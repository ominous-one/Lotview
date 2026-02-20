import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Link2, Link2Off, Settings, RefreshCw, Users, Calendar, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface GhlIntegrationDialogProps {
  dealershipId: number;
  dealershipName: string;
  active?: boolean;
  onSuccess?: () => void;
}

interface GhlAccount {
  id: number;
  locationId: string;
  locationName: string | null;
  isActive: boolean;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  syncError: string | null;
}

interface GhlConfig {
  syncContacts: boolean;
  syncAppointments: boolean;
  syncOpportunities: boolean;
  bidirectionalSync: boolean;
  salesCalendarId: string | null;
  serviceCalendarId: string | null;
  salesPipelineId: string | null;
  defaultLeadStageId: string | null;
}

interface SyncStats {
  contactsSynced: number;
  appointmentsSynced: number;
  pendingContacts: number;
  pendingAppointments: number;
  lastSyncAt: string | null;
}

export function GhlIntegrationDialog({ dealershipId, dealershipName, active = false, onSuccess }: GhlIntegrationDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<GhlAccount | null>(null);
  const [config, setConfig] = useState<GhlConfig | null>(null);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [calendars, setCalendars] = useState<{ id: string; name: string }[]>([]);
  const [pipelines, setPipelines] = useState<{ id: string; name: string; stages: { id: string; name: string }[] }[]>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);

  const fetchData = async () => {
    if (!open) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const headers = { Authorization: `Bearer ${token}` };

      const [accountRes, configRes, statsRes] = await Promise.all([
        fetch(`/api/ghl/account?dealershipId=${dealershipId}`, { headers }),
        fetch(`/api/ghl/config?dealershipId=${dealershipId}`, { headers }),
        fetch(`/api/ghl/sync/stats?dealershipId=${dealershipId}`, { headers }).catch(() => null)
      ]);

      if (accountRes.ok) {
        const data = await accountRes.json();
        setAccount(data);
        
        if (data?.isActive) {
          const [calRes, pipeRes] = await Promise.all([
            fetch(`/api/ghl/calendars?dealershipId=${dealershipId}`, { headers }),
            fetch(`/api/ghl/pipelines?dealershipId=${dealershipId}`, { headers })
          ]);

          if (calRes.ok) {
            const calData = await calRes.json();
            setCalendars(calData.calendars || []);
          }

          if (pipeRes.ok) {
            const pipeData = await pipeRes.json();
            setPipelines(pipeData.pipelines || []);
          }
        }
      }

      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data);
      } else {
        setConfig({
          syncContacts: true,
          syncAppointments: true,
          syncOpportunities: false,
          bidirectionalSync: false,
          salesCalendarId: null,
          serviceCalendarId: null,
          salesPipelineId: null,
          defaultLeadStageId: null
        });
      }

      if (statsRes?.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error fetching GHL data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [open, dealershipId]);

  const handleConnect = () => {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `/api/ghl/auth/init?dealershipId=${dealershipId}&returnUrl=${returnUrl}`;
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect FWC? This will stop all syncing.")) return;
    
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/ghl/disconnect?dealershipId=${dealershipId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        toast({ title: "Disconnected", description: "FWC has been disconnected" });
        setAccount(null);
        onSuccess?.();
      } else {
        throw new Error("Failed to disconnect");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to disconnect FWC", variant: "destructive" });
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/ghl/config?dealershipId=${dealershipId}`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(config)
      });

      if (res.ok) {
        toast({ title: "Saved", description: "Settings saved successfully" });
        onSuccess?.();
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/ghl/test-connection?dealershipId=${dealershipId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (data.success) {
        toast({ title: "Connected", description: `Successfully connected to ${data.locationName || "FWC"}` });
      } else {
        toast({ title: "Connection Failed", description: data.message || "Could not connect to FWC", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to test connection", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/ghl/sync/run?dealershipId=${dealershipId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (data.success) {
        toast({ 
          title: "Sync Complete", 
          description: `Synced ${data.contactsSynced || 0} contacts, ${data.appointmentsSynced || 0} appointments`
        });
        await fetchData();
      } else {
        toast({ title: "Sync Failed", description: data.errors?.[0] || "Unknown error", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to run sync", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={active ? "outline" : "ghost"}
          size="sm"
          className={`flex items-center gap-2 ${active ? "border-green-500 text-green-700 hover:bg-green-50" : "text-muted-foreground hover:text-foreground"}`}
          data-testid={`ghl-integration-${dealershipId}`}
        >
          {active ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
          <span className="hidden sm:inline">FWC</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            FWC Integration - {dealershipName}
          </DialogTitle>
          <DialogDescription>
            Connect to Framework Consulting Software for bidirectional contact and appointment sync
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !account?.isActive ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connect Your Account</CardTitle>
              <CardDescription>
                Link your FWC account to enable CRM synchronization with Lotview.ai and PBS DMS.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleConnect} className="w-full" data-testid="ghl-connect-btn">
                <Link2 className="mr-2 h-4 w-4" />
                Connect to FWC
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="status" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="status" data-testid="ghl-tab-status">Status</TabsTrigger>
              <TabsTrigger value="sync" data-testid="ghl-tab-sync">Sync Settings</TabsTrigger>
              <TabsTrigger value="mappings" data-testid="ghl-tab-mappings">Mappings</TabsTrigger>
            </TabsList>

            <TabsContent value="status" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">Connection Status</CardTitle>
                      <CardDescription className="text-sm">
                        {account.locationName || account.locationId}
                      </CardDescription>
                    </div>
                    <Badge variant={account.isActive ? "default" : "destructive"} className="flex items-center gap-1">
                      {account.isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {account.isActive ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {account.syncError && (
                    <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{account.syncError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Location ID:</span>
                      <p className="font-mono text-xs">{account.locationId}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Token Expires:</span>
                      <p>{account.tokenExpiresAt ? new Date(account.tokenExpiresAt).toLocaleDateString() : "Unknown"}</p>
                    </div>
                  </div>

                  {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">{stats.contactsSynced}</div>
                        <div className="text-xs text-muted-foreground">Contacts Synced</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">{stats.appointmentsSynced}</div>
                        <div className="text-xs text-muted-foreground">Appointments Synced</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-amber-600">{stats.pendingContacts}</div>
                        <div className="text-xs text-muted-foreground">Pending Contacts</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-amber-600">{stats.pendingAppointments}</div>
                        <div className="text-xs text-muted-foreground">Pending Appointments</div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-4">
                    <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing} data-testid="ghl-test-btn">
                      {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Test Connection
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleManualSync} disabled={syncing} data-testid="ghl-sync-btn">
                      {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Run Sync Now
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleDisconnect} data-testid="ghl-disconnect-btn">
                      <Link2Off className="mr-2 h-4 w-4" />
                      Disconnect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sync" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Sync Configuration</CardTitle>
                  <CardDescription>Choose what data to sync between systems</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Sync Contacts
                        </Label>
                        <p className="text-sm text-muted-foreground">Sync contacts between FWC, Lotview, and PBS</p>
                      </div>
                      <Switch
                        checked={config?.syncContacts}
                        onCheckedChange={(checked) => setConfig(c => c ? { ...c, syncContacts: checked } : c)}
                        data-testid="ghl-sync-contacts"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Sync Appointments
                        </Label>
                        <p className="text-sm text-muted-foreground">Sync appointments between FWC and PBS</p>
                      </div>
                      <Switch
                        checked={config?.syncAppointments}
                        onCheckedChange={(checked) => setConfig(c => c ? { ...c, syncAppointments: checked } : c)}
                        data-testid="ghl-sync-appointments"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Sync Opportunities</Label>
                        <p className="text-sm text-muted-foreground">Create opportunities for vehicle interests</p>
                      </div>
                      <Switch
                        checked={config?.syncOpportunities}
                        onCheckedChange={(checked) => setConfig(c => c ? { ...c, syncOpportunities: checked } : c)}
                        data-testid="ghl-sync-opportunities"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="space-y-0.5">
                        <Label className="text-base">Bidirectional Sync</Label>
                        <p className="text-sm text-muted-foreground">Also sync PBS changes back to FWC</p>
                      </div>
                      <Switch
                        checked={config?.bidirectionalSync}
                        onCheckedChange={(checked) => setConfig(c => c ? { ...c, bidirectionalSync: checked } : c)}
                        data-testid="ghl-bidirectional"
                      />
                    </div>
                  </div>

                  <Button onClick={handleSaveConfig} disabled={saving} className="w-full" data-testid="ghl-save-config">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Configuration
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mappings" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Calendar Mappings</CardTitle>
                  <CardDescription>Map FWC calendars to appointment types</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Sales Calendar</Label>
                    <select
                      value={config?.salesCalendarId || ""}
                      onChange={(e) => setConfig(c => c ? { ...c, salesCalendarId: e.target.value || null } : c)}
                      className="w-full p-2 border rounded-md bg-background"
                      data-testid="ghl-sales-calendar"
                    >
                      <option value="">Select a calendar...</option>
                      {calendars.map(cal => (
                        <option key={cal.id} value={cal.id}>{cal.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Service Calendar</Label>
                    <select
                      value={config?.serviceCalendarId || ""}
                      onChange={(e) => setConfig(c => c ? { ...c, serviceCalendarId: e.target.value || null } : c)}
                      className="w-full p-2 border rounded-md bg-background"
                      data-testid="ghl-service-calendar"
                    >
                      <option value="">Select a calendar...</option>
                      {calendars.map(cal => (
                        <option key={cal.id} value={cal.id}>{cal.name}</option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Pipeline Mappings</CardTitle>
                  <CardDescription>Map FWC pipelines for opportunity creation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Sales Pipeline</Label>
                    <select
                      value={config?.salesPipelineId || ""}
                      onChange={(e) => setConfig(c => c ? { ...c, salesPipelineId: e.target.value || null } : c)}
                      className="w-full p-2 border rounded-md bg-background"
                      data-testid="ghl-sales-pipeline"
                    >
                      <option value="">Select a pipeline...</option>
                      {pipelines.map(pipe => (
                        <option key={pipe.id} value={pipe.id}>{pipe.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Default Lead Stage</Label>
                    <select
                      value={config?.defaultLeadStageId || ""}
                      onChange={(e) => setConfig(c => c ? { ...c, defaultLeadStageId: e.target.value || null } : c)}
                      className="w-full p-2 border rounded-md bg-background"
                      data-testid="ghl-default-stage"
                    >
                      <option value="">Select a stage...</option>
                      {pipelines.find(p => p.id === config?.salesPipelineId)?.stages.map(stage => (
                        <option key={stage.id} value={stage.id}>{stage.name}</option>
                      ))}
                    </select>
                  </div>

                  <Button onClick={handleSaveConfig} disabled={saving} className="w-full" data-testid="ghl-save-mappings">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Mappings
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
