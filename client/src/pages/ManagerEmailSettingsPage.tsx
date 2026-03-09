import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navbar } from '@/components/Navbar';
import { apiGet, apiPost } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Manager = {
  id: number;
  name: string;
  email: string;
  notificationEmail: string | null;
  notificationEmailVerifiedAt: string | null;
  notificationEmailHardBouncedAt: string | null;
  notificationEmailSpamComplaintAt: string | null;
};

export default function ManagerEmailSettingsPage() {
  const { data, refetch, isLoading } = useQuery<{ managers: Manager[] }>({
    queryKey: ['/api/notifications/settings/manager-emails'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      return apiGet('/api/notifications/settings/manager-emails', { Authorization: `Bearer ${token}` });
    },
  });

  const [draft, setDraft] = useState<Record<number, string>>({});

  const startVerify = async (userId: number) => {
    const email = (draft[userId] || '').trim();
    if (!email) return;
    const token = localStorage.getItem('auth_token');
    await apiPost(
      `/api/notifications/settings/manager-emails/${userId}/start-verify`,
      { email },
      { Authorization: `Bearer ${token}` }
    );
    await refetch();
  };

  const managers = data?.managers || [];
  const anyVerified = managers.some((m) => !!m.notificationEmailVerifiedAt);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-6 space-y-6" data-testid="manager-email-settings-page">
        <h1 className="text-xl font-semibold">Manager notification emails</h1>

        {!anyVerified ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Action required</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                No verified manager email exists. Appointment booking is allowed, but the system will require an escalation email
                to send required appointment notifications.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales managers</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : managers.length === 0 ? (
              <div className="text-sm text-muted-foreground">No sales managers found for this dealership.</div>
            ) : (
              <div className="space-y-3">
                {managers.map((m) => {
                  const verified = !!m.notificationEmailVerifiedAt && !m.notificationEmailHardBouncedAt && !m.notificationEmailSpamComplaintAt;
                  const current = m.notificationEmail || m.email;
                  return (
                    <div key={m.id} className="border rounded p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-muted-foreground">Login email: {m.email}</div>
                        </div>
                        <Badge variant={verified ? 'default' : 'secondary'}>{verified ? 'Verified' : 'Not verified'}</Badge>
                      </div>

                      <div className="grid md:grid-cols-3 gap-2 items-end">
                        <div className="md:col-span-2">
                          <div className="text-xs text-muted-foreground mb-1">Notification email</div>
                          <Input
                            value={draft[m.id] ?? current}
                            onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                          />
                        </div>
                        <Button onClick={() => startVerify(m.id)}>
                          Send verification link
                        </Button>
                      </div>

                      {m.notificationEmailHardBouncedAt ? (
                        <div className="text-xs text-red-600">Hard bounce detected at {new Date(m.notificationEmailHardBouncedAt).toLocaleString()}</div>
                      ) : null}
                      {m.notificationEmailSpamComplaintAt ? (
                        <div className="text-xs text-red-600">Spam complaint detected at {new Date(m.notificationEmailSpamComplaintAt).toLocaleString()}</div>
                      ) : null}
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
