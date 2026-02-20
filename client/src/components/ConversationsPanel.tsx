import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  MessageSquare, 
  Send, 
  RefreshCw, 
  User, 
  Clock, 
  Bot, 
  Sparkles, 
  Calendar,
  Phone,
  Mail,
  ClipboardCheck,
  ChevronRight,
  Search,
  Facebook,
  MessageCircle,
  Edit3,
  Lightbulb,
  GraduationCap,
  Save,
  CheckCircle,
  AlertCircle,
  Users,
  Car,
  Filter,
  X
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  channel?: "sms" | "email" | "chat";
  direction?: "inbound" | "outbound";
  ghlMessageId?: string;
}

interface Conversation {
  id: number;
  type: "website_chat" | "messenger";
  category?: string;
  vehicleName?: string;
  participantName?: string;
  handoffPhone?: string;
  handoffEmail?: string;
  handoffName?: string;
  ghlContactId?: string;
  messages?: Message[];
  lastMessage?: string;
  createdAt: string;
  lastMessageAt?: string;
  updatedAt?: string;
  unreadCount?: number;
  pageName?: string;
}

interface CrmContact {
  id: number;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  status: string;
  leadSource?: string;
  leadScore?: number;
  preferredMake?: string;
  preferredModel?: string;
  interestedVehicleIds?: string;
  lastContactedAt?: string;
  lastRespondedAt?: string;
  ghlContactId?: string;
  createdAt?: string;
}

interface ConversationsPanelProps {
  dealershipId: number;
  onSwitchToTraining?: () => void;
}

