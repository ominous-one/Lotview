import { storage } from "./storage";
import { createGhlApiService } from "./ghl-api-service";
import OpenAI from "openai";

interface ScheduleDetectionResult {
  shouldSchedule: boolean;
  scheduledTime?: Date;
  followUpContext?: string;
}

interface MessageAnalysis {
  shouldDisableAI: boolean;
  disableReason?: 'stop_request' | 'rudeness';
  isNegative: boolean;
}

export function createScheduledMessageService(dealershipId: number) {
  const ghlService = createGhlApiService(dealershipId);
  
  async function getOpenAIClient(): Promise<OpenAI | null> {
    const dealership = await storage.getDealershipById(dealershipId) as any;
    const apiKey = dealership?.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return new OpenAI({ apiKey });
  }
  
  async function detectSchedulingIntent(
    customerMessage: string,
    conversationContext: string
  ): Promise<ScheduleDetectionResult> {
    const openai = await getOpenAIClient();
    if (!openai) {
      return { shouldSchedule: false };
    }
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are analyzing a customer message to detect if they're requesting a follow-up at a specific time.

Analyze the message for scheduling intent. Look for phrases like:
- "call me Friday at 10am"
- "reach out this weekend"
- "contact me tomorrow"
- "I'll be available on Saturday"
- "can't make it until next week"

Current date/time: ${new Date().toISOString()}

Respond in JSON format:
{
  "shouldSchedule": boolean,
  "scheduledTime": "ISO 8601 datetime string or null",
  "followUpContext": "brief description of what the customer requested"
}

If the customer mentions a relative time (like "tomorrow at 10am"), calculate the actual date.
If they say "this weekend" assume Saturday morning at 10am.
If they say "next week" assume Monday at 10am.`
          },
          {
            role: "user",
            content: `Conversation context:\n${conversationContext}\n\nLatest customer message:\n${customerMessage}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) return { shouldSchedule: false };
      
      const result = JSON.parse(content);
      return {
        shouldSchedule: result.shouldSchedule || false,
        scheduledTime: result.scheduledTime ? new Date(result.scheduledTime) : undefined,
        followUpContext: result.followUpContext,
      };
    } catch (error) {
      console.error("[ScheduledMessage] Error detecting scheduling intent:", error);
      return { shouldSchedule: false };
    }
  }
  
  async function analyzeMessageForAutoStop(
    customerMessage: string
  ): Promise<MessageAnalysis> {
    const lowerMessage = customerMessage.toLowerCase().trim();
    
    if (lowerMessage === 'stop' || 
        lowerMessage === 'unsubscribe' || 
        lowerMessage === 'stop texting me' ||
        lowerMessage.includes('stop messaging') ||
        lowerMessage.includes('stop contacting') ||
        lowerMessage.includes('do not contact') ||
        lowerMessage.includes('remove me')) {
      return {
        shouldDisableAI: true,
        disableReason: 'stop_request',
        isNegative: true,
      };
    }
    
    const openai = await getOpenAIClient();
    if (!openai) {
      return { shouldDisableAI: false, isNegative: false };
    }
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Analyze this customer message for rudeness, hostility, or frustration that suggests they don't want to be contacted by an AI anymore.

Look for:
- Explicit requests to stop or unsubscribe
- Hostile or abusive language
- Clear expressions of frustration with automated responses
- Threats or aggressive tone

Respond in JSON:
{
  "shouldDisableAI": boolean,
  "disableReason": "stop_request" | "rudeness" | null,
  "isNegative": boolean,
  "explanation": "brief explanation"
}`
          },
          {
            role: "user",
            content: customerMessage
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) return { shouldDisableAI: false, isNegative: false };
      
      const result = JSON.parse(content);
      return {
        shouldDisableAI: result.shouldDisableAI || false,
        disableReason: result.disableReason || undefined,
        isNegative: result.isNegative || false,
      };
    } catch (error) {
      console.error("[ScheduledMessage] Error analyzing message for auto-stop:", error);
      return { shouldDisableAI: false, isNegative: false };
    }
  }
  
  async function generateScheduledFollowUp(
    context: {
      customerName: string;
      vehicleInterest?: string;
      schedulingContext: string;
      dealershipName: string;
    }
  ): Promise<string> {
    const openai = await getOpenAIClient();
    if (!openai) {
      return `Hi ${context.customerName}! Following up as requested about scheduling a test drive. When would be a good time for you to come in?`;
    }
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a friendly automotive sales assistant at ${context.dealershipName}.

Generate a brief, personalized follow-up message for a customer who requested to be contacted at this time.

Keep it:
- Short and friendly (2-3 sentences max)
- Reference their previous request
- Include a clear call-to-action to schedule a test drive
- Sound natural, not robotic`
          },
          {
            role: "user",
            content: `Customer: ${context.customerName}
Vehicle interest: ${context.vehicleInterest || 'Not specified'}
What they asked: ${context.schedulingContext}

Generate the follow-up message:`
          }
        ],
        temperature: 0.7,
      });
      
      return response.choices[0]?.message?.content || 
        `Hi ${context.customerName}! Following up as requested. Would you like to schedule a test drive?`;
    } catch (error) {
      console.error("[ScheduledMessage] Error generating follow-up:", error);
      return `Hi ${context.customerName}! Following up as requested. Would you like to schedule a test drive?`;
    }
  }
  
  async function scheduleFollowUpMessage(params: {
    conversationId: number;
    scheduledAt: Date;
    triggerContext: string;
    customerName: string;
    vehicleInterest?: string;
  }): Promise<boolean> {
    try {
      const dealership = await storage.getDealershipById(dealershipId);
      const dealershipName = dealership?.name || 'our dealership';
      
      const content = await generateScheduledFollowUp({
        customerName: params.customerName,
        vehicleInterest: params.vehicleInterest,
        schedulingContext: params.triggerContext,
        dealershipName,
      });
      
      await storage.createScheduledMessage({
        dealershipId,
        conversationId: params.conversationId,
        channel: 'facebook',
        content,
        scheduledAt: params.scheduledAt,
        aiGenerated: true,
        triggerContext: params.triggerContext,
        status: 'pending',
      });
      
      console.log(`[ScheduledMessage] Scheduled follow-up for conversation ${params.conversationId} at ${params.scheduledAt}`);
      return true;
    } catch (error) {
      console.error("[ScheduledMessage] Error scheduling follow-up:", error);
      return false;
    }
  }
  
  async function disableAIForConversation(
    conversationId: number,
    reason: 'stop_request' | 'rudeness' | 'manual'
  ): Promise<boolean> {
    try {
      await storage.updateMessengerConversation(conversationId, dealershipId, {
        aiEnabled: false,
        aiDisabledReason: reason,
        aiDisabledAt: new Date(),
      });
      
      console.log(`[ScheduledMessage] AI disabled for conversation ${conversationId}: ${reason}`);
      return true;
    } catch (error) {
      console.error("[ScheduledMessage] Error disabling AI:", error);
      return false;
    }
  }
  
  async function enableAIForConversation(conversationId: number): Promise<boolean> {
    try {
      await storage.updateMessengerConversation(conversationId, dealershipId, {
        aiEnabled: true,
        aiDisabledReason: null,
        aiDisabledAt: null,
      });
      
      console.log(`[ScheduledMessage] AI enabled for conversation ${conversationId}`);
      return true;
    } catch (error) {
      console.error("[ScheduledMessage] Error enabling AI:", error);
      return false;
    }
  }
  
  return {
    detectSchedulingIntent,
    analyzeMessageForAutoStop,
    scheduleFollowUpMessage,
    disableAIForConversation,
    enableAIForConversation,
    generateScheduledFollowUp,
  };
}

