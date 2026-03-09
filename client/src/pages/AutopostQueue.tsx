import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

type Platform = 'all' | 'facebook_marketplace' | 'craigslist';

type QueueRow = {
  queueItemId: string;
  vehicleId: number;
  priorityRank: number;
  queuedAt: string;
  photoGateOverride: boolean;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  odometer: number;
  photoCount: number;
  uniquePhotoCount: number;
  autopostEligible: boolean;
  autopostBlockReason: string | null;
  fbStatus: string | null;
  fbAttemptCount: number | null;
  fbLastError: string | null;
  clStatus: string | null;
  clAttemptCount: number | null;
  clLastError: string | null;
};

export default function AutopostQueue() {
  const [platform, setPlatform] = useState<Platform>('all');

  const { data, isLoading, error } = useQuery<{ items: QueueRow[] }>({
    queryKey: [`/api/manager/autopost/queue?platform=${platform}`],
  });

  const items = data?.items || [];

  const [localOrder, setLocalOrder] = useState<string[]>([]);

  React.useEffect(() => {
    // Reset local ordering whenever the fetched list changes.
    setLocalOrder(items.map((i) => i.queueItemId));
  }, [items.map((i) => i.queueItemId).join('|')]);

  const byId = useMemo(() => {
    const m = new Map<string, QueueRow>();
    for (const i of items) m.set(i.queueItemId, i);
    return m;
  }, [items]);

  const orderedItems = useMemo(() => {
    const out: QueueRow[] = [];
    for (const id of localOrder) {
      const row = byId.get(id);
      if (row) out.push(row);
    }
    // Any missing (defensive)
    for (const row of items) {
      if (!localOrder.includes(row.queueItemId)) out.push(row);
    }
    return out;
  }, [items, localOrder, byId]);

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/manager/autopost/queue/evaluate', {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/manager/autopost/queue?platform=${platform}`] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedQueueItemIds: string[]) => {
      await apiRequest('POST', '/api/manager/autopost/queue/reorder', { orderedQueueItemIds });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/manager/autopost/queue?platform=${platform}`] });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async (params: { queueItemId: string; enabled: boolean; reason?: string }) => {
      await apiRequest('POST', `/api/manager/autopost/queue/${params.queueItemId}/photo-override`, {
        enabled: params.enabled,
        reason: params.reason || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/manager/autopost/queue?platform=${platform}`] });
    },
  });

  const dequeueMutation = useMutation({
    mutationFn: async (params: { queueItemId: string; reason?: string }) => {
      await apiRequest('POST', `/api/manager/autopost/queue/${params.queueItemId}/dequeue`, {
        reason: params.reason || 'manager_dequeued',
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/manager/autopost/queue?platform=${platform}`] });
    },
  });

  function move(id: string, delta: number) {
    const idx = localOrder.indexOf(id);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= localOrder.length) return;
    const copy = localOrder.slice();
    const [x] = copy.splice(idx, 1);
    copy.splice(next, 0, x);
    setLocalOrder(copy);
  }

  function setRank(id: string, rank: number) {
    const clamped = Math.max(1, Math.min(localOrder.length, rank));
    const idx = localOrder.indexOf(id);
    if (idx < 0) return;
    const copy = localOrder.slice();
    const [x] = copy.splice(idx, 1);
    copy.splice(clamped - 1, 0, x);
    setLocalOrder(copy);
  }

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Autopost Priority Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="w-[260px]">
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger>
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  <SelectItem value="facebook_marketplace">Facebook Marketplace</SelectItem>
                  <SelectItem value="craigslist">Craigslist</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="secondary"
              onClick={() => evaluateMutation.mutate()}
              disabled={evaluateMutation.isPending}
            >
              Evaluate + Enqueue
            </Button>

            <Button
              onClick={() => reorderMutation.mutate(localOrder)}
              disabled={reorderMutation.isPending}
            >
              Save Order
            </Button>
          </div>

          {error ? <div className="text-red-600">{String(error)}</div> : null}
          {isLoading ? <div>Loading…</div> : null}

          <div className="overflow-auto border rounded">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Rank</th>
                  <th className="text-left p-2">Vehicle</th>
                  <th className="text-left p-2">Photos</th>
                  <th className="text-left p-2">Eligible</th>
                  <th className="text-left p-2">FB</th>
                  <th className="text-left p-2">CL</th>
                  <th className="text-left p-2">Override</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderedItems.map((row, idx) => {
                  const label = `${row.year} ${row.make} ${row.model}${row.trim ? ` ${row.trim}` : ''}`;
                  const photoGateOk = row.uniquePhotoCount >= 10 || row.photoGateOverride;
                  return (
                    <tr key={row.queueItemId} className="border-t">
                      <td className="p-2 whitespace-nowrap">
                        <div className="flex gap-2 items-center">
                          <Input
                            className="w-[70px]"
                            type="number"
                            value={idx + 1}
                            onChange={(e) => setRank(row.queueItemId, parseInt(e.target.value || '1', 10))}
                          />
                          <div className="flex flex-col">
                            <Button size="sm" variant="ghost" onClick={() => move(row.queueItemId, -1)}>↑</Button>
                            <Button size="sm" variant="ghost" onClick={() => move(row.queueItemId, 1)}>↓</Button>
                          </div>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{label}</div>
                        <div className="text-muted-foreground">
                          ${row.price?.toLocaleString?.() || row.price} • {row.odometer?.toLocaleString?.() || row.odometer}km
                        </div>
                        {row.autopostBlockReason ? (
                          <div className="text-amber-700">Block: {row.autopostBlockReason}</div>
                        ) : null}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <div>
                          {row.uniquePhotoCount}/{row.photoCount} {photoGateOk ? '' : '(gate)'}
                        </div>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {row.autopostEligible ? 'Yes' : 'No'}
                      </td>
                      <td className="p-2">
                        <div>{row.fbStatus || '-'}</div>
                        {row.fbAttemptCount ? <div className="text-muted-foreground">attempts: {row.fbAttemptCount}</div> : null}
                        {row.fbLastError ? <div className="text-red-600">{row.fbLastError}</div> : null}
                      </td>
                      <td className="p-2">
                        <div>{row.clStatus || '-'}</div>
                        {row.clAttemptCount ? <div className="text-muted-foreground">attempts: {row.clAttemptCount}</div> : null}
                        {row.clLastError ? <div className="text-red-600">{row.clLastError}</div> : null}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={row.photoGateOverride}
                            onCheckedChange={(checked) =>
                              overrideMutation.mutate({ queueItemId: row.queueItemId, enabled: checked, reason: 'manager_override' })
                            }
                          />
                          <span>{row.photoGateOverride ? 'On' : 'Off'}</span>
                        </div>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => dequeueMutation.mutate({ queueItemId: row.queueItemId })}
                          disabled={dequeueMutation.isPending}
                        >
                          Dequeue
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
