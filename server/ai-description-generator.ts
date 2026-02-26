import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import type { Vehicle } from "@shared/schema";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }
  return new Anthropic({ apiKey });
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(price);
}

function formatOdometer(km: number): string {
  return new Intl.NumberFormat("en-CA").format(km);
}

function getVehiclePersonality(vehicle: Vehicle): string {
  const { trim, model, fuelType } = vehicle;
  const combined = `${model} ${trim || ""} ${fuelType || ""}`.toLowerCase();

  if (combined.includes("n line") || combined.includes("sport") || combined.includes("gt") || combined.includes("type r") || combined.includes("si") || combined.includes("rs")) {
    return "sporty";
  }
  if (combined.includes("calligraphy") || combined.includes("ultimate") || combined.includes("platinum") || combined.includes("limited") || combined.includes("prestige")) {
    return "luxury";
  }
  if (combined.includes("electric") || combined.includes("ev") || combined.includes("hybrid") || combined.includes("phev")) {
    return "eco";
  }
  return "general";
}

function buildPrompt(vehicle: Vehicle, carfaxBadges: string[], highlights: string | null, techSpecs: any): string {
  const personality = getVehiclePersonality(vehicle);

  let personalityHint = "";
  switch (personality) {
    case "sporty":
      personalityHint = "Use energetic, exciting language. Emphasize performance and driving dynamics.";
      break;
    case "luxury":
      personalityHint = "Use sophisticated, premium language. Emphasize comfort, refinement, and exclusivity.";
      break;
    case "eco":
      personalityHint = "Emphasize efficiency, sustainability, and innovative technology.";
      break;
    default:
      personalityHint = "Use friendly, approachable language. Highlight value and versatility.";
      break;
  }

  const odometerCallout = vehicle.odometer < 500
    ? "Pretty Much Brand New"
    : vehicle.odometer < 30000
    ? `Only ${formatOdometer(vehicle.odometer)} km`
    : `${formatOdometer(vehicle.odometer)} km`;

  const badgesText = carfaxBadges.length > 0
    ? `Carfax badges: ${carfaxBadges.join(", ")}`
    : "No Carfax badges available";

  const highlightsText = highlights
    ? `Key features from dealer: ${highlights.replace(/\|/g, ", ")}`
    : "No specific highlights available";

  let techSpecsText = "";
  if (techSpecs) {
    try {
      const specs = typeof techSpecs === "string" ? JSON.parse(techSpecs) : techSpecs;
      const sections: string[] = [];
      if (specs.features?.length) sections.push(`Features: ${specs.features.join(", ")}`);
      if (specs.mechanical?.length) sections.push(`Mechanical: ${specs.mechanical.join(", ")}`);
      if (specs.interior?.length) sections.push(`Interior: ${specs.interior.join(", ")}`);
      if (specs.exterior?.length) sections.push(`Exterior: ${specs.exterior.join(", ")}`);
      if (specs.entertainment?.length) sections.push(`Entertainment: ${specs.entertainment.join(", ")}`);
      if (sections.length) techSpecsText = sections.join("\n");
    } catch {
      // ignore parse errors
    }
  }

  return `You are a world-class Facebook Marketplace copywriter for Canadian car dealerships. Generate a compelling vehicle listing description.

VEHICLE DETAILS:
- Year: ${vehicle.year}
- Make: ${vehicle.make}
- Model: ${vehicle.model}
- Trim: ${vehicle.trim || "N/A"}
- Type: ${vehicle.type}
- Price: ${formatPrice(vehicle.price)}
- Odometer: ${odometerCallout}
- Exterior Color: ${vehicle.exteriorColor || "N/A"}
- Transmission: ${vehicle.transmission || "N/A"}
- Fuel Type: ${vehicle.fuelType || "N/A"}
- Drivetrain: ${vehicle.drivetrain || "N/A"}
- Stock Number: ${vehicle.stockNumber || "N/A"}
- ${badgesText}
- ${highlightsText}
${techSpecsText ? `\nTECH SPECS:\n${techSpecsText}` : ""}

PERSONALITY: ${personalityHint}

EXACT FORMAT TO FOLLOW (output ONLY the description text, no markdown):

99% Approval Rate | We Accept All Trade-Ins | Best Prices Guaranteed

[If Carfax badges exist, list them plainly, e.g. No Reported Accidents | One Owner]
[If vehicle could be CPO, mention it]

[Key features as bullet points using bullet character • - pull from highlights and tech specs. 6-10 bullet points.]

[One engaging paragraph about the vehicle - 2-3 sentences max. Match the ${personality} personality.]

Financing available
Dealer#50552
Stock number: ${vehicle.stockNumber || "N/A"}
*OAC. Prices do not include $595 Doc Fee or When Applicable, $799 Finance/Lease Fee, or taxes.

RULES:
- Canadian market: use km (not miles), CAD, provinces
- Do NOT repeat vehicle specs (transmission, drivetrain, fuel type, odometer) as standalone lines — they are already shown in separate Facebook Marketplace fields. Only mention them naturally within bullet points or paragraph if relevant.
- Do NOT use any emojis whatsoever. No emoji characters at all. Use plain text only.
- Use bullet character • for feature lists
- Do NOT use markdown formatting (no **, no ##, no backticks)
- Do NOT include the price in the description (it's set separately in FB Marketplace)
- Keep the description under 1500 characters
- Output ONLY the description text, nothing else`;
}

