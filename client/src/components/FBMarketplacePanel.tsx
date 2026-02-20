import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, Play, Pause, Users, Clock, Activity, CheckCircle, XCircle, AlertCircle, Loader2, Facebook, ExternalLink, Car, List } from "lucide-react";
import { format } from "date-fns";

interface FBMarketplaceAccount {
  id: number;
  dealershipId: number;
  accountName: string;
  facebookEmail: string;
  userId: number | null;
  status: string;
  lastUsedAt: string | null;
  totalPosts: number;
  dailyPostCount: number;
  isInWarmup: boolean;
  warmupEndsAt: string | null;
  errorCount: number;
  lastError: string | null;
  createdAt: string;
}

interface FBMarketplaceListing {
  listing: {
    id: number;
    vehicleId: number;
    accountId: number;
    status: string;
    fbListingId: string | null;
    fbListingUrl: string | null;
    postedAt: string | null;
    lastCheckedAt: string | null;
    views: number;
    messages: number;
    errorMessage: string | null;
    createdAt: string;
  };
  vehicle: {
    id: number;
    year: number;
    make: string;
    model: string;
    trim: string;
    price: number;
    stockNumber: string;
  } | null;
  account: FBMarketplaceAccount | null;
}

interface FBMarketplaceQueueItem {
  queue: {
    id: number;
    vehicleId: number;
    accountId: number | null;
    status: string;
    priority: number;
    scheduledFor: string | null;
    attempts: number;
    lastAttemptAt: string | null;
    errorMessage: string | null;
    createdAt: string;
  };
  vehicle: {
    id: number;
    year: number;
    make: string;
    model: string;
    trim: string;
    price: number;
    stockNumber: string;
  } | null;
  account: FBMarketplaceAccount | null;
}

interface FBMarketplaceActivity {
  id: number;
  dealershipId: number;
  accountId: number | null;
  listingId: number | null;
  vehicleId: number | null;
  action: string;
  status: string;
  details: string | null;
  createdAt: string;
}

interface FBMarketplaceSettings {
  dealershipId: number;
  isEnabled: boolean;
  maxDailyPosts: number;
  minDelayMinutes: number;
  maxDelayMinutes: number;
  warmupDays: number;
  warmupInitialPosts: number;
  autoRenewDays: number;
  defaultDescription: string | null;
}

interface Props {
  dealershipId: number;
}

