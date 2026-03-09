import { useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { Navbar } from '@/components/Navbar';
import { apiGet, apiPost } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

type Appointment = {
  id: string;
  type: string;
  status: string;
  startAt: string;
  endAt: string | null;
  timezone: string;
  leadName: string | null;
  sourceChannel: string;
  ownerUserId: number | null;
};

type AuditEvent = {
  id: string;
  kind: string;
  actorType: string;
  actorUserId: number | null;
  occurredAt: string;
  reasonCodes: string[] | null;
  details: any;
};

export default function AppointmentDetailPage() {
  const [, params] = useRoute('/manager/appointments/:id');
  const id = params?.id as string;

  const [newStartAt, setNewStartAt] = useState('');
  const [escalationEmail, setEscalationEmail] = useState('');

  const { data, refetch, isLoading } = useQuery<{ appointment: Appointment; auditEvents: AuditEvent[] }>({
    queryKey: ['/api/appointments', id],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      return apiGet(`/api/appointments/${id}`, { Authorization: `Bearer ${token}` });
    },
    enabled: !!id,
  });

  const reschedule = async () => {
    const token = localStorage.getItem('auth_token');
    await apiPost(
      `/api/appointments/${id}/reschedule`,
      {
        startAt: new Date(newStartAt).toISOString(),
        escalationEmail: escalationEmail || null,
        idempotencyKey: `reschedule:${Date.now()}`,
      },
      { Authorization: `Bearer ${token}` }
    );
    setNewStartAt('');
    await refetch();
  };

  const cancel = async (cancelledBy: 'buyer' | 'dealer') => {
    const token = localStorage.getItem('auth_token');
    await apiPost(
      `/api/appointments/${id}/cancel`,
      { cancelledBy, escalationEmail: escalationEmail || null, idempotencyKey: `cancel:${cancelledBy}:${Date.now()}` },
      { Authorization: `Bearer ${token}` }
    );
    await refetch();
  };

  const requestReschedule = async () => {
    const token = localStorage.getItem('auth_token');
    await apiPost(
      `/api/appointments/${id}/request-reschedule`,
      { reason: 'Requested by dealer', escalationEmail: escalationEmail || null, idempotencyKey: `rr:${Date.now()}` },
      { Authorization: `Bearer ${token}` }
    );
    await refetch();
  };

  const markNoShow = async () => {
    const token = localStorage.getItem('auth_token');
    await apiPost(
      `/api/appointments/${id}/no-show`,
      { reason: 'Marked no-show', escalationEmail: escalationEmail || null, idempotencyKey: `ns:${Date.now()}` },
      { Authorization: `Bearer ${token}` }
    );
    await refetch();
  };

  const markCompleted = async () => {
    const token = localStorage.getItem('auth_token');
    await apiPost(
      `/api/appointments/${id}/complete`,
      { reason: 'Marked completed', escalationEmail: escalationEmail || null, idempotencyKey: `done:${Date.now()}` },
      { Authorization: `Bearer ${token}` }
    );
    await refetch();
  };

  const createNoResponseTask = async () => {
    const token = localStorage.getItem('auth_token');
    await apiPost(
      `/api/appointments/${id}/follow-up/no-response`,
      {},
      { Authorization: `Bearer ${token}` }
    );
    await refetch();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-6 space-y-6" data-testid="appointment-detail-page">
        {isLoading || !data ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Appointment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="font-semibold">{data.appointment.leadName || 'Unknown buyer'}</div>
                  <Badge variant="secondary">{data.appointment.status}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {new Date(data.appointment.startAt).toLocaleString()} ({data.appointment.timezone}) • {data.appointment.type}
                </div>
                <div className="text-xs text-muted-foreground">Source: {data.appointment.sourceChannel}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Escalation email (only needed if manager email missing/unverified)</CardTitle>
              </CardHeader>
              <CardContent>
                <Input value={escalationEmail} onChange={(e) => setEscalationEmail(e.target.value)} placeholder="manager@dealership.com" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <Label>Reschedule to</Label>
                  <Input value={newStartAt} onChange={(e) => setNewStartAt(e.target.value)} placeholder="2026-03-09T11:00" />
                  <div className="text-xs text-muted-foreground mt-1">Use ISO-ish local input. Stored as timestamptz.</div>
                </div>
                <div className="flex items-end gap-2 flex-wrap">
                  <Button onClick={reschedule} disabled={!newStartAt}>
                    Reschedule
                  </Button>
                  <Button variant="outline" onClick={requestReschedule}>
                    Request reschedule
                  </Button>
                  <Button variant="outline" onClick={markNoShow}>
                    No-show
                  </Button>
                  <Button variant="outline" onClick={markCompleted}>
                    Completed
                  </Button>
                  <Button variant="outline" onClick={createNoResponseTask}>
                    No response task
                  </Button>
                  <Button variant="destructive" onClick={() => cancel('buyer')}>
                    Cancel (buyer)
                  </Button>
                  <Button variant="destructive" onClick={() => cancel('dealer')}>
                    Cancel (dealer)
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Audit</CardTitle>
              </CardHeader>
              <CardContent>
                {!data.auditEvents?.length ? (
                  <div className="text-sm text-muted-foreground">No audit events.</div>
                ) : (
                  <div className="space-y-2">
                    {data.auditEvents.map((e) => (
                      <div key={e.id} className="border rounded p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{e.kind}</div>
                          <div className="text-xs text-muted-foreground">{new Date(e.occurredAt).toLocaleString()}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">Actor: {e.actorType}{e.actorUserId ? `#${e.actorUserId}` : ''}</div>
                        {e.reasonCodes?.length ? (
                          <div className="text-xs mt-1">Reasons: {e.reasonCodes.join(', ')}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
