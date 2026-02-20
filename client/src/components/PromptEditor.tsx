import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, RefreshCw, CheckCircle2, XCircle, MessageSquare, Bot, Zap, AlertCircle, Link2 } from "lucide-react";
import { AiPromptEnhancer } from "./AiPromptEnhancer";

interface ChatPrompt {
  id: number;
  dealershipId: number;
  name: string;
  scenario: string;
  channel: string;
  systemPrompt: string;
  greeting: string;
  followUpPrompt: string | null;
  escalationTriggers: string | null;
  aiModel: string | null;
  temperature: number | null;
  maxTokens: number | null;
  isActive: boolean;
  ghlWorkflowId: string | null;
  ghlPromptSynced: boolean | null;
  ghlLastSyncedAt: string | null;
  ghlSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PromptFormData {
  name: string;
  scenario: string;
  channel: string;
  systemPrompt: string;
  greeting: string;
  followUpPrompt: string;
  escalationTriggers: string[];
  aiModel: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
  ghlWorkflowId: string;
}

const SCENARIO_OPTIONS = [
  { value: "sales", label: "Sales Inquiries" },
  { value: "service", label: "Service Appointments" },
  { value: "appointment", label: "General Appointments" },
  { value: "follow-up", label: "Follow-up Messages" },
  { value: "after-hours", label: "After Hours" },
  { value: "general", label: "General Assistant" },
  { value: "test-drive", label: "Test Drive Scheduling" },
  { value: "get-approved", label: "Financing Pre-Approval" },
  { value: "value-trade", label: "Trade-In Valuation" },
  { value: "reserve", label: "Vehicle Reservation" },
];

const CHANNEL_OPTIONS = [
  { value: "all", label: "All Channels" },
  { value: "sms", label: "SMS Only" },
  { value: "email", label: "Email Only" },
  { value: "chat", label: "Website Chat Only" },
];

const AI_MODEL_OPTIONS = [
  { value: "gpt-4o", label: "GPT-4o (Recommended)" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini (Faster)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Cheapest)" },
];

const defaultFormData: PromptFormData = {
  name: "",
  scenario: "general",
  channel: "all",
  systemPrompt: "",
  greeting: "",
  followUpPrompt: "",
  escalationTriggers: [],
  aiModel: "gpt-4o",
  temperature: 0.7,
  maxTokens: 500,
  isActive: true,
  ghlWorkflowId: "",
};

interface PromptEditorProps {
  dealershipId?: number;
}

export function PromptEditor({ dealershipId }: PromptEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<ChatPrompt | null>(null);
  const [formData, setFormData] = useState<PromptFormData>(defaultFormData);
  const [escalationInput, setEscalationInput] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const queryUrl = dealershipId 
    ? `/api/admin/prompts?dealershipId=${dealershipId}` 
    : "/api/admin/prompts";

  const { data: prompts = [], isLoading } = useQuery<ChatPrompt[]>({
    queryKey: ["/api/admin/prompts", dealershipId],
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch prompts");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PromptFormData) => {
      const res = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, dealershipId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to create prompt");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Prompt created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompts", dealershipId] });
      setIsCreateOpen(false);
      setFormData(defaultFormData);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<PromptFormData> }) => {
      const res = await fetch(`/api/admin/prompts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, dealershipId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to update prompt");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Prompt updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompts", dealershipId] });
      setEditingPrompt(null);
      setFormData(defaultFormData);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const deleteUrl = dealershipId 
        ? `/api/admin/prompts/${id}?dealershipId=${dealershipId}` 
        : `/api/admin/prompts/${id}`;
      const res = await fetch(deleteUrl, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to delete prompt");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Prompt deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompts", dealershipId] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/prompts/${id}/sync-ghl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dealershipId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to sync prompt");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Prompt synced to GHL" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompts", dealershipId] });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const openEditDialog = (prompt: ChatPrompt) => {
    setEditingPrompt(prompt);
    let triggers: string[] = [];
    try {
      if (prompt.escalationTriggers) {
        triggers = JSON.parse(prompt.escalationTriggers);
      }
    } catch { }
    setFormData({
      name: prompt.name,
      scenario: prompt.scenario,
      channel: prompt.channel || "all",
      systemPrompt: prompt.systemPrompt,
      greeting: prompt.greeting,
      followUpPrompt: prompt.followUpPrompt || "",
      escalationTriggers: triggers,
      aiModel: prompt.aiModel || "gpt-4o",
      temperature: prompt.temperature ?? 0.7,
      maxTokens: prompt.maxTokens ?? 500,
      isActive: prompt.isActive,
      ghlWorkflowId: prompt.ghlWorkflowId || "",
    });
  };

  const addEscalationTrigger = () => {
    if (escalationInput.trim() && !formData.escalationTriggers.includes(escalationInput.trim())) {
      setFormData({
        ...formData,
        escalationTriggers: [...formData.escalationTriggers, escalationInput.trim()],
      });
      setEscalationInput("");
    }
  };

  const removeEscalationTrigger = (trigger: string) => {
    setFormData({
      ...formData,
      escalationTriggers: formData.escalationTriggers.filter((t) => t !== trigger),
    });
  };

  const filteredPrompts = activeTab === "all" 
    ? prompts 
    : prompts.filter(p => p.channel === activeTab || p.channel === "all");

  const PromptFormDialog = ({ isEdit }: { isEdit: boolean }) => (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Prompt Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Sales Assistant"
            data-testid="input-prompt-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scenario">Scenario</Label>
          <Select value={formData.scenario} onValueChange={(v) => setFormData({ ...formData, scenario: v })}>
            <SelectTrigger data-testid="select-scenario">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCENARIO_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="channel">Channel</Label>
          <Select value={formData.channel} onValueChange={(v) => setFormData({ ...formData, channel: v })}>
            <SelectTrigger data-testid="select-channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="aiModel">AI Model</Label>
          <Select value={formData.aiModel} onValueChange={(v) => setFormData({ ...formData, aiModel: v })}>
            <SelectTrigger data-testid="select-ai-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="systemPrompt">System Prompt</Label>
        <Textarea
          id="systemPrompt"
          value={formData.systemPrompt}
          onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
          placeholder="You are a helpful assistant for [Dealership Name]..."
          className="min-h-[120px]"
          data-testid="textarea-system-prompt"
        />
        <p className="text-xs text-muted-foreground">This is the main instruction that tells the AI how to behave.</p>
        <AiPromptEnhancer
          currentText={formData.systemPrompt}
          onApply={(enhanced) => setFormData({ ...formData, systemPrompt: enhanced })}
          promptType="system"
          context={`Scenario: ${formData.scenario}, Channel: ${formData.channel}`}
          dealershipId={dealershipId}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="greeting">Greeting Message</Label>
        <Textarea
          id="greeting"
          value={formData.greeting}
          onChange={(e) => setFormData({ ...formData, greeting: e.target.value })}
          placeholder="Hi! Welcome to [Dealership]. How can I help you today?"
          className="min-h-[80px]"
          data-testid="textarea-greeting"
        />
        <p className="text-xs text-muted-foreground">The first message customers see when starting a conversation.</p>
        <AiPromptEnhancer
          currentText={formData.greeting}
          onApply={(enhanced) => setFormData({ ...formData, greeting: enhanced })}
          promptType="greeting"
          context={`Scenario: ${formData.scenario}`}
          dealershipId={dealershipId}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="followUpPrompt">Follow-up Prompt (Optional)</Label>
        <Textarea
          id="followUpPrompt"
          value={formData.followUpPrompt}
          onChange={(e) => setFormData({ ...formData, followUpPrompt: e.target.value })}
          placeholder="If the customer hasn't responded, check in with them..."
          className="min-h-[80px]"
          data-testid="textarea-follow-up"
        />
        <AiPromptEnhancer
          currentText={formData.followUpPrompt}
          onApply={(enhanced) => setFormData({ ...formData, followUpPrompt: enhanced })}
          promptType="followup"
          context={`Scenario: ${formData.scenario}`}
          dealershipId={dealershipId}
        />
      </div>

      <div className="space-y-2">
        <Label>Escalation Triggers</Label>
        <div className="flex gap-2">
          <Input
            value={escalationInput}
            onChange={(e) => setEscalationInput(e.target.value)}
            placeholder="Add keyword (e.g., 'speak to manager')"
            onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addEscalationTrigger())}
            data-testid="input-escalation"
          />
          <Button type="button" variant="outline" onClick={addEscalationTrigger}>Add</Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {formData.escalationTriggers.map((trigger) => (
            <Badge key={trigger} variant="secondary" className="cursor-pointer" onClick={() => removeEscalationTrigger(trigger)}>
              {trigger} <XCircle className="ml-1 h-3 w-3" />
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Keywords that trigger handoff to a human agent.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Temperature: {formData.temperature.toFixed(1)}</Label>
          <Slider
            value={[formData.temperature]}
            onValueChange={([v]) => setFormData({ ...formData, temperature: v })}
            min={0}
            max={1}
            step={0.1}
            data-testid="slider-temperature"
          />
          <p className="text-xs text-muted-foreground">Lower = more focused, Higher = more creative</p>
        </div>
        <div className="space-y-2">
          <Label>Max Tokens: {formData.maxTokens}</Label>
          <Slider
            value={[formData.maxTokens]}
            onValueChange={([v]) => setFormData({ ...formData, maxTokens: v })}
            min={100}
            max={2000}
            step={50}
            data-testid="slider-max-tokens"
          />
          <p className="text-xs text-muted-foreground">Maximum response length</p>
        </div>
      </div>

      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="ghlWorkflowId" className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          GHL Workflow ID
        </Label>
        <Input
          id="ghlWorkflowId"
          value={formData.ghlWorkflowId}
          onChange={(e) => setFormData({ ...formData, ghlWorkflowId: e.target.value })}
          placeholder="Paste workflow ID from GoHighLevel"
          data-testid="input-ghl-workflow"
        />
        <p className="text-xs text-muted-foreground">Link this prompt to a GHL workflow to sync updates automatically.</p>
      </div>

      <div className="flex items-center space-x-2 border-t pt-4">
        <Switch
          id="isActive"
          checked={formData.isActive}
          onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
          data-testid="switch-active"
        />
        <Label htmlFor="isActive">Prompt Active</Label>
      </div>
    </div>
  );

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading prompts...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" />
            AI Prompt Editor
          </h2>
          <p className="text-muted-foreground">Manage chat prompts for your AI assistants. Changes sync to GoHighLevel automatically.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-prompt" onClick={() => setFormData(defaultFormData)}>
              <Plus className="h-4 w-4 mr-2" />
              New Prompt
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Prompt</DialogTitle>
              <DialogDescription>Define a new AI prompt for customer conversations.</DialogDescription>
            </DialogHeader>
            <PromptFormDialog isEdit={false} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate(formData)} disabled={createMutation.isPending} data-testid="button-save-prompt">
                {createMutation.isPending ? "Creating..." : "Create Prompt"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Channels</TabsTrigger>
          <TabsTrigger value="sms">SMS</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredPrompts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No prompts found. Create your first prompt to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredPrompts.map((prompt) => (
                <Card key={prompt.id} data-testid={`prompt-card-${prompt.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg">{prompt.name}</CardTitle>
                          <Badge variant={prompt.isActive ? "default" : "secondary"}>
                            {prompt.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline">{prompt.scenario}</Badge>
                          <Badge variant="outline" className="capitalize">{prompt.channel}</Badge>
                        </div>
                        <CardDescription className="mt-1 line-clamp-2">{prompt.greeting}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {prompt.ghlWorkflowId && (
                          <div className="flex items-center gap-1">
                            {prompt.ghlPromptSynced ? (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Synced
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Pending
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => syncMutation.mutate(prompt.id)}
                              disabled={syncMutation.isPending}
                              title="Sync to GHL"
                            >
                              <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                            </Button>
                          </div>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(prompt)} data-testid={`edit-prompt-${prompt.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Delete this prompt?")) deleteMutation.mutate(prompt.id);
                          }}
                          data-testid={`delete-prompt-${prompt.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>Model: <span className="font-medium">{prompt.aiModel || "gpt-4o"}</span></div>
                      <div>Temp: <span className="font-medium">{prompt.temperature?.toFixed(1) || "0.7"}</span></div>
                      <div>Max Tokens: <span className="font-medium">{prompt.maxTokens || 500}</span></div>
                      {prompt.ghlWorkflowId && (
                        <div>GHL: <span className="font-medium text-xs">{prompt.ghlWorkflowId.slice(0, 12)}...</span></div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editingPrompt} onOpenChange={(open) => !open && setEditingPrompt(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Prompt</DialogTitle>
            <DialogDescription>Update the AI prompt settings.</DialogDescription>
          </DialogHeader>
          <PromptFormDialog isEdit={true} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPrompt(null)}>Cancel</Button>
            <Button
              onClick={() => editingPrompt && updateMutation.mutate({ id: editingPrompt.id, data: formData })}
              disabled={updateMutation.isPending}
              data-testid="button-update-prompt"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