export async function generateDescription(vehicleId: number, dealershipId: number): Promise<{ success: boolean; description?: string; error?: string }> {
  try {
    const vehicle = await storage.getVehicleById(vehicleId, dealershipId);
    if (!vehicle) {
      return { success: false, error: "Vehicle not found" };
    }

    const carfaxBadges = vehicle.carfaxBadges || [];
    const carfaxReport = await storage.getCarfaxReport(vehicleId);
    const allBadges = [...carfaxBadges, ...(carfaxReport?.badges || [])];
    const uniqueBadges = [...new Set(allBadges)];

    const prompt = buildPrompt(vehicle, uniqueBadges, vehicle.highlights || null, vehicle.techSpecs);

    let description: string;

    try {
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return { success: false, error: "No text in AI response" };
      }
      description = textBlock.text.trim();
    } catch (apiError: any) {
      if (apiError.message?.includes("ANTHROPIC_API_KEY")) {
        // No API key - use template fallback
        description = generateDescriptionTemplate(vehicle, uniqueBadges);
      } else {
        throw apiError;
      }
    }

    // Save to fbMarketplaceDescription and description fields
    await storage.updateVehicle(vehicleId, { fbMarketplaceDescription: description }, dealershipId);

    return { success: true, description };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to generate description" };
  }
}

export function generateDescriptionTemplate(vehicle: Vehicle, badges?: string[]): string {
  const carfaxBadges = badges || vehicle.carfaxBadges || [];
  const odometerCallout = vehicle.odometer < 500
    ? "Pretty Much Brand New"
    : vehicle.odometer < 30000
    ? `Only ${formatOdometer(vehicle.odometer)} km`
    : `${formatOdometer(vehicle.odometer)} km`;

  const lines: string[] = [];

  lines.push("99% Approval Rate | We Accept All Trade-Ins | Best Prices Guaranteed");
  lines.push("");

  if (carfaxBadges.length > 0) {
    lines.push(carfaxBadges.join(" | "));
    lines.push("");
  }

  const drivetrainParts: string[] = [];
  if (vehicle.transmission) drivetrainParts.push(vehicle.transmission);
  if (vehicle.drivetrain) drivetrainParts.push(vehicle.drivetrain);
  if (vehicle.fuelType) drivetrainParts.push(vehicle.fuelType);
  if (drivetrainParts.length > 0) {
    lines.push(drivetrainParts.join(" | "));
  }
  lines.push(odometerCallout);
  if (vehicle.exteriorColor) {
    lines.push(vehicle.exteriorColor);
  }
  lines.push("");

  // Features from highlights
  if (vehicle.highlights) {
    const features = vehicle.highlights.split("|").map((f) => f.trim()).filter(Boolean);
    for (const feature of features.slice(0, 8)) {
      lines.push(`• ${feature}`);
    }
    lines.push("");
  }

  lines.push(
    `Check out this ${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}! ` +
    `Come see it in person at our dealership.`
  );
  lines.push("");

  lines.push("Financing available");
  lines.push("Dealer#50552");
  lines.push(`Stock number: ${vehicle.stockNumber || "N/A"}`);
  lines.push("*OAC. Prices do not include $595 Doc Fee or When Applicable, $799 Finance/Lease Fee, or taxes.");

  return lines.join("\n");
}

export async function generateBatchDescriptions(dealershipId: number): Promise<{ total: number; success: number; failed: number; errors: string[] }> {
  const { vehicles: vehicleList } = await storage.getVehicles(dealershipId, 1000, 0);

  const result = { total: vehicleList.length, success: 0, failed: 0, errors: [] as string[] };

  for (const vehicle of vehicleList) {
    const res = await generateDescription(vehicle.id, dealershipId);
    if (res.success) {
      result.success++;
    } else {
      result.failed++;
      result.errors.push(`Vehicle ${vehicle.id} (${vehicle.year} ${vehicle.make} ${vehicle.model}): ${res.error}`);
    }
  }

  return result;
}
