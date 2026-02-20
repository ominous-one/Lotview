import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2, Check, X, Lightbulb, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AiPromptEnhancerProps {
  currentText: string;
  onApply: (enhancedText: string) => void;
  promptType: 'system' | 'greeting' | 'followup' | 'sms' | 'email';
  context?: string;
  disabled?: boolean;
  dealershipId?: number;
}

const PROMPT_TYPE_LABELS: Record<string, { label: string; hint: string }> = {
  system: {
    label: "AI Instructions",
    hint: "This tells the AI how to behave and respond to customers"
  },
  greeting: {
    label: "Welcome Message",
    hint: "The first thing customers see when they start chatting"
  },
  followup: {
    label: "Follow-up Message",
    hint: "A message sent to keep the conversation going"
  },
  sms: {
    label: "Text Message",
    hint: "A short, friendly text message (SMS)"
  },
  email: {
    label: "Email Message",
    hint: "A professional email to send to customers"
  }
};

export function AiPromptEnhancer({ 
  currentText, 
  onApply, 
  promptType, 
  context,
  disabled = false,
  dealershipId
}: AiPromptEnhancerProps) {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const { toast } = useToast();

  const typeInfo = PROMPT_TYPE_LABELS[promptType] || { label: "Message", hint: "" };

  const handleEnhance = async () => {
    if (!currentText.trim()) {
      toast({
        title: "Nothing to enhance",
        description: "Write something first, then I'll help make it better!",
        variant: "destructive"
      });
      return;
    }

    setIsEnhancing(true);
    setSuggestion(null);

    try {
      const response = await apiRequest("POST", "/api/admin/enhance-prompt", {
        text: currentText,
        promptType,
        context,
        dealershipId
      });

      const data = await response.json();
      
      if (data.enhanced) {
        setSuggestion(data.enhanced);
        setShowSuggestion(true);
      } else {
        throw new Error("No enhancement received");
      }
    } catch (error: any) {
      toast({
        title: "Enhancement failed",
        description: error.message || "Could not enhance the text. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleApply = () => {
    if (suggestion) {
      onApply(suggestion);
      setSuggestion(null);
      setShowSuggestion(false);
      toast({
        title: "Applied!",
        description: "Your enhanced message is now ready to use."
      });
    }
  };

  const handleDismiss = () => {
    setSuggestion(null);
    setShowSuggestion(false);
  };

  return (
    <div className="mt-2 space-y-2">
      {!showSuggestion && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleEnhance}
          disabled={disabled || isEnhancing || !currentText.trim()}
          className="text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground border-dashed"
          data-testid={`enhance-${promptType}-button`}
        >
          {isEnhancing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Making it better...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              <span>Enhance with AI</span>
            </>
          )}
        </Button>
      )}

      {showSuggestion && suggestion && (
        <Card className="border-primary/30 bg-primary/5" data-testid={`suggestion-${promptType}`}>
          <CardContent className="p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 space-y-1">
                <p className="text-xs font-medium text-primary">AI Suggestion</p>
                <p className="text-xs text-muted-foreground">{typeInfo.hint}</p>
              </div>
            </div>
            
            <div className="text-sm bg-background/80 rounded-md p-3 border whitespace-pre-wrap max-h-48 overflow-y-auto">
              {suggestion}
            </div>
            
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={handleApply}
                className="gap-1.5 h-8"
                data-testid={`apply-${promptType}-suggestion`}
              >
                <Check className="h-3.5 w-3.5" />
                Use This
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="gap-1.5 h-8 text-muted-foreground"
                data-testid={`dismiss-${promptType}-suggestion`}
              >
                <X className="h-3.5 w-3.5" />
                No Thanks
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleEnhance}
                disabled={isEnhancing}
                className="gap-1.5 h-8 text-muted-foreground ml-auto"
                data-testid={`retry-${promptType}-enhance`}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
