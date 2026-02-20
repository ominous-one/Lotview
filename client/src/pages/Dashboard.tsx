import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/Navbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Settings, Sparkles, Users, LogOut, DollarSign, Plus, Edit2, Trash2, Target, Webhook, Star, X, Code, ExternalLink, Car, Upload, ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { ConversationViewer } from "@/components/ConversationViewer";
import { ConversationsPanel } from "@/components/ConversationsPanel";
import { useToast } from "@/hooks/use-toast";
import { InventoryManagement } from "@/components/InventoryManagement";
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  dealershipId?: number;
  dealershipName?: string;
}

interface CreditScoreTier {
  id: number;
  tierName: string;
  minScore: number;
  maxScore: number;
  interestRate: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ModelYearTerm {
  id: number;
  minModelYear: number;
  maxModelYear: number;
  availableTerms: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PbsConfig {
  id: number;
  partnerId: string;
  username: string;
  password: string;
  webhookUrl?: string;
  webhookSecret?: string;
  pbsApiUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PbsWebhookEvent {
  id: number;
  eventType: string;
  eventId: string;
  payload: string;
  status: string;
  errorMessage?: string;
  processedAt?: string;
  receivedAt: string;
}

interface ChatPrompt {
  id: number;
  dealershipId: number;
  scenario: string;
  systemPrompt: string;
  greeting: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DealershipFee {
  id: number;
  dealershipId: number;
  feeName: string;
  feeAmount: number;
  isPercentage: boolean;
  includeInPayment: boolean;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DealershipBranding {
  logoUrl: string | null;
  dealershipName: string;
}

function BrandingSection() {
  const [branding, setBranding] = useState<DealershipBranding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchBranding();
  }, []);

  const fetchBranding = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const data = await apiGet<DealershipBranding>("/api/dealership/branding", {
        Authorization: `Bearer ${token}`,
      });
      setBranding(data);
    } catch (error) {
      console.error("Error fetching branding:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (PNG, JPG, etc.)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Logo must be smaller than 2MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("logo", file);

    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch("/api/dealership/branding/logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setBranding((prev) => (prev ? { ...prev, logoUrl: data.logoUrl } : null));
        toast({
          title: "Logo updated",
          description: "Your dealership logo has been uploaded successfully",
        });
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload logo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      await apiDelete("/api/dealership/branding/logo", {
        Authorization: `Bearer ${token}`,
      });
      setBranding((prev) => (prev ? { ...prev, logoUrl: null } : null));
      toast({
        title: "Logo removed",
        description: "Your dealership logo has been removed",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove logo. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const defaultLogo = "/lotview-logo.svg";
  const displayLogo = branding?.logoUrl || defaultLogo;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Dealership Logo</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload your dealership logo. It will appear in the header on your inventory pages.
          Recommended size: 200x60 pixels. Max file size: 2MB.
        </p>

        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-center w-48 h-16">
              <img
                src={displayLogo}
                alt={branding?.dealershipName || "Dealership logo"}
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = defaultLogo;
                }}
              />
            </div>
            {!branding?.logoUrl && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Default LotView logo
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <input
                type="file"
                id="logo-upload"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                data-testid="input-logo-upload"
              />
              <label htmlFor="logo-upload">
                <Button
                  asChild
                  variant="outline"
                  disabled={isUploading}
                  className="cursor-pointer"
                >
                  <span>
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload New Logo
                      </>
                    )}
                  </span>
                </Button>
              </label>
            </div>

            {branding?.logoUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveLogo}
                className="text-destructive hover:text-destructive"
                data-testid="button-remove-logo"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remove Logo
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-lg font-medium mb-2">Preview</h3>
        <p className="text-sm text-muted-foreground mb-4">
          This is how your logo will appear in the navigation header
        </p>
        <div className="border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-3">
            <img
              src={displayLogo}
              alt="Logo preview"
              className="h-8 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = defaultLogo;
              }}
            />
            <span className="text-lg font-semibold">{branding?.dealershipName || "Your Dealership"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const { toast } = useToast();

  // New user form state
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    role: "salesperson",
  });
  
  // Edit user form state
  const [editUserForm, setEditUserForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "salesperson",
    isActive: true,
  });

  // Financing rules state
  const [creditTiers, setCreditTiers] = useState<CreditScoreTier[]>([]);
  const [modelYearTerms, setModelYearTerms] = useState<ModelYearTerm[]>([]);
  const [isCreditTierDialogOpen, setIsCreditTierDialogOpen] = useState(false);
  const [isModelYearDialogOpen, setIsModelYearDialogOpen] = useState(false);
  const [editingCreditTier, setEditingCreditTier] = useState<CreditScoreTier | null>(null);
  const [editingModelYearTerm, setEditingModelYearTerm] = useState<ModelYearTerm | null>(null);
  
