import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { Settings, ChevronDown } from "lucide-react";

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

function safeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function fmtWhen(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function FbAutomationSettings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) setLocation("/login");
  }, [setLocation]);

  const settingsQuery = useQuery<any>({
    queryKey: ["/api/fb-inbox/settings"],
  });

  const [businessHoursJson, setBusinessHoursJson] = useState("{}");
  const [thresholdsJson, setThresholdsJson] = useState("{}");
  const [rateLimitsJson, setRateLimitsJson] = useState("{}");
  const [typingSimJson, setTypingSimJson] = useState("{}");

  useEffect(() => {
    if (settingsQuery.data) {
      setBusinessHoursJson(JSON.stringify(settingsQuery.data.businessHours ?? {}, null, 2));
      setThresholdsJson(JSON.stringify(settingsQuery.data.thresholds ?? {}, null, 2));
      setRateLimitsJson(JSON.stringify(settingsQuery.data.rateLimits ?? {}, null, 2));
      setTypingSimJson(JSON.stringify(settingsQuery.data.typingSim ?? {}, null, 2));
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (patch: any) => {
      const res = await apiRequest("PUT", "/api/fb-inbox/settings", patch);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/fb-inbox/settings"] });
      toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const parseJson = (label: string, value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${label} must be valid JSON`);
    }
  };

  const onSave = () => {
    try {
      saveMutation.mutate({
        autoSendEnabled: settingsQuery.data?.autoSendEnabled,
        globalKillSwitch: settingsQuery.data?.globalKillSwitch,
        dryRun: settingsQuery.data?.dryRun,
        businessHours: parseJson("Business hours", businessHoursJson),
        thresholds: parseJson("Thresholds", thresholdsJson),
        rateLimits: parseJson("Rate limits", rateLimitsJson),
        typingSim: parseJson("Typing sim", typingSimJson),
      });
    } catch (e: any) {
      toast({ title: "Invalid config", description: e?.message, variant: "destructive" });
    }
  };

  const toggleMutation = useMutation({
    mutationFn: async (patch: any) => {
      const res = await apiRequest("PUT", "/api/fb-inbox/settings", patch);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/fb-inbox/settings"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });

  // Kill switch confirmation
  const [killModalOpen, setKillModalOpen] = useState(false);
  const [killNextValue, setKillNextValue] = useState<boolean>(false);
  const [killReason, setKillReason] = useState<string>("");

  const requestKillSwitchChange = (next: boolean) => {
    setKillNextValue(next);
    setKillReason("");
    setKillModalOpen(true);
  };

  const confirmKillSwitchChange = () => {
    const r = killReason.trim();
    if (!r) {
      toast({ title: "Reason required", description: "Please enter a reason to toggle the kill switch.", variant: "destructive" });
      return;
    }
    toggleMutation.mutate({ globalKillSwitch: killNextValue, killSwitchReason: r });
    setKillModalOpen(false);
  };

  // Typing sim readable fields
  const typingSimObj = useMemo(() => safeParseJson<TypingSimConfig>(typingSimJson, {}), [typingSimJson]);

  const setTypingSimField = (key: keyof TypingSimConfig, value: number) => {
    const next: TypingSimConfig = { ...typingSimObj, [key]: value };
    setTypingSimJson(JSON.stringify(next, null, 2));
  };

  const [typingAdvancedOpen, setTypingAdvancedOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6" />
          <h1 className="text-2xl font-bold">FB Automation Settings</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation("/sales/fb-inbox")}>Back to Inbox</Button>
          <Button onClick={onSave} disabled={saveMutation.isPending}>Save</Button>
        </div>
      </div>

      <Dialog open={killModalOpen} onOpenChange={setKillModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{killNextValue ? "Enable global kill switch" : "Disable global kill switch"}</DialogTitle>
            <DialogDescription>
              This setting immediately changes server policy for all outbound automation. A reason is required for auditability.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="kill-reason">Reason</Label>
            <Input
              id="kill-reason"
              value={killReason}
              onChange={(e) => setKillReason(e.target.value)}
              placeholder={killNextValue ? "e.g., action block reports" : "e.g., safe to resume"}
            />
            <div className="text-xs text-muted-foreground">
              Last toggled: {fmtWhen(settingsQuery.data?.globalKillSwitchLastToggledAt)} · by {settingsQuery.data?.globalKillSwitchLastToggledBy || "—"}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setKillModalOpen(false)}>Cancel</Button>
            <Button onClick={confirmKillSwitchChange} disabled={toggleMutation.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Kill switches</CardTitle>
          <CardDescription>Server-enforced safety envelope. Global kill switch disables auto-send across all threads.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Auto-send enabled (default ON)</div>
              <div className="text-sm text-muted-foreground">If OFF, automation runs but will not send.</div>
            </div>
            <Switch
              checked={settingsQuery.data?.autoSendEnabled !== false}
              onCheckedChange={(v) => toggleMutation.mutate({ autoSendEnabled: v })}
            />
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="font-medium">Global kill switch</div>
              <div className="text-sm text-muted-foreground">Hard stop: blocks outbound sends even if the client is misconfigured.</div>
              <div className="text-xs text-muted-foreground mt-1">
                Last toggled: {fmtWhen(settingsQuery.data?.globalKillSwitchLastToggledAt)} · by {settingsQuery.data?.globalKillSwitchLastToggledBy || "—"}
                {settingsQuery.data?.globalKillSwitchLastReason ? ` · “${settingsQuery.data.globalKillSwitchLastReason}”` : ""}
              </div>
            </div>
            <Switch
              checked={settingsQuery.data?.globalKillSwitch === true}
              onCheckedChange={(v) => requestKillSwitchChange(v)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Dry run</div>
              <div className="text-sm text-muted-foreground">When ON, extension will not click Send (but still audits).</div>
            </div>
            <Switch
              checked={settingsQuery.data?.dryRun === true}
              onCheckedChange={(v) => toggleMutation.mutate({ dryRun: v })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Business hours (JSON)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={businessHoursJson} onChange={(e) => setBusinessHoursJson(e.target.value)} className="min-h-[240px] font-mono" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thresholds (JSON)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={thresholdsJson} onChange={(e) => setThresholdsJson(e.target.value)} className="min-h-[240px] font-mono" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rate limits (JSON)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={rateLimitsJson} onChange={(e) => setRateLimitsJson(e.target.value)} className="min-h-[240px] font-mono" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Typing simulation</CardTitle>
            <CardDescription>Readable fields for the most important typing-sim parameters.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>msPerCharMin</Label>
                <Input type="number" className="tabular-nums" value={typingSimObj.msPerCharMin ?? ""} onChange={(e) => setTypingSimField("msPerCharMin", Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>msPerCharMax</Label>
                <Input type="number" className="tabular-nums" value={typingSimObj.msPerCharMax ?? ""} onChange={(e) => setTypingSimField("msPerCharMax", Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>minTotalTypingMs</Label>
                <Input type="number" className="tabular-nums" value={typingSimObj.minTotalTypingMs ?? ""} onChange={(e) => setTypingSimField("minTotalTypingMs", Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>maxTotalTypingMs</Label>
                <Input type="number" className="tabular-nums" value={typingSimObj.maxTotalTypingMs ?? ""} onChange={(e) => setTypingSimField("maxTotalTypingMs", Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>pauseEveryNChars</Label>
                <Input type="number" className="tabular-nums" value={typingSimObj.pauseEveryNChars ?? ""} onChange={(e) => setTypingSimField("pauseEveryNChars", Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>jitterPct</Label>
                <Input type="number" step="0.01" className="tabular-nums" value={typingSimObj.jitterPct ?? ""} onChange={(e) => setTypingSimField("jitterPct", Number(e.target.value))} />
              </div>
            </div>

            <Collapsible open={typingAdvancedOpen} onOpenChange={setTypingAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  Advanced JSON
                  <ChevronDown className={`h-4 w-4 transition-transform ${typingAdvancedOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <Textarea value={typingSimJson} onChange={(e) => setTypingSimJson(e.target.value)} className="min-h-[240px] font-mono" />
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
