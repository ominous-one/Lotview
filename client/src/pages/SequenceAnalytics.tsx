import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  MessageSquare, 
  Target, 
  Clock, 
  Plus, 
  Pencil, 
  Trash2, 
  RefreshCw, 
  ArrowLeft,
  Mail,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  PlayCircle,
  PauseCircle
} from "lucide-react";
import { format, subDays } from "date-fns";

interface PerformanceSummary {
  totalExecutions: number;
  totalConversions: number;
  totalMessagesSent: number;
  averageOpenRate: number;
  averageReplyRate: number;
  averageConversionRate: number;
  topPerformingSequences: { sequenceId: number; name: string; conversionRate: number }[];
}

interface SequenceExecution {
  id: number;
  sequenceId: number;
  contactId: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  currentStep: number;
}

interface SequenceConversion {
  id: number;
  executionId: number;
  conversionType: string;
  value: number | null;
  occurredAt: string;
}

interface ReengagementCampaign {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  inactiveDays: number;
  sequenceId: number | null;
  targetContactType: string;
  maxEnrollmentsPerDay: number;
  lastRunAt: string | null;
  totalEnrolled: number;
  totalConverted: number;
  createdAt: string;
}

interface InactiveContact {
  id: number;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  lastActivityAt: string | null;
}