  // Remarketing state
  const [remarketingVehicles, setRemarketingVehicles] = useState<any[]>([]);
  const [allVehicles, setAllVehicles] = useState<any[]>([]);
  const [isAddVehicleDialogOpen, setIsAddVehicleDialogOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [budgetPriority, setBudgetPriority] = useState<number>(3);
  
  // PBS state
  const [pbsConfig, setPbsConfig] = useState<PbsConfig | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<PbsWebhookEvent[]>([]);
  const [isPbsDialogOpen, setIsPbsDialogOpen] = useState(false);
  const [newPbsConfig, setNewPbsConfig] = useState({
    partnerId: "",
    username: "",
    password: "",
    webhookUrl: "",
    webhookSecret: "",
    pbsApiUrl: "https://partnerhub.pbsdealers.com",
  });
  
  const [newCreditTier, setNewCreditTier] = useState({
    tierName: "",
    minScore: 300,
    maxScore: 850,
    interestRate: 5.99,
  });

  const [newModelYearTerm, setNewModelYearTerm] = useState({
    minModelYear: 2020,
    maxModelYear: 2025,
    availableTerms: ["36", "48", "60"],
  });

  // Chat prompts state
  const [chatPrompts, setChatPrompts] = useState<ChatPrompt[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState({
    scenario: "",
    systemPrompt: "",
    greeting: "",
  });

  // Dealership fees state
  const [dealershipFees, setDealershipFees] = useState<DealershipFee[]>([]);
  const [isFeeDialogOpen, setIsFeeDialogOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<DealershipFee | null>(null);
  const [newFee, setNewFee] = useState({
    feeName: "",
    feeAmount: 0,
    isPercentage: false,
    includeInPayment: true,
    displayOrder: 0,
  });

  const scenarios = [
    { value: "test-drive", label: "Test Drive" },
    { value: "get-approved", label: "Get Approved" },
    { value: "value-trade", label: "Value Trade" },
    { value: "reserve", label: "Reserve Vehicle" },
    { value: "general", label: "General Inquiry" },
  ];

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
      
      // Only masters can access this dashboard
      if (parsedUser.role !== 'master' && parsedUser.role !== 'super_admin') {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
        setLocation('/');
        return;
      }

      setUser(parsedUser);
      await loadUsers(token);
      await loadFinancingRules(token);
      await loadVehicles(token);
      await loadRemarketingVehicles(token);
      await loadPbsConfig(token);
      await loadWebhookEvents(token);
      await loadChatPrompts(token);
      await loadDealershipFees(token);
      await loadWebsiteUrl(token);
    } catch (error) {
      console.error("Auth check failed:", error);
      setLocation('/login');
    } finally {
      setIsLoading(false);
    }
  };
  
  const loadWebsiteUrl = async (token: string) => {
    try {
      const data = await apiGet<{ websiteUrl: string }>('/api/dealership/website-url', {
        'Authorization': `Bearer ${token}`,
      });
      setWebsiteUrl(data.websiteUrl);
    } catch (error) {
      console.error("Failed to load website URL:", error);
    }
  };

  const loadUsers = async (token: string) => {
    try {
      const data = await apiGet<User[]>('/api/users', {
        'Authorization': `Bearer ${token}`,
      });
      setUsers(data);
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('auth_token');
    
    try {
      await apiPost('/api/auth/logout', undefined, {
        'Authorization': `Bearer ${token}`,
      });
    } catch (error) {
      console.error("Logout error:", error);
    }

    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    setLocation('/login');
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('auth_token');

    if (!token) return;

    try {
      await apiPost('/api/users', newUser, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "User Created",
        description: `${newUser.name} has been added successfully`,
      });
      
      setIsCreateDialogOpen(false);
      setNewUser({ email: "", password: "", name: "", role: "salesperson" });
      await loadUsers(token);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || "Failed to create user",
        variant: "destructive",
      });
    }
  };

  const handleEditUser = (userToEdit: User) => {
    setEditingUser(userToEdit);
    setEditUserForm({
      email: userToEdit.email,
      password: "",
      name: userToEdit.name,
      role: userToEdit.role,
      isActive: userToEdit.isActive,
    });
    setIsEditDialogOpen(true);
  };
  
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      const updateData: any = {
        email: editUserForm.email,
        name: editUserForm.name,
        role: editUserForm.role,
        isActive: editUserForm.isActive,
      };
      
      // Only include password if it was changed
      if (editUserForm.password) {
        updateData.password = editUserForm.password;
      }

      await apiPatch(`/api/users/${editingUser.id}`, updateData, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "User Updated",
        description: "User information has been saved successfully",
      });
      setIsEditDialogOpen(false);
      setEditingUser(null);
      await loadUsers(token);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || "Failed to update user",
        variant: "destructive",
      });
    }
  };

  const toggleUserStatus = async (userId: number, currentStatus: boolean) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await apiPatch(`/api/users/${userId}`, { isActive: !currentStatus }, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "User Updated",
        description: `User ${!currentStatus ? 'activated' : 'deactivated'} successfully`,
      });
      await loadUsers(token);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update user",
        variant: "destructive",
      });
    }
  };

  const loadVehicles = async (token: string) => {
    try {
      const data = await apiGet<any[]>('/api/vehicles', {
        'Authorization': `Bearer ${token}`,
      });
      setAllVehicles(data);
    } catch (error) {
      console.error("Failed to load vehicles:", error);
    }
  };

  const loadRemarketingVehicles = async (token: string) => {
    try {
      const data = await apiGet<any[]>('/api/remarketing/vehicles', {
        'Authorization': `Bearer ${token}`,
      });
      setRemarketingVehicles(data);
    } catch (error) {
      console.error("Failed to load remarketing vehicles:", error);
    }
  };

  const loadFinancingRules = async (token: string) => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [tiers, terms] = await Promise.all([
        apiGet<CreditScoreTier[]>('/api/financing/credit-tiers', headers),
        apiGet<ModelYearTerm[]>('/api/financing/model-year-terms', headers),
      ]);
      setCreditTiers(tiers);
      setModelYearTerms(terms);
    } catch (error) {
      console.error("Failed to load financing rules:", error);
    }
  };

  const loadPbsConfig = async (token: string) => {
    try {
      const data = await apiGet<PbsConfig | null>('/api/pbs/config', {
        'Authorization': `Bearer ${token}`,
      });
      setPbsConfig(data);
      if (data) {
        setNewPbsConfig({
          partnerId: data.partnerId,
          username: data.username,
          password: data.password,
          webhookUrl: data.webhookUrl || "",
          webhookSecret: data.webhookSecret || "",
          pbsApiUrl: data.pbsApiUrl,
        });
      }
    } catch (error) {
      console.error("Failed to load PBS config:", error);
    }
  };

  const loadWebhookEvents = async (token: string) => {
    try {
      const data = await apiGet<PbsWebhookEvent[]>('/api/pbs/webhook-events?limit=50', {
        'Authorization': `Bearer ${token}`,
      });
      setWebhookEvents(data);
    } catch (error) {
      console.error("Failed to load webhook events:", error);
    }
  };

  const loadChatPrompts = async (token: string) => {
    try {
      const data = await apiGet<ChatPrompt[]>('/api/chat-prompts', {
        'Authorization': `Bearer ${token}`,
      });
      setChatPrompts(data);
    } catch (error) {
      console.error("Failed to load chat prompts:", error);
    }
  };

  const loadDealershipFees = async (token: string) => {
    try {
      const data = await apiGet<DealershipFee[]>('/api/dealership-fees', {
        'Authorization': `Bearer ${token}`,
      });
      setDealershipFees(data);
    } catch (error) {
      console.error("Failed to load dealership fees:", error);
    }
  };

  const handleCreateFee = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await apiPost('/api/dealership-fees', newFee, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "Fee Created",
        description: `${newFee.feeName} has been added successfully`,
      });
      setIsFeeDialogOpen(false);
      setNewFee({ feeName: "", feeAmount: 0, isPercentage: false, includeInPayment: true, displayOrder: 0 });
      await loadDealershipFees(token);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || "Failed to create fee",
        variant: "destructive",
      });
    }
  };

  const handleUpdateFee = async (id: number, updates: Partial<DealershipFee>) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await apiPatch(`/api/dealership-fees/${id}`, updates, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "Fee Updated",
        description: "Fee has been updated successfully",
      });
      await loadDealershipFees(token);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || "Failed to update fee",
        variant: "destructive",
      });
    }
  };

  const handleDeleteFee = async (id: number) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await apiDelete(`/api/dealership-fees/${id}`, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "Fee Deleted",
        description: "Fee has been removed successfully",
      });
      await loadDealershipFees(token);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete fee",
        variant: "destructive",
      });
    }
  };

  const handleSelectScenario = (scenario: string) => {
    setSelectedScenario(scenario);
    const existingPrompt = chatPrompts.find(p => p.scenario === scenario);
    
    if (existingPrompt) {
      setEditingPrompt({
        scenario: existingPrompt.scenario,
        systemPrompt: existingPrompt.systemPrompt,
        greeting: existingPrompt.greeting,
      });
    } else {
      setEditingPrompt({
        scenario,
        systemPrompt: "",
        greeting: "",
      });
    }
  };

  const handleSaveChatPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await apiPost('/api/chat-prompts', {
        scenario: editingPrompt.scenario,
        systemPrompt: editingPrompt.systemPrompt,
        greeting: editingPrompt.greeting,
      }, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "Chat Prompt Saved",
        description: `Prompt for ${editingPrompt.scenario} has been updated successfully`,
      });
      await loadChatPrompts(token);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || "Failed to save chat prompt",
        variant: "destructive",
      });
    }
  };

  const handleSavePbsConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await apiPost('/api/pbs/config', newPbsConfig, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "PBS Configuration Saved",
        description: "DMS integration settings have been updated",
      });
      setIsPbsDialogOpen(false);
      await loadPbsConfig(token);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || "Failed to save PBS configuration",
        variant: "destructive",
      });
    }
  };

  const handleCreateCreditTier = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    if (newCreditTier.minScore > newCreditTier.maxScore) {
      toast({
        title: "Validation Error",
        description: "Min score must be less than or equal to max score",
        variant: "destructive",
      });
      return;
    }

    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      if (editingCreditTier) {
        await apiPatch(`/api/financing/credit-tiers/${editingCreditTier.id}`, newCreditTier, headers);
      } else {
        await apiPost('/api/financing/credit-tiers', newCreditTier, headers);
      }
      
      toast({
        title: editingCreditTier ? "Credit Tier Updated" : "Credit Tier Created",
        description: `${newCreditTier.tierName} has been ${editingCreditTier ? 'updated' : 'added'} successfully`,
      });
      
      setIsCreditTierDialogOpen(false);
      setEditingCreditTier(null);
      setNewCreditTier({ tierName: "", minScore: 300, maxScore: 850, interestRate: 5.99 });
      await loadFinancingRules(token);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || `Failed to ${editingCreditTier ? 'update' : 'create'} credit tier`,
        variant: "destructive",
      });
    }
  };

  const openEditCreditTier = (tier: CreditScoreTier) => {
    setEditingCreditTier(tier);
    setNewCreditTier({
      tierName: tier.tierName,
      minScore: tier.minScore,
      maxScore: tier.maxScore,
      interestRate: tier.interestRate,
    });
    setIsCreditTierDialogOpen(true);
  };

  const deleteCreditTier = async (id: number) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await apiDelete(`/api/financing/credit-tiers/${id}`, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "Credit Tier Deleted",
        description: "The tier has been removed successfully",
      });
      await loadFinancingRules(token);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete credit tier",
        variant: "destructive",
      });
    }
  };

  const handleCreateModelYearTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    if (newModelYearTerm.minModelYear > newModelYearTerm.maxModelYear) {
      toast({
        title: "Validation Error",
        description: "Min year must be less than or equal to max year",
        variant: "destructive",
      });
      return;
    }

    if (newModelYearTerm.availableTerms.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one term",
        variant: "destructive",
      });
      return;
    }

    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      if (editingModelYearTerm) {
        await apiPatch(`/api/financing/model-year-terms/${editingModelYearTerm.id}`, newModelYearTerm, headers);
      } else {
        await apiPost('/api/financing/model-year-terms', newModelYearTerm, headers);
      }
      
      toast({
        title: editingModelYearTerm ? "Model Year Term Updated" : "Model Year Term Created",
        description: `The term rule has been ${editingModelYearTerm ? 'updated' : 'added'} successfully`,
      });
      
      setIsModelYearDialogOpen(false);
      setEditingModelYearTerm(null);
      setNewModelYearTerm({ minModelYear: 2020, maxModelYear: 2025, availableTerms: ["36", "48", "60"] });
      await loadFinancingRules(token);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || `Failed to ${editingModelYearTerm ? 'update' : 'create'} model year term`,
        variant: "destructive",
      });
    }
  };

  const openEditModelYearTerm = (term: ModelYearTerm) => {
    setEditingModelYearTerm(term);
    setNewModelYearTerm({
      minModelYear: term.minModelYear,
      maxModelYear: term.maxModelYear,
      availableTerms: term.availableTerms,
    });
    setIsModelYearDialogOpen(true);
  };

  const handleAddRemarketingVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await apiPost('/api/remarketing/vehicles', {
        vehicleId: parseInt(selectedVehicleId),
        budgetPriority,
      }, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "Vehicle Added",
        description: "Vehicle has been added to remarketing",
      });
      setIsAddVehicleDialogOpen(false);
      setSelectedVehicleId("");
      setBudgetPriority(3);
      await loadRemarketingVehicles(token);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.body?.error || "Failed to add vehicle to remarketing",
        variant: "destructive",
      });
    }
  };

  const updateRemarketingPriority = async (id: number, newPriority: number) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await apiPatch(`/api/remarketing/vehicles/${id}`, { budgetPriority: newPriority }, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "Priority Updated",
        description: "Budget priority has been updated",
      });
      await loadRemarketingVehicles(token);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update priority",
        variant: "destructive",
      });
    }
  };

  const removeRemarketingVehicle = async (id: number) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await apiDelete(`/api/remarketing/vehicles/${id}`, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "Vehicle Removed",
        description: "Vehicle has been removed from remarketing",
      });
      await loadRemarketingVehicles(token);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove vehicle",
        variant: "destructive",
      });
    }
  };

  const deleteModelYearTerm = async (id: number) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await apiDelete(`/api/financing/model-year-terms/${id}`, {
        'Authorization': `Bearer ${token}`,
      });
      toast({
        title: "Model Year Term Deleted",
        description: "The term rule has been removed successfully",
      });
      await loadFinancingRules(token);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete model year term",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
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
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">General Manager Dashboard</h1>
              <p className="text-muted-foreground">Welcome back, {user?.name}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {user?.role === 'super_admin' && (
                <Button onClick={() => setLocation('/super-admin')} variant="default" data-testid="button-super-admin" className="w-full sm:w-auto">
                  Super Admin
                </Button>
              )}
              <Button 
                onClick={() => window.open('/', '_blank')} 
                variant="outline" 
                data-testid="button-website-view" 
                className="w-full sm:w-auto"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Website View
              </Button>
              <Button onClick={handleLogout} variant="outline" data-testid="button-logout" className="w-full sm:w-auto">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>

          <Tabs defaultValue="users" className="w-full">
            <TabsList className="flex flex-wrap h-auto w-full gap-1 mb-8">
              <TabsTrigger value="users" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-2 flex-1 sm:flex-none" data-testid="tab-users">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Users</span>
              </TabsTrigger>
              <TabsTrigger value="financing" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-2 flex-1 sm:flex-none" data-testid="tab-financing">
                <DollarSign className="w-4 h-4" />
                <span className="hidden sm:inline">Financing</span>
              </TabsTrigger>
              <TabsTrigger value="remarketing" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-2 flex-1 sm:flex-none" data-testid="tab-remarketing">
                <Target className="w-4 h-4" />
                <span className="hidden sm:inline">Remarketing</span>
              </TabsTrigger>
              <TabsTrigger value="webhooks" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-2 flex-1 sm:flex-none" data-testid="tab-webhooks">
                <Webhook className="w-4 h-4" />
                <span className="hidden sm:inline">Webhooks</span>
              </TabsTrigger>
              <TabsTrigger value="chat-prompts" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-2 flex-1 sm:flex-none" data-testid="tab-chat-prompts">
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Prompts</span>
              </TabsTrigger>
              <TabsTrigger value="conversations" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-2 flex-1 sm:flex-none" data-testid="tab-conversations">
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Conversations</span>
              </TabsTrigger>
              <TabsTrigger value="insights" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-2 flex-1 sm:flex-none" data-testid="tab-insights">
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Insights</span>
              </TabsTrigger>
              <TabsTrigger value="integrations" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-2 flex-1 sm:flex-none" data-testid="tab-integrations">
                <Code className="w-4 h-4" />
                <span className="hidden sm:inline">Integrations</span>
              </TabsTrigger>
              <TabsTrigger value="fees" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-2 flex-1 sm:flex-none" data-testid="tab-fees">
                <DollarSign className="w-4 h-4" />
                <span className="hidden sm:inline">Fees</span>
              </TabsTrigger>
              <TabsTrigger value="branding" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-2 flex-1 sm:flex-none" data-testid="tab-branding">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Branding</span>
              </TabsTrigger>
              <TabsTrigger value="inventory" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-2 flex-1 sm:flex-none bg-emerald-600/10 hover:bg-emerald-600/20" data-testid="tab-inventory">
                <Car className="w-4 h-4 text-emerald-600" />
                <span className="hidden sm:inline text-emerald-600 font-medium">Inventory</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle>User Management</CardTitle>
                      <CardDescription>
                        Create and manage sales managers and salespeople
                      </CardDescription>
                    </div>
                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button data-testid="button-create-user" className="w-full sm:w-auto">
                          <Users className="w-4 h-4 mr-2" />
                          Create User
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create New User</DialogTitle>
                          <DialogDescription>
                            Add a new sales manager or salesperson to the system
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateUser} className="space-y-4">
                          <div>
                            <Label htmlFor="name">Full Name</Label>
                            <Input
                              id="name"
                              value={newUser.name}
                              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                              placeholder="John Doe"
                              required
                              data-testid="input-user-name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="email">Email</Label>
                            <Input
                              id="email"
                              type="email"
                              value={newUser.email}
                              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                              placeholder="john@olympicauto.com"
                              required
                              data-testid="input-user-email"
                            />
                          </div>
                          <div>
                            <Label htmlFor="password">Password</Label>
                            <Input
                              id="password"
                              type="password"
                              value={newUser.password}
                              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                              placeholder="••••••••"
                              required
                              data-testid="input-user-password"
                            />
                          </div>
                          <div>
                            <Label htmlFor="role">Role</Label>
                            <Select
                              value={newUser.role}
                              onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                            >
                              <SelectTrigger data-testid="select-user-role">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="salesperson">Salesperson</SelectItem>
                                <SelectItem value="manager">Sales Manager</SelectItem>
                                <SelectItem value="master">General Manager</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button type="submit" className="w-full" data-testid="button-submit-user">
                            Create User
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {users.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        No users found. Create your first user to get started.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {users.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted"
                            data-testid={`user-row-${u.id}`}
                          >
                            <div className="flex-1">
                              <div className="font-semibold text-foreground">{u.name}</div>
                              <div className="text-sm text-muted-foreground">{u.email}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs bg-muted text-foreground px-2 py-1 rounded">
                                  {u.role === 'master' ? 'General Manager' : u.role === 'manager' ? 'Sales Manager' : u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                                </span>
                                <span className={`text-xs px-2 py-1 rounded ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {u.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditUser(u)}
                                data-testid={`button-edit-user-${u.id}`}
                              >
                                <Edit2 className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleUserStatus(u.id, u.isActive)}
                                data-testid={`button-toggle-user-${u.id}`}
                              >
                                {u.isActive ? 'Deactivate' : 'Activate'}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              {/* Edit User Dialog */}
              <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
                setIsEditDialogOpen(open);
                if (!open) {
                  setEditingUser(null);
                  setEditUserForm({ email: "", password: "", name: "", role: "salesperson", isActive: true });
                }
              }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit User</DialogTitle>
                    <DialogDescription>
                      Update user information. Leave password blank to keep current password.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleUpdateUser} className="space-y-4">
                    <div>
                      <Label htmlFor="edit-name">Full Name</Label>
                      <Input
                        id="edit-name"
                        value={editUserForm.name}
                        onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                        placeholder="John Doe"
                        required
                        data-testid="input-edit-user-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-email">Email</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={editUserForm.email}
                        onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                        placeholder="john@olympicauto.com"
                        required
                        data-testid="input-edit-user-email"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-password">New Password (optional)</Label>
                      <Input
                        id="edit-password"
                        type="password"
                        value={editUserForm.password}
                        onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                        placeholder="Leave blank to keep current password"
                        data-testid="input-edit-user-password"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-role">Role</Label>
                      <Select
                        value={editUserForm.role}
                        onValueChange={(value) => setEditUserForm({ ...editUserForm, role: value })}
                      >
                        <SelectTrigger data-testid="select-edit-user-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="salesperson">Salesperson</SelectItem>
                          <SelectItem value="manager">Sales Manager</SelectItem>
                          <SelectItem value="master">General Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="edit-isActive"
                        checked={editUserForm.isActive}
                        onChange={(e) => setEditUserForm({ ...editUserForm, isActive: e.target.checked })}
                        className="w-4 h-4"
                        data-testid="checkbox-edit-user-active"
                      />
                      <Label htmlFor="edit-isActive">Active User</Label>
                    </div>
                    <Button type="submit" className="w-full" data-testid="button-update-user">
                      Save Changes
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="financing">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Credit Score Tiers</CardTitle>
                        <CardDescription>
                          Configure interest rates by credit score range
                        </CardDescription>
                      </div>
                      <Dialog open={isCreditTierDialogOpen} onOpenChange={(open) => {
                        setIsCreditTierDialogOpen(open);
                        if (!open) {
                          setEditingCreditTier(null);
                          setNewCreditTier({ tierName: "", minScore: 300, maxScore: 850, interestRate: 5.99 });
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button size="sm" data-testid="button-create-credit-tier">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Tier
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{editingCreditTier ? 'Edit' : 'Create'} Credit Score Tier</DialogTitle>
                            <DialogDescription>
                              Define a credit score range and its interest rate
                            </DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleCreateCreditTier} className="space-y-4">
                            <div>
                              <Label htmlFor="tierName">Tier Name</Label>
                              <Input
                                id="tierName"
                                value={newCreditTier.tierName}
                                onChange={(e) => setNewCreditTier({ ...newCreditTier, tierName: e.target.value })}
                                placeholder="Excellent"
                                required
                                data-testid="input-tier-name"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="minScore">Min Score</Label>
                                <Input
                                  id="minScore"
                                  type="number"
                                  min={300}
                                  max={850}
                                  value={newCreditTier.minScore}
                                  onChange={(e) => setNewCreditTier({ ...newCreditTier, minScore: parseInt(e.target.value) })}
                                  required
                                  data-testid="input-min-score"
                                />
                              </div>
                              <div>
                                <Label htmlFor="maxScore">Max Score</Label>
                                <Input
                                  id="maxScore"
                                  type="number"
                                  min={300}
                                  max={850}
                                  value={newCreditTier.maxScore}
                                  onChange={(e) => setNewCreditTier({ ...newCreditTier, maxScore: parseInt(e.target.value) })}
                                  required
                                  data-testid="input-max-score"
                                />
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="interestRate">Interest Rate (basis points: 699 = 6.99%)</Label>
                              <Input
                                id="interestRate"
                                type="number"
                                step="1"
                                min={0}
                                max={10000}
                                value={newCreditTier.interestRate}
                                onChange={(e) => setNewCreditTier({ ...newCreditTier, interestRate: parseFloat(e.target.value) })}
                                required
                                data-testid="input-interest-rate"
                              />
                            </div>
                            <Button type="submit" className="w-full" data-testid="button-submit-credit-tier">
                              {editingCreditTier ? 'Update' : 'Create'} Tier
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {creditTiers.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No credit tiers configured. Add your first tier to get started.
                        </div>
                      ) : (
                        creditTiers.map((tier) => (
                          <div
                            key={tier.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted"
                            data-testid={`credit-tier-${tier.id}`}
                          >
                            <div className="flex-1">
                              <div className="font-semibold text-foreground">{tier.tierName}</div>
                              <div className="text-sm text-muted-foreground">
                                {tier.minScore} - {tier.maxScore}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="font-semibold text-primary">{tier.interestRate}%</div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditCreditTier(tier)}
                                data-testid={`button-edit-tier-${tier.id}`}
                              >
                                <Edit2 className="w-4 h-4 text-blue-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteCreditTier(tier.id)}
                                data-testid={`button-delete-tier-${tier.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Model Year Terms</CardTitle>
                        <CardDescription>
                          Configure available loan terms by vehicle age
                        </CardDescription>
                      </div>
                      <Dialog open={isModelYearDialogOpen} onOpenChange={(open) => {
                        setIsModelYearDialogOpen(open);
                        if (!open) {
                          setEditingModelYearTerm(null);
                          setNewModelYearTerm({ minModelYear: 2020, maxModelYear: 2025, availableTerms: ["36", "48", "60"] });
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button size="sm" data-testid="button-create-model-year-term">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Rule
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{editingModelYearTerm ? 'Edit' : 'Create'} Model Year Term Rule</DialogTitle>
                            <DialogDescription>
                              Define available loan terms for a model year range
                            </DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleCreateModelYearTerm} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="minModelYear">Min Year</Label>
                                <Input
                                  id="minModelYear"
                                  type="number"
                                  min={1980}
                                  max={2050}
                                  value={newModelYearTerm.minModelYear}
                                  onChange={(e) => setNewModelYearTerm({ ...newModelYearTerm, minModelYear: parseInt(e.target.value) })}
                                  required
                                  data-testid="input-min-year"
                                />
                              </div>
                              <div>
                                <Label htmlFor="maxModelYear">Max Year</Label>
                                <Input
                                  id="maxModelYear"
                                  type="number"
                                  min={1980}
                                  max={2050}
                                  value={newModelYearTerm.maxModelYear}
                                  onChange={(e) => setNewModelYearTerm({ ...newModelYearTerm, maxModelYear: parseInt(e.target.value) })}
                                  required
                                  data-testid="input-max-year"
                                />
                              </div>
                            </div>
                            <div>
                              <Label>Available Terms (months)</Label>
                              <div className="grid grid-cols-3 gap-2 mt-2">
                                {["36", "48", "60", "72", "84"].map((term) => (
                                  <label key={term} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={newModelYearTerm.availableTerms.includes(term)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setNewModelYearTerm({
                                            ...newModelYearTerm,
                                            availableTerms: [...newModelYearTerm.availableTerms, term].sort(),
                                          });
                                        } else {
                                          setNewModelYearTerm({
                                            ...newModelYearTerm,
                                            availableTerms: newModelYearTerm.availableTerms.filter(t => t !== term),
                                          });
                                        }
                                      }}
                                      className="rounded"
                                    />
                                    <span className="text-sm">{term}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <Button type="submit" className="w-full" data-testid="button-submit-model-year-term">
                              {editingModelYearTerm ? 'Update' : 'Create'} Rule
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {modelYearTerms.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No term rules configured. Add your first rule to get started.
                        </div>
                      ) : (
                        modelYearTerms.map((term) => (
                          <div
                            key={term.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted"
                            data-testid={`model-year-term-${term.id}`}
                          >
                            <div className="flex-1">
                              <div className="font-semibold text-foreground">
                                {term.minModelYear} - {term.maxModelYear}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Terms: {term.availableTerms.join(", ")} months
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditModelYearTerm(term)}
                                data-testid={`button-edit-term-${term.id}`}
                              >
                                <Edit2 className="w-4 h-4 text-blue-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteModelYearTerm(term.id)}
                                data-testid={`button-delete-term-${term.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="remarketing">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Remarketing Configuration</CardTitle>
                      <CardDescription>
                        Select up to 20 vehicles for remarketing campaigns ({remarketingVehicles.length}/20 selected)
                      </CardDescription>
                    </div>
                    <Dialog open={isAddVehicleDialogOpen} onOpenChange={setIsAddVehicleDialogOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          disabled={remarketingVehicles.length >= 20}
                          data-testid="button-add-remarketing-vehicle"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Vehicle
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Vehicle to Remarketing</DialogTitle>
                          <DialogDescription>
                            Select a vehicle and set its budget priority (1-5 stars)
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleAddRemarketingVehicle} className="space-y-4">
                          <div>
                            <Label htmlFor="vehicle">Vehicle</Label>
                            <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId} required>
                              <SelectTrigger id="vehicle" data-testid="select-vehicle">
                                <SelectValue placeholder="Select a vehicle" />
                              </SelectTrigger>
                              <SelectContent>
                                {allVehicles
                                  .filter(v => !remarketingVehicles.some(rv => rv.vehicleId === v.id))
                                  .map(vehicle => (
                                    <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                                      {vehicle.year} {vehicle.make} {vehicle.model} - ${vehicle.price.toLocaleString()}
                                    </SelectItem>
                                  ))
                                }
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Budget Priority (1-5 stars)</Label>
                            <div className="flex gap-2 mt-2">
                              {[1, 2, 3, 4, 5].map(priority => (
                                <button
                                  key={priority}
                                  type="button"
                                  onClick={() => setBudgetPriority(priority)}
                                  className={`p-2 rounded transition-colors ${
                                    budgetPriority >= priority ? 'text-yellow-500' : 'text-muted-foreground'
                                  }`}
                                  data-testid={`button-priority-${priority}`}
                                >
                                  <Star className="w-6 h-6" fill={budgetPriority >= priority ? 'currentColor' : 'none'} />
                                </button>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {budgetPriority === 5 && "Highest priority - Maximum ad spend"}
                              {budgetPriority === 4 && "High priority - Above average spend"}
                              {budgetPriority === 3 && "Medium priority - Average spend"}
                              {budgetPriority === 2 && "Low priority - Below average spend"}
                              {budgetPriority === 1 && "Lowest priority - Minimum ad spend"}
                            </p>
                          </div>
                          <Button type="submit" className="w-full" data-testid="button-submit-add-vehicle">
                            Add to Remarketing
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {remarketingVehicles.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-medium mb-2">No Vehicles Selected</h3>
                      <p className="text-sm mb-4">
                        Add vehicles to your remarketing campaign (up to 20)
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {remarketingVehicles.map(rv => {
                        const vehicle = allVehicles.find(v => v.id === rv.vehicleId);
                        if (!vehicle) return null;
                        
                        return (
                          <div key={rv.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`remarketing-vehicle-${rv.id}`}>
                            <div className="flex-1">
                              <div className="font-medium">
                                {vehicle.year} {vehicle.make} {vehicle.model}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                ${vehicle.price.toLocaleString()} • Stock #{vehicle.stockNumber || 'N/A'}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map(priority => (
                                  <button
                                    key={priority}
                                    onClick={() => updateRemarketingPriority(rv.id, priority)}
                                    className={`p-1 rounded transition-colors ${
                                      rv.budgetPriority >= priority ? 'text-yellow-500' : 'text-muted-foreground'
                                    }`}
                                    data-testid={`button-update-priority-${rv.id}-${priority}`}
                                  >
                                    <Star className="w-5 h-5" fill={rv.budgetPriority >= priority ? 'currentColor' : 'none'} />
                                  </button>
                                ))}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeRemarketingVehicle(rv.id)}
                                data-testid={`button-remove-${rv.id}`}
                              >
                                <X className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="webhooks">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>PBS DMS Integration</CardTitle>
                        <CardDescription>
                          Configure PBS Partner Hub API credentials and webhook settings
                        </CardDescription>
                      </div>
                      <Dialog open={isPbsDialogOpen} onOpenChange={setIsPbsDialogOpen}>
                        <DialogTrigger asChild>
                          <Button data-testid="button-configure-pbs">
                            <Settings className="w-4 h-4 mr-2" />
                            {pbsConfig ? 'Update' : 'Configure'} PBS
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>PBS DMS Configuration</DialogTitle>
                            <DialogDescription>
                              Enter your PBS Partner Hub credentials and webhook settings
                            </DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleSavePbsConfig} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="partnerId">Partner ID</Label>
                                <Input
                                  id="partnerId"
                                  value={newPbsConfig.partnerId}
                                  onChange={(e) => setNewPbsConfig({ ...newPbsConfig, partnerId: e.target.value })}
                                  placeholder="Your PBS Partner ID"
                                  required
                                  data-testid="input-partner-id"
                                />
                              </div>
                              <div>
                                <Label htmlFor="username">API Username</Label>
                                <Input
                                  id="username"
                                  value={newPbsConfig.username}
                                  onChange={(e) => setNewPbsConfig({ ...newPbsConfig, username: e.target.value })}
                                  placeholder="API username"
                                  required
                                  data-testid="input-username"
                                />
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="password">API Password</Label>
                              <Input
                                id="password"
                                type="password"
                                value={newPbsConfig.password}
                                onChange={(e) => setNewPbsConfig({ ...newPbsConfig, password: e.target.value })}
                                placeholder="API password"
                                required
                                data-testid="input-password"
                              />
                            </div>
                            <div>
                              <Label htmlFor="pbsApiUrl">PBS API URL</Label>
                              <Input
                                id="pbsApiUrl"
                                value={newPbsConfig.pbsApiUrl}
                                onChange={(e) => setNewPbsConfig({ ...newPbsConfig, pbsApiUrl: e.target.value })}
                                placeholder="https://partnerhub.pbsdealers.com"
                                required
                                data-testid="input-api-url"
                              />
                            </div>
                            <div className="border-t pt-4">
                              <h4 className="font-medium mb-3">Webhook Configuration (Optional)</h4>
                              <div className="space-y-3">
                                <div>
                                  <Label htmlFor="webhookUrl">Webhook URL</Label>
                                  <Input
                                    id="webhookUrl"
                                    value={newPbsConfig.webhookUrl}
                                    onChange={(e) => setNewPbsConfig({ ...newPbsConfig, webhookUrl: e.target.value })}
                                    placeholder={`${window.location.origin}/api/pbs/webhook`}
                                    data-testid="input-webhook-url"
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Register this URL in your PBS Partner Hub dashboard
                                  </p>
                                </div>
                                <div>
                                  <Label htmlFor="webhookSecret">Webhook Secret</Label>
                                  <Input
                                    id="webhookSecret"
                                    type="password"
                                    value={newPbsConfig.webhookSecret}
                                    onChange={(e) => setNewPbsConfig({ ...newPbsConfig, webhookSecret: e.target.value })}
                                    placeholder="Optional webhook verification secret"
                                    data-testid="input-webhook-secret"
                                  />
                                </div>
                              </div>
                            </div>
                            <Button type="submit" className="w-full" data-testid="button-save-pbs-config">
                              Save Configuration
                            </Button>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {pbsConfig ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                          <div>
                            <div className="text-sm font-medium text-muted-foreground">Partner ID</div>
                            <div className="text-sm">{pbsConfig.partnerId}</div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-muted-foreground">Username</div>
                            <div className="text-sm">{pbsConfig.username}</div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-muted-foreground">API URL</div>
                            <div className="text-sm">{pbsConfig.pbsApiUrl}</div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-muted-foreground">Webhook URL</div>
                            <div className="text-sm truncate">{pbsConfig.webhookUrl || 'Not configured'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                          Configuration active
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Webhook className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                        <p className="mb-2">No PBS configuration found</p>
                        <p className="text-sm text-muted-foreground">Click Configure PBS to get started</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Webhook Event Log</CardTitle>
                        <CardDescription>
                          Recent webhook events received from PBS ({webhookEvents.length} events)
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const token = localStorage.getItem('auth_token');
                          if (token) loadWebhookEvents(token);
                        }}
                        data-testid="button-refresh-events"
                      >
                        Refresh
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {webhookEvents.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                        <p className="mb-2">No webhook events received yet</p>
                        <p className="text-sm text-muted-foreground">
                          Events will appear here when PBS sends webhooks
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {webhookEvents.map((event) => (
                          <div
                            key={event.id}
                            className="p-3 border rounded-lg hover:bg-muted"
                            data-testid={`webhook-event-${event.id}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{event.eventType}</span>
                                  <span
                                    className={`px-2 py-0.5 text-xs rounded-full ${
                                      event.status === 'processed'
                                        ? 'bg-green-100 text-green-700'
                                        : event.status === 'failed'
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-yellow-100 text-yellow-700'
                                    }`}
                                  >
                                    {event.status}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  Event ID: {event.eventId} • Received: {new Date(event.receivedAt).toLocaleString()}
                                </div>
                                {event.errorMessage && (
                                  <div className="text-xs text-red-600 mt-1">
                                    Error: {event.errorMessage}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="chat-prompts">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Chat Scenarios</CardTitle>
                    <CardDescription>
                      Select a scenario to manage its AI prompts
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {scenarios.map((scenario) => {
                        const existingPrompt = chatPrompts.find(p => p.scenario === scenario.value);
                        const isConfigured = !!existingPrompt;
                        
                        return (
                          <div
                            key={scenario.value}
                            className={`flex items-center justify-between p-4 border rounded-lg hover:bg-muted cursor-pointer transition-colors ${
                              selectedScenario === scenario.value ? 'border-primary bg-primary/5' : ''
                            }`}
                            onClick={() => handleSelectScenario(scenario.value)}
                            data-testid={`scenario-${scenario.value}`}
                          >
                            <div className="flex-1">
                              <div className="font-semibold text-foreground">{scenario.label}</div>
                              <div className="text-sm text-muted-foreground">{scenario.value}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isConfigured && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                  Configured
                                </span>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectScenario(scenario.value);
                                }}
                                data-testid={`button-edit-${scenario.value}`}
                              >
                                <Edit2 className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Edit Chat Prompt</CardTitle>
                    <CardDescription>
                      Configure the AI behavior and greeting for this scenario
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedScenario ? (
                      <form onSubmit={handleSaveChatPrompt} className="space-y-4">
                        <div>
                          <Label htmlFor="scenario">Scenario</Label>
                          <Input
                            id="scenario"
                            value={scenarios.find(s => s.value === editingPrompt.scenario)?.label || editingPrompt.scenario}
                            disabled
                            className="bg-muted"
                            data-testid="input-scenario"
                          />
                        </div>

                        <div>
                          <Label htmlFor="systemPrompt">System Prompt</Label>
                          <Textarea
                            id="systemPrompt"
                            value={editingPrompt.systemPrompt}
                            onChange={(e) => setEditingPrompt({ ...editingPrompt, systemPrompt: e.target.value })}
                            placeholder="Enter the system prompt that defines AI behavior..."
                            className="min-h-[200px] font-mono text-sm"
                            required
                            data-testid="textarea-system-prompt"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            This defines how the AI should behave and respond for this scenario
                          </p>
                        </div>

                        <div>
                          <Label htmlFor="greeting">Greeting Message</Label>
                          <Textarea
                            id="greeting"
                            value={editingPrompt.greeting}
                            onChange={(e) => setEditingPrompt({ ...editingPrompt, greeting: e.target.value })}
                            placeholder="Enter the greeting message..."
                            className="min-h-[100px]"
                            required
                            data-testid="textarea-greeting"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            The first message users see when starting this conversation
                          </p>
                        </div>

                        <Button type="submit" className="w-full" data-testid="button-save-prompt">
                          Save Chat Prompt
                        </Button>
                      </form>
                    ) : (
                      <div className="py-12 text-center text-muted-foreground">
                        <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <p>Select a scenario to configure its chat prompt</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="conversations" className="mt-0">
              {user?.dealershipId ? (
                <ConversationsPanel 
                  dealershipId={user.dealershipId}
                  onSwitchToTraining={() => {}}
                />
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p>Unable to load conversations. Please contact support.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="insights">
              <Card>
                <CardHeader>
                  <CardTitle>AI Analytics & Insights</CardTitle>
                  <CardDescription>
                    View sentiment analysis, intent detection, and conversion insights
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-12 text-center">
                  <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">AI-powered analytics coming soon</p>
                  <p className="text-sm text-muted-foreground">
                    Analyze conversation sentiment, customer intent, and conversion patterns
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="integrations">
              <Card>
                <CardHeader>
                  <CardTitle>External Integrations</CardTitle>
                  <CardDescription>
                    Connect external tools and automation services to your dealership
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <Webhook className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-2">External integrations like Zapier, Make.com, and custom webhooks are coming soon.</p>
                    {user?.role === 'super_admin' && (
                      <p className="text-sm">
                        For n8n integration, visit the{' '}
                        <button 
                          onClick={() => setLocation('/super-admin')}
                          className="text-primary hover:underline"
                        >
                          Super Admin Dashboard → API Integrations
                        </button>
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fees">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle>Dealership Fees</CardTitle>
                      <CardDescription>
                        Configure administrative and documentation fees that are included in payment calculations
                      </CardDescription>
                    </div>
                    <Dialog open={isFeeDialogOpen} onOpenChange={setIsFeeDialogOpen}>
                      <DialogTrigger asChild>
                        <Button data-testid="button-add-fee" className="w-full sm:w-auto">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Fee
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add New Fee</DialogTitle>
                          <DialogDescription>
                            Configure a fee that will be added to payment calculations
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateFee} className="space-y-4">
                          <div>
                            <Label htmlFor="feeName">Fee Name</Label>
                            <Input
                              id="feeName"
                              value={newFee.feeName}
                              onChange={(e) => setNewFee({ ...newFee, feeName: e.target.value })}
                              placeholder="e.g., Admin Fee, Documentation Fee"
                              required
                              data-testid="input-fee-name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="feeAmount">Amount ($)</Label>
                            <Input
                              id="feeAmount"
                              type="number"
                              value={newFee.feeAmount}
                              onChange={(e) => setNewFee({ ...newFee, feeAmount: parseInt(e.target.value) || 0 })}
                              placeholder="499"
                              required
                              data-testid="input-fee-amount"
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="includeInPayment"
                              checked={newFee.includeInPayment}
                              onChange={(e) => setNewFee({ ...newFee, includeInPayment: e.target.checked })}
                              className="h-4 w-4 rounded border-gray-300"
                              data-testid="checkbox-include-payment"
                            />
                            <Label htmlFor="includeInPayment">Include in monthly payment calculation</Label>
                          </div>
                          <Button type="submit" className="w-full" data-testid="button-submit-fee">
                            Add Fee
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {dealershipFees.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No fees configured yet. Add fees to include them in payment calculations.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-4">Fee Name</th>
                            <th className="text-left py-3 px-4">Amount</th>
                            <th className="text-left py-3 px-4">In Payment</th>
                            <th className="text-left py-3 px-4">Status</th>
                            <th className="text-right py-3 px-4">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dealershipFees.map((fee) => (
                            <tr key={fee.id} className="border-b" data-testid={`row-fee-${fee.id}`}>
                              <td className="py-3 px-4 font-medium">{fee.feeName}</td>
                              <td className="py-3 px-4">${fee.feeAmount.toLocaleString()}</td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-1 rounded text-xs ${fee.includeInPayment ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}`}>
                                  {fee.includeInPayment ? 'Yes' : 'No'}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-1 rounded text-xs ${fee.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                                  {fee.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleUpdateFee(fee.id, { isActive: !fee.isActive })}
                                    data-testid={`button-toggle-fee-${fee.id}`}
                                  >
                                    {fee.isActive ? 'Deactivate' : 'Activate'}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteFee(fee.id)}
                                    className="text-red-600 hover:text-red-700"
                                    data-testid={`button-delete-fee-${fee.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>Note:</strong> Fees marked "In Payment" will be added to the vehicle price when calculating monthly payments, 
                      but will not be shown on the vehicle listing price.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="branding">
              <Card>
                <CardHeader>
                  <CardTitle>Dealership Branding</CardTitle>
                  <CardDescription>
                    Customize your dealership's logo and branding
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BrandingSection />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inventory">
              <InventoryManagement />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
