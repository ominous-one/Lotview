import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { LogOut, Facebook, Plus, Trash2, Edit, FileText, ListOrdered, Calendar, Clock, GripVertical, Car, CalendarDays, Link, CheckCircle, AlertCircle, ExternalLink, PackageOpen, MessageCircle } from "lucide-react";
import { PostingCalendar } from "@/components/PostingCalendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { InventoryManagement } from "@/components/InventoryManagement";
import { MyFBAccountsPanel } from "@/components/MyFBAccountsPanel";

type FacebookAccount = {
  id: number;
  accountName: string;
  facebookUserId?: string;
  accessToken?: string;
  isActive: boolean;
  tokenExpiresAt?: string;
  createdAt: string;
};

type AdTemplate = {
  id: number;
  templateName: string;
  titleTemplate: string;
  descriptionTemplate: string;
  isDefault: boolean;
  createdAt: string;
};

type PostingSchedule = {
  id: number;
  startTime: string;
  intervalMinutes: number;
  isActive: boolean;
};

type Vehicle = {
  id: number;
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  imageUrl?: string;
  odometer: number;
};

type QueueItem = {
  id: number;
  vehicleId: number;
  facebookAccountId?: number;
  templateId?: number;
  queueOrder: number;
  status: string;
  vehicle?: Vehicle;
  facebookAccount?: FacebookAccount;
  template?: AdTemplate;
};

