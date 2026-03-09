import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";

type AuditEvent = {
  id: number;
  threadId?: number | null;
  eventKey: string;
  kind: string;
  details: any;
  createdAt: string;
};

export default function FbAuditConsole() {
  const [, setLocation] = useLocation();
  const [kind, setKind] = useState<string>("");
  const [threadId, setThreadId] = useState<string>("");

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) setLocation("/login");
  }, [setLocation]);

  const url = `/api/fb-inbox/audit?limit=100${kind ? `&kind=${encodeURIComponent(kind)}` : ""}${threadId ? `&threadId=${encodeURIComponent(threadId)}` : ""}`;

  const auditQuery = useQuery<{ events: AuditEvent[]; total: number }>({
    queryKey: [url],
    refetchInterval: 5000,
  });

  const kindBadgeClass = (k: string) => {
    switch (k) {
      case "AUTO_SENT":
        return "bg-emerald-100 text-emerald-800 border border-emerald-200";
      case "BLOCKED":
        return "bg-red-50 text-red-700 border border-red-200";
      case "ESCALATED":
        return "bg-amber-50 text-amber-800 border border-amber-200";
      case "PAUSED":
        return "bg-amber-50 text-amber-800 border border-amber-200";
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
        <div className="flex items-start gap-3">
          <Shield className="w-6 h-6 mt-0.5" />
          <div>
            <h1 className="text-2xl font-bold leading-tight">FB Audit Console</h1>
            <p className="text-sm text-muted-foreground">Observable, explainable automation — every action leaves a trail.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation("/sales/fb-inbox")}>Back to Inbox</Button>
          <Button variant="outline" onClick={() => setLocation("/sales/fb-automation")}>Automation Settings</Button>
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription className="text-xs">Filter by kind and/or thread id. Refreshes automatically.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">Kind</div>
            <Input value={kind} onChange={(e) => setKind(e.target.value)} placeholder="AUTO_SENT | BLOCKED | ESCALATED ..." />
          </div>
          <div className="w-full md:w-[220px]">
            <div className="text-xs text-muted-foreground mb-1">Thread ID</div>
            <Input value={threadId} onChange={(e) => setThreadId(e.target.value)} placeholder="123" inputMode="numeric" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription className="text-xs">Showing up to 100 most recent events.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[72vh] pr-3">
            {auditQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-3 w-40 mt-3" />
                    <Skeleton className="h-16 w-full mt-3" />
                  </div>
                ))}
              </div>
            ) : auditQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="font-medium text-destructive">Failed to load audit events</div>
                <div className="text-muted-foreground mt-1">Try refreshing the page or narrowing filters.</div>
              </div>
            ) : (auditQuery.data?.events || []).length === 0 ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">No events match these filters.</div>
            ) : (
              <div className="space-y-2">
                {(auditQuery.data?.events || []).map((e) => (
                  <div key={e.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={kindBadgeClass(e.kind)}>
                          {e.kind}
                        </Badge>
                        <span className="text-sm text-muted-foreground tabular-nums">{new Date(e.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">thread: {e.threadId ?? "-"}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 font-mono">eventKey: {e.eventKey}</div>
                    <pre className="mt-2 text-xs bg-muted/40 p-2 rounded overflow-auto font-mono">
                      {JSON.stringify(e.details, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
