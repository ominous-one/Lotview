import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Navbar } from '@/components/Navbar';
import { apiGet } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Appointment = {
  id: string;
  status: string;
  type: string;
  startAt: string;
  endAt: string | null;
  timezone: string;
  leadName: string | null;
  ownerUserId: number | null;
};

type Salesperson = { id: number; name: string; role: string };

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export default function AppointmentCalendarPage() {
  const [mode, setMode] = useState<'day' | 'week'>('week');
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [ownerUserId, setOwnerUserId] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');

  const range = useMemo(() => {
    const day = startOfDay(new Date(anchor + 'T00:00:00'));
    if (mode === 'day') return { start: day, end: addDays(day, 1) };
    // week starting Monday-ish: keep simple, 7 days from anchor
    return { start: day, end: addDays(day, 7) };
  }, [anchor, mode]);

  const { data: salespeople } = useQuery<{ salespeople: Salesperson[] }>({
    queryKey: ['/api/salespeople'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const list = (await apiGet('/api/salespeople', { Authorization: `Bearer ${token}` })) as Salesperson[];
      return { salespeople: list };
    },
  });

  const { data, isLoading } = useQuery<{ appointments: Appointment[] }>({
    queryKey: ['/api/appointments', mode, anchor, ownerUserId, status],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const qs = new URLSearchParams({
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      });
      if (ownerUserId !== 'all') qs.set('ownerUserId', ownerUserId);
      if (status !== 'all') qs.set('status', status);
      return apiGet(`/api/appointments?${qs.toString()}`, { Authorization: `Bearer ${token}` });
    },
  });

  const days = useMemo(() => {
    const arr: Date[] = [];
    const start = startOfDay(range.start);
    const count = mode === 'day' ? 1 : 7;
    for (let i = 0; i < count; i++) arr.push(addDays(start, i));
    return arr;
  }, [range.start, mode]);

  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const d of days) m.set(d.toISOString().slice(0, 10), []);
    for (const a of data?.appointments || []) {
      const key = new Date(a.startAt).toISOString().slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    }
    for (const [k, list] of m) {
      list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      m.set(k, list);
    }
    return m;
  }, [data?.appointments, days]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-6 space-y-6" data-testid="appointment-calendar-page">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="text-xl font-semibold">Calendar</div>
            <div className="text-sm text-muted-foreground">Day/Week view (canonical LotView calendar)</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={mode} onValueChange={(v) => setMode(v as any)}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
              </SelectContent>
            </Select>
            <Input className="w-[160px]" type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
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
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {['BOOKED','RESCHEDULE_REQUESTED','RESCHEDULED','CANCELLED_BY_BUYER','CANCELLED_BY_DEALER','NO_SHOW','COMPLETED','PENDING_CONFIRMATION','PROPOSED','DRAFT'].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{mode === 'day' ? 'Day' : 'Week'} overview</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <div className={mode === 'day' ? 'space-y-4' : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'}>
                {days.map((d) => {
                  const key = d.toISOString().slice(0, 10);
                  const items = byDay.get(key) || [];
                  return (
                    <div key={key} className="border rounded p-3">
                      <div className="font-medium">{d.toLocaleDateString()}</div>
                      <div className="text-xs text-muted-foreground mb-2">{items.length} appointments</div>
                      <div className="space-y-2">
                        {items.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No appointments.</div>
                        ) : (
                          items.map((a) => (
                            <div key={a.id} className="flex items-center justify-between gap-2 border rounded p-2">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{a.leadName || 'Unknown buyer'}</div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(a.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} • {a.type}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{a.status}</Badge>
                                <Link href={`/manager/appointments/${a.id}`}>
                                  <Button size="sm" variant="outline">View</Button>
                                </Link>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
