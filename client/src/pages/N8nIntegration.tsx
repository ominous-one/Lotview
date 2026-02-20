import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Copy, Key, Clock, CheckCircle, AlertCircle, Code, Webhook, FileJson, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Dealership = {
  id: number;
  name: string;
  slug: string;
};

type ExternalToken = {
  id: number;
  dealershipId: number;
  tokenName: string;
  tokenPrefix: string;
  permissions: string[];
  lastUsedAt?: string;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
};

type NewTokenResponse = {
  id: number;
  tokenName: string;
  rawToken: string;
  tokenPrefix: string;
  permissions: string[];
  expiresAt?: string;
  dealershipId: number;
  message: string;
};

const PERMISSIONS = [
  { value: "import:vehicles", label: "Import Vehicles", description: "Create and update vehicles" },
  { value: "read:vehicles", label: "Read Vehicles", description: "View vehicle inventory" },
  { value: "update:vehicles", label: "Update Vehicles", description: "Modify existing vehicles" },
  { value: "delete:vehicles", label: "Delete Vehicles", description: "Remove vehicles" },
];

export default function N8nIntegration() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedDealershipId, setSelectedDealershipId] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newToken, setNewToken] = useState<NewTokenResponse | null>(null);
  const [tokenForm, setTokenForm] = useState({
    tokenName: "",
    permissions: ["import:vehicles"] as string[],
  });

  // Check for super_admin access
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      setLocation('/login');
      return;
    }
    
    try {
      const user = JSON.parse(storedUser);
      if (user.role !== 'super_admin') {
        toast({
          title: "Access Denied",
          description: "This feature is only available to system administrators.",
          variant: "destructive",
        });
        setLocation('/dashboard');
        return;
      }
      setIsAuthorized(true);
    } catch {
      setLocation('/login');
    }
  }, [setLocation, toast]);

  // Fetch dealerships for super_admin
  const { data: dealerships = [] } = useQuery<Dealership[]>({
    queryKey: ['dealerships'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/super-admin/dealerships', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch dealerships');
      return response.json();
    },
    enabled: isAuthorized
  });

  // Note: We intentionally do NOT auto-select a dealership
  // Super_admin must explicitly choose which tenant to manage for security
  
  // Close create dialog when dealership changes to prevent cross-tenant token creation
  useEffect(() => {
    if (createDialogOpen) {
      setCreateDialogOpen(false);
      setTokenForm({ tokenName: "", permissions: ["import:vehicles"] });
    }
  }, [selectedDealershipId]);

  const { data: tokens = [], isLoading } = useQuery<ExternalToken[]>({
    queryKey: ['external-tokens', selectedDealershipId],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/external-tokens?dealershipId=${selectedDealershipId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch tokens');
      return response.json();
    },
    enabled: isAuthorized && !!selectedDealershipId
  });

  const createTokenMutation = useMutation({
    mutationFn: async (data: typeof tokenForm) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/external-tokens', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...data, dealershipId: selectedDealershipId })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create token');
      }
      return response.json();
    },
    onSuccess: (data: NewTokenResponse) => {
      setNewToken(data);
      queryClient.invalidateQueries({ queryKey: ['external-tokens', selectedDealershipId] });
      setTokenForm({ tokenName: "", permissions: ["import:vehicles"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteTokenMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/external-tokens/${id}?dealershipId=${selectedDealershipId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete token');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-tokens', selectedDealershipId] });
      toast({ title: "Success", description: "Token deleted successfully" });
    }
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard` });
  };

  const togglePermission = (perm: string) => {
    setTokenForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm]
    }));
  };

  const apiEndpoint = `${window.location.origin}/api/import/vehicles`;
  
  const samplePayload = `{
  "vehicles": [
    {
      "year": 2024,
      "make": "Toyota",
      "model": "Camry",
      "trim": "XSE",
      "type": "Sedan",
      "price": 32500,
      "odometer": 15000,
      "location": "Vancouver",
      "dealership": "Olympic Auto Group",
      "description": "Excellent condition, one owner",
      "vin": "1HGBH41JXMN109186",
      "stockNumber": "OAG-12345",
      "images": [
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg"
      ],
      "badges": ["Low KM", "One Owner"],
      "cargurusUrl": "https://cargurus.ca/...",
      "cargurusPrice": 33000,
      "dealRating": "Great Deal"
    }
  ],
  "options": {
    "updateExisting": true
  }
}`;

  // Don't render until authorization is confirmed
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-12 px-4">
        <div className="max-w-5xl mx-auto">
          <Button 
            variant="ghost" 
            onClick={() => setLocation('/dashboard')}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">n8n Integration</h1>
          <p className="text-muted-foreground mb-4">
            Connect n8n or other automation tools to automatically import vehicles from CarGurus, your website, or other sources.
          </p>

          {/* Dealership Selector */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="w-5 h-5" />
                Select Dealership
              </CardTitle>
              <CardDescription>
                Choose which dealership to manage API tokens for
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select 
                value={selectedDealershipId?.toString() || ""} 
                onValueChange={(value) => setSelectedDealershipId(parseInt(value))}
              >
                <SelectTrigger className="w-full md:w-80" data-testid="select-dealership">
                  <SelectValue placeholder="Select a dealership..." />
                </SelectTrigger>
                <SelectContent>
                  {dealerships.map((d) => (
                    <SelectItem key={d.id} value={d.id.toString()}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* API Tokens Section */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="w-5 h-5" />
                    API Tokens
                  </CardTitle>
                  <CardDescription>
                    Create tokens to authenticate your n8n workflows
                  </CardDescription>
                </div>
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      data-testid="button-create-token"
                      disabled={!selectedDealershipId}
                      title={!selectedDealershipId ? "Select a dealership first" : undefined}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Token
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create API Token</DialogTitle>
                      <DialogDescription>
                        This token will allow external services to access your vehicle data
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="tokenName">Token Name</Label>
                        <Input
                          id="tokenName"
                          placeholder="n8n Scraper"
                          value={tokenForm.tokenName}
                          onChange={(e) => setTokenForm({ ...tokenForm, tokenName: e.target.value })}
                          data-testid="input-token-name"
                        />
                      </div>
                      <div>
                        <Label>Permissions</Label>
                        <div className="space-y-2 mt-2">
                          {PERMISSIONS.map((perm) => (
                            <div key={perm.value} className="flex items-start gap-3 p-2 border rounded-lg">
                              <Checkbox
                                id={perm.value}
                                checked={tokenForm.permissions.includes(perm.value)}
                                onCheckedChange={() => togglePermission(perm.value)}
                              />
                              <div>
                                <Label htmlFor={perm.value} className="font-medium cursor-pointer">
                                  {perm.label}
                                </Label>
                                <p className="text-xs text-muted-foreground">{perm.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => createTokenMutation.mutate(tokenForm)}
                        disabled={!tokenForm.tokenName || tokenForm.permissions.length === 0 || createTokenMutation.isPending}
                        data-testid="button-save-token"
                      >
                        Create Token
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedDealershipId ? (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Please select a dealership above to manage API tokens</p>
                </div>
              ) : isLoading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : tokens.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No API tokens created yet. Create your first token to get started.
                </div>
              ) : (
                <div className="space-y-3">
                  {tokens.map((token) => (
                    <div
                      key={token.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4"
                      data-testid={`token-item-${token.id}`}
                    >
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {token.tokenName}
                          <Badge variant={token.isActive ? "default" : "secondary"}>
                            {token.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Prefix: <code className="bg-muted px-1 rounded">{token.tokenPrefix}...</code>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {token.permissions.map((perm) => (
                            <Badge key={perm} variant="outline" className="text-xs">
                              {perm}
                            </Badge>
                          ))}
                        </div>
                        {token.lastUsedAt && (
                          <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Last used: {new Date(token.lastUsedAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTokenMutation.mutate(token.id)}
                        disabled={!selectedDealershipId || deleteTokenMutation.isPending}
                        data-testid={`button-delete-token-${token.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* New Token Dialog */}
          <Dialog open={!!newToken} onOpenChange={(open) => !open && setNewToken(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  Token Created Successfully
                </DialogTitle>
                <DialogDescription>
                  Copy this token now - you won't be able to see it again!
                </DialogDescription>
              </DialogHeader>
              {newToken && (
                <div className="py-4">
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-sm break-all">{newToken.rawToken}</code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(newToken.rawToken, "API Token")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-orange-800">
                      Save this token securely. It will only be shown once and cannot be recovered.
                    </p>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => { setNewToken(null); setCreateDialogOpen(false); }}>
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* API Documentation */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="w-5 h-5" />
                API Endpoint
              </CardTitle>
              <CardDescription>
                Use this endpoint to import vehicles from n8n
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Endpoint URL</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 bg-muted p-3 rounded-lg text-sm break-all">
                      POST {apiEndpoint}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(apiEndpoint, "Endpoint URL")}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Headers</Label>
                  <div className="bg-muted p-3 rounded-lg mt-1">
                    <code className="text-sm">
                      Authorization: Bearer YOUR_API_TOKEN<br />
                      Content-Type: application/json
                    </code>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sample Payload */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="w-5 h-5" />
                Sample Request Body
              </CardTitle>
              <CardDescription>
                JSON structure for importing vehicles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                  <code>{samplePayload}</code>
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(samplePayload, "Sample Payload")}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* n8n Workflow Setup */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5" />
                n8n Workflow Setup
              </CardTitle>
              <CardDescription>
                Step-by-step guide to connect n8n
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="font-medium">Create a Schedule Trigger</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      In n8n, add a "Schedule Trigger" node set to run at your preferred interval (e.g., daily at 6 AM).
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="font-medium">Scrape Vehicle Data</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Add an HTTP Request node to scrape CarGurus or your website. Use the HTML Extract node to parse vehicle details.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    3
                  </div>
                  <div>
                    <h4 className="font-medium">Transform Data</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Use a Code or Set node to format the scraped data into the required JSON structure (see sample above).
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    4
                  </div>
                  <div>
                    <h4 className="font-medium">Send to This App</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Add a final HTTP Request node configured as follows:
                    </p>
                    <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                      <li>Method: POST</li>
                      <li>URL: {apiEndpoint}</li>
                      <li>Headers: Authorization: Bearer YOUR_TOKEN</li>
                      <li>Body: JSON with your vehicle data</li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium">Test & Activate</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Run the workflow manually to test, then activate it to run on schedule. Check the import results in the response.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
