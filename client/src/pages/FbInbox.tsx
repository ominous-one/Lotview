import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle,
  ShieldAlert,
  PauseCircle,
  PlayCircle,
  ChevronDown,
  Wand2,
  Timer,
  Ban,
} from "lucide-react";

type FbThread = {
  id: number;
  fbThreadId: string;
  participantName?: string | null;
  listingTitle?: string | null;
  listingUrl?: string | null;
  vehicleId?: number | null;
  state: string;
  unreadCount: number;
  lastMessageAt?: string | null;
  doNotContact: boolean;
  escalated: boolean;
  isPaused: boolean;
  autoSendEnabled: boolean;
};

type FbMessage = {
  id: number;
  direction: string;
  senderRole: string;
  sentAt?: string | null;
  text: string;
};

type FbAuditEvent = {
  id: number;
  kind: string;
  details: any;
  createdAt: string;
};

type TypingSimConfig = {
  msPerCharMin?: number;
  msPerCharMax?: number;
  minTotalTypingMs?: number;
  maxTotalTypingMs?: number;
  chunkSizeCharsMin?: number;
  chunkSizeCharsMax?: number;
  pauseEveryNChars?: number;
  pauseDurationMsMin?: number;
  pauseDurationMsMax?: number;
  jitterPct?: number;
  sendAfterTypingDoneDelayMsMin?: number;
  sendAfterTypingDoneDelayMsMax?: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function estimateTypingMs(text: string, cfg?: TypingSimConfig): number {
  const L = text.length;
  const msPerCharMin = cfg?.msPerCharMin ?? 35;
  const msPerCharMax = cfg?.msPerCharMax ?? 95;
  const minTotalTypingMs = cfg?.minTotalTypingMs ?? 700;
  const maxTotalTypingMs = cfg?.maxTotalTypingMs ?? 12000;

  const p = (msPerCharMin + msPerCharMax) / 2;
  const base = L * p;
  return clamp(Math.round(base), minTotalTypingMs, maxTotalTypingMs);
}

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0.0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function FbInbox() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) setLocation("/login");
  }, [setLocation]);

  const settingsQuery = useQuery<any>({
    queryKey: ["/api/fb-inbox/settings"],
  });

  const threadsQuery = useQuery<{ threads: FbThread[]; total: number }>({
    queryKey: ["/api/fb-inbox/threads"],
    refetchInterval: 5000,
  });

  const selectedThread = useMemo(() => {
    return threadsQuery.data?.threads.find((t) => t.id === selectedThreadId) || null;
  }, [threadsQuery.data, selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId && threadsQuery.data?.threads?.length) {
      setSelectedThreadId(threadsQuery.data.threads[0].id);
    }
  }, [selectedThreadId, threadsQuery.data]);

  const messagesQuery = useQuery<FbMessage[]>({
    queryKey: selectedThreadId ? ["/api/fb-inbox/threads", String(selectedThreadId), "messages"] : ["__noop"],
    enabled: !!selectedThreadId,
    refetchInterval: 2500,
  });

  const auditSnippetQuery = useQuery<{ events: FbAuditEvent[]; total: number }>({
    queryKey: selectedThreadId ? ["/api/fb-inbox/audit", String(selectedThreadId), "snippet"] : ["__noop_a"],
    enabled: !!selectedThreadId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/fb-inbox/audit?threadId=${selectedThreadId}&limit=8&offset=0`);
      return res.json();
    },
    refetchInterval: 5000,
  });

  const decideSendQuery = useQuery<{ events: FbAuditEvent[]; total: number }>({
    queryKey: selectedThreadId ? ["/api/fb-inbox/audit", String(selectedThreadId), "decide"] : ["__noop_d"],
    enabled: !!selectedThreadId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/fb-inbox/audit?threadId=${selectedThreadId}&kind=DECIDE_SEND&limit=1&offset=0`);
      return res.json();
    },
    refetchInterval: 2500,
  });

  const latestDecide = decideSendQuery.data?.events?.[0];
  const candidateReply: string | undefined = latestDecide?.details?.candidateReply;
  const decision = latestDecide?.details?.decision;
  const reasonCodes: string[] = Array.isArray(decision?.reasonCodes) ? decision.reasonCodes : [];

  const typingCfg: TypingSimConfig | undefined = decision?.typingSim || settingsQuery.data?.typingSim;
  const predictedTypingMs = candidateReply ? estimateTypingMs(candidateReply, typingCfg) : 0;

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const typingStartMs = latestDecide?.createdAt ? new Date(latestDecide.createdAt).getTime() : null;
  const typingElapsedMs = typingStartMs ? Math.max(0, nowMs - typingStartMs) : 0;
  const typingRemainingMs = typingStartMs ? Math.max(0, predictedTypingMs - typingElapsedMs) : 0;

  const pauseMutation = useMutation({
    mutationFn: async (paused: boolean) => {
      if (!selectedThreadId) throw new Error("No thread selected");
      const res = await apiRequest("POST", `/api/fb-inbox/threads/${selectedThreadId}/pause`, { paused });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/fb-inbox/threads"] });
      toast({ title: "Updated thread" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });

  const autoSendMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!selectedThreadId) throw new Error("No thread selected");
      const res = await apiRequest("POST", `/api/fb-inbox/threads/${selectedThreadId}/auto-send`, { enabled });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/fb-inbox/threads"] });
      toast({ title: "Updated automation" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });

  const dncMutation = useMutation({
    mutationFn: async (dnc: boolean) => {
      if (!selectedThreadId) throw new Error("No thread selected");
      const res = await apiRequest("POST", `/api/fb-inbox/threads/${selectedThreadId}/dnc`, { dnc });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/fb-inbox/threads"] });
      toast({ title: "Updated thread" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });

  const globalKill = settingsQuery.data?.globalKillSwitch === true;

  // Global kill switch quick toggle (1 click)
  const [killModalOpen, setKillModalOpen] = useState(false);
  const [killNextValue, setKillNextValue] = useState<boolean>(false);
  const [killReason, setKillReason] = useState<string>("");

  const requestKillSwitchChange = (next: boolean) => {
    setKillNextValue(next);
    setKillReason("");
    setKillModalOpen(true);
  };

  const killSwitchMutation = useMutation({
    mutationFn: async (payload: { next: boolean; reason: string }) => {
      const res = await apiRequest("PUT", "/api/fb-inbox/settings", { globalKillSwitch: payload.next, killSwitchReason: payload.reason });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/fb-inbox/settings"] });
      toast({ title: "Kill switch updated" });
    },
    onError: (e: any) => toast({ title: "Kill switch update failed", description: e?.message, variant: "destructive" }),
  });

  const confirmKillSwitchChange = () => {
    const r = killReason.trim();
    if (!r) {
      toast({ title: "Reason required", description: "Please enter a reason to toggle the kill switch.", variant: "destructive" });
      return;
    }
    killSwitchMutation.mutate({ next: killNextValue, reason: r });
    setKillModalOpen(false);
  };

  // Abort
  const [abortModalOpen, setAbortModalOpen] = useState(false);
  const [abortReason, setAbortReason] = useState("");

  const abortMutation = useMutation({
    mutationFn: async (payload: { reason: string }) => {
      if (!selectedThreadId) throw new Error("No thread selected");
      const res = await apiRequest("POST", `/api/fb-inbox/threads/${selectedThreadId}/abort`, { reason: payload.reason });
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/fb-inbox/threads"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/fb-inbox/audit", String(selectedThreadId), "snippet"] }),
      ]);
      toast({ title: "Abort requested", description: "Thread paused to prevent further automation." });
    },
    onError: (e: any) => toast({ title: "Abort failed", description: e?.message, variant: "destructive" }),
  });

  const [whyOpen, setWhyOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background p-6">
      <Dialog open={killModalOpen} onOpenChange={setKillModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{killNextValue ? "Enable global kill switch" : "Disable global kill switch"}</DialogTitle>
            <DialogDescription>Reason is required and will be saved with the settings audit metadata.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="kill-reason">Reason</Label>
            <Input id="kill-reason" value={killReason} onChange={(e) => setKillReason(e.target.value)} placeholder="e.g., action block reports" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKillModalOpen(false)}>Cancel</Button>
            <Button onClick={confirmKillSwitchChange} disabled={killSwitchMutation.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={abortModalOpen} onOpenChange={setAbortModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abort queued send</DialogTitle>
            <DialogDescription>
              This pauses the thread and logs an ABORT_REQUESTED event. (If a send is already in-flight inside Messenger, use the global kill switch.)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="abort-reason">Reason</Label>
            <Input id="abort-reason" value={abortReason} onChange={(e) => setAbortReason(e.target.value)} placeholder="e.g., wrong vehicle detected" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbortModalOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                const r = abortReason.trim();
                if (!r) {
                  toast({ title: "Reason required", description: "Please enter a reason.", variant: "destructive" });
                  return;
                }
                abortMutation.mutate({ reason: r });
                setAbortModalOpen(false);
              }}
              disabled={abortMutation.isPending}
            >
              Abort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Page header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
        <div className="flex items-start gap-3">
          <MessageCircle className="w-6 h-6 mt-0.5" />
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold leading-tight">FB Inbox</h1>
              {globalKill && (
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlert className="w-4 h-4" /> Global kill switch
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Monitor threads, control automation, and reply with confidence.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-end">
          <div className="flex items-center gap-2 rounded-md border px-3 py-2">
            <ShieldAlert className={`w-4 h-4 ${globalKill ? "text-destructive" : "text-muted-foreground"}`} />
            <div className="text-xs">
              <div className="font-medium">Global kill</div>
              <div className="text-muted-foreground">{globalKill ? "ON (blocking sends)" : "OFF"}</div>
            </div>
            <div className="ml-2">
              <Switch checked={globalKill} onCheckedChange={(v) => requestKillSwitchChange(v)} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLocation("/sales/fb-automation")}>Automation Settings</Button>
            <Button variant="outline" onClick={() => setLocation("/sales/fb-audit")}>Audit Console</Button>
          </div>
        </div>
      </div>

      {/* 3-column layout: threads | transcript | context */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Threads */}
        <Card className="md:col-span-4 lg:col-span-3">
          <CardHeader>
            <CardTitle>Threads</CardTitle>
            <CardDescription className="text-xs">Unread, state, and safety flags.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[70vh] pr-2">
              {threadsQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="rounded-lg border p-3">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full mt-2" />
                      <div className="flex gap-2 mt-3">
                        <Skeleton className="h-5 w-14" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : threadsQuery.isError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <div className="font-medium text-destructive">Failed to load threads</div>
                  <div className="text-muted-foreground mt-1">Try refreshing the page.</div>
                </div>
              ) : (threadsQuery.data?.threads || []).length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">No threads yet.</div>
              ) : (
                <div className="space-y-2">
                  {(threadsQuery.data?.threads || []).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedThreadId(t.id)}
                      className={`w-full text-left rounded-lg border p-3 hover:bg-accent transition ${selectedThreadId === t.id ? "bg-accent" : "bg-background"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium truncate">{t.participantName || "Unknown lead"}</div>
                        {t.unreadCount > 0 && <Badge className="tabular-nums">{t.unreadCount}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-1">{t.listingTitle || t.listingUrl || "No listing"}</div>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {t.doNotContact && <Badge variant="destructive">DNC</Badge>}
                        {t.escalated && <Badge variant="secondary">Escalated</Badge>}
                        {t.isPaused && <Badge variant="outline">Paused</Badge>}
                        {!t.autoSendEnabled && <Badge variant="outline">Auto-send: OFF</Badge>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Transcript */}
        <Card className="md:col-span-8 lg:col-span-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Conversation</span>
              {selectedThread && (
                <div className="flex items-center gap-3 flex-wrap justify-end">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Thread</span>
                    <Badge variant="outline" className="tabular-nums">#{selectedThread.id}</Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Pause</span>
                    <Button
                      size="sm"
                      variant={selectedThread.isPaused ? "default" : "outline"}
                      onClick={() => pauseMutation.mutate(!selectedThread.isPaused)}
                    >
                      {selectedThread.isPaused ? <PlayCircle className="w-4 h-4 mr-1" /> : <PauseCircle className="w-4 h-4 mr-1" />}
                      {selectedThread.isPaused ? "Resume" : "Pause"}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Auto-send</span>
                    <Switch
                      checked={!!selectedThread.autoSendEnabled && !globalKill}
                      onCheckedChange={(v) => autoSendMutation.mutate(v)}
                      disabled={globalKill}
                    />
                    <span className="text-xs text-muted-foreground">{globalKill ? "Blocked" : selectedThread.autoSendEnabled ? "ON" : "OFF"}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">DNC</span>
                    <Switch checked={!!selectedThread.doNotContact} onCheckedChange={(v) => dncMutation.mutate(v)} />
                  </div>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedThread && <div className="text-muted-foreground">Select a thread to view the transcript.</div>}
            {selectedThread && (
              <>
                {/* Typing simulation preview */}
                {candidateReply && decision && decision.allow === true && !globalKill && typingStartMs && predictedTypingMs > 0 && (
                  <div className="mb-4 rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Timer className="w-4 h-4 text-muted-foreground" />
                        <div className="text-sm font-medium">Typing simulation</div>
                        <Badge variant="outline" className="tabular-nums">ETA {fmtMs(predictedTypingMs)}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-muted-foreground tabular-nums">Remaining: {fmtMs(typingRemainingMs)}</div>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-2"
                          onClick={() => {
                            setAbortReason("");
                            setAbortModalOpen(true);
                          }}
                        >
                          <Ban className="w-4 h-4" /> Abort
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Status: {typingRemainingMs > 0 ? "queued / typing" : "completed"}</div>
                  </div>
                )}

                <div className="text-sm">
                  <div className="font-medium">{selectedThread.participantName || "Unknown lead"}</div>
                  {selectedThread.listingUrl && (
                    <a className="text-xs text-primary underline" href={selectedThread.listingUrl} target="_blank" rel="noreferrer">
                      Open listing
                    </a>
                  )}
                </div>
                <Separator className="my-3" />
                <ScrollArea className="h-[62vh] pr-3">
                  {messagesQuery.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="max-w-[85%] rounded-lg border p-3">
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-4 w-full mt-2" />
                          <Skeleton className="h-4 w-5/6 mt-2" />
                        </div>
                      ))}
                    </div>
                  ) : messagesQuery.isError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <div className="font-medium text-destructive">Failed to load messages</div>
                      <div className="text-muted-foreground mt-1">Try switching threads or refreshing.</div>
                    </div>
                  ) : (messagesQuery.data || []).length === 0 ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">No messages yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {(messagesQuery.data || []).map((m) => (
                        <div
                          key={m.id}
                          className={`max-w-[85%] rounded-lg p-3 border ${m.direction === "OUTBOUND" ? "ml-auto bg-primary/5" : "bg-muted/40"}`}
                        >
                          <div className="text-xs text-muted-foreground mb-1">
                            {m.direction} • {m.senderRole}
                            {m.sentAt ? ` • ${new Date(m.sentAt).toLocaleString()}` : ""}
                          </div>
                          <div className="whitespace-pre-wrap text-sm">{m.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>

        {/* Context / controls */}
        <Card className="md:col-span-12 lg:col-span-3">
          <CardHeader>
            <CardTitle>Context</CardTitle>
            <CardDescription className="text-xs">Listing + safety posture at a glance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedThread ? (
              <div className="text-sm text-muted-foreground">Select a thread to see details.</div>
            ) : (
              <>
                {/* Suggested reply */}
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-muted-foreground" />
                      <div className="text-sm font-medium">Suggested reply</div>
                    </div>
                    {decision ? (
                      <Badge variant={decision.allow ? "default" : "destructive"}>{decision.allow ? "Allowed" : "Blocked"}</Badge>
                    ) : (
                      <Badge variant="outline">—</Badge>
                    )}
                  </div>

                  <div className="mt-2 text-sm whitespace-pre-wrap">
                    {candidateReply ? candidateReply : <span className="text-muted-foreground">No suggestion recorded yet.</span>}
                  </div>

                  {decision && (
                    <div className="mt-3">
                      <Collapsible open={whyOpen} onOpenChange={setWhyOpen}>
                        <CollapsibleTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-2">
                            Why
                            <ChevronDown className={`h-4 w-4 transition-transform ${whyOpen ? "rotate-180" : ""}`} />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3 space-y-2">
                          <div className="text-xs text-muted-foreground">Policy reason codes</div>
                          {reasonCodes.length === 0 ? (
                            <div className="text-sm text-muted-foreground">—</div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {reasonCodes.map((c) => (
                                <Badge key={c} variant="secondary" className="font-mono text-[11px]">{c}</Badge>
                              ))}
                            </div>
                          )}

                          <Separator />

                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <div className="text-xs text-muted-foreground">Lead name conf</div>
                              <div className="tabular-nums">{typeof latestDecide?.details?.leadNameConfidence === "number" ? latestDecide.details.leadNameConfidence.toFixed(2) : "—"}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Vehicle conf</div>
                              <div className="tabular-nums">{typeof latestDecide?.details?.vehicleMappingConfidence === "number" ? latestDecide.details.vehicleMappingConfidence.toFixed(2) : "—"}</div>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}
                </div>

                {/* Audit trail snippet */}
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Audit trail (latest)</div>
                  <div className="rounded-lg border p-3">
                    {auditSnippetQuery.isLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-4 w-full" />
                        ))}
                      </div>
                    ) : auditSnippetQuery.isError ? (
                      <div className="text-sm text-muted-foreground">Failed to load audit.</div>
                    ) : (auditSnippetQuery.data?.events || []).length === 0 ? (
                      <div className="text-sm text-muted-foreground">No events yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {(auditSnippetQuery.data?.events || []).slice(0, 8).map((e) => (
                          <div key={e.id} className="text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="outline" className="font-mono text-[11px]">{e.kind}</Badge>
                              <div className="text-xs text-muted-foreground tabular-nums">{new Date(e.createdAt).toLocaleTimeString()}</div>
                            </div>
                            {Array.isArray(e.details?.reasonCodes) && e.details.reasonCodes.length > 0 && (
                              <div className="mt-1 text-xs text-muted-foreground truncate">
                                {e.details.reasonCodes.slice(0, 4).join(", ")}{e.details.reasonCodes.length > 4 ? "…" : ""}
                              </div>
                            )}
                          </div>
                        ))}
                        <Separator />
                        <Button size="sm" variant="outline" onClick={() => setLocation("/sales/fb-audit")}>Open full audit</Button>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Listing</div>
                  <div className="text-sm">
                    <div className="font-medium">{selectedThread.listingTitle || "No listing title"}</div>
                    {selectedThread.listingUrl ? (
                      <a className="text-xs text-primary underline" href={selectedThread.listingUrl} target="_blank" rel="noreferrer">
                        Open listing in Facebook
                      </a>
                    ) : (
                      <div className="text-xs text-muted-foreground">No listing URL</div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Audit</div>
                  <div className="text-sm text-muted-foreground">View the Audit Console for this thread id.</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(String(selectedThread.id))}>Copy thread id</Button>
                    <Button size="sm" variant="outline" onClick={() => setLocation("/sales/fb-audit")}>Open audit</Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
