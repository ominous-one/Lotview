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
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Clock, Mail, MessageSquare, Bot, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { AiPromptEnhancer } from "./AiPromptEnhancer";
import { apiRequest } from "@/lib/queryClient";

interface SequenceStep {
  stepNumber: number;
  delayMinutes: number;
  messageType: 'sms' | 'email';
  templateText: string;
}

interface FollowUpSequence {
  id: number;
  dealershipId: number;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConditions: string | null;
  steps: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SequenceFormData {
  name: string;
  description: string;
  triggerType: string;
  triggerConditions: string;
  steps: SequenceStep[];
  isActive: boolean;
}

const TRIGGER_TYPE_OPTIONS = [
  { value: "chat_ended", label: "After Chat Ends", description: "When a customer finishes a chat session" },
  { value: "no_activity", label: "No Activity (Cold Lead)", description: "When a lead goes cold for a set number of days" },
  { value: "vehicle_views", label: "Vehicle Views", description: "When a customer views specific vehicles" },
  { value: "post_test_drive", label: "After Test Drive", description: "Follow up after a test drive appointment" },
  { value: "facebook_messenger", label: "Facebook Messenger Lead", description: "When someone messages you on Facebook" },
  { value: "manual", label: "Manual Trigger", description: "Start sequence manually for specific contacts" },
];

const defaultStep: SequenceStep = {
  stepNumber: 1,
  delayMinutes: 1440,
  messageType: 'sms',
  templateText: ''
};

const defaultFormData: SequenceFormData = {
  name: "",
  description: "",
  triggerType: "chat_ended",
  triggerConditions: "",
  steps: [{ ...defaultStep }],
  isActive: true
};

function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / 1440)} days`;
}

function parseDelay(value: string, unit: string): number {
  const num = parseInt(value) || 0;
  switch (unit) {
    case 'minutes': return num;
    case 'hours': return num * 60;
    case 'days': return num * 1440;
    default: return num;
  }
}

interface FollowUpSequenceEditorProps {
  dealershipId?: number;
}

export function FollowUpSequenceEditor({ dealershipId }: FollowUpSequenceEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSequence, setEditingSequence] = useState<FollowUpSequence | null>(null);
  const [formData, setFormData] = useState<SequenceFormData>(defaultFormData);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0]));

  const queryUrl = dealershipId 
    ? `/api/automation/sequences?dealershipId=${dealershipId}` 
    : "/api/automation/sequences";

  const { data: sequences = [], isLoading } = useQuery<FollowUpSequence[]>({
    queryKey: ["/api/automation/sequences", dealershipId],
    queryFn: async () => {
      const res = await apiRequest("GET", queryUrl);
      if (!res.ok) throw new Error("Failed to fetch sequences");
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: SequenceFormData) => {
      const res = await apiRequest("POST", "/api/automation/sequences", {
        ...data,
        steps: JSON.stringify(data.steps),
        triggerConditions: data.triggerConditions || null,
        dealershipId
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to create sequence");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequence created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/sequences", dealershipId] });
      setIsCreateOpen(false);
      setFormData(defaultFormData);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<SequenceFormData> }) => {
      const payload: any = { ...data, dealershipId };
      if (data.steps) payload.steps = JSON.stringify(data.steps);
      
      const res = await apiRequest("PATCH", `/api/automation/sequences/${id}`, payload);
      if (!res.ok) throw new Error((await res.json()).error || "Failed to update sequence");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequence updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/sequences", dealershipId] });
      setEditingSequence(null);
      setFormData(defaultFormData);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const deleteUrl = dealershipId 
        ? `/api/automation/sequences/${id}?dealershipId=${dealershipId}` 
        : `/api/automation/sequences/${id}`;
      const res = await apiRequest("DELETE", deleteUrl);
      if (!res.ok) throw new Error((await res.json()).error || "Failed to delete sequence");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequence deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/sequences", dealershipId] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const openEditDialog = (sequence: FollowUpSequence) => {
    setEditingSequence(sequence);
    let steps: SequenceStep[] = [];
    try {
      steps = JSON.parse(sequence.steps);
    } catch {
      steps = [{ ...defaultStep }];
    }
    setFormData({
      name: sequence.name,
      description: sequence.description || "",
      triggerType: sequence.triggerType,
      triggerConditions: sequence.triggerConditions || "",
      steps,
      isActive: sequence.isActive
    });
    setExpandedSteps(new Set([0]));
  };

  const addStep = () => {
    const newStep: SequenceStep = {
      stepNumber: formData.steps.length + 1,
      delayMinutes: 1440,
      messageType: 'sms',
      templateText: ''
    };
    setFormData({ ...formData, steps: [...formData.steps, newStep] });
    setExpandedSteps(new Set([formData.steps.length]));
  };

  const removeStep = (index: number) => {
    const newSteps = formData.steps.filter((_, i) => i !== index)
      .map((step, i) => ({ ...step, stepNumber: i + 1 }));
    setFormData({ ...formData, steps: newSteps });
  };

  const updateStep = (index: number, updates: Partial<SequenceStep>) => {
    const newSteps = [...formData.steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setFormData({ ...formData, steps: newSteps });
  };

  const toggleStepExpanded = (index: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSteps(newExpanded);
  };

  const StepEditor = ({ step, index }: { step: SequenceStep; index: number }) => {
    const isExpanded = expandedSteps.has(index);
    const [delayValue, setDelayValue] = useState(
      step.delayMinutes >= 1440 ? Math.round(step.delayMinutes / 1440) :
      step.delayMinutes >= 60 ? Math.round(step.delayMinutes / 60) : step.delayMinutes
    );
    const [delayUnit, setDelayUnit] = useState(
      step.delayMinutes >= 1440 ? 'days' : step.delayMinutes >= 60 ? 'hours' : 'minutes'
    );

    return (
      <Card className="border-dashed">
        <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => toggleStepExpanded(index)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium">
                {step.stepNumber}
              </div>
              <div className="flex items-center gap-2">
                {step.messageType === 'sms' ? (
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Mail className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium capitalize">{step.messageType}</span>
              </div>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {formatDelay(step.delayMinutes)}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {formData.steps.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={(e) => { e.stopPropagation(); removeStep(index); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="pt-0 pb-4 px-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Message Type</Label>
                <Select
                  value={step.messageType}
                  onValueChange={(v: 'sms' | 'email') => updateStep(index, { messageType: v })}
                >
                  <SelectTrigger data-testid={`step-${index}-type`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sms">SMS / Text</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Delay After Previous</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={delayValue}
                    onChange={(e) => {
                      setDelayValue(parseInt(e.target.value) || 1);
                      updateStep(index, { delayMinutes: parseDelay(e.target.value, delayUnit) });
                    }}
                    className="w-20"
                    data-testid={`step-${index}-delay`}
                  />
                  <Select
                    value={delayUnit}
                    onValueChange={(v) => {
                      setDelayUnit(v);
                      updateStep(index, { delayMinutes: parseDelay(String(delayValue), v) });
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Message Template</Label>
              <Textarea
                value={step.templateText}
                onChange={(e) => updateStep(index, { templateText: e.target.value })}
                placeholder={step.messageType === 'sms' 
                  ? "Hi {{first_name}}, just checking in about that {{vehicle}}. Still interested?" 
                  : "Subject: Your {{vehicle}} is waiting!\n\nHi {{first_name}},\n\nWe wanted to follow up..."}
                className="min-h-[100px]"
                data-testid={`step-${index}-template`}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{name}}"}, {"{{first_name}}"}, {"{{vehicle}}"}, {"{{price}}"}, {"{{dealership}}"} for personalization
              </p>
              <AiPromptEnhancer
                currentText={step.templateText}
                onApply={(enhanced) => updateStep(index, { templateText: enhanced })}
                promptType={step.messageType}
                context={`Trigger: ${formData.triggerType}, Step ${step.stepNumber} of ${formData.steps.length}`}
                dealershipId={dealershipId}
              />
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const SequenceFormDialog = ({ isEdit }: { isEdit: boolean }) => (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Sequence Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Cold Lead Revival"
            data-testid="input-sequence-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="triggerType">When to Start</Label>
          <Select 
            value={formData.triggerType} 
            onValueChange={(v) => setFormData({ ...formData, triggerType: v })}
          >
            <SelectTrigger data-testid="select-trigger-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGER_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {TRIGGER_TYPE_OPTIONS.find(o => o.value === formData.triggerType)?.description}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of this sequence's purpose"
          data-testid="input-sequence-description"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Message Steps
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={addStep} data-testid="add-step-button">
            <Plus className="h-4 w-4 mr-1" />
            Add Step
          </Button>
        </div>
        <div className="space-y-3">
          {formData.steps.map((step, index) => (
            <StepEditor key={index} step={step} index={index} />
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-2 border-t pt-4">
        <Switch
          id="isActive"
          checked={formData.isActive}
          onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
          data-testid="switch-sequence-active"
        />
        <Label htmlFor="isActive">Sequence Active</Label>
      </div>
    </div>
  );

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading sequences...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6" />
            Follow-up Sequences
          </h2>
          <p className="text-muted-foreground">
            Automated message sequences that go out to customers. Use AI to craft perfect messages.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-sequence" onClick={() => setFormData(defaultFormData)}>
              <Plus className="h-4 w-4 mr-2" />
              New Sequence
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Follow-up Sequence</DialogTitle>
              <DialogDescription>
                Set up automated messages that go out to customers. AI will help you write great messages.
              </DialogDescription>
            </DialogHeader>
            <SequenceFormDialog isEdit={false} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => createMutation.mutate(formData)} 
                disabled={createMutation.isPending || !formData.name.trim()}
                data-testid="button-save-sequence"
              >
                {createMutation.isPending ? "Creating..." : "Create Sequence"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {sequences.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No follow-up sequences yet.</p>
            <p className="text-sm mt-1">Create your first sequence to start automating customer follow-ups.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sequences.map((sequence) => {
            let steps: SequenceStep[] = [];
            try {
              steps = JSON.parse(sequence.steps);
            } catch { }
            const triggerInfo = TRIGGER_TYPE_OPTIONS.find(t => t.value === sequence.triggerType);
            
            return (
              <Card key={sequence.id} data-testid={`sequence-card-${sequence.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg">{sequence.name}</CardTitle>
                        <Badge variant={sequence.isActive ? "default" : "secondary"}>
                          {sequence.isActive ? "Active" : "Paused"}
                        </Badge>
                        <Badge variant="outline">{triggerInfo?.label || sequence.triggerType}</Badge>
                      </div>
                      {sequence.description && (
                        <CardDescription className="mt-1">{sequence.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => openEditDialog(sequence)}
                        data-testid={`edit-sequence-${sequence.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Delete this sequence? This cannot be undone.")) {
                            deleteMutation.mutate(sequence.id);
                          }
                        }}
                        data-testid={`delete-sequence-${sequence.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Zap className="h-4 w-4" />
                      <span>{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
                    </div>
                    {steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-1">
                        {step.messageType === 'sms' ? (
                          <MessageSquare className="h-3 w-3" />
                        ) : (
                          <Mail className="h-3 w-3" />
                        )}
                        <span className="text-xs">{formatDelay(step.delayMinutes)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editingSequence} onOpenChange={(open) => !open && setEditingSequence(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Sequence</DialogTitle>
            <DialogDescription>Update your automated follow-up sequence.</DialogDescription>
          </DialogHeader>
          <SequenceFormDialog isEdit={true} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSequence(null)}>Cancel</Button>
            <Button
              onClick={() => editingSequence && updateMutation.mutate({ id: editingSequence.id, data: formData })}
              disabled={updateMutation.isPending}
              data-testid="button-update-sequence"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
