import OpenAI from "openai";
import { db } from "./db";
import { aiPromptTemplates, dealershipApiKeys } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "./storage";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

async function getOpenAIClient(dealershipId: number): Promise<{ client: OpenAI; source: string }> {
  // Try to get dealership-specific API key
  const apiKeys = await storage.getDealershipApiKeys(dealershipId);
  
  if (apiKeys?.openaiApiKey && apiKeys.openaiApiKey.length > 20) {
    // Use dealership's own OpenAI API key
    console.log(`Using dealership ${dealershipId} OpenAI API key (length: ${apiKeys.openaiApiKey.length})`);
    return {
      client: new OpenAI({
        apiKey: apiKeys.openaiApiKey
      }),
      source: 'dealership'
    };
  }
  
  // Fallback to Replit's AI Integrations service
  console.log(`Using Replit AI Integrations fallback for dealership ${dealershipId}`);
  return {
    client: new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
    }),
    source: 'replit'
  };
}

export async function generateChatResponse(
  messages: ChatMessage[],
  dealershipId: number,
  scenario: string = 'general',
  vehicleContext?: string
): Promise<string> {
  try {
    // Load the active prompt for this dealership and scenario
    const promptData = await storage.getActivePromptForScenario(dealershipId, scenario);
    
    // Get current date and time in Pacific timezone (Vancouver)
    const now = new Date();
    const pacificTime = now.toLocaleString('en-US', { 
      timeZone: 'America/Vancouver',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    // Create a more explicit date/time context that the AI must use
    const dateTimeContext = `=== CURRENT DATE AND TIME ===
TODAY IS: ${pacificTime} (Pacific Time)
Use this exact date/time when customers ask about the current date, time, or when scheduling appointments. NEVER respond with placeholder text like "[insert date]" - always use the actual date provided above.
===========================`;
    
    // If no custom prompt, use a default system message
    let systemContent = `You are a helpful car sales consultant. Be friendly, concise, and focused on helping customers.

${dateTimeContext}

${vehicleContext ? `Current vehicle being discussed: ${vehicleContext}` : ""}

IMPORTANT RULES:
1. Keep responses to 2-3 sentences maximum - be concise
2. Before confirming any appointment or action, you MUST collect the customer's NAME and CONTACT INFO (phone or email)
3. Ask for ONE piece of information at a time
4. Don't repeat information the customer already gave you
5. Never confirm an appointment without having: date/time, full name, and phone number
6. When asked about the date or time, use the ACTUAL date/time provided above - never use placeholder text

Your goals:
- Answer questions directly and briefly
- Help schedule test drives and appointments (but always get name + contact first)
- Explain vehicle features when asked
- Guide customers efficiently through their purchase journey

Be helpful and action-oriented. If you don't have specific information, offer to connect them with a sales representative.`;

    if (promptData) {
      // Use the database prompt with date/time and vehicle context - put date/time at the TOP
      systemContent = `${dateTimeContext}\n\n${promptData.systemPrompt}\n\nIMPORTANT: When customers ask about the date or time, use the ACTUAL date/time provided at the start of this prompt. NEVER use placeholder text like "[insert date]" or "[current time]".`;
      if (vehicleContext) {
        systemContent += `\n\nCurrent vehicle being discussed: ${vehicleContext}`;
      }
    }

    const systemMessage: ChatMessage = {
      role: "system",
      content: systemContent
    };

    // Get the appropriate OpenAI client (dealership-specific or fallback)
    const { client: openai, source } = await getOpenAIClient(dealershipId);
    
    // Use gpt-4o-mini for dealership keys (better compatibility), gpt-5 for Replit AI Integrations
    const model = source === 'dealership' ? 'gpt-4o-mini' : 'gpt-4o';

    const response = await openai.chat.completions.create({
      model: model,
      messages: [systemMessage, ...messages],
      max_completion_tokens: 500,
      temperature: 1,
    });

    return response.choices[0]?.message?.content || "I apologize, but I'm having trouble responding right now. Please try again or contact our sales team directly.";
  } catch (error: any) {
    console.error("OpenAI API error:", error?.message || error);
    console.error("Full error:", JSON.stringify(error, null, 2));
    throw new Error("Failed to generate chat response");
  }
}

export function getInitialChatMessage(action: string | null, vehicleName: string): string {
  switch (action) {
    case 'test-drive':
      return `Perfect! You want to book a test drive for the ${vehicleName}. I can help you schedule that right away. What day works best for you this week?`;
    
    case 'reserve':
      return `Great choice! You're interested in reserving the ${vehicleName}. To secure this vehicle, I'll need a few quick details. Would you like to proceed with a $500 refundable deposit?`;
    
    default:
      return `Hi there! I see you're looking at the ${vehicleName}. It's a great choice! Would you like to see the CarFax report or schedule a test drive?`;
  }
}

interface VehicleData {
  year: number;
  make: string;
  model: string;
  trim: string;
  type: string;
  price: number;
  odometer: number;
  badges: string[];
  dealership: string;
  location: string;
  rawDescription?: string;
  fullPageContent?: string;
}

async function getActivePromptTemplate(dealershipId: number): Promise<string> {
  try {
    const template = await db.query.aiPromptTemplates.findFirst({
      where: and(
        eq(aiPromptTemplates.dealershipId, dealershipId),
        eq(aiPromptTemplates.isActive, true)
      ),
    });
    
    if (template) {
      return template.promptText;
    }
  } catch (error) {
    console.error("Error fetching prompt template:", error);
  }
  
  // Default fallback prompt
  return 'Create a compelling, professional vehicle description for a Canadian automotive dealership (Olympic Auto Group in Vancouver, BC).\n\n' +
    'Vehicle Details:\n' +
    '- {{YEAR}} {{MAKE}} {{MODEL}} {{TRIM}}\n' +
    '- Type: {{TYPE}}\n' +
    '- Price: ${{PRICE}} CAD\n' +
    '- Odometer: {{ODOMETER}} km\n' +
    '- Badges/Features: {{BADGES}}\n' +
    '- Location: {{DEALERSHIP}}, {{LOCATION}}\n' +
    '{{FULL_CONTENT}}\n\n' +
    'Requirements:\n' +
    '- Write 2-3 compelling paragraphs (150-200 words total)\n' +
    '- Highlight key features, benefits, and value proposition\n' +
    '- Use Canadian automotive market language and terminology\n' +
    '- Emphasize quality, reliability, and value\n' +
    '- Include emotional appeal and lifestyle benefits\n' +
    '- Mention financing availability and dealership reputation\n' +
    '- Use professional, enthusiastic tone\n' +
    '- Focus on what makes THIS vehicle special\n' +
    '- DO NOT use placeholder text or generic templates\n' +
    '- DO NOT mention things not in the vehicle details\n\n' +
    'Write the description now:';
}

export async function generateVehicleDescription(vehicle: VehicleData, dealershipId: number = 1): Promise<string> {
  try {
    const badgesText = vehicle.badges.length > 0 ? vehicle.badges.join(', ') : 'none';
    const fullContentSection = vehicle.fullPageContent 
      ? `\n\nAdditional information from listing:\n${vehicle.fullPageContent.slice(0, 3000)}`
      : vehicle.rawDescription 
      ? `\nOriginal listing info: ${vehicle.rawDescription}`
      : '';
    
    // Get customizable prompt template
    const promptTemplate = await getActivePromptTemplate(dealershipId);
    
    // Replace template variables
    const prompt = promptTemplate
      .replace(/\{\{YEAR\}\}/g, vehicle.year.toString())
      .replace(/\{\{MAKE\}\}/g, vehicle.make)
      .replace(/\{\{MODEL\}\}/g, vehicle.model)
      .replace(/\{\{TRIM\}\}/g, vehicle.trim)
      .replace(/\{\{TYPE\}\}/g, vehicle.type)
      .replace(/\{\{PRICE\}\}/g, vehicle.price.toLocaleString())
      .replace(/\{\{ODOMETER\}\}/g, vehicle.odometer.toLocaleString())
      .replace(/\{\{BADGES\}\}/g, badgesText)
      .replace(/\{\{DEALERSHIP\}\}/g, vehicle.dealership)
      .replace(/\{\{LOCATION\}\}/g, vehicle.location)
      .replace(/\{\{FULL_CONTENT\}\}/g, fullContentSection);

    // Get the appropriate OpenAI client
    const { client: openaiClient, source } = await getOpenAIClient(dealershipId);
    
    // Use gpt-4o-mini for dealership keys, gpt-5 for Replit AI Integrations
    const model = source === 'dealership' ? 'gpt-4o-mini' : 'gpt-4o';

    const response = await openaiClient.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: "You are an expert automotive copywriter specializing in Canadian car dealership marketing. Write compelling, specific vehicle descriptions that sell vehicles."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 400,
      temperature: 1,
    });

    const description = response.choices[0]?.message?.content?.trim();
    
    if (!description || description.length < 50) {
      // Fallback to basic description
      return `This ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} is an exceptional ${vehicle.type.toLowerCase()} available at ${vehicle.dealership}. With ${vehicle.odometer.toLocaleString()} km on the odometer and priced at $${vehicle.price.toLocaleString()}, it represents outstanding value in today's market. ${vehicle.badges.length > 0 ? `Features include: ${vehicle.badges.join(', ')}.` : ''} Visit us in ${vehicle.location} to experience this vehicle firsthand and explore our flexible financing options.`;
    }
    
    return description;
  } catch (error) {
    console.error("Error generating vehicle description:", error);
    // Fallback description
    return `This ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} is an exceptional ${vehicle.type.toLowerCase()} available at ${vehicle.dealership}. With ${vehicle.odometer.toLocaleString()} km on the odometer and priced at $${vehicle.price.toLocaleString()}, it represents outstanding value in today's market. ${vehicle.badges.length > 0 ? `Features include: ${vehicle.badges.join(', ')}.` : ''} Visit us in ${vehicle.location} to experience this vehicle firsthand and explore our flexible financing options.`;
  }
}

