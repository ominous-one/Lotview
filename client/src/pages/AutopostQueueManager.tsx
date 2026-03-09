import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type PlatformStatus = {
  id: string;
  platform: "facebook_marketplace" | "craigslist";
  status: string;
  attemptCount: number;
  lastError?: string | null;
};

type QueueItem = {
  queueItem: {
    id: string;
    priorityRank: number;
    photoGateOverride: boolean;
    blockedReason?: string | null;
  };
  vehicle: {
    id: number;
    year: number;
    make: string;
    model: string;
    trim: string;
    price: number;
    images: string[];
    photoStatus?: string;
    autopostEligible?: boolean;
    autopostBlockReason?: string | null;
  };
  platformStatuses: PlatformStatus[];
};

export default function AutopostQueueManager() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/manager/autopost/queue");
      const json = await res.json();
      setItems(json.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const orderedIds = useMemo(() => items.map(i => i.queueItem.id), [items]);

  function move(index: number, dir: -1 | 1) {
    const next = [...items];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    setItems(next);
  }

  async function saveOrder() {
    setSaving(true);
    try {
      await fetch("/api/manager/autopost/queue/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedQueueItemIds: orderedIds }),
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleOverride(queueItemId: string, enabled: boolean) {
    await fetch(`/api/manager/autopost/queue/${queueItemId}/photo-override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, reason: enabled ? "manager override" : "override cleared" }),
    });
    await load();
  }

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Autopost Priority Queue</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>Refresh</Button>
            <Button onClick={saveOrder} disabled={saving || items.length === 0}>Save order</Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[70vh] pr-4">
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">{loading ? "Loading..." : "Queue is empty"}</div>
            ) : (
              <div className="space-y-3">
                {items.map((row, idx) => {
                  const v = row.vehicle;
                  const photoCount = v?.images?.length || 0;
                  const fbs = row.platformStatuses.find(s => s.platform === "facebook_marketplace");
                  const cls = row.platformStatuses.find(s => s.platform === "craigslist");

                  return (
                    <Card key={row.queueItem.id}>
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">#{idx + 1}</Badge>
                            <div className="font-medium truncate">
                              {v?.year} {v?.make} {v?.model} {v?.trim}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            ${v?.price?.toLocaleString?.() ?? v?.price} • photos: {photoCount} • photoStatus: {v?.photoStatus || "-"}
                          </div>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <Badge variant={fbs?.status === "posted" ? "default" : "outline"}>FB: {fbs?.status || "-"}</Badge>
                            <Badge variant={cls?.status === "posted" ? "default" : "outline"}>CL: {cls?.status || "-"}</Badge>
                            {v?.autopostEligible ? (
                              <Badge>eligible</Badge>
                            ) : (
                              <Badge variant="destructive">blocked: {v?.autopostBlockReason || "-"}</Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex flex-col gap-1 items-end">
                            <div className="text-xs text-muted-foreground">Photo override</div>
                            <div className="flex items-center gap-2">
                              <Switch checked={!!row.queueItem.photoGateOverride} onCheckedChange={(v) => toggleOverride(row.queueItem.id, v)} />
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <Button size="sm" variant="outline" onClick={() => move(idx, -1)} disabled={idx === 0}>Up</Button>
                            <Button size="sm" variant="outline" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}>Down</Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
