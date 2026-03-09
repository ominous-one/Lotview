import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Navbar } from '@/components/Navbar';
import { apiGet } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FollowUpTask = {
  id: string;
  appointmentId: string | null;
  ownerUserId: number | null;
  kind: string;
  status: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  createdAt: string;
};

type Salesperson = { id: number; name: string; role: string };

export default function FollowUpTasksPage() {
  const [ownerUserId, setOwnerUserId] = useState<string>('all');
  const [status, setStatus] = useState<string>('OPEN');

  const { data: salespeople } = useQuery<{ salespeople: Salesperson[] }>({
    queryKey: ['/api/salespeople'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const list = (await apiGet('/api/salespeople', { Authorization: `Bearer ${token}` })) as Salesperson[];
      return { salespeople: list };
    },
  });

  const { data, isLoading } = useQuery<{ tasks: FollowUpTask[] }>({
    queryKey: ['/api/follow-up-tasks', ownerUserId, status],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const qs = new URLSearchParams();
      if (ownerUserId !== 'all') qs.set('ownerUserId', ownerUserId);
      if (status !== 'all') qs.set('status', status);
      return apiGet(`/api/follow-up-tasks?${qs.toString()}`, { Authorization: `Bearer ${token}` });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-6 space-y-6" data-testid="follow-up-tasks-page">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="text-xl font-semibold">Follow-up tasks</div>
            <div className="text-sm text-muted-foreground">Generated from appointment lifecycle events</div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={ownerUserId} onValueChange={setOwnerUserId}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {salespeople?.salespeople?.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feed</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : !data?.tasks?.length ? (
              <div className="text-sm text-muted-foreground">No tasks.</div>
            ) : (
              <div className="space-y-2">
                {data.tasks.map((t) => (
                  <div key={t.id} className="flex items-start justify-between gap-3 border rounded p-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.kind} • {t.dueAt ? `Due ${new Date(t.dueAt).toLocaleString()}` : 'No due date'}
                      </div>
                      {t.description ? <div className="text-sm mt-2 text-muted-foreground">{t.description}</div> : null}
                      {t.appointmentId ? (
                        <div className="mt-2">
                          <Link href={`/manager/appointments/${t.appointmentId}`}>
                            <Button variant="link" className="p-0 h-auto">View appointment</Button>
                          </Link>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{t.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
