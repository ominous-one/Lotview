import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, Facebook, ExternalLink, Loader2, CheckCircle, XCircle, AlertCircle, ShieldAlert } from "lucide-react";
import { format } from "date-fns";

interface FBAccount {
  id: number;
  dealershipId: number;
  userId: number;
  accountSlot: number;
  accountName: string;
  facebookEmail: string;
  facebookUserId: string | null;
  profileId: string;
  status: string;
  lastAuthAt: string | null;
  sessionExpiresAt: string | null;
  postsToday: number;
  postsThisWeek: number;
  totalPosts: number;
  dailyLimit: number;
  warmupComplete: boolean;
  lastPostAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FBStats {
  totalAccounts: number;
  activeAccounts: number;
  totalPosts: number;
  postsToday: number;
  activeListings: number;
  pendingListings: number;
}

export function MyFBAccountsPanel() {
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [deleteAccountId, setDeleteAccountId] = useState<number | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["my-fb-accounts"],
    queryFn: () => apiGet<FBAccount[]>("/api/fb-marketplace/my-accounts"),
  });

  const { data: stats } = useQuery({
    queryKey: ["my-fb-stats"],
    queryFn: () => apiGet<FBStats>("/api/fb-marketplace/my-stats"),
  });

  const createAccountMutation = useMutation({
    mutationFn: (data: { accountName: string; facebookEmail: string }) =>
      apiPost("/api/fb-marketplace/my-accounts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-fb-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["my-fb-stats"] });
      setShowAddAccount(false);
      setNewAccountName("");
      setNewAccountEmail("");
      toast({ title: "Facebook account added", description: "Now connect your account to start posting." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (accountId: number) => apiDelete(`/api/fb-marketplace/my-accounts/${accountId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-fb-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["my-fb-stats"] });
      setDeleteAccountId(null);
      toast({ title: "Account removed" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const initiateAuthMutation = useMutation({
    mutationFn: (accountId: number) => apiPost(`/api/fb-marketplace/my-accounts/${accountId}/auth`),
    onSuccess: (data: any) => {
      window.open(data.authUrl, '_blank', 'width=600,height=700');
      toast({ 
        title: "Login Window Opened", 
        description: "Log in to Facebook in the popup window, then click 'Verify' when done." 
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const verifySessionMutation = useMutation({
    mutationFn: (accountId: number) => apiPost(`/api/fb-marketplace/my-accounts/${accountId}/verify`),
    onSuccess: (data: any) => {
      setIsAuthenticating(null);
      queryClient.invalidateQueries({ queryKey: ["my-fb-accounts"] });
      if (data.success) {
        toast({ title: "Account Connected", description: "Your Facebook account is ready for posting." });
      } else {
        toast({ title: "Verification Failed", description: "Please try logging in again.", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      setIsAuthenticating(null);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleAddAccount = () => {
    if (!newAccountName.trim() || !newAccountEmail.trim()) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    createAccountMutation.mutate({ accountName: newAccountName, facebookEmail: newAccountEmail });
  };

  const handleStartAuth = (accountId: number) => {
    setIsAuthenticating(accountId);
    initiateAuthMutation.mutate(accountId);
  };

  const handleVerifyAuth = (accountId: number) => {
    verifySessionMutation.mutate(accountId);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case 'needs_auth':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Needs Login</Badge>;
      case 'suspended':
        return <Badge variant="destructive"><ShieldAlert className="w-3 h-3 mr-1" />Suspended</Badge>;
      case 'expired':
        return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" />Session Expired</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const canAddMoreAccounts = accounts.length < 2;

  return (
    <div className="space-y-6" data-testid="my-fb-accounts-panel">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Facebook className="w-6 h-6 text-blue-500" />
            My Facebook Accounts
          </h2>
          <p className="text-muted-foreground">
            Connect up to 2 personal Facebook accounts for posting vehicles to Marketplace
          </p>
        </div>
        {canAddMoreAccounts && (
          <Button onClick={() => setShowAddAccount(true)} data-testid="button-add-fb-account">
            <Plus className="w-4 h-4 mr-2" />
            Add Account ({accounts.length}/2)
          </Button>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.activeAccounts}/{stats.totalAccounts}</div>
              <div className="text-sm text-muted-foreground">Active Accounts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.postsToday}</div>
              <div className="text-sm text-muted-foreground">Posts Today</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.totalPosts}</div>
              <div className="text-sm text-muted-foreground">Total Posts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.activeListings}</div>
              <div className="text-sm text-muted-foreground">Active Listings</div>
            </CardContent>
          </Card>
        </div>
      )}

      {accountsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Facebook className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No Facebook Accounts Connected</h3>
            <p className="text-muted-foreground mb-4">
              Connect your personal Facebook account to start posting vehicles to Marketplace
            </p>
            <Button onClick={() => setShowAddAccount(true)} data-testid="button-connect-first-account">
              <Plus className="w-4 h-4 mr-2" />
              Connect Facebook Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account) => (
            <Card key={account.id} data-testid={`card-fb-account-${account.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Facebook className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{account.accountName}</CardTitle>
                      <CardDescription>{account.facebookEmail}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(account.status)}
                    <Badge variant="outline">Slot {account.accountSlot}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Posts Today</div>
                    <div className="text-lg font-medium">{account.postsToday}/{account.dailyLimit}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">This Week</div>
                    <div className="text-lg font-medium">{account.postsThisWeek}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Total Posts</div>
                    <div className="text-lg font-medium">{account.totalPosts}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Status</div>
                    <div className="text-lg font-medium">
                      {account.warmupComplete ? 'Ready' : 'Warming Up'}
                    </div>
                  </div>
                </div>

                {account.lastPostAt && (
                  <p className="text-sm text-muted-foreground mb-4">
                    Last posted: {format(new Date(account.lastPostAt), "MMM d, yyyy h:mm a")}
                  </p>
                )}

                {account.lastError && (
                  <div className="bg-destructive/10 text-destructive text-sm p-3 rounded mb-4">
                    {account.lastError}
                  </div>
                )}

                <div className="flex gap-2">
                  {account.status === 'needs_auth' || account.status === 'expired' ? (
                    <>
                      <Button 
                        onClick={() => handleStartAuth(account.id)}
                        disabled={isAuthenticating === account.id}
                        data-testid={`button-connect-${account.id}`}
                      >
                        {isAuthenticating === account.id ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Facebook className="w-4 h-4 mr-2" />
                        )}
                        Connect to Facebook
                      </Button>
                      {isAuthenticating === account.id && (
                        <Button 
                          variant="outline"
                          onClick={() => handleVerifyAuth(account.id)}
                          disabled={verifySessionMutation.isPending}
                          data-testid={`button-verify-${account.id}`}
                        >
                          {verifySessionMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4 mr-2" />
                          )}
                          Verify Login
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button 
                      variant="outline"
                      onClick={() => handleStartAuth(account.id)}
                      data-testid={`button-reconnect-${account.id}`}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Re-authenticate
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    className="text-destructive"
                    onClick={() => setDeleteAccountId(account.id)}
                    data-testid={`button-delete-${account.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAddAccount} onOpenChange={setShowAddAccount}>
        <DialogContent data-testid="dialog-add-fb-account">
          <DialogHeader>
            <DialogTitle>Add Facebook Account</DialogTitle>
            <DialogDescription>
              Connect a personal Facebook account to post vehicles to Marketplace.
              You can connect up to 2 accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="accountName">Account Name</Label>
              <Input
                id="accountName"
                placeholder="e.g., My Personal Account"
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
                placeholder="your.email@example.com"
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
              onClick={handleAddAccount}
              disabled={createAccountMutation.isPending}
              data-testid="button-confirm-add"
            >
              {createAccountMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAccountId !== null} onOpenChange={() => setDeleteAccountId(null)}>
        <DialogContent data-testid="dialog-delete-fb-account">
          <DialogHeader>
            <DialogTitle>Remove Facebook Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this Facebook account? 
              Any active listings will remain on Marketplace but won't be managed anymore.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAccountId(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => deleteAccountId && deleteAccountMutation.mutate(deleteAccountId)}
              disabled={deleteAccountMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteAccountMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remove Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
