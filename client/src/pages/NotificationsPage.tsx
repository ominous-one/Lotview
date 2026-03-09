import { useQuery } from '@tanstack/react-query';
import { Navbar } from '@/components/Navbar';
import { apiGet, apiPost } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';

type Notification = {
  id: string;
  title: string;
  body: string;
  deepLink: string | null;
  isRead: boolean;
  createdAt: string;
};

export default function NotificationsPage() {
  const { data, refetch, isLoading } = useQuery<{ notifications: Notification[] }>({
    queryKey: ['/api/notifications'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      return apiGet('/api/notifications?limit=100', { Authorization: `Bearer ${token}` });
    },
  });

  const markRead = async (id: string) => {
    const token = localStorage.getItem('auth_token');
    await apiPost(`/api/notifications/${id}/read`, {}, { Authorization: `Bearer ${token}` });
    await refetch();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-6 space-y-6" data-testid="notifications-page">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Notifications</h1>
          <Link href="/manager/notifications/settings">
            <Button variant="outline">Manager email settings</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feed</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : !data?.notifications?.length ? (
              <div className="text-sm text-muted-foreground">No notifications yet.</div>
            ) : (
              <div className="space-y-2">
                {data.notifications.map((n) => (
                  <div key={n.id} className="border rounded p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{n.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={n.isRead ? 'secondary' : 'default'}>{n.isRead ? 'Read' : 'New'}</Badge>
                        {!n.isRead ? (
                          <Button size="sm" variant="outline" onClick={() => markRead(n.id)}>Mark read</Button>
                        ) : null}
                      </div>
                    </div>
                    <pre className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground">{n.body}</pre>
                    {n.deepLink ? (
                      <div className="mt-2">
                        <a className="text-sm underline" href={n.deepLink}>Open</a>
                      </div>
                    ) : null}
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
