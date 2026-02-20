import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/Navbar";
import { apiGet, apiPost, apiPatch, apiDelete, ApiRequestError } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { 
  Phone, 
  PhoneIncoming, 
  PhoneOutgoing, 
  Clock, 
  User, 
  Calendar,
  BarChart3, 
  Star, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  Settings,
  Plus,
  Trash2,
  Save,
  Eye,
  FileText,
  Copy,
  ChevronUp,
  ChevronDown,
  ClipboardList,
  Users,
  Mic
} from "lucide-react";

interface CallRecording {
  id: number;
  dealershipId: number;
  ghlCallId: string;
  ghlContactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  salespersonId: number | null;
  salespersonName: string | null;
  callType: string;
  callDirection: string;
  callDuration: number;
  recordingUrl: string | null;
  transcription: string | null;
  callStatus: string;
  startedAt: string;
  analysisStatus: string;
  overallScore: number | null;
  categoryScores: Record<string, number> | null;
  aiSummary: string | null;
  keyMoments: any[] | null;
  coachingPoints: string[] | null;
  needsReview: boolean;
  reviewedBy: number | null;
  reviewNotes: string | null;
  analyzedAt: string | null;
  createdAt: string;
}

interface AnalysisCriteria {
  id: number;
  dealershipId: number;
  name: string;
  description: string | null;
  category: string;
  weight: number;
  isActive: boolean;
  promptInstructions: string | null;
}

interface CallStats {
  totalCalls: number;
  analyzedCalls: number;
  avgScore: number;
  needsReviewCount: number;
  inboundCalls: number;
  outboundCalls: number;
  avgDuration: number;
}

interface ScoringTemplate {
  id: number;
  dealershipId: number | null;
  department: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  version: number;
  criteria?: ScoringCriterion[];
}

interface ScoringCriterion {
  id: number;
  templateId: number;
  category: string;
  label: string;
  description: string | null;
  weight: number;
  maxScore: number;
  ratingType: string;
  sortOrder: number;
  aiInstruction: string | null;
  isRequired: boolean;
}

interface ScoringSheet {
  id: number;
  callRecordingId: number;
  templateId: number;
  status: string;
  aiTotalScore: number | null;
  aiMaxScore: number | null;
  reviewerTotalScore: number | null;
  finalScore: number | null;
  employeeName: string | null;
  employeeDepartment: string | null;
  reviewerNotes: string | null;
  coachingNotes: string | null;
}

interface ScoringResponse {
  id: number;
  sheetId: number;
  criterionId: number;
  aiScore: number | null;
  aiReasoning: string | null;
  reviewerScore: number | null;
  comment: string | null;
  timestamp: string | null;
}