export function ConversationsPanel({ dealershipId, onSwitchToTraining }: ConversationsPanelProps) {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<{
    websiteChats: Conversation[];
    messengerConversations: Conversation[];
    totalWebsiteChats: number;
    totalMessengerConversations: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [scheduledMessages, setScheduledMessages] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [trainingMode, setTrainingMode] = useState(false);
  const [fwcMessageType, setFwcMessageType] = useState<'sms' | 'email' | 'facebook' | null>(null);
  const [fwcMessageText, setFwcMessageText] = useState("");
  const [isSendingFwc, setIsSendingFwc] = useState(false);
  
  // Tab state: 'chats' or 'contacts'
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');
  
  // Contacts state
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [contactStatusFilter, setContactStatusFilter] = useState<string>("all");
  const [contactSourceFilter, setContactSourceFilter] = useState<string>("all");
  
  // Training mode state
  const [trainingDialogOpen, setTrainingDialogOpen] = useState(false);
  const [selectedTrainingMessage, setSelectedTrainingMessage] = useState<{
    originalContent: string;
    messageIndex: number;
    context: Message[];
  } | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [trainingFeedback, setTrainingFeedback] = useState<string | null>(null);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [currentPromptId, setCurrentPromptId] = useState<number | null>(null);
  const [currentScenario, setCurrentScenario] = useState<string>("general");
  const [suggestedPrompt, setSuggestedPrompt] = useState<string | null>(null);
  const [promptChanges, setPromptChanges] = useState<string[]>([]);
  const [editablePrompt, setEditablePrompt] = useState<string>("");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  // Refs to avoid stale closures in WebSocket handler
  const selectedConversationRef = useRef<Conversation | null>(null);
  const loadConversationsRef = useRef<(() => Promise<void>) | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  const loadConversations = useCallback(async (preserveSelection = true) => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/all-conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
        
        // Use ref to get current selection (avoids stale closure)
        const currentSelection = selectedConversationRef.current;
        
        // If we have a selected conversation, refresh it with updated data
        if (currentSelection && preserveSelection) {
          const currentId = currentSelection.id;
          const currentType = currentSelection.type;
          
          // Find the updated conversation
          if (currentType === 'website_chat') {
            const updated = data.websiteChats?.find((c: Conversation) => c.id === currentId);
            if (updated) {
              setSelectedConversation({ ...updated, type: 'website_chat' });
            }
          } else if (currentType === 'messenger') {
            const updated = data.messengerConversations?.find((c: Conversation) => c.id === currentId);
            if (updated) {
              setSelectedConversation({ ...updated, type: 'messenger' });
            }
          }
        } else if (!currentSelection) {
          // Auto-select first conversation if none selected
          // Normalize types before selection to ensure consistent handling
          if (data.websiteChats?.length > 0) {
            selectConversation({ ...data.websiteChats[0], type: 'website_chat' });
          } else if (data.messengerConversations?.length > 0) {
            selectConversation({ ...data.messengerConversations[0], type: 'messenger' });
          }
        }
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Select a conversation and load messages if needed (for messenger)
  const selectConversation = async (conv: Conversation) => {
    if (conv.type === 'messenger' && !conv.messages) {
      // Fetch messenger messages separately
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`/api/messenger-conversations/${conv.id}/messages`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const messagesData = await response.json();
          // Transform messenger messages to match our format
          const messages: Message[] = messagesData.map((m: any) => ({
            role: m.senderType === 'customer' ? 'user' : 'assistant',
            content: m.content,
            timestamp: m.createdAt
          }));
          setSelectedConversation({ ...conv, messages });
        } else {
          setSelectedConversation(conv);
        }
      } catch (error) {
        console.error('Error fetching messenger messages:', error);
        setSelectedConversation(conv);
      }
    } else {
      setSelectedConversation(conv);
    }
  };

  // Load CRM contacts with filters
  const loadContacts = useCallback(async () => {
    setIsLoadingContacts(true);
    try {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      if (contactSearchQuery) params.append('search', contactSearchQuery);
      if (contactStatusFilter !== 'all') params.append('status', contactStatusFilter);
      if (contactSourceFilter !== 'all') params.append('leadSource', contactSourceFilter);
      params.append('limit', '100');
      
      const response = await fetch(`/api/crm/contacts?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts || []);
        setContactsTotal(data.total || data.contacts?.length || 0);
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
      toast({
        title: "Error",
        description: "Failed to load contacts",
        variant: "destructive"
      });
    } finally {
      setIsLoadingContacts(false);
    }
  }, [contactSearchQuery, contactStatusFilter, contactSourceFilter, toast]);

  // Load contacts when tab switches or filters change
  useEffect(() => {
    if (activeTab === 'contacts') {
      loadContacts();
    }
  }, [activeTab, loadContacts]);

  // Store loadConversations in ref for WebSocket handler
  useEffect(() => {
    loadConversationsRef.current = loadConversations;
  }, [loadConversations]);

  // Initial load
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws?token=${token}`;
    
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[Conversations] WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const notification = JSON.parse(event.data);
          
          // Handle new message notifications
          if (notification.type === 'new_message' || notification.type === 'conversation_update') {
            console.log('[Conversations] Real-time update received:', notification);
            
            // Use ref to call latest loadConversations
            if (loadConversationsRef.current) {
              loadConversationsRef.current();
            }
            
            // Show toast for new inbound messages
            if (notification.data?.direction === 'inbound') {
              toast({
                title: notification.title || 'New Message',
                description: `${notification.data?.senderName || 'Customer'}: ${notification.data?.messagePreview || ''}`,
              });
            }
          }
        } catch (error) {
          console.error('[Conversations] Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[Conversations] WebSocket disconnected, reconnecting in 5s...');
        reconnectTimeout = setTimeout(connect, 5000);
      };

      ws.onerror = (error) => {
        console.error('[Conversations] WebSocket error:', error);
      };
    };

    connect();

    return () => {
      if (ws) {
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [toast]);

  // Regenerate AI suggestions when conversation changes
  useEffect(() => {
    if (selectedConversation) {
      generateAiSuggestion();
    }
  }, [selectedConversation]);

  const generateAiSuggestion = async () => {
    if (!selectedConversation?.messages?.length) {
      setAiSuggestion(null);
      return;
    }
    
    setIsLoadingAi(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/ai/suggest-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: selectedConversation.messages.slice(-5),
          context: {
            vehicleName: selectedConversation.vehicleName,
            category: selectedConversation.category,
            customerName: getContactName(selectedConversation)
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiSuggestion(data.suggestion);
      }
    } catch (error) {
      console.error('Error generating AI suggestion:', error);
    } finally {
      setIsLoadingAi(false);
    }
  };

  const sendReply = async () => {
    if (!selectedConversation || !replyText.trim()) return;
    
    // Only Messenger conversations support replies via API
    if (selectedConversation.type === 'website_chat') {
      toast({ 
        title: "Info", 
        description: "Website chat replies are not supported. Use the customer's phone or email to follow up.",
        variant: "default"
      });
      return;
    }
    
    setIsSending(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/messenger-conversations/${selectedConversation.id}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: replyText.trim() })
      });
      
      if (response.ok) {
        toast({ title: "Sent", description: "Message sent successfully" });
        setReplyText("");
        loadConversations();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const useAiSuggestion = () => {
    if (aiSuggestion) {
      setReplyText(aiSuggestion);
    }
  };

  const sendFwcMessage = async () => {
    if (!selectedConversation || !fwcMessageType || !fwcMessageText.trim()) {
      toast({ title: "Error", description: "Please select a message type and enter a message", variant: "destructive" });
      return;
    }

    if (!selectedConversation.ghlContactId) {
      toast({ 
        title: "FWC Not Linked", 
        description: "This conversation doesn't have a linked FWC contact. Contact info may be missing.", 
        variant: "destructive" 
      });
      return;
    }

    setIsSendingFwc(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/conversations/${selectedConversation.id}/fwc-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          type: fwcMessageType,
          message: fwcMessageText.trim()
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({ title: "Sent", description: data.message || `${fwcMessageType.toUpperCase()} sent successfully` });
        setFwcMessageText("");
        setFwcMessageType(null);
      } else {
        toast({ title: "Error", description: data.error || "Failed to send message", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to send FWC message", variant: "destructive" });
    } finally {
      setIsSendingFwc(false);
    }
  };

  // Handle sending channel message (SMS/Email) from the main input area
  const handleSendChannelMessage = async () => {
    if (!selectedConversation || !fwcMessageType || !fwcMessageText.trim()) {
      toast({ title: "Error", description: "Please select a channel and enter a message", variant: "destructive" });
      return;
    }

    const phone = selectedConversation.handoffPhone;
    const email = selectedConversation.handoffEmail;

    // Validate channel availability
    if (fwcMessageType === 'sms' && !phone) {
      toast({ title: "Error", description: "No phone number available for SMS", variant: "destructive" });
      return;
    }
    if (fwcMessageType === 'email' && !email) {
      toast({ title: "Error", description: "No email address available", variant: "destructive" });
      return;
    }

    setIsSendingFwc(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/conversations/${selectedConversation.id}/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          channel: fwcMessageType,
          message: fwcMessageText.trim(),
          phone,
          email
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({ 
          title: "Sent", 
          description: data.message || `${fwcMessageType.toUpperCase()} sent successfully to ${fwcMessageType === 'sms' ? phone : email}` 
        });
        setFwcMessageText("");
        // Keep channel selected for easy follow-up
        
        // Refetch conversations to show the new message
        await loadConversations();
      } else {
        toast({ title: "Error", description: data.error || "Failed to send message", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    } finally {
      setIsSendingFwc(false);
    }
  };

  // Training mode functions
  const handleAiMessageClick = (msg: Message, index: number) => {
    if (!trainingMode || msg.role !== 'assistant' || !selectedConversation?.messages) return;
    
    // Get context (previous messages up to and including this one)
    const context = selectedConversation.messages.slice(0, index + 1);
    
    setSelectedTrainingMessage({
      originalContent: msg.content,
      messageIndex: index,
      context
    });
    setEditedContent(msg.content);
    setTrainingFeedback(null);
    setCurrentPrompt(null);
    setTrainingDialogOpen(true);
    
    // Load the current prompt for this dealership
    loadCurrentPrompt();
  };

  const loadCurrentPrompt = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/chat-prompts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const prompts = await response.json();
        
        // Detect scenario from conversation category
        let scenario = 'general';
        if (selectedConversation?.category) {
          const cat = selectedConversation.category.toLowerCase();
          if (cat.includes('get-approved') || cat.includes('financing') || cat.includes('pre-approved')) {
            scenario = 'get-approved';
          } else if (cat.includes('test-drive') || cat.includes('testdrive')) {
            scenario = 'test-drive';
          } else if (cat.includes('reserve')) {
            scenario = 'reserve';
          } else if (cat.includes('trade') || cat.includes('value-trade')) {
            scenario = 'value-trade';
          }
        }
        setCurrentScenario(scenario);
        
        // Find matching prompt - first try exact scenario match, then fallback to general
        let activePrompt = prompts.find((p: any) => p.isActive && p.scenario === scenario);
        if (!activePrompt) {
          activePrompt = prompts.find((p: any) => p.isActive && p.scenario === 'general');
        }
        if (!activePrompt && prompts.length > 0) {
          activePrompt = prompts[0];
        }
        
        if (activePrompt) {
          setCurrentPrompt(activePrompt.systemPrompt);
          setCurrentPromptId(activePrompt.id);
        }
      }
    } catch (error) {
      console.error('Error loading prompt:', error);
    }
  };

  const getTrainingFeedback = async () => {
    if (!selectedTrainingMessage || editedContent === selectedTrainingMessage.originalContent) {
      toast({ title: "No Changes", description: "Edit the response to get AI feedback", variant: "default" });
      return;
    }

    setIsLoadingFeedback(true);
    setSuggestedPrompt(null);
    setPromptChanges([]);
    
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/chat/training-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          originalResponse: selectedTrainingMessage.originalContent,
          editedResponse: editedContent,
          conversationContext: selectedTrainingMessage.context,
          currentPrompt: currentPrompt
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setTrainingFeedback(data.feedback);
        
        // Handle suggested prompt
        if (data.suggestedPrompt && data.suggestedPrompt !== currentPrompt) {
          setSuggestedPrompt(data.suggestedPrompt);
          setEditablePrompt(data.suggestedPrompt);
          setPromptChanges(data.changes || []);
        }
      } else {
        toast({ title: "Error", description: "Failed to get training feedback", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to get training feedback", variant: "destructive" });
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  const saveUpdatedPrompt = async () => {
    if (!editablePrompt || !currentPromptId) {
      toast({ title: "Error", description: "No prompt to save", variant: "destructive" });
      return;
    }

    setIsSavingPrompt(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/chat-prompts/${currentPromptId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          systemPrompt: editablePrompt
        })
      });
      
      if (response.ok) {
        toast({ title: "Success", description: "Prompt updated for all users at this dealership" });
        setCurrentPrompt(editablePrompt);
        setSuggestedPrompt(null);
      } else {
        toast({ title: "Error", description: "Failed to save prompt", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save prompt", variant: "destructive" });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const closeTrainingDialog = () => {
    setTrainingDialogOpen(false);
    setSelectedTrainingMessage(null);
    setEditedContent("");
    setTrainingFeedback(null);
    setCurrentPrompt(null);
    setCurrentPromptId(null);
    setCurrentScenario("general");
    setSuggestedPrompt(null);
    setPromptChanges([]);
    setEditablePrompt("");
  };

  const getContactName = (conv: Conversation): string => {
    if (conv.handoffName) return conv.handoffName;
    if (conv.participantName) return conv.participantName;
    
    // Common words that are NOT names
    const skipWords = ['yes', 'no', 'hi', 'hello', 'hey', 'sure', 'ok', 'okay', 'thanks', 'thank', 'interested', 'looking', 
      'yeah', 'yep', 'nope', 'maybe', 'please', 'car', 'vehicle', 'price', 'available', 'test', 'drive', 
      'info', 'information', 'details', 'more', 'about', 'good', 'great', 'nice', 'awesome'];
    
    // Try to extract name from messages if not stored
    if (conv.messages?.length) {
      for (const msg of conv.messages) {
        if (msg.role === 'user') {
          const content = msg.content.trim();
          
          // Pattern 1: Explicit name declarations
          const namePatterns = [
            /my name is\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
            /i'm\s+([a-zA-Z]+)(?:\s|,|\.|\!|$)/i,
            /i am\s+([a-zA-Z]+)(?:\s|,|\.|\!|$)/i,
            /this is\s+([a-zA-Z]+)(?:\s|,|\.|\!|$)/i,
            /call me\s+([a-zA-Z]+)(?:\s|,|\.|\!|$)/i,
            /^([a-zA-Z]+)\s+here(?:\s|,|\.|\!|$)/i,
          ];
          
          for (const pattern of namePatterns) {
            const match = content.match(pattern);
            if (match && match[1] && match[1].length > 1 && match[1].length < 20) {
              if (!skipWords.includes(match[1].toLowerCase())) {
                return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
              }
            }
          }
          
          // Pattern 2: Single word response that looks like a name (capitalized, 2-15 chars)
          // Only check short messages (likely name responses to "what's your name?")
          if (content.length >= 2 && content.length <= 20 && /^[A-Za-z]+$/.test(content)) {
            const potentialName = content.toLowerCase();
            if (!skipWords.includes(potentialName) && content.length >= 3) {
              // Check if previous message (assistant) asked for name
              const msgIndex = conv.messages.indexOf(msg);
              if (msgIndex > 0) {
                const prevMsg = conv.messages[msgIndex - 1];
                if (prevMsg.role === 'assistant' && /name|who.*you|call you|introduce/i.test(prevMsg.content)) {
                  return content.charAt(0).toUpperCase() + content.slice(1).toLowerCase();
                }
              }
            }
          }
        }
      }
    }
    
    if (conv.handoffEmail) return conv.handoffEmail.split('@')[0];
    return 'Unknown';
  };

  const getContactInitials = (conv: Conversation): string => {
    const name = getContactName(conv);
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getLastMessage = (conv: Conversation): string => {
    if (conv.messages && conv.messages.length > 0) {
      const lastMsg = conv.messages[conv.messages.length - 1];
      return lastMsg.content.substring(0, 50) + (lastMsg.content.length > 50 ? '...' : '');
    }
    if (conv.lastMessage) {
      return conv.lastMessage.substring(0, 50) + (conv.lastMessage.length > 50 ? '...' : '');
    }
    return 'No messages';
  };

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const allConversations = [
    ...(conversations?.websiteChats?.map(c => ({ ...c, type: 'website_chat' as const })) || []),
    ...(conversations?.messengerConversations?.map(c => ({ ...c, type: 'messenger' as const })) || [])
  ].sort((a, b) => {
    const dateA = new Date(a.lastMessageAt || a.createdAt);
    const dateB = new Date(b.lastMessageAt || b.createdAt);
    return dateB.getTime() - dateA.getTime();
  });

  const filteredConversations = allConversations.filter(conv => {
    if (!searchQuery) return true;
    const name = getContactName(conv).toLowerCase();
    const lastMsg = getLastMessage(conv).toLowerCase();
    return name.includes(searchQuery.toLowerCase()) || lastMsg.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="h-[calc(100vh-200px)] flex bg-background rounded-lg border overflow-hidden" data-testid="conversations-panel">
      {/* Left Panel - Tabbed interface for Chats/Contacts */}
      <div className="w-80 border-r flex flex-col bg-muted/30">
        {/* Tab buttons */}
        <div className="border-b">
          <div className="flex">
            <button
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'chats'
                  ? 'border-b-2 border-primary text-primary bg-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              onClick={() => {
                setActiveTab('chats');
                setSelectedContact(null);
              }}
              data-testid="tab-chats"
            >
              <MessageSquare className="w-4 h-4" />
              Chats
            </button>
            <button
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'contacts'
                  ? 'border-b-2 border-primary text-primary bg-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              onClick={() => {
                setActiveTab('contacts');
                setSelectedConversation(null);
              }}
              data-testid="tab-contacts"
            >
              <Users className="w-4 h-4" />
              Contacts
            </button>
          </div>
        </div>

        {/* Chats Tab Content */}
        {activeTab === 'chats' && (
          <>
            {/* Header with search and training toggle */}
            <div className="p-4 border-b space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">Messages</h2>
                <Button variant="ghost" size="sm" onClick={() => loadConversations()} disabled={isLoading}>
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-background"
                  data-testid="search-conversations"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="training-mode" className="text-sm flex items-center gap-2 cursor-pointer">
                  <ClipboardCheck className="w-4 h-4" />
                  Training Mode
                </Label>
                <Switch
                  id="training-mode"
                  checked={trainingMode}
                  onCheckedChange={setTrainingMode}
                  data-testid="toggle-training-mode"
                />
              </div>
            </div>

            {/* Conversations List */}
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                        <div className="h-3 w-36 bg-muted rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredConversations.length > 0 ? (
                <div>
                  {filteredConversations.map((conv) => (
                    <div
                      key={`${conv.type}-${conv.id}`}
                      className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b ${
                        selectedConversation?.id === conv.id && selectedConversation?.type === conv.type
                          ? 'bg-primary/10'
                          : ''
                      }`}
                      onClick={() => selectConversation(conv)}
                      data-testid={`conversation-${conv.type}-${conv.id}`}
                    >
                      {/* Avatar */}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
                        conv.type === 'messenger' ? 'bg-blue-500' : 'bg-green-500'
                      }`}>
                        {getContactInitials(conv)}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">{getContactName(conv)}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(conv.lastMessageAt || conv.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground truncate">
                            {getLastMessage(conv)}
                          </p>
                          {conv.unreadCount && conv.unreadCount > 0 && (
                            <Badge className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                              {conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No conversations found</p>
                </div>
              )}
            </ScrollArea>
          </>
        )}

        {/* Contacts Tab Content */}
        {activeTab === 'contacts' && (
          <>
            {/* Header with filters */}
            <div className="p-4 border-b space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-lg">Contacts</h2>
                  <span className="text-xs text-muted-foreground">
                    {isLoadingContacts ? (
                      <span className="inline-block w-16 h-3 bg-muted rounded animate-pulse" />
                    ) : (
                      `${contactsTotal} total ${contactsTotal === 1 ? 'contact' : 'contacts'}`
                    )}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => loadContacts()} disabled={isLoadingContacts}>
                  <RefreshCw className={`w-4 h-4 ${isLoadingContacts ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={contactSearchQuery}
                  onChange={(e) => setContactSearchQuery(e.target.value)}
                  className="pl-9 bg-background"
                  data-testid="search-contacts"
                />
              </div>

              {/* Filter dropdowns */}
              <div className="grid grid-cols-2 gap-2">
                <Select value={contactStatusFilter} onValueChange={setContactStatusFilter}>
                  <SelectTrigger className="h-8 text-xs" data-testid="filter-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={contactSourceFilter} onValueChange={setContactSourceFilter}>
                  <SelectTrigger className="h-8 text-xs" data-testid="filter-source">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="walk-in">Walk-in</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Active filters summary */}
              {(contactStatusFilter !== 'all' || contactSourceFilter !== 'all' || contactSearchQuery) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Filters:</span>
                  {contactSearchQuery && (
                    <Badge variant="secondary" className="text-xs">
                      "{contactSearchQuery}"
                      <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => setContactSearchQuery('')} />
                    </Badge>
                  )}
                  {contactStatusFilter !== 'all' && (
                    <Badge variant="secondary" className="text-xs capitalize">
                      {contactStatusFilter}
                      <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => setContactStatusFilter('all')} />
                    </Badge>
                  )}
                  {contactSourceFilter !== 'all' && (
                    <Badge variant="secondary" className="text-xs capitalize">
                      {contactSourceFilter}
                      <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => setContactSourceFilter('all')} />
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Contacts List */}
            <ScrollArea className="flex-1">
              {isLoadingContacts ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                        <div className="h-3 w-36 bg-muted rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : contacts.length > 0 ? (
                <div>
                  {contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b ${
                        selectedContact?.id === contact.id ? 'bg-primary/10' : ''
                      }`}
                      onClick={() => setSelectedContact(contact)}
                      data-testid={`contact-${contact.id}`}
                    >
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                        {(contact.firstName?.[0] || '?') + (contact.lastName?.[0] || '')}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">
                            {contact.firstName} {contact.lastName || ''}
                          </span>
                          <Badge 
                            variant={
                              contact.status === 'customer' ? 'default' :
                              contact.status === 'prospect' ? 'secondary' :
                              contact.status === 'lead' ? 'outline' : 'destructive'
                            }
                            className="text-xs capitalize"
                          >
                            {contact.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          {contact.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {contact.phone}
                            </span>
                          )}
                          {contact.preferredMake && (
                            <span className="flex items-center gap-1">
                              <Car className="w-3 h-3" />
                              {contact.preferredMake} {contact.preferredModel || ''}
                            </span>
                          )}
                        </div>
                        {contact.leadSource && (
                          <div className="text-xs text-muted-foreground mt-1 capitalize">
                            Source: {contact.leadSource}
                          </div>
                        )}
                      </div>
                      
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No contacts found</p>
                  <p className="text-xs mt-1">Try adjusting your filters</p>
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </div>

      {/* Middle Panel - Chat View */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b flex items-center justify-between bg-background">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
                  selectedConversation.type === 'messenger' ? 'bg-blue-500' : 'bg-green-500'
                }`}>
                  {getContactInitials(selectedConversation)}
                </div>
                <div>
                  <h3 className="font-semibold">{getContactName(selectedConversation)}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {selectedConversation.handoffPhone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {selectedConversation.handoffPhone}
                      </span>
                    )}
                    {selectedConversation.handoffEmail && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {selectedConversation.handoffEmail}
                      </span>
                    )}
                    {selectedConversation.vehicleName && (
                      <Badge variant="outline" className="text-xs">
                        {selectedConversation.vehicleName}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Badge variant={selectedConversation.type === 'messenger' ? 'default' : 'secondary'}>
                {selectedConversation.type === 'messenger' ? 'Messenger' : 'Website'}
              </Badge>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {trainingMode && (
                <div className="mb-3 p-2 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-purple-600" />
                  <p className="text-xs text-purple-700 dark:text-purple-400">
                    Training Mode: Click any AI response (blue) to edit and improve the prompt
                  </p>
                </div>
              )}
              <div className="space-y-4">
                {selectedConversation.messages?.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'assistant' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      onClick={() => handleAiMessageClick(msg, idx)}
                      className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                        msg.role === 'user'
                          ? msg.channel === 'sms' 
                            ? 'bg-green-50 dark:bg-green-950/50 text-foreground border border-green-200 dark:border-green-800 rounded-bl-md'
                            : msg.channel === 'email'
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-foreground border border-blue-200 dark:border-blue-800 rounded-bl-md'
                            : 'bg-white dark:bg-gray-700 text-foreground border border-gray-200 dark:border-gray-600 rounded-bl-md'
                          : msg.channel === 'sms'
                          ? `bg-green-600 text-white rounded-br-md ${trainingMode ? 'cursor-pointer hover:bg-green-700 ring-2 ring-transparent hover:ring-purple-400' : ''}`
                          : msg.channel === 'email'
                          ? `bg-blue-600 text-white rounded-br-md ${trainingMode ? 'cursor-pointer hover:bg-blue-700 ring-2 ring-transparent hover:ring-purple-400' : ''}`
                          : `bg-blue-500 text-white rounded-br-md ${trainingMode ? 'cursor-pointer hover:bg-blue-600 ring-2 ring-transparent hover:ring-purple-400' : ''}`
                      }`}
                      data-testid={`message-${msg.role}-${idx}`}
                    >
                      {msg.channel && (
                        <div className={`flex items-center gap-1 mb-1 text-xs ${msg.role === 'user' ? 'text-muted-foreground' : 'text-white/80'}`}>
                          {msg.channel === 'sms' && <Phone className="w-3 h-3" />}
                          {msg.channel === 'email' && <Mail className="w-3 h-3" />}
                          {msg.channel === 'chat' && <MessageCircle className="w-3 h-3" />}
                          <span className="uppercase">{msg.channel}</span>
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      {trainingMode && msg.role === 'assistant' && (
                        <div className="flex items-center gap-1 mt-1 text-blue-200 text-xs">
                          <Edit3 className="w-3 h-3" />
                          <span>Click to train</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t bg-background">
              {selectedConversation.type === 'website_chat' && (
                <>
                  {/* Channel selector for website chats */}
                  {(selectedConversation.handoffPhone || selectedConversation.handoffEmail) ? (
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-muted-foreground">Reply via:</span>
                        <div className="flex gap-1">
                          {selectedConversation.handoffPhone && (
                            <Button
                              size="sm"
                              variant={fwcMessageType === 'sms' ? 'default' : 'outline'}
                              onClick={() => setFwcMessageType(fwcMessageType === 'sms' ? null : 'sms')}
                              className={`h-7 text-xs gap-1 ${fwcMessageType === 'sms' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                              data-testid="channel-sms"
                            >
                              <Phone className="w-3 h-3" />
                              SMS
                            </Button>
                          )}
                          {selectedConversation.handoffEmail && (
                            <Button
                              size="sm"
                              variant={fwcMessageType === 'email' ? 'default' : 'outline'}
                              onClick={() => setFwcMessageType(fwcMessageType === 'email' ? null : 'email')}
                              className={`h-7 text-xs gap-1 ${fwcMessageType === 'email' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                              data-testid="channel-email"
                            >
                              <Mail className="w-3 h-3" />
                              Email
                            </Button>
                          )}
                        </div>
                        {selectedConversation.handoffPhone && (
                          <span className="text-xs text-muted-foreground ml-auto">{selectedConversation.handoffPhone}</span>
                        )}
                      </div>
                      {!fwcMessageType && (
                        <p className="text-xs text-muted-foreground">Select a channel above to send a message</p>
                      )}
                    </div>
                  ) : (
                    <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        No contact info available. Customer needs to provide phone or email during chat.
                      </p>
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center gap-2">
                {selectedConversation.type === 'messenger' ? (
                  <>
                    <Input
                      placeholder="Type a message..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
                      className="flex-1"
                      data-testid="message-input"
                    />
                    <Button 
                      onClick={sendReply} 
                      disabled={isSending || !replyText.trim()}
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      placeholder={fwcMessageType ? `Type your ${fwcMessageType.toUpperCase()} message...` : "Select a channel above to reply"}
                      value={fwcMessageText}
                      disabled={!fwcMessageType}
                      onChange={(e) => setFwcMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && fwcMessageType && fwcMessageText.trim()) {
                          handleSendChannelMessage();
                        }
                      }}
                      className="flex-1"
                      data-testid="message-input"
                    />
                    <Button 
                      onClick={handleSendChannelMessage} 
                      disabled={isSendingFwc || !fwcMessageText.trim() || !fwcMessageType}
                      className={fwcMessageType === 'sms' ? 'bg-green-600 hover:bg-green-700' : fwcMessageType === 'email' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                    >
                      {isSendingFwc ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        ) : activeTab === 'contacts' && selectedContact ? (
          /* Contact Detail View */
          <div className="flex-1 flex flex-col">
            {/* Contact Header */}
            <div className="p-6 border-b bg-background">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-xl">
                  {(selectedContact.firstName?.[0] || '?') + (selectedContact.lastName?.[0] || '')}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">
                    {selectedContact.firstName} {selectedContact.lastName || ''}
                  </h2>
                  <div className="flex items-center gap-3 mt-2">
                    <Badge 
                      variant={
                        selectedContact.status === 'customer' ? 'default' :
                        selectedContact.status === 'prospect' ? 'secondary' :
                        selectedContact.status === 'lead' ? 'outline' : 'destructive'
                      }
                      className="capitalize"
                    >
                      {selectedContact.status}
                    </Badge>
                    {selectedContact.leadScore !== undefined && selectedContact.leadScore > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Score: {selectedContact.leadScore}
                      </Badge>
                    )}
                    {selectedContact.leadSource && (
                      <span className="text-sm text-muted-foreground capitalize">
                        via {selectedContact.leadSource}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Info & Quick Actions */}
            <div className="p-6 space-y-6">
              {/* Quick Actions */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Quick Actions</h3>
                <div className="flex gap-2 flex-wrap">
                  {selectedContact.phone && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setFwcMessageType('sms');
                          setFwcMessageText('');
                        }}
                        data-testid="action-sms"
                      >
                        <Phone className="w-4 h-4 mr-2" />
                        Send SMS
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`tel:${selectedContact.phone}`, '_self')}
                        data-testid="action-call"
                      >
                        <Phone className="w-4 h-4 mr-2" />
                        Call
                      </Button>
                    </>
                  )}
                  {selectedContact.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFwcMessageType('email');
                        setFwcMessageText('');
                      }}
                      data-testid="action-email"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Send Email
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              {/* Contact Details */}
              <div className="grid grid-cols-2 gap-4">
                {selectedContact.phone && (
                  <div>
                    <span className="text-xs text-muted-foreground">Phone</span>
                    <p className="text-sm font-medium">{selectedContact.phone}</p>
                  </div>
                )}
                {selectedContact.email && (
                  <div>
                    <span className="text-xs text-muted-foreground">Email</span>
                    <p className="text-sm font-medium">{selectedContact.email}</p>
                  </div>
                )}
                {selectedContact.preferredMake && (
                  <div>
                    <span className="text-xs text-muted-foreground">Interested Vehicle</span>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Car className="w-3 h-3" />
                      {selectedContact.preferredMake} {selectedContact.preferredModel || ''}
                    </p>
                  </div>
                )}
                {selectedContact.lastContactedAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">Last Contacted</span>
                    <p className="text-sm font-medium">
                      {formatTime(selectedContact.lastContactedAt)}
                    </p>
                  </div>
                )}
                {selectedContact.lastRespondedAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">Last Response</span>
                    <p className="text-sm font-medium">
                      {formatTime(selectedContact.lastRespondedAt)}
                    </p>
                  </div>
                )}
                {selectedContact.createdAt && (
                  <div>
                    <span className="text-xs text-muted-foreground">Added</span>
                    <p className="text-sm font-medium">
                      {formatTime(selectedContact.createdAt)}
                    </p>
                  </div>
                )}
              </div>

              {/* GHL Link */}
              {selectedContact.ghlContactId && (
                <>
                  <Separator />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    Synced with GoHighLevel
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              {activeTab === 'contacts' ? (
                <>
                  <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Select a contact</p>
                  <p className="text-sm">Choose a contact from the left to view details</p>
                </>
              ) : (
                <>
                  <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Select a conversation</p>
                  <p className="text-sm">Choose a conversation from the left to start messaging</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - AI Assistant / Contact Actions */}
      <div className="w-80 border-l flex flex-col bg-muted/30">
        <div className="p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            {activeTab === 'contacts' ? (
              <>
                <Users className="w-5 h-5 text-purple-500" />
                Contact Actions
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-purple-500" />
                AI Assistant
              </>
            )}
          </h3>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Contact Mode - Show contact-specific actions */}
            {activeTab === 'contacts' && selectedContact ? (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" />
                      Send Message
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Select value={fwcMessageType} onValueChange={(v: any) => setFwcMessageType(v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sms" disabled={!selectedContact.phone}>
                          <div className="flex items-center gap-2">
                            <Phone className="w-3 h-3" />
                            SMS
                          </div>
                        </SelectItem>
                        <SelectItem value="email" disabled={!selectedContact.email}>
                          <div className="flex items-center gap-2">
                            <Mail className="w-3 h-3" />
                            Email
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder={`Type your ${fwcMessageType.toUpperCase()} message...`}
                      className="min-h-[80px] text-sm"
                      value={fwcMessageText}
                      onChange={(e) => setFwcMessageText(e.target.value)}
                    />
                    <Button size="sm" className="w-full" disabled={!fwcMessageText.trim()}>
                      <Send className="w-3 h-3 mr-2" />
                      Send {fwcMessageType.toUpperCase()}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Activity Log
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No recent activity
                    </p>
                  </CardContent>
                </Card>
              </>
            ) : activeTab === 'contacts' ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Select a contact to see actions</p>
              </div>
            ) : (
              <>
                {/* Chat Mode - Show AI suggestions */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      Suggested Reply
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingAi ? (
                      <div className="space-y-2">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
                      </div>
                    ) : aiSuggestion ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">{aiSuggestion}</p>
                        <Button size="sm" onClick={useAiSuggestion} className="w-full">
                          Use This Reply
                        </Button>
                      </div>
                    ) : selectedConversation ? (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Analyzing conversation...</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Select a conversation to see AI suggestions
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Scheduled Messages - only show in chats mode */}
            {activeTab === 'chats' && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Scheduled Messages
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {scheduledMessages.length > 0 ? (
                    <div className="space-y-2">
                      {scheduledMessages.map((msg, idx) => (
                        <div key={idx} className="text-sm p-2 bg-muted rounded">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            <Clock className="w-3 h-3" />
                            {msg.scheduledFor}
                          </div>
                          <p className="line-clamp-2">{msg.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No scheduled messages
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Conversation Analysis - only show in chats mode */}
            {activeTab === 'chats' && selectedConversation && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Contact Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Name:</span>{' '}
                    <span className="font-medium">{getContactName(selectedConversation)}</span>
                  </div>
                  {selectedConversation.handoffPhone && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Phone:</span>{' '}
                      <span className="font-medium">{selectedConversation.handoffPhone}</span>
                    </div>
                  )}
                  {selectedConversation.handoffEmail && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Email:</span>{' '}
                      <span className="font-medium">{selectedConversation.handoffEmail}</span>
                    </div>
                  )}
                  {selectedConversation.vehicleName && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Interest:</span>{' '}
                      <span className="font-medium">{selectedConversation.vehicleName}</span>
                    </div>
                  )}
                  <div className="text-sm">
                    <span className="text-muted-foreground">Messages:</span>{' '}
                    <span className="font-medium">{selectedConversation.messages?.length || 0}</span>
                  </div>
                  {selectedConversation.ghlContactId && (
                    <div className="text-sm">
                      <Badge variant="outline" className="text-xs">
                        FWC Linked
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* FWC Follow-up Actions - only show in chats mode */}
            {activeTab === 'chats' && selectedConversation && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    FWC Follow-up
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Message Type Selector */}
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={fwcMessageType === 'sms' ? 'default' : 'outline'}
                      onClick={() => setFwcMessageType(fwcMessageType === 'sms' ? null : 'sms')}
                      className="flex-1"
                      disabled={!selectedConversation.handoffPhone}
                      title={!selectedConversation.handoffPhone ? 'No phone number available' : 'Send SMS'}
                    >
                      <Phone className="w-3 h-3 mr-1" />
                      SMS
                    </Button>
                    <Button
                      size="sm"
                      variant={fwcMessageType === 'email' ? 'default' : 'outline'}
                      onClick={() => setFwcMessageType(fwcMessageType === 'email' ? null : 'email')}
                      className="flex-1"
                      disabled={!selectedConversation.handoffEmail}
                      title={!selectedConversation.handoffEmail ? 'No email available' : 'Send Email'}
                    >
                      <Mail className="w-3 h-3 mr-1" />
                      Email
                    </Button>
                    <Button
                      size="sm"
                      variant={fwcMessageType === 'facebook' ? 'default' : 'outline'}
                      onClick={() => setFwcMessageType(fwcMessageType === 'facebook' ? null : 'facebook')}
                      className="flex-1"
                      disabled={selectedConversation.type !== 'messenger'}
                      title={selectedConversation.type !== 'messenger' ? 'Only for Facebook conversations' : 'Send Facebook Message'}
                    >
                      <Facebook className="w-3 h-3 mr-1" />
                      FB
                    </Button>
                  </div>

                  {/* Message Input */}
                  {fwcMessageType && (
                    <div className="space-y-2">
                      <textarea
                        placeholder={`Type your ${fwcMessageType === 'facebook' ? 'Facebook' : fwcMessageType.toUpperCase()} message...`}
                        value={fwcMessageText}
                        onChange={(e) => setFwcMessageText(e.target.value)}
                        className="w-full min-h-[80px] p-2 text-sm border rounded-md resize-none"
                        data-testid="fwc-message-input"
                      />
                      <div className="flex gap-2">
                        {aiSuggestion && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setFwcMessageText(aiSuggestion)}
                            className="flex-1"
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            Use AI
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={sendFwcMessage}
                          disabled={isSendingFwc || !fwcMessageText.trim() || !selectedConversation.ghlContactId}
                          className="flex-1"
                          data-testid="send-fwc-message"
                        >
                          {isSendingFwc ? (
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3 mr-1" />
                          )}
                          Send
                        </Button>
                      </div>
                      {!selectedConversation.ghlContactId && (
                        <p className="text-xs text-amber-600">
                          No FWC contact linked. Sync required.
                        </p>
                      )}
                    </div>
                  )}

                  {!fwcMessageType && (
                    <div className="text-xs text-center py-2 space-y-1">
                      <p className="text-muted-foreground">
                        Select a channel above to send follow-up
                      </p>
                      {!selectedConversation.handoffPhone && !selectedConversation.handoffEmail && selectedConversation.type === 'website_chat' && (
                        <p className="text-amber-600">
                          No contact info available. Customer needs to provide phone or email during chat.
                        </p>
                      )}
                      {selectedConversation.type === 'website_chat' && (
                        <p className="text-muted-foreground text-xs">
                          Website chats: SMS/Email enabled when customer shares contact info
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Training Mode Dialog - Full Width */}
      <Dialog open={trainingDialogOpen} onOpenChange={(open) => !open && closeTrainingDialog()}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <GraduationCap className="w-6 h-6 text-purple-600" />
              AI Training Mode
              {currentScenario !== 'general' && (
                <Badge variant="secondary" className="ml-2">
                  {currentScenario.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedTrainingMessage && (
            <div className="flex-1 overflow-y-auto py-4">
              {/* Two Column Layout - Top Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {/* Left Column - Conversation Context (Large) */}
                <div className="flex flex-col">
                  <Label className="text-sm font-medium mb-2 block">Conversation Context</Label>
                  <div className="flex-1 min-h-[280px] max-h-[320px] overflow-y-auto bg-muted/50 rounded-lg p-3 space-y-2 border">
                    {selectedTrainingMessage.context.map((msg, idx) => (
                      <div key={idx} className={`text-sm ${msg.role === 'user' ? 'text-left' : 'text-right'}`}>
                        <span className={`inline-block px-3 py-2 rounded-lg max-w-[90%] ${
                          msg.role === 'user' ? 'bg-gray-200 dark:bg-gray-700' : 'bg-blue-100 dark:bg-blue-900'
                        }`}>
                          <span className="font-medium text-xs">{msg.role === 'user' ? 'Customer' : 'AI'}:</span>{' '}
                          {msg.content}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column - Current System Prompt (Large) */}
                <div className="flex flex-col">
                  <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Bot className="w-4 h-4" />
                    Current System Prompt 
                    <Badge variant="outline" className="text-xs">
                      {currentScenario}
                    </Badge>
                  </Label>
                  <div className="flex-1 min-h-[280px] max-h-[320px] overflow-y-auto bg-muted/50 rounded-lg p-3 border">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">
                      {currentPrompt || 'Loading prompt...'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Bottom Left - Edit AI Response */}
                <div>
                  <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    Edit AI Response
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Modify the response to show how the AI should have replied:
                  </p>
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="min-h-[120px] text-base"
                    placeholder="Edit the AI response..."
                    data-testid="training-edit-input"
                  />
                  {editedContent !== selectedTrainingMessage.originalContent && (
                    <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" />
                      Response modified - click "Get Feedback" to analyze
                    </p>
                  )}
                </div>

                {/* Bottom Right - Feedback & Suggested Prompt */}
                <div className="space-y-3">
                  {/* AI Feedback Section */}
                  {trainingFeedback && (
                    <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                      <Label className="text-sm font-medium mb-1 flex items-center gap-2 text-purple-700 dark:text-purple-400">
                        <Lightbulb className="w-4 h-4" />
                        Analysis
                      </Label>
                      <p className="text-sm whitespace-pre-wrap">{trainingFeedback}</p>
                      
                      {/* Changes list */}
                      {promptChanges.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-purple-200 dark:border-purple-700">
                          <p className="text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">Suggested Changes:</p>
                          <ul className="text-xs space-y-1">
                            {promptChanges.map((change, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                                <span>{change}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Suggested Prompt with Diff Highlighting */}
                  {suggestedPrompt && (
                    <div className="bg-green-50 dark:bg-green-950/30 border-2 border-green-400 dark:border-green-600 rounded-lg p-3">
                      <Label className="text-sm font-medium mb-1 flex items-center gap-2 text-green-700 dark:text-green-400">
                        <Sparkles className="w-4 h-4" />
                        Suggested Updated Prompt
                      </Label>
                      <p className="text-xs text-green-600 dark:text-green-500 mb-2">
                        Changes highlighted below. Edit and save to apply to all AI conversations:
                      </p>
                      
                      {/* Diff View - Show changes */}
                      <div className="bg-white dark:bg-gray-900 rounded border border-green-300 dark:border-green-700 p-2 mb-2 max-h-[120px] overflow-y-auto">
                        <div className="text-xs font-mono whitespace-pre-wrap">
                          {(() => {
                            const currentLines = (currentPrompt || '').split('\n');
                            const suggestedLines = suggestedPrompt.split('\n');
                            const allLines: { type: 'same' | 'added' | 'removed', text: string }[] = [];
                            
                            // Simple diff: show removed lines first, then added
                            const currentSet = new Set(currentLines);
                            const suggestedSet = new Set(suggestedLines);
                            
                            currentLines.forEach(line => {
                              if (!suggestedSet.has(line) && line.trim()) {
                                allLines.push({ type: 'removed', text: line });
                              }
                            });
                            
                            suggestedLines.forEach(line => {
                              if (!currentSet.has(line) && line.trim()) {
                                allLines.push({ type: 'added', text: line });
                              }
                            });
                            
                            if (allLines.length === 0) {
                              return <span className="text-muted-foreground">No significant changes detected</span>;
                            }
                            
                            return allLines.map((line, idx) => (
                              <div key={idx} className={`px-1 rounded ${
                                line.type === 'added' ? 'bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-300' :
                                line.type === 'removed' ? 'bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-300 line-through' :
                                ''
                              }`}>
                                {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : ''}{line.text}
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                      
                      <Textarea
                        value={editablePrompt}
                        onChange={(e) => setEditablePrompt(e.target.value)}
                        className="min-h-[100px] bg-white dark:bg-gray-900 border-green-300 dark:border-green-700 font-mono text-xs"
                        placeholder="Suggested prompt..."
                        data-testid="suggested-prompt-input"
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSuggestedPrompt(null);
                            setEditablePrompt("");
                          }}
                        >
                          Discard
                        </Button>
                        <Button 
                          onClick={saveUpdatedPrompt}
                          disabled={isSavingPrompt || !editablePrompt}
                          className="bg-green-600 hover:bg-green-700"
                          size="sm"
                        >
                          {isSavingPrompt ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              Save Prompt
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-shrink-0 flex gap-2 pt-3 border-t">
            <Button variant="outline" onClick={closeTrainingDialog}>
              Close
            </Button>
            <Button 
              onClick={getTrainingFeedback}
              disabled={isLoadingFeedback || editedContent === selectedTrainingMessage?.originalContent}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isLoadingFeedback ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Get Feedback
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
