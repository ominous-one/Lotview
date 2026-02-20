import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { 
  CheckCircle2, Circle, SkipForward, ExternalLink, 
  ChevronDown, ChevronRight, Building2, Scale, Palette,
  Plug, Users, FileText, Loader2, AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LaunchChecklistItem {
  id: number;
  dealershipId: number;
  category: string;
  taskName: string;
  taskDescription: string | null;
  isRequired: boolean;
  status: string;
  completedBy: number | null;
  completedAt: string | null;
  dueDate: string | null;
  sortOrder: number;
  externalUrl: string | null;
  notes: string | null;
}

interface LaunchChecklistProgress {
  total: number;
  completed: number;
  required: number;
  requiredCompleted: number;
}

interface LaunchChecklistProps {
  dealershipId: number;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  accounts: { label: 'External Accounts', icon: Building2, color: 'text-blue-500' },
  legal: { label: 'Legal & Compliance', icon: Scale, color: 'text-red-500' },
  branding: { label: 'Branding Assets', icon: Palette, color: 'text-purple-500' },
  integrations: { label: 'API Integrations', icon: Plug, color: 'text-green-500' },
  staff: { label: 'Staff Onboarding', icon: Users, color: 'text-orange-500' },
  content: { label: 'Content & Testing', icon: FileText, color: 'text-cyan-500' },
};

export function LaunchChecklist({ dealershipId }: LaunchChecklistProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['accounts', 'legal']));
  const [skipNotes, setSkipNotes] = useState<Record<number, string>>({});
  const [showSkipInput, setShowSkipInput] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ items: LaunchChecklistItem[]; progress: LaunchChecklistProgress }>({
    queryKey: [`/api/super-admin/dealerships/${dealershipId}/launch-checklist`],
    queryFn: async () => {
      const res = await fetch(`/api/super-admin/dealerships/${dealershipId}/launch-checklist`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch checklist');
      return res.json();
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const res = await fetch(`/api/super-admin/dealerships/${dealershipId}/launch-checklist/${itemId}/complete`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to complete item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/super-admin/dealerships/${dealershipId}/launch-checklist`] });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async ({ itemId, notes }: { itemId: number; notes?: string }) => {
      const res = await fetch(`/api/super-admin/dealerships/${dealershipId}/launch-checklist/${itemId}/skip`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error('Failed to skip item');
      return res.json();
    },
    onSuccess: () => {
      setShowSkipInput(null);
      setSkipNotes({});
      queryClient.invalidateQueries({ queryKey: [`/api/super-admin/dealerships/${dealershipId}/launch-checklist`] });
    },
  });

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p>Failed to load launch checklist</p>
        </CardContent>
      </Card>
    );
  }

  const { items, progress } = data;
  const progressPercent = progress.required > 0 ? (progress.requiredCompleted / progress.required) * 100 : 0;
  
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, LaunchChecklistItem[]>);

  const categoryOrder = ['accounts', 'legal', 'branding', 'integrations', 'staff', 'content'];
  const sortedCategories = categoryOrder.filter(cat => groupedItems[cat]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Launch Readiness</span>
            <Badge variant={progressPercent === 100 ? "default" : "secondary"}>
              {progress.requiredCompleted} / {progress.required} Required
            </Badge>
          </CardTitle>
          <CardDescription>
            Complete these tasks before the dealership goes live
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Required tasks completed</span>
              <span className="font-medium">{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.completed} of {progress.total} total tasks done</span>
              {progressPercent === 100 && (
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Ready to launch!
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {sortedCategories.map(category => {
        const config = CATEGORY_CONFIG[category] || { label: category, icon: Circle, color: 'text-gray-500' };
        const Icon = config.icon;
        const categoryItems = groupedItems[category];
        const completedCount = categoryItems.filter(i => i.status === 'completed' || i.status === 'skipped').length;
        const isExpanded = expandedCategories.has(category);

        return (
          <Card key={category}>
            <CardHeader 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => toggleCategory(category)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                  <Icon className={cn("w-5 h-5", config.color)} />
                  <CardTitle className="text-lg">{config.label}</CardTitle>
                </div>
                <Badge variant={completedCount === categoryItems.length ? "default" : "outline"}>
                  {completedCount} / {categoryItems.length}
                </Badge>
              </div>
            </CardHeader>
            
            {isExpanded && (
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {categoryItems.map(item => (
                    <div 
                      key={item.id}
                      className={cn(
                        "p-4 rounded-lg border transition-colors",
                        item.status === 'completed' && "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900",
                        item.status === 'skipped' && "bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800",
                        item.status === 'pending' && "bg-background border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {item.status === 'completed' ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          ) : item.status === 'skipped' ? (
                            <SkipForward className="w-5 h-5 text-gray-400" />
                          ) : (
                            <Circle className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              "font-medium",
                              item.status !== 'pending' && "line-through text-muted-foreground"
                            )}>
                              {item.taskName}
                            </span>
                            {item.isRequired && item.status === 'pending' && (
                              <Badge variant="destructive" className="text-xs">Required</Badge>
                            )}
                          </div>
                          
                          {item.taskDescription && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {item.taskDescription}
                            </p>
                          )}
                          
                          {item.notes && (
                            <p className="text-sm text-muted-foreground italic mb-2">
                              Note: {item.notes}
                            </p>
                          )}
                          
                          {item.status === 'pending' && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              <Button
                                size="sm"
                                onClick={() => completeMutation.mutate(item.id)}
                                disabled={completeMutation.isPending}
                                data-testid={`button-complete-${item.id}`}
                              >
                                {completeMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 mr-1" />
                                )}
                                Mark Complete
                              </Button>
                              
                              {!item.isRequired && showSkipInput !== item.id && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setShowSkipInput(item.id)}
                                  data-testid={`button-skip-${item.id}`}
                                >
                                  <SkipForward className="w-4 h-4 mr-1" />
                                  Skip
                                </Button>
                              )}
                              
                              {item.externalUrl && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  asChild
                                >
                                  <a 
                                    href={item.externalUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    data-testid={`link-external-${item.id}`}
                                  >
                                    <ExternalLink className="w-4 h-4 mr-1" />
                                    Open
                                  </a>
                                </Button>
                              )}
                            </div>
                          )}
                          
                          {showSkipInput === item.id && (
                            <div className="mt-3 space-y-2">
                              <Textarea
                                placeholder="Why are you skipping this? (optional)"
                                value={skipNotes[item.id] || ''}
                                onChange={(e) => setSkipNotes({ ...skipNotes, [item.id]: e.target.value })}
                                rows={2}
                                data-testid={`input-skip-notes-${item.id}`}
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => skipMutation.mutate({ itemId: item.id, notes: skipNotes[item.id] })}
                                  disabled={skipMutation.isPending}
                                >
                                  {skipMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                  ) : null}
                                  Confirm Skip
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setShowSkipInput(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