export default function SequenceAnalytics() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<ReengagementCampaign | null>(null);
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    description: "",
    inactiveDays: 90,
    targetContactType: "all",
    maxEnrollmentsPerDay: 50,
    isActive: true
  });

  const token = localStorage.getItem('auth_token');
  const headers = { 'Authorization': `Bearer ${token}` };

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<PerformanceSummary>({
    queryKey: ['sequence-analytics-summary', startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/automation/analytics/summary?startDate=${startDate}&endDate=${endDate}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch summary');
      return res.json();
    }
  });

  const { data: executions, isLoading: executionsLoading } = useQuery<SequenceExecution[]>({
    queryKey: ['sequence-executions'],
    queryFn: async () => {
      const res = await fetch('/api/automation/analytics/executions?limit=50', { headers });
      if (!res.ok) throw new Error('Failed to fetch executions');
      return res.json();
    }
  });

  const { data: conversions, isLoading: conversionsLoading } = useQuery<SequenceConversion[]>({
    queryKey: ['sequence-conversions', startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/automation/analytics/conversions?startDate=${startDate}&endDate=${endDate}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch conversions');
      return res.json();
    }
  });

  const { data: campaigns, isLoading: campaignsLoading, refetch: refetchCampaigns } = useQuery<ReengagementCampaign[]>({
    queryKey: ['reengagement-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/automation/reengagement-campaigns', { headers });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    }
  });

  const { data: inactiveContacts, isLoading: inactiveLoading } = useQuery<InactiveContact[]>({
    queryKey: ['inactive-contacts'],
    queryFn: async () => {
      const res = await fetch('/api/automation/inactive-contacts?inactiveDays=90&limit=100', { headers });
      if (!res.ok) throw new Error('Failed to fetch inactive contacts');
      return res.json();
    }
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: typeof newCampaign) => {
      const res = await fetch('/api/automation/reengagement-campaigns', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to create campaign');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Campaign created successfully" });
      refetchCampaigns();
      setIsCreateDialogOpen(false);
      setNewCampaign({ name: "", description: "", inactiveDays: 90, targetContactType: "all", maxEnrollmentsPerDay: 50, isActive: true });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create campaign", variant: "destructive" });
    }
  });

  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ReengagementCampaign> }) => {
      const res = await fetch(`/api/automation/reengagement-campaigns/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to update campaign');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Campaign updated successfully" });
      refetchCampaigns();
      setEditingCampaign(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update campaign", variant: "destructive" });
    }
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/automation/reengagement-campaigns/${id}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) throw new Error('Failed to delete campaign');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Campaign deleted successfully" });
      refetchCampaigns();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete campaign", variant: "destructive" });
    }
  });

  const toggleCampaignStatus = (campaign: ReengagementCampaign) => {
    updateCampaignMutation.mutate({ id: campaign.id, data: { isActive: !campaign.isActive } });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500" data-testid="badge-status-completed"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500" data-testid="badge-status-in-progress"><PlayCircle className="w-3 h-3 mr-1" />In Progress</Badge>;
      case 'failed':
        return <Badge className="bg-red-500" data-testid="badge-status-failed"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-500" data-testid="badge-status-paused"><PauseCircle className="w-3 h-3 mr-1" />Paused</Badge>;
      default:
        return <Badge data-testid="badge-status-unknown">{status}</Badge>;
    }
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 px-4 max-w-7xl mx-auto pb-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <button 
              onClick={() => setLocation("/manager")}
              className="mb-2 flex items-center gap-2 text-muted-foreground hover:text-primary transition text-sm"
              data-testid="button-back-manager"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Manager
            </button>
            <h1 className="text-3xl font-bold text-foreground" data-testid="page-title">Sequence Analytics</h1>
            <p className="text-muted-foreground">Track automation performance and re-engagement campaigns</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[140px]"
              data-testid="input-start-date"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[140px]"
              data-testid="input-end-date"
            />
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => refetchSummary()}
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="campaigns" data-testid="tab-campaigns">
              <Target className="w-4 h-4 mr-2" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="executions" data-testid="tab-executions">
              <PlayCircle className="w-4 h-4 mr-2" />
              Executions
            </TabsTrigger>
            <TabsTrigger value="inactive" data-testid="tab-inactive">
              <Users className="w-4 h-4 mr-2" />
              Inactive
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {summaryLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-24 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <Card data-testid="card-total-executions">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <PlayCircle className="w-4 h-4" />
                        Executions
                      </div>
                      <div className="text-2xl font-bold">{summary?.totalExecutions || 0}</div>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-total-conversions">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Target className="w-4 h-4" />
                        Conversions
                      </div>
                      <div className="text-2xl font-bold text-green-600">{summary?.totalConversions || 0}</div>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-messages-sent">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <MessageSquare className="w-4 h-4" />
                        Messages
                      </div>
                      <div className="text-2xl font-bold">{summary?.totalMessagesSent || 0}</div>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-open-rate">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <Mail className="w-4 h-4" />
                        Open Rate
                      </div>
                      <div className="text-2xl font-bold">{formatPercent(summary?.averageOpenRate || 0)}</div>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-reply-rate">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <MessageSquare className="w-4 h-4" />
                        Reply Rate
                      </div>
                      <div className="text-2xl font-bold">{formatPercent(summary?.averageReplyRate || 0)}</div>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-conversion-rate">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <TrendingUp className="w-4 h-4" />
                        Conv. Rate
                      </div>
                      <div className="text-2xl font-bold text-green-600">{formatPercent(summary?.averageConversionRate || 0)}</div>
                    </CardContent>
                  </Card>
                </div>

                {summary?.topPerformingSequences && summary.topPerformingSequences.length > 0 && (
                  <Card data-testid="card-top-sequences">
                    <CardHeader>
                      <CardTitle className="text-lg">Top Performing Sequences</CardTitle>
                      <CardDescription>Sequences ranked by conversion rate</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {summary.topPerformingSequences.map((seq, index) => (
                          <div key={seq.sequenceId} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid={`sequence-row-${seq.sequenceId}`}>
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                              <span className="font-medium">{seq.name}</span>
                            </div>
                            <Badge variant="outline" className="text-green-600">
                              {formatPercent(seq.conversionRate)} conversion
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {conversions && conversions.length > 0 && (
                  <Card data-testid="card-recent-conversions">
                    <CardHeader>
                      <CardTitle className="text-lg">Recent Conversions</CardTitle>
                      <CardDescription>Latest successful conversions from sequences</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Type</TableHead>
                              <TableHead>Value</TableHead>
                              <TableHead>Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {conversions.slice(0, 10).map((conv) => (
                              <TableRow key={conv.id} data-testid={`conversion-row-${conv.id}`}>
                                <TableCell>
                                  <Badge>{conv.conversionType}</Badge>
                                </TableCell>
                                <TableCell>{conv.value ? `$${conv.value.toLocaleString()}` : '—'}</TableCell>
                                <TableCell>{format(new Date(conv.occurredAt), 'MMM d, yyyy h:mm a')}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Re-engagement Campaigns</h2>
                <p className="text-sm text-muted-foreground">Automatically re-engage inactive contacts</p>
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-campaign">
                    <Plus className="w-4 h-4 mr-2" />
                    New Campaign
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Re-engagement Campaign</DialogTitle>
                    <DialogDescription>Set up automatic outreach to inactive contacts</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Campaign Name</Label>
                      <Input
                        id="name"
                        value={newCampaign.name}
                        onChange={(e) => setNewCampaign(p => ({ ...p, name: e.target.value }))}
                        placeholder="e.g., 90-Day Re-engagement"
                        data-testid="input-campaign-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Input
                        id="description"
                        value={newCampaign.description}
                        onChange={(e) => setNewCampaign(p => ({ ...p, description: e.target.value }))}
                        placeholder="Optional description"
                        data-testid="input-campaign-description"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="inactiveDays">Inactive Days</Label>
                        <Input
                          id="inactiveDays"
                          type="number"
                          value={newCampaign.inactiveDays}
                          onChange={(e) => setNewCampaign(p => ({ ...p, inactiveDays: parseInt(e.target.value) || 90 }))}
                          data-testid="input-inactive-days"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="maxEnrollments">Max Daily Enrollments</Label>
                        <Input
                          id="maxEnrollments"
                          type="number"
                          value={newCampaign.maxEnrollmentsPerDay}
                          onChange={(e) => setNewCampaign(p => ({ ...p, maxEnrollmentsPerDay: parseInt(e.target.value) || 50 }))}
                          data-testid="input-max-enrollments"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactType">Target Contact Type</Label>
                      <Select 
                        value={newCampaign.targetContactType} 
                        onValueChange={(v) => setNewCampaign(p => ({ ...p, targetContactType: v }))}
                      >
                        <SelectTrigger data-testid="select-contact-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Contacts</SelectItem>
                          <SelectItem value="leads">Leads Only</SelectItem>
                          <SelectItem value="customers">Past Customers</SelectItem>
                          <SelectItem value="service">Service Clients</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                    <Button 
                      onClick={() => createCampaignMutation.mutate(newCampaign)}
                      disabled={!newCampaign.name || createCampaignMutation.isPending}
                      data-testid="button-save-campaign"
                    >
                      {createCampaignMutation.isPending ? "Creating..." : "Create Campaign"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {campaignsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : campaigns && campaigns.length > 0 ? (
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <Card key={campaign.id} data-testid={`campaign-card-${campaign.id}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{campaign.name}</h3>
                            <Badge variant={campaign.isActive ? "default" : "secondary"}>
                              {campaign.isActive ? "Active" : "Paused"}
                            </Badge>
                          </div>
                          {campaign.description && (
                            <p className="text-sm text-muted-foreground mb-2">{campaign.description}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {campaign.inactiveDays} days inactive
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {campaign.totalEnrolled} enrolled
                            </span>
                            <span className="flex items-center gap-1">
                              <Target className="w-4 h-4" />
                              {campaign.totalConverted} converted
                            </span>
                            {campaign.lastRunAt && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                Last run: {format(new Date(campaign.lastRunAt), 'MMM d')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={campaign.isActive}
                            onCheckedChange={() => toggleCampaignStatus(campaign)}
                            data-testid={`switch-campaign-${campaign.id}`}
                          />
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setEditingCampaign(campaign)}
                            data-testid={`button-edit-campaign-${campaign.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this campaign?')) {
                                deleteCampaignMutation.mutate(campaign.id);
                              }
                            }}
                            data-testid={`button-delete-campaign-${campaign.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Campaigns Yet</h3>
                  <p className="text-muted-foreground mb-4">Create your first re-engagement campaign to automatically reach out to inactive contacts</p>
                  <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-campaign">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Campaign
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="executions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Sequence Executions</CardTitle>
                <CardDescription>Track individual sequence runs and their progress</CardDescription>
              </CardHeader>
              <CardContent>
                {executionsLoading ? (
                  <div className="h-48 bg-muted rounded animate-pulse" />
                ) : executions && executions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Step</TableHead>
                          <TableHead>Started</TableHead>
                          <TableHead>Completed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {executions.map((exec) => (
                          <TableRow key={exec.id} data-testid={`execution-row-${exec.id}`}>
                            <TableCell className="font-mono text-sm">#{exec.id}</TableCell>
                            <TableCell>Contact #{exec.contactId}</TableCell>
                            <TableCell>{getStatusBadge(exec.status)}</TableCell>
                            <TableCell>Step {exec.currentStep}</TableCell>
                            <TableCell>{format(new Date(exec.startedAt), 'MMM d, h:mm a')}</TableCell>
                            <TableCell>
                              {exec.completedAt ? format(new Date(exec.completedAt), 'MMM d, h:mm a') : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <PlayCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No sequence executions recorded yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inactive" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Inactive Contacts</CardTitle>
                <CardDescription>Contacts with no activity in the past 90+ days</CardDescription>
              </CardHeader>
              <CardContent>
                {inactiveLoading ? (
                  <div className="h-48 bg-muted rounded animate-pulse" />
                ) : inactiveContacts && inactiveContacts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Last Activity</TableHead>
                          <TableHead>Days Inactive</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inactiveContacts.map((contact) => {
                          const hasActivity = contact.lastActivityAt != null && contact.lastActivityAt !== '';
                          const activityDate = hasActivity ? new Date(contact.lastActivityAt!) : null;
                          const daysSinceActivity = activityDate && !isNaN(activityDate.getTime())
                            ? Math.floor((Date.now() - activityDate.getTime()) / (1000 * 60 * 60 * 24))
                            : null;
                          return (
                            <TableRow key={contact.id} data-testid={`inactive-contact-${contact.id}`}>
                              <TableCell className="font-medium">{contact.contactName || 'Unknown'}</TableCell>
                              <TableCell>{contact.contactEmail || '—'}</TableCell>
                              <TableCell>{contact.contactPhone || '—'}</TableCell>
                              <TableCell>
                                {hasActivity && activityDate && !isNaN(activityDate.getTime())
                                  ? format(activityDate, 'MMM d, yyyy')
                                  : 'Never'
                                }
                              </TableCell>
                              <TableCell>
                                {daysSinceActivity != null && daysSinceActivity >= 0 ? (
                                  <Badge variant="outline" className="text-orange-600">
                                    {daysSinceActivity} days
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    Never
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No inactive contacts found</p>
                    <p className="text-sm mt-1">All contacts have been active within the last 90 days</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {editingCampaign && (
          <Dialog open={!!editingCampaign} onOpenChange={() => setEditingCampaign(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Campaign</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Campaign Name</Label>
                  <Input
                    value={editingCampaign.name}
                    onChange={(e) => setEditingCampaign(p => p ? { ...p, name: e.target.value } : null)}
                    data-testid="input-edit-campaign-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={editingCampaign.description || ''}
                    onChange={(e) => setEditingCampaign(p => p ? { ...p, description: e.target.value } : null)}
                    data-testid="input-edit-campaign-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Inactive Days</Label>
                    <Input
                      type="number"
                      value={editingCampaign.inactiveDays}
                      onChange={(e) => setEditingCampaign(p => p ? { ...p, inactiveDays: parseInt(e.target.value) || 90 } : null)}
                      data-testid="input-edit-inactive-days"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Daily Enrollments</Label>
                    <Input
                      type="number"
                      value={editingCampaign.maxEnrollmentsPerDay}
                      onChange={(e) => setEditingCampaign(p => p ? { ...p, maxEnrollmentsPerDay: parseInt(e.target.value) || 50 } : null)}
                      data-testid="input-edit-max-enrollments"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingCampaign(null)}>Cancel</Button>
                <Button 
                  onClick={() => {
                    if (editingCampaign) {
                      updateCampaignMutation.mutate({ 
                        id: editingCampaign.id, 
                        data: {
                          name: editingCampaign.name,
                          description: editingCampaign.description,
                          inactiveDays: editingCampaign.inactiveDays,
                          maxEnrollmentsPerDay: editingCampaign.maxEnrollmentsPerDay
                        }
                      });
                    }
                  }}
                  disabled={updateCampaignMutation.isPending}
                  data-testid="button-update-campaign"
                >
                  {updateCampaignMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