// Social templates type for Marketplace Blast
export interface SocialTemplates {
  marketplace: {
    title: string;
    description: string;
  };
  pagePost?: {
    body: string;
  };
  instagram?: {
    caption: string;
    hashtags: string;
  };
  reply?: {
    message: string;
  };
}

// Generate Marketplace listing content for a vehicle
export async function generateMarketplaceContent(
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim: string;
    type: string;
    price: number;
    odometer: number;
    badges: string[];
    description: string;
    location: string;
    dealership: string;
    vin?: string;
    carfaxUrl?: string;
  },
  dealershipId: number,
  dealershipName?: string
): Promise<SocialTemplates> {
  try {
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`;
    
    const prompt = `Generate SHORT, punchy Facebook Marketplace listing content for this vehicle.

VEHICLE DETAILS:
- Year: ${vehicle.year}
- Make: ${vehicle.make}
- Model: ${vehicle.model}
- Trim: ${vehicle.trim || 'Base'}
- Type: ${vehicle.type}
- Price: $${vehicle.price.toLocaleString()} CAD
- Kilometers: ${vehicle.odometer.toLocaleString()} km
- Location: ${vehicle.location}
- Dealership: ${vehicle.dealership}
${vehicle.badges.length > 0 ? `- Features: ${vehicle.badges.join(', ')}` : ''}
${vehicle.carfaxUrl ? '- Clean Carfax available' : ''}

REQUIREMENTS:
1. Title: Maximum 100 characters. Format: "[Year] [Make] [Model] [Trim] | [Key Feature] | [Condition]"
   Examples: "2023 Hyundai Tucson Preferred AWD | One Owner | No Accidents"
2. Description: 3-4 short paragraphs, maximum 500 characters total. Focus on:
   - Key selling points (condition, history, features)
   - What makes this vehicle special
   - Call to action
3. Do NOT mention financing rates or loan approvals
4. Be professional but friendly
5. Use Canadian spelling (kilometres, colour)

Return ONLY valid JSON in this exact format, no other text:
{
  "marketplace": {
    "title": "...",
    "description": "..."
  },
  "pagePost": {
    "body": "..."
  },
  "reply": {
    "message": "..."
  }
}`;

    const { client: openaiClient, source } = await getOpenAIClient(dealershipId);
    const model = source === 'dealership' ? 'gpt-4o-mini' : 'gpt-4o';

    const response = await openaiClient.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: "You are an expert automotive copywriter for Canadian car dealerships. Generate compelling, compliant Facebook Marketplace listings. Always return valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 600,
      temperature: 0.8,
    });

    const content = response.choices[0]?.message?.content?.trim() || '';
    
    // Try to parse JSON from the response
    let templates: SocialTemplates;
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanContent = content;
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      templates = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response, using fallback:', parseError);
      // Fallback templates
      templates = {
        marketplace: {
          title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} | Great Value | Well Maintained`,
          description: `This ${vehicleName} is available at ${vehicle.dealership} in ${vehicle.location}. With ${vehicle.odometer.toLocaleString()} km, it's priced at $${vehicle.price.toLocaleString()}. ${vehicle.badges.length > 0 ? `Features: ${vehicle.badges.slice(0, 3).join(', ')}.` : ''} Contact us for more details!`
        },
        pagePost: {
          body: `🚗 Just Listed: ${vehicleName}\n💰 $${vehicle.price.toLocaleString()}\n📍 ${vehicle.odometer.toLocaleString()} km\n\nAvailable now at ${vehicle.dealership}. DM us for details!`
        },
        reply: {
          message: `Hi! Yes, the ${vehicleName} is still available. It's priced at $${vehicle.price.toLocaleString()} with ${vehicle.odometer.toLocaleString()} km. Would you like to schedule a viewing?`
        }
      };
    }

    return templates;
  } catch (error) {
    console.error('Error generating marketplace content:', error);
    // Return fallback content
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`;
    return {
      marketplace: {
        title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} | Great Value`,
        description: `${vehicleName} available at ${vehicle.dealership}. ${vehicle.odometer.toLocaleString()} km, $${vehicle.price.toLocaleString()}. Contact us today!`
      },
      pagePost: {
        body: `🚗 ${vehicleName}\n💰 $${vehicle.price.toLocaleString()}\n📍 ${vehicle.odometer.toLocaleString()} km\n\nAvailable at ${vehicle.dealership}!`
      },
      reply: {
        message: `Yes, the ${vehicleName} is available at $${vehicle.price.toLocaleString()}. Would you like to schedule a viewing?`
      }
    };
  }
}
