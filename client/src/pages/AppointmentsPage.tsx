import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Navbar } from '@/components/Navbar';
import { apiGet, apiPost } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Plus } from 'lucide-react';

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
  vehicleId: number | null;
};

export default function AppointmentsPage() {
  const [startAt, setStartAt] = useState('');
  const [timezone, setTimezone] = useState('America/Vancouver');
  const [type, setType] = useState<'IN_PERSON_VISIT' | 'TEST_DRIVE' | 'PHONE_CALL'>('IN_PERSON_VISIT');
  const [leadName, setLeadName] = useState('');
  const [escalationEmail, setEscalationEmail] = useState('');

  const { data, refetch, isLoading } = useQuery<{ appointments: Appointment[] }>({
    queryKey: ['/api/appointments'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      return apiGet('/api/appointments', { Authorization: `Bearer ${token}` });
    },
  });

  const create = async () => {
    const token = localStorage.getItem('auth_token');
    await apiPost(
      '/api/appointments',
      {
        type,
        status: 'BOOKED',
        startAt: new Date(startAt).toISOString(),
        timezone,
        leadName: leadName || null,
        sourceChannel: 'manual',
        idempotencyKey: `manual:${Date.now()}`,
        escalationEmail: escalationEmail || null,
      },
      { Authorization: `Bearer ${token}` }
    );
    setLeadName('');
    await refetch();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-6 space-y-6" data-testid="appointments-page">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Appointments (LotView Calendar)</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick book (internal calendar)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label>Date/time</Label>
              <Input value={startAt} onChange={(e) => setStartAt(e.target.value)} placeholder="2026-03-09T10:30" />
              <p className="text-xs text-muted-foreground mt-1">ISO-ish local input. Stored as timestamptz.</p>
            </div>
            <div>
              <Label>Timezone</Label>
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_PERSON_VISIT">In person</SelectItem>
                  <SelectItem value="TEST_DRIVE">Test drive</SelectItem>
                  <SelectItem value="PHONE_CALL">Phone call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lead name</Label>
              <Input value={leadName} onChange={(e) => setLeadName(e.target.value)} />
            </div>

            <div className="md:col-span-5">
              <Label>Escalation email (required if no verified manager email exists)</Label>
              <Input value={escalationEmail} onChange={(e) => setEscalationEmail(e.target.value)} placeholder="manager@dealership.com" />
            </div>

            <div className="md:col-span-5">
              <Button onClick={create} disabled={!startAt}>
                <Plus className="h-4 w-4 mr-2" />
                Book appointment
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : !data?.appointments?.length ? (
              <div className="text-sm text-muted-foreground">No appointments found.</div>
            ) : (
              <div className="space-y-2">
                {data.appointments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between border rounded p-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.leadName || 'Unknown buyer'}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(a.startAt).toLocaleString()} ({a.timezone}) • {a.type}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{a.status}</Badge>
                      <Link href={`/manager/appointments/${a.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
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
