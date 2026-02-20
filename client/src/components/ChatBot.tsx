import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, MessageSquare, Send, Loader2 } from "lucide-react";
import { sendChatMessage, saveConversation, type ChatMessage } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useChat } from "@/contexts/ChatContext";
import { useTenant } from "@/contexts/TenantContext";
import { trackCTAClick, trackChatMessage, trackChatOpen, getSessionId } from "@/lib/tracking";

interface ChatBotProps {
  vehicleName?: string;
  action?: string | null;
  vehicle?: {
    id: number;
    make: string;
    model: string;
    year: number;
    price: number;
    vin?: string | null;
    dealership: string;
    type: string;
  };
}

export function ChatBot({ vehicleName, action, vehicle }: ChatBotProps) {
  const chatContext = useChat();
  const { dealership } = useTenant();
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [handoffRequested, setHandoffRequested] = useState(false);
  const [smsOfferShown, setSmsOfferShown] = useState(false);
  const [smsDeclined, setSmsDeclined] = useState(false);
  const [awaitingPhone, setAwaitingPhone] = useState(false);
  const [leadSyncedToGHL, setLeadSyncedToGHL] = useState(false);
  const [capturedContact, setCapturedContact] = useState<{ phone?: string; email?: string; name?: string }>({});
  const ctaAutoSentRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast} = useToast();

  // Handle closing chat and saving conversation
  const handleCloseChat = async () => {
    // Save conversation if there are user messages (more than just the initial greeting)
    if (messages.length > 1 && messages.some(msg => msg.role === 'user')) {
      try {
        const category = action || 'general'; // Use CTA action as category or 'general'
        const sessionId = getSessionId();
        const savedConv = await saveConversation(
          category,
          messages,
          sessionId,
          vehicle?.id,
          vehicleName,
          dealership?.id
        );
        
        // Store conversation ID for potential handoff
        if (savedConv?.id) {
          setConversationId(savedConv.id);
        }
      } catch (error) {
        console.error("Failed to save conversation:", error);
        // Don't block closing the chat if save fails
      }
    }
    
    setIsOpen(false);
    chatContext.closeChat();
  };

  // Detect phone and email in user messages
  const detectContactInfo = (text: string): { phone?: string; email?: string; name?: string } => {
    const contact: { phone?: string; email?: string; name?: string } = {};
    
    // Phone regex - matches various formats including plain 10-digit numbers
    // Examples: (604) 555-9898, 604-555-9898, 604.555.9898, 6045559898
    const phoneRegex = /(?<!\d)\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)|(?<!\d)\d{10}(?!\d)/;
    const phoneMatch = text.match(phoneRegex);
    if (phoneMatch) {
      contact.phone = phoneMatch[0].replace(/[^\d]/g, ''); // Normalize to digits only
    }
    
    // Email regex
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const emailMatch = text.match(emailRegex);
    if (emailMatch) {
      contact.email = emailMatch[0].toLowerCase();
    }
    
    return contact;
  };

  // Extract name from conversation (looks for patterns like "my name is X" or "I'm X")
  const extractNameFromConversation = (msgs: ChatMessage[]): string | undefined => {
    for (const msg of msgs) {
      if (msg.role === 'user') {
        const content = msg.content.toLowerCase();
        // Match patterns like "my name is John" or "I'm John" or "it's John"
        const namePatterns = [
          /my name is\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
          /i'm\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
          /i am\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
          /this is\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
          /call me\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
          /^([a-zA-Z]+)$/i, // Single word response (likely name when asked)
        ];
        
        for (const pattern of namePatterns) {
          const match = msg.content.match(pattern);
          if (match && match[1] && match[1].length > 1 && match[1].length < 30) {
            // Skip common non-name words
            const skipWords = ['yes', 'no', 'hi', 'hello', 'hey', 'sure', 'ok', 'okay', 'thanks', 'thank'];
            if (!skipWords.includes(match[1].toLowerCase())) {
              return match[1];
            }
          }
        }
      }
    }
    return undefined;
  };

  // Auto-sync lead to GHL when contact info is captured
  const autoSyncLeadToGHL = async (phone?: string, email?: string, currentMessages?: ChatMessage[]) => {
    if (leadSyncedToGHL || (!phone && !email)) return;
    
    try {
      const name = extractNameFromConversation(currentMessages || messages);
      const category = action || 'general';
      
      const response = await fetch('/api/chat/auto-sync-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationId || null, // Only pass real ID, not fallback
          phone: phone,
          email: email,
          name: name,
          messages: (currentMessages || messages).map(m => ({ role: m.role, content: m.content })),
          vehicleInfo: vehicle ? {
            vehicleName: vehicleName,
            vehicleId: vehicle.id,
          } : undefined,
          category: category,
          source: 'website_chat', // Could be 'facebook_marketplace' or 'messenger'
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        setLeadSyncedToGHL(true);
        setCapturedContact({ phone, email, name });
        console.log('[ChatBot] Lead auto-synced to GHL:', result.contactId);
      } else if (result.skipped) {
        // Mark as synced to prevent repeated attempts when GHL not configured
        setLeadSyncedToGHL(true);
        console.log('[ChatBot] GHL sync skipped - not configured');
      } else {
        console.warn('[ChatBot] GHL sync failed:', result.error);
        // Don't mark as synced on failure - allow retry
      }
    } catch (error) {
      console.error('[ChatBot] Error auto-syncing to GHL:', error);
      // Don't mark as synced on error - allow retry
    }
  };

  // Sync with ChatContext
  useEffect(() => {
    if (chatContext.isOpen && !isOpen) {
      setIsOpen(true);
      setHasOpened(true);
    }
  }, [chatContext.isOpen]);

  // Handle initial message from ChatContext
  useEffect(() => {
    if (chatContext.initialMessage && isOpen && messages.length > 0) {
      const initialMsg = chatContext.initialMessage;
      chatContext.clearInitialMessage();
      
      // Add as user message and trigger AI response
      const userMessage: ChatMessage = { role: "user", content: initialMsg };
      const conversationWithUser = [...messages, userMessage];
      setMessages(conversationWithUser);
      setIsLoading(true);

      // Map action to scenario
      const scenario = action === 'test-drive' ? 'test-drive' 
        : action === 'reserve' ? 'reserve'
        : action === 'get-approved' ? 'get-approved'
        : action === 'value-trade' ? 'value-trade'
        : 'general';

      // Send full conversation including assistant greeting for context (dealershipId resolved by backend from tenant middleware)
      sendChatMessage(conversationWithUser, vehicleName || "", scenario).then(response => {
        setMessages(prev => {
          const updated = [...prev, { role: "assistant" as const, content: response }];
          trackChatMessage(vehicle, updated.length);
          return updated;
        });
      }).catch(error => {
        console.error("Chat error:", error);
        toast({ title: "Error", description: "Failed to send message.", variant: "destructive" });
      }).finally(() => {
        setIsLoading(false);
      });
    }
  }, [chatContext.initialMessage, isOpen, messages.length]);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize chat with context-aware message when opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const initialMessage = getInitialMessage();
      setMessages([{ role: "assistant", content: initialMessage }]);
    }
  }, [isOpen]);

  // Open immediately if action is provided
  useEffect(() => {
    if (action && !hasOpened) {
      setIsOpen(true);
      setHasOpened(true);
      trackChatOpen(vehicle, 'cta'); // Track chat opened from CTA
    }
  }, [action, hasOpened]);

  // Auto-send CTA message after greeting is ready
  useEffect(() => {
    if (action && isOpen && messages.length === 1 && !ctaAutoSentRef.current && !isLoading && vehicleName) {
      const ctaMessages: Record<string, string> = {
        'test-drive': `I'd like to book a test drive for the ${vehicleName}.`,
        'reserve': `I'd like to reserve the ${vehicleName}.`,
        'get-approved': `I'd like to get pre-approved for financing on the ${vehicleName}.`,
        'value-trade': `I'd like to get a trade-in value for my vehicle toward the ${vehicleName}.`
      };
      
      const message = ctaMessages[action];
      if (message) {
        ctaAutoSentRef.current = true;
        setIsLoading(true);
        
        const userMessage: ChatMessage = { role: "user", content: message };
        
        // Map action to scenario
        const scenario = action === 'test-drive' ? 'test-drive' 
          : action === 'reserve' ? 'reserve'
          : action === 'get-approved' ? 'get-approved'
          : action === 'value-trade' ? 'value-trade'
          : 'general';
        
        // Use functional setState to ensure we have the latest messages
        setMessages(currentMessages => {
          const fullConversation = [...currentMessages, userMessage];
          
          // Send full conversation to backend from within setState (dealershipId resolved by backend from tenant middleware)
          sendChatMessage(fullConversation, vehicleName, scenario).then(response => {
            setMessages(prevMessages => {
              const updated = [...prevMessages, { role: "assistant" as const, content: response }];
              trackChatMessage(vehicle, updated.length);
              return updated;
            });
          }).catch(error => {
            console.error("Chat error:", error);
            toast({ title: "Error", description: "Failed to send message.", variant: "destructive" });
          }).finally(() => {
            setIsLoading(false);
          });
          
          return fullConversation;
        });
      }
    }
  }, [action, isOpen, messages.length, isLoading, vehicleName]);

  // Auto-open after 10 seconds if no action
  useEffect(() => {
    if (vehicleName && !hasOpened && !action) {
      const timer = setTimeout(() => {
        setIsOpen(true);
        setHasOpened(true);
        trackChatOpen(vehicle, 'auto'); // Track auto-opened chat
      }, 10000); // 10 seconds
      return () => clearTimeout(timer);
    }
  }, [vehicleName, hasOpened, action]);

  // Generate initial message based on action
  const getInitialMessage = () => {
    if (!vehicleName) {
      return "Welcome to Olympic Auto Group! Can I help you find your dream car today?";
    }

    if (action === 'test-drive') {
      return `Perfect! You want to book a test drive for the ${vehicleName}. I can help you schedule that right away. What day works best for you this week?`;
    }
    
    if (action === 'reserve') {
      return `Great choice! You're interested in reserving the ${vehicleName}. To secure this vehicle, I'll need a few quick details. Would you like to proceed with a $500 refundable deposit?`;
    }

    if (action === 'get-approved') {
      return `Excellent! Let's get you pre-approved for financing on the ${vehicleName}. This usually takes just a few minutes. May I start by getting your full name and email address?`;
    }

    if (action === 'value-trade') {
      return `I'd be happy to help you value your trade-in toward the ${vehicleName}. To give you an accurate estimate, could you tell me the year, make, and model of your current vehicle?`;
    }

    return `Hi there! I see you're looking at the ${vehicleName}. It's a great choice! Would you like to see the CarFax report or schedule a test drive?`;
  };

  // Handle SMS handoff
  const handleSMSHandoff = async (phoneNumber: string) => {
    if (!conversationId) {
      // Save conversation first to get ID
      try {
        const category = action || 'general';
        const sessionId = getSessionId();
        const savedConv = await saveConversation(
          category,
          messages,
          sessionId,
          vehicle?.id,
          vehicleName,
          dealership?.id
        );
        
        if (savedConv?.id) {
          setConversationId(savedConv.id);
          await sendHandoffRequest(savedConv.id, phoneNumber);
        }
      } catch (error) {
        console.error("Failed to save conversation for handoff:", error);
        toast({
          title: "Error",
          description: "Failed to initiate SMS handoff. Please try again.",
          variant: "destructive"
        });
      }
    } else {
      await sendHandoffRequest(conversationId, phoneNumber);
    }
  };

  const sendHandoffRequest = async (convId: number, phoneNumber: string) => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/chat/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          phoneNumber,
          messages,
          vehicleInfo: vehicle,
          category: action || 'general'
        }),
      });

      if (!response.ok) throw new Error("Handoff failed");

      const data = await response.json();
      
      setMessages(prev => [...prev, { 
        role: "assistant" as const, 
        content: data.message || "Great! You'll receive a text message shortly to continue this conversation via SMS. Our team will be in touch!" 
      }]);
      
      setHandoffRequested(true);
      
      toast({
        title: "Success",
        description: "Conversation handed off to SMS!",
      });
    } catch (error) {
      console.error("SMS handoff error:", error);
      toast({
        title: "Error",
        description: "Failed to handoff to SMS. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setAwaitingPhone(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: inputValue.trim()
    };

    // Check if we're awaiting phone number for handoff
    if (awaitingPhone) {
      const lowerInput = inputValue.trim().toLowerCase();
      
      // Check if user is declining SMS while awaiting phone
      const isDeclining = lowerInput === 'no' || lowerInput.includes('no thanks') || 
        lowerInput.includes('nevermind') || lowerInput.includes('never mind') ||
        lowerInput.includes('cancel') || lowerInput.includes("don't") ||
        lowerInput.includes('skip') || lowerInput.includes('not interested');
      
      if (isDeclining) {
        // User changed their mind about SMS
        setAwaitingPhone(false);
        setSmsDeclined(true);
        setMessages(prev => [...prev, userMessage, {
          role: "assistant" as const,
          content: "No problem! Let's continue our conversation here. How can I help you?"
        }]);
        setInputValue("");
        return;
      }
      
      const phoneRegex = /(?<!\d)\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)|(?<!\d)\d{10}(?!\d)/;
      if (phoneRegex.test(inputValue.trim())) {
        setMessages(prev => [...prev, userMessage]);
        setInputValue("");
        await handleSMSHandoff(inputValue.trim());
        return;
      } else {
        setMessages(prev => [...prev, userMessage, {
          role: "assistant" as const,
          content: "I need a valid phone number to send you a text. Please provide your phone number in the format: (555) 123-4567"
        }]);
        setInputValue("");
        return;
      }
    }

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Check if user is requesting text/sms communication
      const lowerMessage = userMessage.content.toLowerCase();
      const wantsText = lowerMessage.includes('text') || lowerMessage.includes('sms') || 
                        lowerMessage.includes('message me') || lowerMessage.includes('text me');
      
      // Check if user is declining SMS (responds "no" to SMS offer)
      const isDecliningSms = smsOfferShown && !smsDeclined && 
        (lowerMessage === 'no' || lowerMessage.includes('no thanks') || 
         lowerMessage.includes('no, ') || lowerMessage.includes('keep it') ||
         lowerMessage.includes('stay here') || lowerMessage.includes("don't text") ||
         lowerMessage.includes('this way') || lowerMessage.includes('prefer not'));
      
      if (isDecliningSms) {
        setSmsDeclined(true);
      }
      
      // Map action to scenario for database prompt lookup
      let scenario = 'general';
      let contextPrefix = "";
      if (action === 'test-drive') {
        scenario = 'test-drive';
        contextPrefix = "The customer clicked 'Book Test Drive' and wants to schedule a test drive. ";
      } else if (action === 'reserve') {
        scenario = 'reserve';
        contextPrefix = "The customer clicked 'Reserve Vehicle' and wants to reserve this vehicle. ";
      } else if (action === 'get-approved') {
        scenario = 'get-approved';
        contextPrefix = "The customer clicked 'Get Pre-Approved' and wants to get pre-approved for financing. ";
      } else if (action === 'value-trade') {
        scenario = 'value-trade';
        contextPrefix = "The customer clicked 'Value Trade-in' and wants to get a trade-in value. ";
      }

      const vehicleContextWithAction = vehicleName 
        ? `${contextPrefix}Vehicle: ${vehicleName}`
        : contextPrefix;

      // DealershipId is now resolved by backend from tenant middleware (subdomain/header)
      const response = await sendChatMessage(
        [...messages, userMessage],
        vehicleContextWithAction,
        scenario
      );

      const updatedMessages = [...messages, userMessage, { role: "assistant" as const, content: response }];
      setMessages(updatedMessages);
      trackChatMessage(vehicle, updatedMessages.length);
      
      // Detect contact info in user message and auto-sync to GHL if not already synced
      if (!leadSyncedToGHL) {
        const detected = detectContactInfo(userMessage.content);
        if (detected.phone || detected.email) {
          // Auto-sync lead to GHL with transcript
          autoSyncLeadToGHL(detected.phone, detected.email, updatedMessages);
        }
      }

      // After a few messages, offer SMS handoff ONCE if not already shown, declined, or completed
      if (messages.length >= 4 && !handoffRequested && !smsOfferShown && !smsDeclined && !wantsText) {
        setSmsOfferShown(true);
        setTimeout(() => {
          setMessages(prev => [...prev, {
            role: "assistant" as const,
            content: "Would you prefer to continue this conversation via text message? I can send you a text so we can chat that way instead!"
          }]);
        }, 2000);
      } else if (wantsText && !handoffRequested) {
        // User wants SMS - ask for phone number
        setTimeout(() => {
          setMessages(prev => [...prev, {
            role: "assistant" as const,
            content: "Perfect! I'd be happy to continue via text. What's the best phone number to reach you at?"
          }]);
          setAwaitingPhone(true);
        }, 1000);
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
      // Remove the user message if the request failed
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-24 right-2 md:right-8 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {/* Chat Panel - only rendered when open, expands leftward */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 100, opacity: 0 }}
            className="glass-panel rounded-2xl shadow-2xl overflow-hidden border border-blue-100 pointer-events-auto flex flex-col w-72 md:w-96"
            style={{ maxHeight: '500px' }}
          >
            {/* Header */}
            <div className="bg-primary p-4 flex items-center gap-3 shrink-0">
              <div className="relative">
                <img src="https://randomuser.me/api/portraits/men/32.jpg" className="w-10 h-10 rounded-full border-2 border-white" alt="Agent" />
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-primary"></div>
              </div>
              <div>
                <p className="text-white font-bold text-sm">Sales Consultant</p>
                <p className="text-blue-200 text-xs">Active Now</p>
              </div>
              <button onClick={handleCloseChat} className="ml-auto text-white/50 hover:text-white transition" data-testid="button-close-chat">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-muted space-y-3" style={{ maxHeight: '340px' }}>
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-br-none'
                        : 'bg-card text-foreground rounded-tl-none shadow-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-card text-foreground p-3 rounded-xl rounded-tl-none shadow-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-3 bg-card border-t border-border shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background text-foreground"
                  disabled={isLoading}
                  data-testid="input-chat-message"
                />
                <button
                  type="submit"
                  disabled={isLoading || !inputValue.trim()}
                  className="bg-primary text-white p-2 rounded-lg hover:bg-blue-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-send-message"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button - always in reserved space */}
      {!isOpen && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => {
            setIsOpen(true);
            trackChatOpen(vehicle, 'manual'); // Track manual chat open
          }}
          className="pointer-events-auto w-14 h-14 bg-primary rounded-full shadow-lg flex items-center justify-center text-white hover:bg-primary/90 transition-colors"
          data-testid="button-open-chat"
        >
          <MessageSquare className="w-6 h-6" />
        </motion.button>
      )}
    </div>
  );
}