interface CallParticipant {
  id: number;
  callRecordingId: number;
  speakerLabel: string;
  speakerName: string | null;
  speakerRole: string;
  department: string | null;
  userId: number | null;
  confidenceScore: number | null;
  speakingTimeSeconds: number | null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-gray-400';
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreBadgeVariant(score: number | null): "default" | "secondary" | "destructive" | "outline" {
  if (score === null) return 'outline';
  if (score >= 80) return 'default';
  if (score >= 60) return 'secondary';
  return 'destructive';
}

function CallListItem({ call, onClick }: { call: CallRecording; onClick: () => void }) {
  return (
    <div 
      className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={onClick}
      data-testid={`call-item-${call.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${call.callDirection === 'inbound' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
            {call.callDirection === 'inbound' ? <PhoneIncoming className="w-4 h-4" /> : <PhoneOutgoing className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-medium">{call.contactName || call.contactPhone || 'Unknown Caller'}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {formatDuration(call.callDuration)}
              <span className="text-muted-foreground/50">•</span>
              {formatDate(call.startedAt)}
            </div>
            {call.salespersonName && (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <User className="w-3 h-3" />
                {call.salespersonName}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          {call.analysisStatus === 'completed' ? (
            <Badge variant={getScoreBadgeVariant(call.overallScore)} className="text-sm">
              {call.overallScore !== null ? `${call.overallScore}%` : 'N/A'}
            </Badge>
          ) : call.analysisStatus === 'pending' ? (
            <Badge variant="outline" className="text-sm">
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Analyzing
            </Badge>
          ) : (
            <Badge variant="outline" className="text-sm text-muted-foreground">
              Not Analyzed
            </Badge>
          )}
          
          {call.needsReview && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Review Needed
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function CallDetailDialog({ 
  call, 
  open, 
  onOpenChange,
  onAnalyze,
  onMarkReviewed
}: { 
  call: CallRecording | null; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onAnalyze: (id: number) => void;
  onMarkReviewed: (id: number, notes: string) => void;
}) {
  const [reviewNotes, setReviewNotes] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  
  if (!call) return null;
  
  const categoryScores = call.categoryScores || {};
  const keyMoments = call.keyMoments || [];
  const coachingPoints = call.coachingPoints || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {call.callDirection === 'inbound' ? <PhoneIncoming className="w-5 h-5" /> : <PhoneOutgoing className="w-5 h-5" />}
            Call with {call.contactName || call.contactPhone || 'Unknown'}
          </DialogTitle>
          <DialogDescription>
            {formatDate(call.startedAt)} • {formatDuration(call.callDuration)} • {call.salespersonName || 'Unassigned'}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="analysis" className="flex-1 overflow-hidden">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="analysis" data-testid="tab-analysis">
              <BarChart3 className="w-4 h-4 mr-2" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="scoring" data-testid="tab-scoring">
              <ClipboardList className="w-4 h-4 mr-2" />
              Scoring Sheet
            </TabsTrigger>
            <TabsTrigger value="transcript" data-testid="tab-transcript">
              <MessageSquare className="w-4 h-4 mr-2" />
              Transcript
            </TabsTrigger>
            <TabsTrigger value="coaching" data-testid="tab-coaching">
              <Star className="w-4 h-4 mr-2" />
              Coaching
            </TabsTrigger>
            <TabsTrigger value="participants" data-testid="tab-participants">
              <Users className="w-4 h-4 mr-2" />
              Speakers
            </TabsTrigger>
          </TabsList>
          
          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="analysis" className="m-0">
              {call.analysisStatus === 'completed' ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className={`text-4xl font-bold ${getScoreColor(call.overallScore)}`}>
                        {call.overallScore}%
                      </div>
                      <div className="text-sm text-muted-foreground">Overall Score</div>
                    </div>
                    
                    <Separator orientation="vertical" className="h-16" />
                    
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      {Object.entries(categoryScores).map(([category, score]) => (
                        <div key={category} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="capitalize">{category.replace(/_/g, ' ')}</span>
                            <span className={getScoreColor(score as number)}>{score}%</span>
                          </div>
                          <Progress value={score as number} className="h-2" />
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {call.aiSummary && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">AI Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{call.aiSummary}</p>
                      </CardContent>
                    </Card>
                  )}
                  
                  {keyMoments.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Key Moments</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {keyMoments.map((moment, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <Badge variant="outline" className="shrink-0">
                                {moment.timestamp || `${i + 1}`}
                              </Badge>
                              <span>{moment.description || moment}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : call.analysisStatus === 'pending' ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Analysis in progress...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <BarChart3 className="w-8 h-8 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">This call hasn't been analyzed yet</p>
                  <Button onClick={() => onAnalyze(call.id)} data-testid="btn-analyze-call">
                    <Play className="w-4 h-4 mr-2" />
                    Analyze Now
                  </Button>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="scoring" className="m-0">
              <CallScoringSheet 
                callId={call.id} 
                token={localStorage.getItem('auth_token')} 
              />
            </TabsContent>
            
            <TabsContent value="transcript" className="m-0">
              {call.transcription ? (
                <Card>
                  <CardContent className="pt-4">
                    <pre className="text-sm whitespace-pre-wrap font-sans">{call.transcription}</pre>
                  </CardContent>
                </Card>
              ) : call.recordingUrl ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="w-8 h-8 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Transcript not available</p>
                  <p className="text-sm text-muted-foreground mt-1">Audio recording is available for playback</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="w-8 h-8 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No transcript or recording available</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="coaching" className="m-0">
              <div className="space-y-6">
                {coachingPoints.length > 0 ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Star className="w-4 h-4 text-yellow-500" />
                        AI Coaching Suggestions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {coachingPoints.map((point, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No coaching points available for this call
                  </div>
                )}
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Manager Review Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {call.reviewNotes ? (
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        <p>{call.reviewNotes}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Reviewed by {call.reviewedBy ? `User #${call.reviewedBy}` : 'Manager'}
                        </p>
                      </div>
                    ) : null}
                    
                    {call.needsReview && (
                      <>
                        <Textarea
                          placeholder="Add your review notes here..."
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          className="min-h-[100px]"
                          data-testid="input-review-notes"
                        />
                        <Button 
                          onClick={() => onMarkReviewed(call.id, reviewNotes)}
                          data-testid="btn-mark-reviewed"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Mark as Reviewed
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="participants" className="m-0">
              <CallParticipantsPanel 
                callId={call.id} 
                token={localStorage.getItem('auth_token')} 
              />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function CallParticipantsPanel({ callId, token }: { callId: number; token: string | null }) {
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    
    const fetchParticipants = async () => {
      try {
        const data = await apiGet<CallParticipant[]>(`/api/call-recordings/${callId}/participants`, { 'Authorization': `Bearer ${token}` });
        setParticipants(data);
      } catch (error) {
        console.error('Error fetching participants:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchParticipants();
  }, [callId, token]);

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'employee': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'customer': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getDepartmentLabel = (dept: string | null) => {
    if (!dept) return null;
    const labels: Record<string, string> = {
      sales: 'Sales',
      service: 'Service',
      parts: 'Parts',
      finance: 'Finance',
      general: 'General'
    };
    return labels[dept] || dept;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Users className="w-8 h-8 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No speaker data available</p>
        <p className="text-sm text-muted-foreground mt-1">Speaker identification requires call transcription with diarization</p>
      </div>
    );
  }

  const totalSpeakingTime = participants.reduce((sum, p) => sum + (p.speakingTimeSeconds || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Identified Speakers ({participants.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {participants.map((participant) => (
            <div 
              key={participant.id} 
              className="p-3 border rounded-lg"
              data-testid={`participant-${participant.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${getRoleColor(participant.speakerRole)}`}>
                    {participant.speakerRole === 'employee' ? (
                      <User className="w-4 h-4" />
                    ) : participant.speakerRole === 'customer' ? (
                      <Phone className="w-4 h-4" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium">
                      {participant.speakerName || participant.speakerLabel}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs capitalize">
                        {participant.speakerRole}
                      </Badge>
                      {participant.department && (
                        <Badge variant="secondary" className="text-xs">
                          {getDepartmentLabel(participant.department)}
                        </Badge>
                      )}
                      {participant.confidenceScore !== null && (
                        <span className="text-xs text-muted-foreground">
                          {participant.confidenceScore}% confidence
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {participant.speakingTimeSeconds !== null && totalSpeakingTime > 0 && (
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {formatDuration(participant.speakingTimeSeconds)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round((participant.speakingTimeSeconds / totalSpeakingTime) * 100)}% of call
                    </div>
                  </div>
                )}
              </div>
              
              {participant.speakingTimeSeconds !== null && totalSpeakingTime > 0 && (
                <Progress 
                  value={(participant.speakingTimeSeconds / totalSpeakingTime) * 100} 
                  className="h-1 mt-3"
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Speaking Time Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {participants.map((p, i) => {
              const percentage = totalSpeakingTime > 0 
                ? (p.speakingTimeSeconds || 0) / totalSpeakingTime * 100 
                : 0;
              return (
                <div
                  key={p.id}
                  className={`h-6 rounded ${
                    p.speakerRole === 'employee' ? 'bg-blue-500' : 
                    p.speakerRole === 'customer' ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                  style={{ width: `${percentage}%` }}
                  title={`${p.speakerName || p.speakerLabel}: ${Math.round(percentage)}%`}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <span>Employee</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>Customer</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CriteriaManagementDialog({
  open,
  onOpenChange,
  criteria,
  onSave,
  onDelete
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  criteria: AnalysisCriteria[];
  onSave: (criterion: Partial<AnalysisCriteria>) => void;
  onDelete: (id: number) => void;
}) {
  const [editingCriterion, setEditingCriterion] = useState<Partial<AnalysisCriteria> | null>(null);
  
  const categories = ['professionalism', 'script_adherence', 'customer_sentiment', 'lead_qualification', 'objection_handling', 'closing_skills'];
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Analysis Criteria
          </DialogTitle>
          <DialogDescription>
            Configure the criteria used to analyze and score calls
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          <div className="space-y-4">
            {criteria.map((criterion) => (
              <Card key={criterion.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{criterion.name}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {criterion.category.replace(/_/g, ' ')}
                        </Badge>
                        {!criterion.isActive && (
                          <Badge variant="secondary" className="text-xs">Disabled</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{criterion.description}</p>
                      <div className="text-xs text-muted-foreground mt-2">
                        Weight: {criterion.weight}%
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setEditingCriterion(criterion)}
                        data-testid={`btn-edit-criterion-${criterion.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => onDelete(criterion.id)}
                        className="text-red-600 hover:text-red-700"
                        data-testid={`btn-delete-criterion-${criterion.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setEditingCriterion({ 
                name: '', 
                description: '', 
                category: 'professionalism', 
                weight: 20, 
                isActive: true,
                promptInstructions: ''
              })}
              data-testid="btn-add-criterion"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Criterion
            </Button>
          </div>
        </ScrollArea>
        
        {editingCriterion && (
          <Dialog open={!!editingCriterion} onOpenChange={() => setEditingCriterion(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCriterion.id ? 'Edit' : 'Add'} Criterion</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={editingCriterion.name || ''}
                    onChange={(e) => setEditingCriterion({ ...editingCriterion, name: e.target.value })}
                    placeholder="e.g., Greeting Quality"
                    data-testid="input-criterion-name"
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select 
                    value={editingCriterion.category || 'professionalism'} 
                    onValueChange={(v) => setEditingCriterion({ ...editingCriterion, category: v })}
                  >
                    <SelectTrigger data-testid="select-criterion-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat} className="capitalize">
                          {cat.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={editingCriterion.description || ''}
                    onChange={(e) => setEditingCriterion({ ...editingCriterion, description: e.target.value })}
                    placeholder="Describe what this criterion evaluates"
                    data-testid="input-criterion-description"
                  />
                </div>
                <div>
                  <Label>Weight (%)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={editingCriterion.weight || 20}
                    onChange={(e) => setEditingCriterion({ ...editingCriterion, weight: parseInt(e.target.value) || 20 })}
                    data-testid="input-criterion-weight"
                  />
                </div>
                <div>
                  <Label>AI Prompt Instructions (Optional)</Label>
                  <Textarea
                    value={editingCriterion.promptInstructions || ''}
                    onChange={(e) => setEditingCriterion({ ...editingCriterion, promptInstructions: e.target.value })}
                    placeholder="Custom instructions for the AI when evaluating this criterion"
                    className="min-h-[80px]"
                    data-testid="input-criterion-prompt"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditingCriterion(null)}>
                    Cancel
                  </Button>
                  <Button onClick={() => { onSave(editingCriterion); setEditingCriterion(null); }} data-testid="btn-save-criterion">
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

const DEPARTMENTS = ['Sales', 'Service', 'Parts', 'Finance', 'General'];
const SCORING_CATEGORIES = ['greeting', 'discovery', 'product_knowledge', 'closing', 'professionalism', 'follow_up'];
const RATING_TYPES = ['numeric', 'yes_no', 'scale_5'];

function ScoringTemplatesDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const token = localStorage.getItem('auth_token');
  
  const [templates, setTemplates] = useState<ScoringTemplate[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('Sales');
  const [selectedTemplate, setSelectedTemplate] = useState<ScoringTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editingCriterion, setEditingCriterion] = useState<Partial<ScoringCriterion> | null>(null);
  
  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<ScoringTemplate[]>('/api/call-scoring/templates', { 'Authorization': `Bearer ${token}` });
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const fetchTemplateDetails = async (templateId: number) => {
    try {
      const data = await apiGet<ScoringTemplate>(`/api/call-scoring/templates/${templateId}`, { 'Authorization': `Bearer ${token}` });
      setSelectedTemplate(data);
    } catch (error) {
      console.error('Error fetching template details:', error);
    }
  };
  
  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);
  
  const departmentTemplates = templates.filter(t => t.department === selectedDepartment);
  const isSystemTemplate = selectedTemplate?.dealershipId === null;
  
  const handleCloneTemplate = async (templateId: number) => {
    try {
      const cloned = await apiPost<ScoringTemplate>(`/api/call-scoring/templates/${templateId}/clone`, undefined, { 'Authorization': `Bearer ${token}` });
      toast({ title: "Success", description: "Template cloned successfully" });
      fetchTemplates();
      fetchTemplateDetails(cloned.id);
    } catch (error) {
      toast({ title: "Error", description: "Failed to clone template", variant: "destructive" });
    }
  };
  
  const handleUpdateTemplate = async (updates: Partial<ScoringTemplate>) => {
    if (!selectedTemplate) return;
    try {
      await apiPatch(`/api/call-scoring/templates/${selectedTemplate.id}`, updates, { 'Authorization': `Bearer ${token}` });
      toast({ title: "Success", description: "Template updated" });
      fetchTemplateDetails(selectedTemplate.id);
    } catch (error) {
      toast({ title: "Error", description: "Failed to update template", variant: "destructive" });
    }
  };
  
  const handleSaveCriterion = async (criterion: Partial<ScoringCriterion>) => {
    if (!selectedTemplate) return;
    try {
      if (criterion.id) {
        await apiPatch(`/api/call-scoring/criteria/${criterion.id}`, criterion, { 'Authorization': `Bearer ${token}` });
      } else {
        await apiPost(`/api/call-scoring/templates/${selectedTemplate.id}/criteria`, criterion, { 'Authorization': `Bearer ${token}` });
      }
      toast({ title: "Success", description: "Criterion saved" });
      fetchTemplateDetails(selectedTemplate.id);
    } catch (error) {
      toast({ title: "Error", description: "Failed to save criterion", variant: "destructive" });
    }
  };
  
  const handleDeleteCriterion = async (criterionId: number) => {
    try {
      await apiDelete(`/api/call-scoring/criteria/${criterionId}`, { 'Authorization': `Bearer ${token}` });
      toast({ title: "Success", description: "Criterion deleted" });
      if (selectedTemplate) fetchTemplateDetails(selectedTemplate.id);
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete criterion", variant: "destructive" });
    }
  };
  
  const handleReorderCriterion = async (criterionId: number, direction: 'up' | 'down') => {
    if (!selectedTemplate?.criteria) return;
    const currentIndex = selectedTemplate.criteria.findIndex(c => c.id === criterionId);
    if (currentIndex === -1) return;
    
    const newOrder = selectedTemplate.criteria.map(c => c.id);
    if (direction === 'up' && currentIndex > 0) {
      [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];
    } else if (direction === 'down' && currentIndex < newOrder.length - 1) {
      [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
    } else {
      return;
    }
    
    try {
      await apiPost(`/api/call-scoring/templates/${selectedTemplate.id}/criteria/reorder`, { order: newOrder }, { 'Authorization': `Bearer ${token}` });
      fetchTemplateDetails(selectedTemplate.id);
    } catch (error) {
      toast({ title: "Error", description: "Failed to reorder criteria", variant: "destructive" });
    }
  };
  
  const groupedCriteria = selectedTemplate?.criteria?.reduce((acc, c) => {
    if (!acc[c.category]) acc[c.category] = [];
    acc[c.category].push(c);
    return acc;
  }, {} as Record<string, ScoringCriterion[]>) || {};
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Scoring Templates
          </DialogTitle>
          <DialogDescription>
            Manage call scoring templates and criteria by department
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={selectedDepartment} onValueChange={setSelectedDepartment} className="flex-1 overflow-hidden">
          <TabsList className="w-full justify-start">
            {DEPARTMENTS.map(dept => (
              <TabsTrigger key={dept} value={dept} data-testid={`tab-dept-${dept.toLowerCase()}`}>
                {dept}
              </TabsTrigger>
            ))}
          </TabsList>
          
          <div className="flex gap-4 mt-4 flex-1 overflow-hidden">
            <div className="w-64 border-r pr-4">
              <h4 className="text-sm font-medium mb-2">Templates</h4>
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : departmentTemplates.length === 0 ? (
                <div className="text-sm text-muted-foreground">No templates found</div>
              ) : (
                <div className="space-y-2">
                  {departmentTemplates.map(template => (
                    <div
                      key={template.id}
                      className={`p-2 rounded-lg cursor-pointer transition-colors ${
                        selectedTemplate?.id === template.id ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'
                      }`}
                      onClick={() => fetchTemplateDetails(template.id)}
                      data-testid={`template-item-${template.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{template.name}</span>
                        {template.dealershipId === null && (
                          <Badge variant="secondary" className="text-xs">System</Badge>
                        )}
                      </div>
                      {template.isDefault && (
                        <Badge variant="outline" className="text-xs mt-1">Default</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <ScrollArea className="flex-1">
              {selectedTemplate ? (
                <div className="space-y-4 pr-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium">{selectedTemplate.name}</h3>
                      <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                      <div className="flex gap-2 mt-2">
                        {selectedTemplate.isActive && <Badge>Active</Badge>}
                        {selectedTemplate.isDefault && <Badge variant="secondary">Default</Badge>}
                        <Badge variant="outline">v{selectedTemplate.version}</Badge>
                      </div>
                    </div>
                    {isSystemTemplate ? (
                      <Button
                        onClick={() => handleCloneTemplate(selectedTemplate.id)}
                        data-testid="btn-customize-template"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Customize
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateTemplate({ isDefault: !selectedTemplate.isDefault })}
                          data-testid="btn-toggle-default"
                        >
                          {selectedTemplate.isDefault ? 'Unset Default' : 'Set as Default'}
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium">Criteria</h4>
                      {!isSystemTemplate && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingCriterion({
                            templateId: selectedTemplate.id,
                            category: 'greeting',
                            label: '',
                            description: '',
                            weight: 10,
                            maxScore: 10,
                            ratingType: 'numeric',
                            sortOrder: (selectedTemplate.criteria?.length || 0) + 1,
                            isRequired: true
                          })}
                          data-testid="btn-add-scoring-criterion"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Criterion
                        </Button>
                      )}
                    </div>
                    
                    {Object.entries(groupedCriteria).map(([category, criteria]) => (
                      <div key={category} className="mb-4">
                        <h5 className="text-xs font-medium text-muted-foreground uppercase mb-2">
                          {category.replace(/_/g, ' ')}
                        </h5>
                        <div className="space-y-2">
                          {criteria.sort((a, b) => a.sortOrder - b.sortOrder).map((criterion, idx) => (
                            <Card key={criterion.id}>
                              <CardContent className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm">{criterion.label}</span>
                                      <Badge variant="outline" className="text-xs">
                                        {criterion.ratingType === 'numeric' ? `0-${criterion.maxScore}` : 
                                         criterion.ratingType === 'yes_no' ? 'Yes/No' : '1-5 Stars'}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        Weight: {criterion.weight}%
                                      </span>
                                    </div>
                                    {criterion.description && (
                                      <p className="text-xs text-muted-foreground mt-1">{criterion.description}</p>
                                    )}
                                  </div>
                                  {!isSystemTemplate && (
                                    <div className="flex items-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleReorderCriterion(criterion.id, 'up')}
                                        disabled={idx === 0}
                                        data-testid={`btn-move-up-${criterion.id}`}
                                      >
                                        <ChevronUp className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleReorderCriterion(criterion.id, 'down')}
                                        disabled={idx === criteria.length - 1}
                                        data-testid={`btn-move-down-${criterion.id}`}
                                      >
                                        <ChevronDown className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setEditingCriterion(criterion)}
                                        data-testid={`btn-edit-scoring-criterion-${criterion.id}`}
                                      >
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-red-600"
                                        onClick={() => handleDeleteCriterion(criterion.id)}
                                        data-testid={`btn-delete-scoring-criterion-${criterion.id}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                    
                    {Object.keys(groupedCriteria).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No criteria defined for this template
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileText className="w-8 h-8 mb-2" />
                  <p>Select a template to view details</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </Tabs>
        
        {editingCriterion && (
          <Dialog open={!!editingCriterion} onOpenChange={() => setEditingCriterion(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCriterion.id ? 'Edit' : 'Add'} Scoring Criterion</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Label</Label>
                  <Input
                    value={editingCriterion.label || ''}
                    onChange={(e) => setEditingCriterion({ ...editingCriterion, label: e.target.value })}
                    placeholder="e.g., Greeting Quality"
                    data-testid="input-scoring-criterion-label"
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select 
                    value={editingCriterion.category || 'greeting'} 
                    onValueChange={(v) => setEditingCriterion({ ...editingCriterion, category: v })}
                  >
                    <SelectTrigger data-testid="select-scoring-criterion-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCORING_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat} className="capitalize">
                          {cat.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={editingCriterion.description || ''}
                    onChange={(e) => setEditingCriterion({ ...editingCriterion, description: e.target.value })}
                    placeholder="Describe what this criterion evaluates"
                    data-testid="input-scoring-criterion-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Rating Type</Label>
                    <Select 
                      value={editingCriterion.ratingType || 'numeric'} 
                      onValueChange={(v) => setEditingCriterion({ ...editingCriterion, ratingType: v })}
                    >
                      <SelectTrigger data-testid="select-scoring-criterion-rating-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="numeric">Numeric (0-Max)</SelectItem>
                        <SelectItem value="yes_no">Yes/No</SelectItem>
                        <SelectItem value="scale_5">1-5 Stars</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Max Score</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={editingCriterion.maxScore || 10}
                      onChange={(e) => setEditingCriterion({ ...editingCriterion, maxScore: parseInt(e.target.value) || 10 })}
                      data-testid="input-scoring-criterion-max-score"
                    />
                  </div>
                </div>
                <div>
                  <Label>Weight (%)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={editingCriterion.weight || 10}
                    onChange={(e) => setEditingCriterion({ ...editingCriterion, weight: parseInt(e.target.value) || 10 })}
                    data-testid="input-scoring-criterion-weight"
                  />
                </div>
                <div>
                  <Label>AI Instructions (Optional)</Label>
                  <Textarea
                    value={editingCriterion.aiInstruction || ''}
                    onChange={(e) => setEditingCriterion({ ...editingCriterion, aiInstruction: e.target.value })}
                    placeholder="Custom instructions for the AI when scoring this criterion"
                    className="min-h-[60px]"
                    data-testid="input-scoring-criterion-ai-instruction"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingCriterion.isRequired ?? true}
                    onCheckedChange={(checked) => setEditingCriterion({ ...editingCriterion, isRequired: checked })}
                    data-testid="switch-scoring-criterion-required"
                  />
                  <Label>Required</Label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditingCriterion(null)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => { handleSaveCriterion(editingCriterion); setEditingCriterion(null); }} 
                    data-testid="btn-save-scoring-criterion"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CallScoringSheet({
  callId,
  token
}: {
  callId: number;
  token: string | null;
}) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ScoringTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [scoringSheet, setScoringSheet] = useState<ScoringSheet | null>(null);
  const [responses, setResponses] = useState<ScoringResponse[]>([]);
  const [criteria, setCriteria] = useState<ScoringCriterion[]>([]);
  const [coachingNotes, setCoachingNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedResponses, setEditedResponses] = useState<Record<number, { score: number | null; comment: string }>>({});
  
  useEffect(() => {
    fetchTemplates();
    fetchScoring();
  }, [callId]);
  
  const fetchTemplates = async () => {
    try {
      const data = await apiGet<ScoringTemplate[]>('/api/call-scoring/templates', { 'Authorization': `Bearer ${token}` });
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };
  
  const fetchScoring = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<{ sheet: ScoringSheet | null; responses: ScoringResponse[]; criteria: ScoringCriterion[] }>(`/api/call-recordings/${callId}/scoring`, { 'Authorization': `Bearer ${token}` });
      if (data.sheet) {
        setScoringSheet(data.sheet);
        setResponses(data.responses || []);
        setCriteria(data.criteria || []);
        setSelectedTemplateId(data.sheet.templateId);
        setCoachingNotes(data.sheet.coachingNotes || '');
        const edited: Record<number, { score: number | null; comment: string }> = {};
        (data.responses || []).forEach((r: ScoringResponse) => {
          edited[r.criterionId] = { score: r.reviewerScore, comment: r.comment || '' };
        });
        setEditedResponses(edited);
      }
    } catch (error) {
      console.error('Error fetching scoring:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCreateScoring = async () => {
    if (!selectedTemplateId) {
      toast({ title: "Error", description: "Please select a template", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      await apiPost(`/api/call-recordings/${callId}/scoring`, { templateId: selectedTemplateId }, { 'Authorization': `Bearer ${token}` });
      toast({ title: "Success", description: "Scoring sheet created" });
      fetchScoring();
    } catch (error) {
      toast({ title: "Error", description: "Failed to create scoring sheet", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleSaveResponses = async () => {
    if (!scoringSheet) return;
    setIsSaving(true);
    try {
      const responsesToSave = Object.entries(editedResponses).map(([criterionId, data]) => ({
        criterionId: parseInt(criterionId),
        reviewerScore: data.score,
        comment: data.comment
      }));
      
      await apiPost(`/api/call-recordings/${callId}/scoring/responses`, { responses: responsesToSave, coachingNotes }, { 'Authorization': `Bearer ${token}` });
      toast({ title: "Success", description: "Scores saved successfully" });
      fetchScoring();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save scores", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  const updateResponse = (criterionId: number, field: 'score' | 'comment', value: number | string | null) => {
    setEditedResponses(prev => ({
      ...prev,
      [criterionId]: {
        ...prev[criterionId] || { score: null, comment: '' },
        [field]: value
      }
    }));
  };
  
  const getResponseForCriterion = (criterionId: number) => {
    return responses.find(r => r.criterionId === criterionId);
  };
  
  const renderScoreInput = (criterion: ScoringCriterion, currentValue: number | null, onChange: (v: number | null) => void) => {
    if (criterion.ratingType === 'yes_no') {
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={currentValue === criterion.maxScore}
            onCheckedChange={(checked) => onChange(checked ? criterion.maxScore : 0)}
            data-testid={`switch-score-${criterion.id}`}
          />
          <span className="text-sm">{currentValue === criterion.maxScore ? 'Yes' : 'No'}</span>
        </div>
      );
    }
    
    if (criterion.ratingType === 'scale_5') {
      return (
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => onChange(star)}
              className={`p-1 ${(currentValue || 0) >= star ? 'text-yellow-500' : 'text-gray-300'}`}
              data-testid={`star-${criterion.id}-${star}`}
            >
              <Star className="w-5 h-5 fill-current" />
            </button>
          ))}
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-3 w-full">
        <Slider
          value={[currentValue || 0]}
          onValueChange={([v]) => onChange(v)}
          max={criterion.maxScore}
          min={0}
          step={1}
          className="flex-1"
          data-testid={`slider-score-${criterion.id}`}
        />
        <span className="text-sm font-medium w-12 text-right">
          {currentValue ?? 0}/{criterion.maxScore}
        </span>
      </div>
    );
  };
  
  const reviewerTotal = Object.entries(editedResponses).reduce((sum, [criterionId, data]) => {
    return sum + (data.score || 0);
  }, 0);
  
  const maxPossible = criteria.reduce((sum, c) => sum + c.maxScore, 0);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (!scoringSheet) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-medium mb-2">No Scoring Sheet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create a scoring sheet to evaluate this call
          </p>
        </div>
        
        <div className="max-w-md mx-auto space-y-4">
          <div>
            <Label>Select Template</Label>
            <Select
              value={selectedTemplateId?.toString() || ''}
              onValueChange={(v) => setSelectedTemplateId(parseInt(v))}
            >
              <SelectTrigger data-testid="select-scoring-template">
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id.toString()}>
                    {t.name} ({t.department})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            className="w-full"
            onClick={handleCreateScoring}
            disabled={!selectedTemplateId || isSaving}
            data-testid="btn-create-scoring-sheet"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Create Scoring Sheet
          </Button>
        </div>
      </div>
    );
  }
  
  const groupedCriteria = criteria.reduce((acc, c) => {
    if (!acc[c.category]) acc[c.category] = [];
    acc[c.category].push(c);
    return acc;
  }, {} as Record<string, ScoringCriterion[]>);
  
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {scoringSheet.aiTotalScore ?? '-'}/{scoringSheet.aiMaxScore ?? maxPossible}
              </div>
              <div className="text-xs text-muted-foreground">AI Score</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {reviewerTotal}/{maxPossible}
              </div>
              <div className="text-xs text-muted-foreground">Reviewer Score</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${getScoreColor(scoringSheet.finalScore)}`}>
                {scoringSheet.finalScore ?? '-'}%
              </div>
              <div className="text-xs text-muted-foreground">Final Score</div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {Object.entries(groupedCriteria).map(([category, categoryCriteria]) => (
        <div key={category}>
          <h4 className="text-sm font-medium text-muted-foreground uppercase mb-3">
            {category.replace(/_/g, ' ')}
          </h4>
          <div className="space-y-3">
            {categoryCriteria.sort((a, b) => a.sortOrder - b.sortOrder).map(criterion => {
              const response = getResponseForCriterion(criterion.id);
              const edited = editedResponses[criterion.id] || { score: response?.reviewerScore ?? null, comment: response?.comment || '' };
              
              return (
                <Card key={criterion.id}>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-sm">{criterion.label}</div>
                          {criterion.description && (
                            <p className="text-xs text-muted-foreground">{criterion.description}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          Weight: {criterion.weight}%
                        </Badge>
                      </div>
                      
                      {response?.aiScore !== null && response?.aiScore !== undefined && (
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-blue-600 font-medium">AI Score: {response.aiScore}/{criterion.maxScore}</span>
                          </div>
                          {response.aiReasoning && (
                            <p className="text-xs text-blue-700 mt-1">{response.aiReasoning}</p>
                          )}
                        </div>
                      )}
                      
                      <div>
                        <Label className="text-xs">Reviewer Score</Label>
                        {renderScoreInput(
                          criterion,
                          edited.score,
                          (v) => updateResponse(criterion.id, 'score', v)
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-xs">Comment</Label>
                        <Textarea
                          value={edited.comment}
                          onChange={(e) => updateResponse(criterion.id, 'comment', e.target.value)}
                          placeholder="Add a comment..."
                          className="min-h-[60px] text-sm"
                          data-testid={`textarea-comment-${criterion.id}`}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Coaching Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={coachingNotes}
            onChange={(e) => setCoachingNotes(e.target.value)}
            placeholder="Add coaching notes for the employee..."
            className="min-h-[100px]"
            data-testid="textarea-coaching-notes"
          />
        </CardContent>
      </Card>
      
      <Button 
        className="w-full"
        onClick={handleSaveResponses}
        disabled={isSaving}
        data-testid="btn-save-scoring"
      >
        {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Save Scores
      </Button>
    </div>
  );
}

export default function CallAnalysis() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [calls, setCalls] = useState<CallRecording[]>([]);
  const [criteria, setCriteria] = useState<AnalysisCriteria[]>([]);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<CallRecording | null>(null);
  const [showCriteriaDialog, setShowCriteriaDialog] = useState(false);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);
  
  // Handle URL query parameters for navigation from Quick Actions
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    const department = urlParams.get('department');
    
    if (tab === 'templates') {
      setShowTemplatesDialog(true);
    }
    // department param can be used for filtering in the future
  }, [location]);
  
  const [filters, setFilters] = useState({
    salespersonId: '',
    startDate: '',
    endDate: '',
    analysisStatus: '',
    needsReview: '',
    minScore: '',
    maxScore: ''
  });
  
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0
  });
  
  const token = localStorage.getItem('auth_token');
  
  const fetchCalls = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.salespersonId) params.append('salespersonId', filters.salespersonId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.analysisStatus) params.append('analysisStatus', filters.analysisStatus);
      if (filters.needsReview) params.append('needsReview', filters.needsReview);
      if (filters.minScore) params.append('minScore', filters.minScore);
      if (filters.maxScore) params.append('maxScore', filters.maxScore);
      params.append('limit', pagination.limit.toString());
      params.append('offset', pagination.offset.toString());
      
      const data = await apiGet<{ calls: CallRecording[]; total: number }>(`/api/call-recordings?${params.toString()}`, { 'Authorization': `Bearer ${token}` });
      setCalls(data.calls || []);
      setPagination(prev => ({ ...prev, total: data.total || 0 }));
    } catch (error) {
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        setLocation('/login');
        return;
      }
      console.error('Error fetching calls:', error);
      toast({
        title: "Error",
        description: "Failed to load call recordings",
        variant: "destructive"
      });
    }
  };
  
  const fetchCriteria = async () => {
    try {
      const data = await apiGet<AnalysisCriteria[]>('/api/call-analysis-criteria', { 'Authorization': `Bearer ${token}` });
      setCriteria(data);
    } catch (error) {
      console.error('Error fetching criteria:', error);
    }
  };
  
  const fetchStats = async () => {
    try {
      const data = await apiGet<CallStats>('/api/call-recordings/stats', { 'Authorization': `Bearer ${token}` });
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };
  
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchCalls(), fetchCriteria(), fetchStats()]);
      setIsLoading(false);
    };
    loadData();
  }, []);
  
  useEffect(() => {
    fetchCalls();
  }, [filters, pagination.offset]);
  
  const handleAnalyzeCall = async (callId: number) => {
    try {
      await apiPost(`/api/call-recordings/${callId}/analyze`, undefined, { 'Authorization': `Bearer ${token}` });
      
      toast({
        title: "Analysis Started",
        description: "The call is being analyzed. This may take a moment."
      });
      
      setTimeout(fetchCalls, 5000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start call analysis",
        variant: "destructive"
      });
    }
  };
  
  const handleMarkReviewed = async (callId: number, notes: string) => {
    try {
      await apiPatch(`/api/call-recordings/${callId}/review`, { notes }, { 'Authorization': `Bearer ${token}` });
      
      toast({
        title: "Marked as Reviewed",
        description: "The call has been marked as reviewed"
      });
      
      setSelectedCall(null);
      fetchCalls();
      fetchStats();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to mark call as reviewed",
        variant: "destructive"
      });
    }
  };
  
  const handleSaveCriterion = async (criterion: Partial<AnalysisCriteria>) => {
    try {
      if (criterion.id) {
        await apiPatch(`/api/call-analysis-criteria/${criterion.id}`, criterion, { 'Authorization': `Bearer ${token}` });
      } else {
        await apiPost('/api/call-analysis-criteria', criterion, { 'Authorization': `Bearer ${token}` });
      }
      
      toast({
        title: "Saved",
        description: "Analysis criterion has been saved"
      });
      
      fetchCriteria();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save criterion",
        variant: "destructive"
      });
    }
  };
  
  const handleDeleteCriterion = async (id: number) => {
    try {
      await apiDelete(`/api/call-analysis-criteria/${id}`, { 'Authorization': `Bearer ${token}` });
      
      toast({
        title: "Deleted",
        description: "Analysis criterion has been deleted"
      });
      
      fetchCriteria();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete criterion",
        variant: "destructive"
      });
    }
  };
  
  const clearFilters = () => {
    setFilters({
      salespersonId: '',
      startDate: '',
      endDate: '',
      analysisStatus: '',
      needsReview: '',
      minScore: '',
      maxScore: ''
    });
    setPagination(prev => ({ ...prev, offset: 0 }));
  };
  
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  
  return (
    <div className="min-h-screen bg-background" data-testid="call-analysis-page">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Call Analysis</h1>
            <p className="text-muted-foreground">AI-powered insights from your team's phone calls</p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowTemplatesDialog(true)}
              data-testid="btn-manage-templates"
            >
              <FileText className="w-4 h-4 mr-2" />
              Templates
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowCriteriaDialog(true)}
              data-testid="btn-manage-criteria"
            >
              <Settings className="w-4 h-4 mr-2" />
              Criteria
            </Button>
            <Button 
              onClick={() => { fetchCalls(); fetchStats(); }}
              data-testid="btn-refresh-calls"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
        
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Calls</span>
                </div>
                <div className="text-2xl font-bold mt-1">{stats.totalCalls}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Analyzed</span>
                </div>
                <div className="text-2xl font-bold mt-1">{stats.analyzedCalls}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Avg Score</span>
                </div>
                <div className={`text-2xl font-bold mt-1 ${getScoreColor(stats.avgScore)}`}>
                  {stats.avgScore > 0 ? `${stats.avgScore}%` : '-'}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Needs Review</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-red-600">{stats.needsReviewCount}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <PhoneIncoming className="w-4 h-4 text-blue-500" />
                  <span className="text-sm text-muted-foreground">Inbound</span>
                </div>
                <div className="text-2xl font-bold mt-1">{stats.inboundCalls}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Avg Duration</span>
                </div>
                <div className="text-2xl font-bold mt-1">{formatDuration(stats.avgDuration)}</div>
              </CardContent>
            </Card>
          </div>
        )}
        
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[150px]">
                <Label className="text-xs">Status</Label>
                <Select value={filters.analysisStatus} onValueChange={(v) => setFilters({ ...filters, analysisStatus: v })}>
                  <SelectTrigger data-testid="filter-status">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="completed">Analyzed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="none">Not Analyzed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex-1 min-w-[150px]">
                <Label className="text-xs">Review Status</Label>
                <Select value={filters.needsReview} onValueChange={(v) => setFilters({ ...filters, needsReview: v })}>
                  <SelectTrigger data-testid="filter-review">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="true">Needs Review</SelectItem>
                    <SelectItem value="false">Reviewed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex-1 min-w-[120px]">
                <Label className="text-xs">Min Score</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0"
                  value={filters.minScore}
                  onChange={(e) => setFilters({ ...filters, minScore: e.target.value })}
                  data-testid="filter-min-score"
                />
              </div>
              
              <div className="flex-1 min-w-[120px]">
                <Label className="text-xs">Max Score</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="100"
                  value={filters.maxScore}
                  onChange={(e) => setFilters({ ...filters, maxScore: e.target.value })}
                  data-testid="filter-max-score"
                />
              </div>
              
              <div className="flex-1 min-w-[140px]">
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  data-testid="filter-start-date"
                />
              </div>
              
              <div className="flex-1 min-w-[140px]">
                <Label className="text-xs">End Date</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  data-testid="filter-end-date"
                />
              </div>
              
              <Button variant="outline" onClick={clearFilters} data-testid="btn-clear-filters">
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-24 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : calls.length > 0 ? (
          <>
            <div className="space-y-3">
              {calls.map((call) => (
                <CallListItem 
                  key={call.id} 
                  call={call} 
                  onClick={() => setSelectedCall(call)} 
                />
              ))}
            </div>
            
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-muted-foreground">
                  Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset - prev.limit }))}
                    data-testid="btn-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                    data-testid="btn-next-page"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Phone className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Call Recordings Found</h3>
              <p className="text-muted-foreground mb-4">
                Call recordings from GoHighLevel will appear here once configured.
              </p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Set up your GHL integration to automatically capture and analyze sales calls.
                Configure tracking numbers and enable call recording in your GHL account.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
      
      <CallDetailDialog
        call={selectedCall}
        open={!!selectedCall}
        onOpenChange={(open) => !open && setSelectedCall(null)}
        onAnalyze={handleAnalyzeCall}
        onMarkReviewed={handleMarkReviewed}
      />
      
      <CriteriaManagementDialog
        open={showCriteriaDialog}
        onOpenChange={setShowCriteriaDialog}
        criteria={criteria}
        onSave={handleSaveCriterion}
        onDelete={handleDeleteCriterion}
      />
      
      <ScoringTemplatesDialog
        open={showTemplatesDialog}
        onOpenChange={setShowTemplatesDialog}
      />
    </div>
  );
}