export async function processScheduledMessages(): Promise<void> {
  console.log("[ScheduledMessage] Processing due scheduled messages...");
  
  try {
    const dueMessages = await storage.getDueScheduledMessages();
    console.log(`[ScheduledMessage] Found ${dueMessages.length} messages due for sending`);
    
    for (const message of dueMessages) {
      try {
        if (message.channel === 'facebook' && message.conversationId) {
          const conversation = await storage.getMessengerConversationById(
            message.conversationId, 
            message.dealershipId
          );
          
          if (!conversation) {
            console.error(`[ScheduledMessage] Conversation ${message.conversationId} not found`);
            await storage.updateScheduledMessage(message.id, message.dealershipId, {
              status: 'failed',
              errorMessage: 'Conversation not found',
            });
            continue;
          }
          
          // Check if conversation is in watch mode (manual takeover)
          // AI should watch but not send auto-responses
          if (conversation.aiWatchMode) {
            console.log(`[ScheduledMessage] Skipping message ${message.id} - conversation in watch mode (manual takeover)`);
            await storage.updateScheduledMessage(message.id, message.dealershipId, {
              status: 'skipped',
              errorMessage: 'Manual takeover active - AI watching but not responding',
            });
            continue;
          }
          
          // Check if AI is disabled for this conversation
          if (!conversation.aiEnabled) {
            console.log(`[ScheduledMessage] Skipping message ${message.id} - AI disabled: ${conversation.aiDisabledReason}`);
            await storage.updateScheduledMessage(message.id, message.dealershipId, {
              status: 'skipped',
              errorMessage: `AI disabled: ${conversation.aiDisabledReason}`,
            });
            continue;
          }
          
          const ghlService = createGhlApiService(message.dealershipId);
          
          // Need to get or create a GHL conversation for this contact
          if (!conversation.ghlConversationId) {
            console.error(`[ScheduledMessage] No GHL conversation ID for conversation ${message.conversationId}`);
            await storage.updateScheduledMessage(message.id, message.dealershipId, {
              status: 'failed',
              errorMessage: 'No GHL conversation linked',
            });
            continue;
          }
          
          const sendResult = await ghlService.sendMessage(conversation.ghlConversationId, {
            type: 'FB',
            message: message.content,
          });
          
          if (sendResult.success) {
            await storage.updateScheduledMessage(message.id, message.dealershipId, {
              status: 'sent',
            });
            console.log(`[ScheduledMessage] Sent scheduled message ${message.id}`);
          } else {
            await storage.updateScheduledMessage(message.id, message.dealershipId, {
              status: 'failed',
              errorMessage: sendResult.error || 'Failed to send message',
            });
            console.error(`[ScheduledMessage] Failed to send message ${message.id}: ${sendResult.error}`);
          }
        }
      } catch (error: any) {
        console.error(`[ScheduledMessage] Error processing message ${message.id}:`, error);
        await storage.updateScheduledMessage(message.id, message.dealershipId, {
          status: 'failed',
          errorMessage: error.message,
        });
      }
    }
  } catch (error) {
    console.error("[ScheduledMessage] Error processing scheduled messages:", error);
  }
}