export function FBMarketplacePanel({ dealershipId }: Props) {
  const [activeTab, setActiveTab] = useState("accounts");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [authAccountId, setAuthAccountId] = useState<number | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["fb-marketplace-settings", dealershipId],
    queryFn: () => apiGet<FBMarketplaceSettings>(`/api/super-admin/fb-marketplace/settings/${dealershipId}`),
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["fb-marketplace-accounts", dealershipId],
    queryFn: () => apiGet<FBMarketplaceAccount[]>(`/api/super-admin/fb-marketplace/accounts/${dealershipId}`),
  });

  const { data: listings = [], isLoading: listingsLoading } = useQuery({
    queryKey: ["fb-marketplace-listings", dealershipId],
    queryFn: () => apiGet<FBMarketplaceListing[]>(`/api/super-admin/fb-marketplace/listings/${dealershipId}`),
  });

  const { data: queue = [], isLoading: queueLoading } = useQuery({
    queryKey: ["fb-marketplace-queue", dealershipId],
    queryFn: () => apiGet<FBMarketplaceQueueItem[]>(`/api/super-admin/fb-marketplace/queue/${dealershipId}`),
  });

  const { data: activity = [], isLoading: activityLoading } = useQuery({
    queryKey: ["fb-marketplace-activity", dealershipId],
    queryFn: () => apiGet<FBMarketplaceActivity[]>(`/api/super-admin/fb-marketplace/activity/${dealershipId}`),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: Partial<FBMarketplaceSettings>) => 
      apiPut(`/api/super-admin/fb-marketplace/settings/${dealershipId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fb-marketplace-settings", dealershipId] });
      toast({ title: "Settings updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: (data: { accountName: string; facebookEmail: string }) =>
      apiPost(`/api/super-admin/fb-marketplace/accounts/${dealershipId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fb-marketplace-accounts", dealershipId] });
      setShowAddAccount(false);
      setNewAccountName("");
      setNewAccountEmail("");
      toast({ title: "Account added" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (accountId: number) =>
      apiDelete(`/api/super-admin/fb-marketplace/accounts/${accountId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fb-marketplace-accounts", dealershipId] });
      toast({ title: "Account deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const initiateAuthMutation = useMutation({
    mutationFn: (accountId: number) =>
      apiPost<{ authUrl: string; message: string }>(`/api/super-admin/fb-marketplace/accounts/${accountId}/auth`, {}),
    onSuccess: (data) => {
      toast({ 
        title: "Authentication Started", 
        description: "A browser window will open for Facebook login. Complete the login, then click 'Verify Session'." 
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const verifySessionMutation = useMutation({
    mutationFn: (accountId: number) =>
      apiPost<{ success: boolean }>(`/api/super-admin/fb-marketplace/accounts/${accountId}/verify`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["fb-marketplace-accounts", dealershipId] });
      setAuthAccountId(null);
      if (data.success) {
        toast({ title: "Session verified", description: "Account is now ready to post" });
      } else {
        toast({ title: "Verification failed", description: "Please try authenticating again", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const processQueueMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/super-admin/fb-marketplace/process-queue/${dealershipId}`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["fb-marketplace-queue", dealershipId] });
      queryClient.invalidateQueries({ queryKey: ["fb-marketplace-listings", dealershipId] });
      queryClient.invalidateQueries({ queryKey: ["fb-marketplace-activity", dealershipId] });
      toast({ title: "Queue processed" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "posted":
      case "success":
        return <Badge className="bg-green-500">{status}</Badge>;
      case "pending":
      case "processing":
        return <Badge className="bg-yellow-500">{status}</Badge>;
      case "failed":
      case "error":
      case "suspended":
        return <Badge className="bg-red-500">{status}</Badge>;
      case "needs_auth":
        return <Badge className="bg-orange-500">{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const activeAccounts = accounts.filter(a => a.status === "active").length;
  const pendingListings = listings.filter(l => l.listing.status === "pending").length;
  const postedListings = listings.filter(l => l.listing.status === "posted").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Facebook className="h-6 w-6 text-blue-500" />
            Facebook Marketplace Automation
          </h2>
          <p className="text-muted-foreground">
            Manage personal Facebook accounts and automate vehicle listings
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="enabled">Automation Enabled</Label>
            <Switch
              id="enabled"
              checked={settings?.isEnabled ?? false}
              onCheckedChange={(checked) => updateSettingsMutation.mutate({ isEnabled: checked })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeAccounts}</div>
            <p className="text-xs text-muted-foreground">{accounts.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Posted Listings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{postedListings}</div>
            <p className="text-xs text-muted-foreground">{pendingListings} pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{queue.length}</div>
            <p className="text-xs text-muted-foreground">items waiting</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Daily Limit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{settings?.maxDailyPosts || 10}</div>
            <p className="text-xs text-muted-foreground">posts per account</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="accounts" data-testid="fbmp-tab-accounts">
            <Users className="h-4 w-4 mr-2" />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="listings" data-testid="fbmp-tab-listings">
            <Car className="h-4 w-4 mr-2" />
            Listings
          </TabsTrigger>
          <TabsTrigger value="queue" data-testid="fbmp-tab-queue">
            <List className="h-4 w-4 mr-2" />
            Queue
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="fbmp-tab-activity">
            <Activity className="h-4 w-4 mr-2" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="fbmp-tab-settings">
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Facebook Accounts</h3>
            <Dialog open={showAddAccount} onOpenChange={setShowAddAccount}>
              <DialogTrigger asChild>
                <Button data-testid="btn-add-fb-account">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Account
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Facebook Account</DialogTitle>
                  <DialogDescription>
                    Add a sales rep's personal Facebook account for posting to Marketplace
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="accountName">Account Name</Label>
                    <Input
                      id="accountName"
                      placeholder="e.g., John Smith"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      data-testid="input-account-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="facebookEmail">Facebook Email</Label>
                    <Input
                      id="facebookEmail"
                      type="email"
                      placeholder="john@example.com"
                      value={newAccountEmail}
                      onChange={(e) => setNewAccountEmail(e.target.value)}
                      data-testid="input-facebook-email"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddAccount(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => createAccountMutation.mutate({
                      accountName: newAccountName,
                      facebookEmail: newAccountEmail,
                    })}
                    disabled={!newAccountName || !newAccountEmail || createAccountMutation.isPending}
                    data-testid="btn-save-account"
                  >
                    {createAccountMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Account
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {accountsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : accounts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No accounts configured</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Add Facebook accounts to start posting vehicles to Marketplace
                </p>
                <Button onClick={() => setShowAddAccount(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Account
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Posts Today</TableHead>
                  <TableHead>Total Posts</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.accountName}</TableCell>
                    <TableCell>{account.facebookEmail}</TableCell>
                    <TableCell>
                      {getStatusBadge(account.status)}
                      {account.isInWarmup && (
                        <Badge variant="outline" className="ml-2">Warmup</Badge>
                      )}
                    </TableCell>
                    <TableCell>{account.dailyPostCount}</TableCell>
                    <TableCell>{account.totalPosts}</TableCell>
                    <TableCell>
                      {account.lastUsedAt
                        ? format(new Date(account.lastUsedAt), "MMM d, HH:mm")
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {account.status === "needs_auth" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAuthAccountId(account.id);
                                initiateAuthMutation.mutate(account.id);
                              }}
                              disabled={initiateAuthMutation.isPending}
                              data-testid={`btn-auth-${account.id}`}
                            >
                              {initiateAuthMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Authenticate"
                              )}
                            </Button>
                            {authAccountId === account.id && (
                              <Button
                                size="sm"
                                onClick={() => verifySessionMutation.mutate(account.id)}
                                disabled={verifySessionMutation.isPending}
                                data-testid={`btn-verify-${account.id}`}
                              >
                                {verifySessionMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Verify Session"
                                )}
                              </Button>
                            )}
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this account?")) {
                              deleteAccountMutation.mutate(account.id);
                            }
                          }}
                          data-testid={`btn-delete-${account.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="listings" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Active Listings</h3>
            <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["fb-marketplace-listings", dealershipId] })}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {listingsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : listings.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Car className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No listings yet</h3>
                <p className="text-muted-foreground text-sm">
                  Queue vehicles to start posting to Facebook Marketplace
                </p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.map((item) => (
                  <TableRow key={item.listing.id}>
                    <TableCell className="font-medium">
                      {item.vehicle
                        ? `${item.vehicle.year} ${item.vehicle.make} ${item.vehicle.model}`
                        : `Vehicle #${item.listing.vehicleId}`}
                    </TableCell>
                    <TableCell>{item.account?.accountName || "-"}</TableCell>
                    <TableCell>{getStatusBadge(item.listing.status)}</TableCell>
                    <TableCell>
                      {item.listing.postedAt
                        ? format(new Date(item.listing.postedAt), "MMM d, HH:mm")
                        : "-"}
                    </TableCell>
                    <TableCell>{item.listing.views}</TableCell>
                    <TableCell>{item.listing.messages}</TableCell>
                    <TableCell>
                      {item.listing.fbListingUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(item.listing.fbListingUrl!, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Posting Queue</h3>
            <div className="flex gap-2">
              <Button
                onClick={() => processQueueMutation.mutate()}
                disabled={processQueueMutation.isPending || queue.length === 0}
                data-testid="btn-process-queue"
              >
                {processQueueMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Process Queue
              </Button>
            </div>
          </div>

          {queueLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : queue.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <List className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Queue is empty</h3>
                <p className="text-muted-foreground text-sm">
                  Add vehicles to the queue from the inventory management section
                </p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => (
                  <TableRow key={item.queue.id}>
                    <TableCell className="font-medium">
                      {item.vehicle
                        ? `${item.vehicle.year} ${item.vehicle.make} ${item.vehicle.model}`
                        : `Vehicle #${item.queue.vehicleId}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.queue.priority}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(item.queue.status)}</TableCell>
                    <TableCell>
                      {item.queue.scheduledFor
                        ? format(new Date(item.queue.scheduledFor), "MMM d, HH:mm")
                        : "ASAP"}
                    </TableCell>
                    <TableCell>{item.queue.attempts}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {item.queue.errorMessage || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Activity Log</h3>
            <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["fb-marketplace-activity", dealershipId] })}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {activityLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : activity.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No activity yet</h3>
                <p className="text-muted-foreground text-sm">
                  Activity will appear here as accounts post and interact
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(item.createdAt), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell>{item.action}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {item.details || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Automation Settings</CardTitle>
              <CardDescription>Configure posting limits, delays, and warmup periods</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="maxDailyPosts">Max Daily Posts per Account</Label>
                  <Input
                    id="maxDailyPosts"
                    type="number"
                    value={settings?.maxDailyPosts || 10}
                    onChange={(e) => updateSettingsMutation.mutate({ maxDailyPosts: parseInt(e.target.value) })}
                    data-testid="input-max-daily-posts"
                  />
                  <p className="text-xs text-muted-foreground">Recommended: 5-10 to avoid detection</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="autoRenewDays">Auto-Renew Listings (days)</Label>
                  <Input
                    id="autoRenewDays"
                    type="number"
                    value={settings?.autoRenewDays || 7}
                    onChange={(e) => updateSettingsMutation.mutate({ autoRenewDays: parseInt(e.target.value) })}
                    data-testid="input-auto-renew-days"
                  />
                  <p className="text-xs text-muted-foreground">Renew listings after this many days</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minDelayMinutes">Min Delay Between Posts (minutes)</Label>
                  <Input
                    id="minDelayMinutes"
                    type="number"
                    value={settings?.minDelayMinutes || 5}
                    onChange={(e) => updateSettingsMutation.mutate({ minDelayMinutes: parseInt(e.target.value) })}
                    data-testid="input-min-delay"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxDelayMinutes">Max Delay Between Posts (minutes)</Label>
                  <Input
                    id="maxDelayMinutes"
                    type="number"
                    value={settings?.maxDelayMinutes || 15}
                    onChange={(e) => updateSettingsMutation.mutate({ maxDelayMinutes: parseInt(e.target.value) })}
                    data-testid="input-max-delay"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="warmupDays">Warmup Period (days)</Label>
                  <Input
                    id="warmupDays"
                    type="number"
                    value={settings?.warmupDays || 7}
                    onChange={(e) => updateSettingsMutation.mutate({ warmupDays: parseInt(e.target.value) })}
                    data-testid="input-warmup-days"
                  />
                  <p className="text-xs text-muted-foreground">New accounts post less during warmup</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="warmupInitialPosts">Initial Posts During Warmup</Label>
                  <Input
                    id="warmupInitialPosts"
                    type="number"
                    value={settings?.warmupInitialPosts || 2}
                    onChange={(e) => updateSettingsMutation.mutate({ warmupInitialPosts: parseInt(e.target.value) })}
                    data-testid="input-warmup-initial-posts"
                  />
                  <p className="text-xs text-muted-foreground">Posts per day during first week</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