export default function Sales() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [addToQueueDialogOpen, setAddToQueueDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FacebookAccount | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<AdTemplate | null>(null);
  const [draggedItem, setDraggedItem] = useState<number | null>(null);

  const [accountForm, setAccountForm] = useState({ accountName: "" });
  const [templateForm, setTemplateForm] = useState({ 
    templateName: "", 
    titleTemplate: "", 
    descriptionTemplate: "",
    isDefault: false
  });
  const [scheduleForm, setScheduleForm] = useState({
    startTime: "09:00",
    intervalMinutes: 60,
    isActive: false
  });
  const [queueForm, setQueueForm] = useState({
    vehicleId: 0,
    facebookAccountId: 0,
    templateId: 0
  });
  
  // Facebook OAuth state
  const [connectingAccountId, setConnectingAccountId] = useState<number | null>(null);
  
  // New OAuth session-based flow state
  const [oauthSessionId, setOauthSessionId] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthPages, setOauthPages] = useState<Array<{ id: string; name: string; category?: string; picture?: string }>>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [pageSelectionDialogOpen, setPageSelectionDialogOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('user');

    if (!token || !storedUser) {
      setLocation('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      
      if (parsedUser.role !== 'salesperson' && parsedUser.role !== 'master') {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        setLocation('/');
        return;
      }

      setUser(parsedUser);
    } catch (error) {
      console.error("Auth check failed:", error);
      setLocation('/login');
    } finally {
      setIsLoading(false);
    }
  };

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<FacebookAccount[]>({
    queryKey: ['facebook-accounts'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/facebook/accounts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch accounts');
      return response.json();
    },
    enabled: !!user
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<AdTemplate[]>({
    queryKey: ['ad-templates'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/facebook/templates', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
    enabled: !!user
  });

  const { data: schedule } = useQuery<PostingSchedule>({
    queryKey: ['posting-schedule'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/facebook/schedule', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch schedule');
      return response.json();
    },
    enabled: !!user
  });

  useEffect(() => {
    if (schedule) {
      setScheduleForm({
        startTime: schedule.startTime,
        intervalMinutes: schedule.intervalMinutes,
        isActive: schedule.isActive
      });
    }
  }, [schedule]);

  const createAccountMutation = useMutation({
    mutationFn: async (data: typeof accountForm) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/facebook/accounts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create account');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facebook-accounts'] });
      setAccountDialogOpen(false);
      setAccountForm({ accountName: "" });
      toast({ title: "Success", description: "Facebook account added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/facebook/accounts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to delete account');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facebook-accounts'] });
      toast({ title: "Success", description: "Facebook account deleted" });
    }
  });
  
  // NEW: Start OAuth session (opens popup, then shows page selection)
  const startOAuthMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/facebook/oauth/start', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start OAuth');
      }
      return response.json();
    },
    onSuccess: (data: { authUrl: string; sessionId: string }) => {
      setOauthSessionId(data.sessionId);
      setOauthLoading(true);
      
      // Open Facebook auth in popup
      const popup = window.open(data.authUrl, 'Facebook Auth', 'width=600,height=700');
      
      // Listen for message from popup
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'facebook-oauth-complete') {
          window.removeEventListener('message', handleMessage);
          pollSessionStatus(data.sessionId);
        }
      };
      window.addEventListener('message', handleMessage);
      
      // Also poll for popup close as fallback
      const checkPopup = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkPopup);
          window.removeEventListener('message', handleMessage);
          // Start polling for session
          pollSessionStatus(data.sessionId);
        }
      }, 500);
    },
    onError: (error: Error) => {
      setOauthLoading(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
  
  // Poll OAuth session status
  const pollSessionStatus = async (sessionId: string) => {
    const token = localStorage.getItem('auth_token');
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds max
    
    const poll = async () => {
      attempts++;
      try {
        const response = await fetch(`/api/facebook/oauth/session/${sessionId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch session');
        const data = await response.json();
        
        if (data.status === 'ready') {
          setOauthLoading(false);
          setOauthPages(data.pages || []);
          setSelectedPageIds([]);
          setPageSelectionDialogOpen(true);
        } else if (data.status === 'expired') {
          setOauthLoading(false);
          toast({ title: "Session Expired", description: "Please try again", variant: "destructive" });
        } else if (attempts < maxAttempts) {
          setTimeout(poll, 500);
        } else {
          setOauthLoading(false);
          toast({ title: "Timeout", description: "Facebook connection timed out. Please try again.", variant: "destructive" });
        }
      } catch (error) {
        setOauthLoading(false);
        toast({ title: "Error", description: "Failed to check connection status", variant: "destructive" });
      }
    };
    
    poll();
  };
  
  // Connect selected pages
  const connectPagesMutation = useMutation({
    mutationFn: async ({ sessionId, pageIds }: { sessionId: string; pageIds: string[] }) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/facebook/accounts/connect', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ sessionId, pageIds })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to connect pages');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['facebook-accounts'] });
      setPageSelectionDialogOpen(false);
      setOauthSessionId(null);
      setOauthPages([]);
      setSelectedPageIds([]);
      toast({ title: "Success", description: data.message || "Facebook pages connected successfully!" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
  
  // Handle Add Account button click (new flow)
  const handleAddAccount = () => {
    startOAuthMutation.mutate();
  };
  
  // Handle page selection toggle
  const togglePageSelection = (pageId: string) => {
    setSelectedPageIds(prev => 
      prev.includes(pageId) 
        ? prev.filter(id => id !== pageId)
        : [...prev, pageId]
    );
  };
  
  // Handle connect selected pages
  const handleConnectPages = () => {
    if (oauthSessionId && selectedPageIds.length > 0) {
      connectPagesMutation.mutate({ sessionId: oauthSessionId, pageIds: selectedPageIds });
    }
  };

  // LEGACY: Initiate Facebook OAuth for reconnecting existing accounts
  const initiateOAuthMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/facebook/oauth/init/${accountId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to initiate OAuth');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Open Facebook auth in popup
      const popup = window.open(data.authUrl, 'Facebook Auth', 'width=600,height=700');
      
      // Poll for popup close to refresh accounts
      const checkPopup = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkPopup);
          queryClient.invalidateQueries({ queryKey: ['facebook-accounts'] });
          setConnectingAccountId(null);
          toast({ title: "Reconnected", description: "Facebook account reconnected successfully" });
        }
      }, 500);
    },
    onError: (error: Error) => {
      setConnectingAccountId(null);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
  
  // Handle reconnect button click (for expired tokens)
  const handleConnectFacebook = async (accountId: number) => {
    setConnectingAccountId(accountId);
    initiateOAuthMutation.mutate(accountId);
  };
  
  // Get token status display
  const getTokenStatus = (account: FacebookAccount) => {
    if (!account.facebookUserId) {
      return { status: 'not_connected', label: 'Not Connected', variant: 'secondary' as const, className: '' };
    }
    if (!account.tokenExpiresAt) {
      return { status: 'connected', label: 'Connected', variant: 'default' as const, className: '' };
    }
    const expiresAt = new Date(account.tokenExpiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysLeft <= 0) {
      return { status: 'expired', label: 'Token Expired', variant: 'destructive' as const, className: '' };
    } else if (daysLeft <= 7) {
      return { status: 'expiring', label: `Expires in ${daysLeft}d`, variant: 'outline' as const, className: 'border-orange-500 text-orange-600' };
    }
    return { status: 'connected', label: 'Connected', variant: 'default' as const, className: '' };
  };

  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateForm) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/facebook/templates', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create template');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-templates'] });
      setTemplateDialogOpen(false);
      setTemplateForm({ templateName: "", titleTemplate: "", descriptionTemplate: "", isDefault: false });
      toast({ title: "Success", description: "Ad template created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/facebook/templates/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to delete template');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-templates'] });
      toast({ title: "Success", description: "Template deleted" });
    }
  });

  const saveScheduleMutation = useMutation({
    mutationFn: async (data: typeof scheduleForm) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/facebook/schedule', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save schedule');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posting-schedule'] });
      toast({ title: "Success", description: "Posting schedule saved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery<Vehicle[]>({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const response = await fetch('/api/vehicles');
      if (!response.ok) throw new Error('Failed to fetch vehicles');
      return response.json();
    }
  });

  const { data: queueItems = [], isLoading: queueLoading } = useQuery<QueueItem[]>({
    queryKey: ['posting-queue'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/facebook/queue', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch queue');
      return response.json();
    }
  });

  const addToQueueMutation = useMutation({
    mutationFn: async (data: { vehicleId: number; facebookAccountId?: number; templateId?: number }) => {
      const token = localStorage.getItem('auth_token');
      const maxOrder = Math.max(0, ...queueItems.map(item => item.queueOrder));
      
      const payload: any = {
        vehicleId: data.vehicleId,
        queueOrder: maxOrder + 1,
        status: 'queued'
      };
      
      if (data.facebookAccountId && data.facebookAccountId > 0) {
        payload.facebookAccountId = data.facebookAccountId;
      }
      
      if (data.templateId && data.templateId > 0) {
        payload.templateId = data.templateId;
      }
      
      const response = await fetch('/api/facebook/queue', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add to queue');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posting-queue'] });
      setAddToQueueDialogOpen(false);
      setQueueForm({ vehicleId: 0, facebookAccountId: 0, templateId: 0 });
      toast({ title: "Success", description: "Vehicle added to posting queue" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateQueueMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; queueOrder?: number; facebookAccountId?: number; templateId?: number }) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/facebook/queue/${id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update queue item');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posting-queue'] });
    }
  });

  const deleteFromQueueMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/facebook/queue/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to remove from queue');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posting-queue'] });
      toast({ title: "Success", description: "Vehicle removed from queue" });
    }
  });

  const handleDragStart = (id: number) => {
    setDraggedItem(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetId: number) => {
    if (draggedItem === null || draggedItem === targetId) return;
    
    const originalOrders = new Map(queueItems.map(item => [item.id, item.queueOrder]));
    const currentItems = JSON.parse(JSON.stringify(queueItems));
    const draggedIndex = currentItems.findIndex((item: QueueItem) => item.id === draggedItem);
    const targetIndex = currentItems.findIndex((item: QueueItem) => item.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reorderedItems = [...currentItems];
    const [removed] = reorderedItems.splice(draggedIndex, 1);
    reorderedItems.splice(targetIndex, 0, removed);

    const updatedItems = reorderedItems.map((item: QueueItem, index: number) => ({
      ...item,
      queueOrder: index + 1
    }));

    queryClient.setQueryData(['posting-queue'], updatedItems);

    updatedItems.forEach((item: QueueItem) => {
      const originalOrder = originalOrders.get(item.id);
      if (originalOrder !== undefined && originalOrder !== item.queueOrder) {
        updateQueueMutation.mutate({ id: item.id, queueOrder: item.queueOrder });
      }
    });

    setDraggedItem(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    setLocation('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Salesperson Dashboard</h1>
              <p className="text-muted-foreground">Welcome back, {user?.name}</p>
            </div>
            <Button onClick={handleLogout} variant="outline" data-testid="button-logout" className="w-full sm:w-auto">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <a href="/sales/conversations" className="block">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer border-[#00aad2]/30 bg-gradient-to-br from-[#00aad2]/5 to-white">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#00aad2]/10 flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-[#00aad2]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Facebook Conversations</h3>
                    <p className="text-sm text-muted-foreground">Message leads from Marketplace</p>
                  </div>
                  <Badge className="ml-auto bg-[#00aad2]">New</Badge>
                </CardContent>
              </Card>
            </a>
            <a href="/sales/auto-posting" className="block">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer border-[#022d60]/30 bg-gradient-to-br from-[#022d60]/5 to-white">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#022d60]/10 flex items-center justify-center">
                    <CalendarDays className="w-6 h-6 text-[#022d60]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Auto-Posting Dashboard</h3>
                    <p className="text-sm text-muted-foreground">Schedule Facebook posts</p>
                  </div>
                </CardContent>
              </Card>
            </a>
            <a href="/marketplace-blast" className="block" data-testid="marketplace-blast-link">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer border-[#1877f2]/30 bg-gradient-to-br from-[#1877f2]/5 to-white">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#1877f2]/10 flex items-center justify-center">
                    <Facebook className="w-6 h-6 text-[#1877f2]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Marketplace Blast</h3>
                    <p className="text-sm text-muted-foreground">Post vehicles to Facebook Marketplace</p>
                  </div>
                  <Badge className="ml-auto bg-[#1877f2]">Quick</Badge>
                </CardContent>
              </Card>
            </a>
          </div>

          <Tabs defaultValue="accounts" className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto">
              <TabsTrigger value="accounts" className="text-xs sm:text-sm py-2">
                <Facebook className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Pages</span>
                <span className="sm:hidden">Pages</span>
              </TabsTrigger>
              <TabsTrigger value="marketplace" className="text-xs sm:text-sm py-2 bg-blue-600/10 hover:bg-blue-600/20" data-testid="tab-marketplace">
                <Facebook className="w-4 h-4 mr-1 sm:mr-2 text-blue-600" />
                <span className="hidden sm:inline text-blue-600 font-medium">Marketplace</span>
                <span className="sm:hidden text-blue-600">Mkt</span>
              </TabsTrigger>
              <TabsTrigger value="templates" className="text-xs sm:text-sm py-2">
                <FileText className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Templates</span>
                <span className="sm:hidden">Tmpl</span>
              </TabsTrigger>
              <TabsTrigger value="queue" className="text-xs sm:text-sm py-2 opacity-60">
                <ListOrdered className="w-4 h-4 mr-1 sm:mr-2" />
                Queue
                <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 hidden sm:inline">Soon</Badge>
              </TabsTrigger>
              <TabsTrigger value="schedule" className="text-xs sm:text-sm py-2 opacity-60">
                <Calendar className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Schedule</span>
                <span className="sm:hidden">Sched</span>
                <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 hidden sm:inline">Soon</Badge>
              </TabsTrigger>
              <TabsTrigger value="inventory" className="text-xs sm:text-sm py-2 bg-emerald-600/10 hover:bg-emerald-600/20" data-testid="tab-inventory">
                <PackageOpen className="w-4 h-4 mr-1 sm:mr-2 text-emerald-600" />
                <span className="hidden sm:inline text-emerald-600 font-medium">Inventory</span>
                <span className="sm:hidden text-emerald-600">Inv</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="accounts" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle>Facebook Accounts</CardTitle>
                      <CardDescription>
                        Connect up to 5 Facebook accounts for marketplace posting ({accounts.length}/5 used)
                      </CardDescription>
                    </div>
                    <Button 
                      onClick={handleAddAccount}
                      disabled={accounts.length >= 5 || oauthLoading || startOAuthMutation.isPending}
                      data-testid="button-add-account"
                      className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                    >
                      {oauthLoading || startOAuthMutation.isPending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Facebook className="w-4 h-4 mr-2" />
                          Add Facebook Account
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {accountsLoading ? (
                    <div className="text-center py-8">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    </div>
                  ) : accounts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No Facebook accounts connected yet. Add your first account to get started.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {accounts.map((account) => {
                        const tokenStatus = getTokenStatus(account);
                        
                        return (
                          <div
                            key={account.id}
                            className="p-4 border rounded-lg bg-card"
                            data-testid={`account-item-${account.id}`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-100">
                                  <Facebook className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                  <div className="font-medium flex items-center gap-2">
                                    {account.accountName}
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    Connected {new Date(account.createdAt).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={tokenStatus.variant} className={tokenStatus.className}>
                                  {tokenStatus.label}
                                </Badge>
                                
                                {tokenStatus.status === 'expired' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleConnectFacebook(account.id)}
                                    disabled={connectingAccountId === account.id}
                                    className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                  >
                                    {connectingAccountId === account.id ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mr-2" />
                                        Reconnecting...
                                      </>
                                    ) : (
                                      <>
                                        <AlertCircle className="w-4 h-4 mr-2" />
                                        Reconnect
                                      </>
                                    )}
                                  </Button>
                                )}
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteAccountMutation.mutate(account.id)}
                                  data-testid={`button-delete-account-${account.id}`}
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              
            </TabsContent>

            <TabsContent value="templates" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Ad Templates</CardTitle>
                      <CardDescription>
                        Create custom posting templates with dynamic variables like {"{price}"}, {"{year}"}, {"{make}"}, {"{model}"}
                      </CardDescription>
                    </div>
                    <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button data-testid="button-add-template">
                          <Plus className="w-4 h-4 mr-2" />
                          Create Template
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Create Ad Template</DialogTitle>
                          <DialogDescription>
                            Use variables: {"{price}"}, {"{year}"}, {"{make}"}, {"{model}"}, {"{trim}"}, {"{odometer}"}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div>
                            <Label htmlFor="templateName">Template Name</Label>
                            <Input
                              id="templateName"
                              placeholder="Standard Listing"
                              value={templateForm.templateName}
                              onChange={(e) => setTemplateForm({ ...templateForm, templateName: e.target.value })}
                              data-testid="input-template-name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="titleTemplate">Title Template</Label>
                            <Input
                              id="titleTemplate"
                              placeholder="{year} {make} {model} - ${price}"
                              value={templateForm.titleTemplate}
                              onChange={(e) => setTemplateForm({ ...templateForm, titleTemplate: e.target.value })}
                              data-testid="input-title-template"
                            />
                          </div>
                          <div>
                            <Label htmlFor="descriptionTemplate">Description Template</Label>
                            <Textarea
                              id="descriptionTemplate"
                              placeholder="Amazing {year} {make} {model} {trim} with only {odometer}km! Price: ${price}"
                              value={templateForm.descriptionTemplate}
                              onChange={(e) => setTemplateForm({ ...templateForm, descriptionTemplate: e.target.value })}
                              rows={6}
                              data-testid="input-description-template"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={templateForm.isDefault}
                              onCheckedChange={(checked) => setTemplateForm({ ...templateForm, isDefault: checked })}
                              data-testid="switch-default-template"
                            />
                            <Label>Set as default template</Label>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => createTemplateMutation.mutate(templateForm)}
                            disabled={!templateForm.templateName || !templateForm.titleTemplate || !templateForm.descriptionTemplate || createTemplateMutation.isPending}
                            data-testid="button-save-template"
                          >
                            Create Template
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {templatesLoading ? (
                    <div className="text-center py-8">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    </div>
                  ) : templates.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No templates created yet. Create your first template to standardize your posts.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          className="p-4 border rounded-lg bg-white"
                          data-testid={`template-item-${template.id}`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium">{template.templateName}</h3>
                                {template.isDefault && (
                                  <Badge variant="secondary">Default</Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Created {new Date(template.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteTemplateMutation.mutate(template.id)}
                              data-testid={`button-delete-template-${template.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">Title:</div>
                              <div className="text-sm bg-muted p-2 rounded font-mono">{template.titleTemplate}</div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">Description:</div>
                              <div className="text-sm bg-muted p-2 rounded font-mono whitespace-pre-wrap">{template.descriptionTemplate}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="queue" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ListOrdered className="w-5 h-5" />
                    Posting Queue
                    <Badge variant="secondary" className="ml-2">Coming Soon</Badge>
                  </CardTitle>
                  <CardDescription>
                    Automated posting queue - drag to reorder vehicle posting sequence
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-16 text-muted-foreground">
                    <ListOrdered className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <h3 className="text-xl font-semibold mb-2">Coming Soon</h3>
                    <p className="max-w-md mx-auto">
                      The automated posting queue will allow you to schedule and organize your vehicle posts. 
                      For now, use the <strong>Marketplace Blast</strong> tab or <strong>Inventory</strong> to manually post vehicles.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="schedule" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Posting Schedule
                    <Badge variant="secondary" className="ml-2">Coming Soon</Badge>
                  </CardTitle>
                  <CardDescription>
                    Configure automated posting times and intervals
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-16 text-muted-foreground">
                    <Calendar className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <h3 className="text-xl font-semibold mb-2">Coming Soon</h3>
                    <p className="max-w-md mx-auto">
                      Automated scheduling will allow you to set up recurring posts at specific times. 
                      For now, use the <strong>Marketplace Blast</strong> tab or <strong>Inventory</strong> to manually post vehicles.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="marketplace" className="mt-6">
              <MyFBAccountsPanel />
            </TabsContent>

            <TabsContent value="inventory" className="mt-6">
              <InventoryManagement />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      
      {/* Page Selection Dialog (New OAuth Flow) */}
      <Dialog open={pageSelectionDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setPageSelectionDialogOpen(false);
          setOauthSessionId(null);
          setOauthPages([]);
          setSelectedPageIds([]);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Facebook Pages</DialogTitle>
            <DialogDescription>
              Choose which pages to connect for posting vehicles. Select one or more pages.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 max-h-80 overflow-y-auto py-4">
            {oauthPages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No Facebook pages found.</p>
                <p className="text-sm mt-1">Make sure you have admin access to at least one Facebook page.</p>
              </div>
            ) : (
              oauthPages.map((page) => (
                <div
                  key={page.id}
                  onClick={() => togglePageSelection(page.id)}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedPageIds.includes(page.id) 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-border hover:bg-muted'
                  }`}
                  data-testid={`page-option-${page.id}`}
                >
                  <div className="flex items-center gap-3">
                    {page.picture ? (
                      <img src={page.picture} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Facebook className="w-5 h-5 text-blue-600" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-medium">{page.name}</div>
                      {page.category && (
                        <div className="text-xs text-muted-foreground">{page.category}</div>
                      )}
                    </div>
                    {selectedPageIds.includes(page.id) && (
                      <CheckCircle className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setPageSelectionDialogOpen(false);
                setOauthSessionId(null);
                setOauthPages([]);
                setSelectedPageIds([]);
              }}
              data-testid="button-cancel-page-selection"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConnectPages}
              disabled={selectedPageIds.length === 0 || connectPagesMutation.isPending}
              data-testid="button-connect-pages"
              className="bg-blue-600 hover:bg-blue-700"
            >
              {connectPagesMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Connecting...
                </>
              ) : (
                <>
                  Connect {selectedPageIds.length > 0 && `(${selectedPageIds.length})`}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
