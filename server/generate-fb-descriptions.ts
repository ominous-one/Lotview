import OpenAI from "openai";
import { db } from "./db";
import { vehicles } from "@shared/schema";
import { isNull, eq } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface TechSpecs {
  features?: string[];
  mechanical?: string[];
  exterior?: string[];
  interior?: string[];
  entertainment?: string[];
}

async function generateFBMarketplaceDescription(vehicle: {
  id: number;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  odometer: number;
  fuelType: string | null;
  transmission: string | null;
  drivetrain: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  carfaxBadges: string[] | null;
  vdpDescription: string | null;
  techSpecs: string | null;
  badges: string[];
}): Promise<string> {
  let specs: TechSpecs = {};
  try {
    if (vehicle.techSpecs) {
      specs = JSON.parse(vehicle.techSpecs);
    }
  } catch (e) {
    console.log(`  Failed to parse tech specs for vehicle ${vehicle.id}`);
  }

  const engineInfo = specs.mechanical?.find(s => 
    s.toLowerCase().includes('engine') || 
    s.toLowerCase().includes('cylinder') ||
    s.toLowerCase().includes('litre') ||
    s.toLowerCase().includes('liter')
  ) || '';

  const topFeatures = [
    ...(specs.features || []).slice(0, 3),
    ...(specs.interior || []).filter(s => 
      s.toLowerCase().includes('leather') || 
      s.toLowerCase().includes('heated') ||
      s.toLowerCase().includes('sunroof') ||
      s.toLowerCase().includes('navigation')
    ).slice(0, 2),
    ...(specs.entertainment || []).filter(s =>
      s.toLowerCase().includes('apple carplay') ||
      s.toLowerCase().includes('android auto') ||
      s.toLowerCase().includes('premium') ||
      s.toLowerCase().includes('bluetooth')
    ).slice(0, 2),
  ].slice(0, 6);

  const carfaxHighlights = vehicle.carfaxBadges?.join(', ') || 'Clean history available';

  const prompt = `You are a world-class car sales professional writing a Facebook Marketplace description. Write a compelling, mobile-optimized description for this vehicle that will grab attention and drive inquiries.

VEHICLE DATA:
- ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}
- Price: $${vehicle.price.toLocaleString()}
- Odometer: ${vehicle.odometer.toLocaleString()} km
- Fuel: ${vehicle.fuelType || 'Gasoline'}
- Transmission: ${vehicle.transmission || 'Automatic'}
- Drivetrain: ${vehicle.drivetrain || 'N/A'}
- Exterior: ${vehicle.exteriorColor || 'N/A'}
- Interior: ${vehicle.interiorColor || 'N/A'}
${engineInfo ? `- Engine: ${engineInfo}` : ''}
- Carfax: ${carfaxHighlights}
- Key Features: ${topFeatures.join(', ') || 'Well-equipped'}

${vehicle.vdpDescription ? `DEALER OVERVIEW:\n${vehicle.vdpDescription.substring(0, 500)}` : ''}

REQUIREMENTS:
1. Start with an attention-grabbing opening line (not just the vehicle name)
2. Highlight Carfax history prominently (this builds trust!)
3. Feature the top 3-4 selling points that buyers care about
4. Include engine/performance info if available
5. Keep it scannable - use short paragraphs and bullet points or emojis
6. End with a call to action
7. Stay under 1000 characters (Facebook Marketplace limit)
8. Sound confident and excited, but not pushy
9. DO NOT include the price (Facebook shows it separately)
10. DO NOT include generic dealer disclaimers

Write ONLY the description - no title, no quotes, just the raw description text:`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      {
        role: "system",
        content: "You are an expert car salesperson who writes compelling, conversion-focused Facebook Marketplace descriptions. You understand what buyers look for and how to highlight value."
      },
      { role: "user", content: prompt }
    ],
    max_completion_tokens: 500,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

async function main() {
  console.log('Starting AI Facebook Marketplace description generation...\n');

  const vehiclesNeedingDescriptions = await db
    .select({
      id: vehicles.id,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
      trim: vehicles.trim,
      price: vehicles.price,
      odometer: vehicles.odometer,
      fuelType: vehicles.fuelType,
      transmission: vehicles.transmission,
      drivetrain: vehicles.drivetrain,
      exteriorColor: vehicles.exteriorColor,
      interiorColor: vehicles.interiorColor,
      carfaxBadges: vehicles.carfaxBadges,
      vdpDescription: vehicles.vdpDescription,
      techSpecs: vehicles.techSpecs,
      badges: vehicles.badges,
      fbMarketplaceDescription: vehicles.fbMarketplaceDescription,
    })
    .from(vehicles)
    .where(isNull(vehicles.fbMarketplaceDescription));

  console.log(`Found ${vehiclesNeedingDescriptions.length} vehicles needing FB descriptions\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const vehicle of vehiclesNeedingDescriptions) {
    console.log(`Processing: ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} (ID: ${vehicle.id})`);

    try {
      const description = await generateFBMarketplaceDescription(vehicle);

      if (description) {
        await db.update(vehicles)
          .set({ fbMarketplaceDescription: description })
          .where(eq(vehicles.id, vehicle.id));
        
        console.log(`  ✓ Generated ${description.length} chars`);
        console.log(`  Preview: ${description.substring(0, 100)}...`);
        successCount++;
      } else {
        console.log(`  ✗ Empty response from AI`);
        errorCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`  ✗ Error:`, error instanceof Error ? error.message : error);
      errorCount++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n========================================`);
  console.log(`FB Marketplace Description Generation Complete`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`========================================`);
}

main().catch(console.error);
