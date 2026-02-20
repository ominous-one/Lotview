import { storage } from "./storage";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_VIDEO_API = "https://us-central1-aiplatform.googleapis.com";

export interface GeminiVideoRequest {
  prompt: string;
  aspectRatio?: "16:9" | "9:16";
  durationSeconds?: 6 | 8;
  resolution?: "720p" | "1080p";
  negativePrompt?: string;
}

export interface GeminiVideoResponse {
  success: boolean;
  videoUrl?: string;
  error?: string;
  estimatedCost?: string;
  generationTimeSeconds?: number;
}

const serviceCache = new Map<number, GeminiService>();

export class GeminiService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  static async getInstanceForDealership(dealershipId: number): Promise<GeminiService | null> {
    if (serviceCache.has(dealershipId)) {
      return serviceCache.get(dealershipId)!;
    }
    
    try {
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      if (apiKeys?.geminiApiKey) {
        const service = new GeminiService(apiKeys.geminiApiKey);
        serviceCache.set(dealershipId, service);
        console.log(`[Gemini] Service initialized for dealership ${dealershipId}`);
        return service;
      } else {
        console.warn(`[Gemini] API key not configured for dealership ${dealershipId}`);
        return null;
      }
    } catch (error) {
      console.error(`[Gemini] Error loading configuration for dealership ${dealershipId}:`, error);
      return null;
    }
  }

  static clearCache(dealershipId?: number) {
    if (dealershipId) {
      serviceCache.delete(dealershipId);
    } else {
      serviceCache.clear();
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string; modelInfo?: any }> {
    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/v1beta/models?key=${this.apiKey}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      return { 
        success: true, 
        modelInfo: {
          availableModels: data.models?.slice(0, 5).map((m: any) => m.name) || [],
          total: data.models?.length || 0
        }
      };
    } catch (error) {
      console.error('[Gemini] Connection test failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async generateVehicleVideoPrompt(vehicle: {
    year: number;
    make: string;
    model: string;
    trim?: string;
    type?: string;
    exteriorColor?: string;
    interiorColor?: string;
    mileage?: number;
  }): Promise<string> {
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`;
    const vehicleType = vehicle.type?.toLowerCase() || 'vehicle';
    
    let prompt = `Cinematic automotive showcase of a ${vehicleName}. `;
    prompt += `Professional dealership-quality video featuring smooth rotating exterior views. `;
    
    if (vehicle.exteriorColor) {
      prompt += `Exterior in ${vehicle.exteriorColor.toLowerCase()} finish with pristine paint quality. `;
    }
    
    if (vehicle.type) {
      const typeDescriptions: Record<string, string> = {
        'SUV': 'Showcase the commanding presence and spacious design of this sport utility vehicle. ',
        'Sedan': 'Highlight the elegant lines and refined styling of this sedan. ',
        'Truck': 'Emphasize the rugged capability and powerful stance of this pickup truck. ',
        'Coupe': 'Feature the sporty profile and dynamic design of this coupe. ',
        'Hatchback': 'Show the practical versatility and modern styling of this hatchback. ',
        'Van': 'Demonstrate the spacious interior and family-friendly features of this van. ',
        'Convertible': 'Capture the freedom and excitement of this convertible with top-down views. ',
      };
      prompt += typeDescriptions[vehicle.type] || '';
    }
    
    prompt += `Professional automotive photography lighting, no reflections, showroom environment. `;
    prompt += `Clean, modern dealership backdrop. No watermarks, logos, or text overlays.`;
    
    return prompt;
  }

  async generateVideo(request: GeminiVideoRequest): Promise<GeminiVideoResponse> {
    const startTime = Date.now();
    const durationSeconds = request.durationSeconds || 6;
    const estimatedCostPerSecond = 0.15;
    const estimatedCost = `$${(durationSeconds * estimatedCostPerSecond).toFixed(2)}`;

    try {
      console.log(`[Gemini] Generating video with prompt: ${request.prompt.substring(0, 100)}...`);
      console.log(`[Gemini] Estimated cost: ${estimatedCost}`);

      return {
        success: false,
        error: "Video generation requires Vertex AI project setup. Contact administrator.",
        estimatedCost
      };
    } catch (error) {
      console.error('[Gemini] Video generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        estimatedCost,
        generationTimeSeconds: Math.round((Date.now() - startTime) / 1000)
      };
    }
  }

  async generateText(prompt: string, maxTokens: number = 1024): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.7,
            }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('No text generated');
      }

      return { success: true, text };
    } catch (error) {
      console.error('[Gemini] Text generation error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async generateVehicleDescription(vehicle: {
    year: number;
    make: string;
    model: string;
    trim?: string;
    type?: string;
    mileage?: number;
    price?: number;
    badges?: string[];
    description?: string;
  }): Promise<{ success: boolean; description?: string; error?: string }> {
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`;
    
    const prompt = `Write a compelling, professional vehicle listing description for a ${vehicleName}.
${vehicle.type ? `Vehicle type: ${vehicle.type}` : ''}
${vehicle.mileage ? `Mileage: ${vehicle.mileage.toLocaleString()} km` : ''}
${vehicle.price ? `Price: $${vehicle.price.toLocaleString()}` : ''}
${vehicle.badges?.length ? `Certifications/Badges: ${vehicle.badges.join(', ')}` : ''}

The description should:
- Be 2-3 paragraphs
- Highlight key selling points
- Use professional automotive terminology
- Create urgency without being pushy
- Be suitable for a dealership website

Do not include any placeholders or square brackets. Write only the description text.`;

    return this.generateText(prompt, 512);
  }
}

export async function getGeminiServiceForDealership(dealershipId: number): Promise<GeminiService | null> {
  return GeminiService.getInstanceForDealership(dealershipId);
}
