/**
 * AI Carfax Trainer — World-Class Vehicle Intelligence
 * 
 * Converts raw Carfax data into AI-ready context that produces
 * persuasive, confidence-building sales language.
 */

import { CarfaxReport } from "./carfax-scraper";

export interface AiTrainingVehicle {
  id: number;
  year: number;
  make: string;
  model: string;
  trim?: string;
  price?: number;
  odometer?: number;
  description?: string;
  carfax?: CarfaxReport;
  marketData?: {
    avgPrice: number;
    priceRange: [number, number];
    daysOnMarket: number;
    demandScore: number;
  };
  photos?: string[];
  status: string;
}

export interface AiSalesContext {
  greeting: string;
  vehicleSummary: string;
  confidenceStatement: string;
  urgencyHooks: string[];
  objectionHandlers: Record<string, string>;
  recommendedPrice: number;
  photoScore: number;
  descriptionQuality: number;
}

export function buildAiCarfaxContext(vehicle: AiTrainingVehicle): string {
  const { carfax } = vehicle;
  if (!carfax) return "";

  const lines: string[] = [];
  lines.push(`## Carfax Intelligence for ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
  lines.push(``);

  // Confidence score
  const confidence = calculateConfidenceScore(vehicle);
  lines.push(`**Confidence Score: ${confidence}/100**`);
  lines.push(``);

  // Key selling points
  lines.push(`### Key Selling Points`);
  if (!carfax.damageReported) {
    lines.push(`- **No accidents or damage** — This vehicle has never been in a reported accident.`);
  }
  if (carfax.ownerCount === 1) {
    lines.push(`- **Single owner** — Purchased new and carefully maintained by one owner.`);
  } else if (carfax.ownerCount <= 2) {
    lines.push(`- **${carfax.ownerCount} owners** — Limited ownership history indicates careful stewardship.`);
  }
  if (carfax.serviceRecordCount > 5) {
    lines.push(`- **${carfax.serviceRecordCount} service records** — Regularly maintained at certified facilities.`);
  }
  if (!carfax.structuralDamage && !carfax.totalLoss && !carfax.airbagDeployment) {
    lines.push(`- **Clean structural record** — No structural damage, total loss, or airbag deployment.`);
  }
  if (carfax.recallCount === 0) {
    lines.push(`- **No open recalls** — All manufacturer safety campaigns addressed.`);
  }
  if (carfax.useHistory?.personal) {
    lines.push(`- **Personal use only** — Never commercial, rental, taxi, or fleet duty.`);
  }
  if (carfax.buybackGuarantee) {
    lines.push(`- **Buyback Guarantee eligible** — Carfax stands behind this vehicle's history.`);
  }

  lines.push(``);
  lines.push(`### Customer Objection Responses`);

  if (carfax.damageReported) {
    lines.push(`**"Was it in an accident?"** — Yes, there was damage reported. Here's what we know: [explain from report]. Our certified technicians have inspected and repaired all issues. Full documentation available.`);
  } else {
    lines.push(`**"Was it in an accident?"** — No accidents or damage have been reported to Carfax. Clean history verified.`);
  }

  if (carfax.ownerCount > 2) {
    lines.push(`**"Too many owners?"** — ${carfax.ownerCount} owners with full service history at each. Each owner maintained it properly — that's actually a positive with the documentation to prove it.`);
  }

  if (vehicle.odometer && carfax.odometerLastReported) {
    const discrepancy = Math.abs(vehicle.odometer - carfax.odometerLastReported);
    if (discrepancy > 1000) {
      lines.push(`**"Odometer discrepancy?"** — Carfax last recorded ${carfax.odometerLastReported?.toLocaleString()} km. Current reading is ${vehicle.odometer.toLocaleString()} km. This vehicle has been driven ${discrepancy.toLocaleString()} km since last report — consistent with normal use.`);
    }
  }

  lines.push(``);
  lines.push(`### Recommended Talking Points`);
  lines.push(`1. Lead with the Carfax — "Let me show you the Carfax report..."`);
  lines.push(`2. Show the confidence score — "This vehicle scores ${confidence}/100 for history quality."`);
  lines.push(`3. Use specific numbers — "${carfax.serviceRecordCount} service records" is more powerful than "well maintained."`);
  lines.push(`4. Address concerns proactively — Bring up the Carfax before the customer asks.`);

  return lines.join("\n");
}

export function generateAiSalesResponse(
  vehicle: AiTrainingVehicle,
  customerMessage: string,
  tone: "professional" | "friendly" | "urgent" = "professional"
): string {
  const { carfax } = vehicle;
  const carfaxContext = carfax ? buildAiCarfaxContext(vehicle) : "";

  const intents = detectCustomerIntent(customerMessage);
  const responses: string[] = [];

  // Greeting
  if (tone === "friendly") {
    responses.push(`Hi there! Thanks for reaching out about the ${vehicle.year} ${vehicle.make} ${vehicle.model}.`);
  } else if (tone === "urgent") {
    responses.push(`Thanks for your interest in the ${vehicle.year} ${vehicle.make} ${vehicle.model}! This one is getting a lot of attention.`);
  } else {
    responses.push(`Thank you for your inquiry about the ${vehicle.year} ${vehicle.make} ${vehicle.model}.`);
  }

  // Answer based on intent
  if (intents.includes("price")) {
    if (vehicle.price) {
      responses.push(`This vehicle is priced at $${vehicle.price.toLocaleString()}, which reflects its excellent condition and history.`);
      if (carfax && !carfax.damageReported) {
        responses.push(`With a clean Carfax (no accidents), this pricing represents strong value.`);
      }
    }
  }

  if (intents.includes("history") && carfax) {
    responses.push(`I can share the full Carfax report with you. Highlights: ${carfax.badges.slice(0, 3).join(", ")}.`);
  }

  if (intents.includes("photos")) {
    const count = vehicle.photos?.length || 0;
    responses.push(`We have ${count} high-resolution photos available. ${count < 10 ? "I can take additional photos of any specific area you'd like to see." : ""}`);
  }

  if (intents.includes("test_drive")) {
    responses.push(`I'd love to get you behind the wheel. When would work for a test drive?`);
  }

  // Closing based on tone
  if (tone === "urgent") {
    responses.push(`Given the interest level, I'd recommend scheduling a viewing soon. Shall we set a time?`);
  } else {
    responses.push(`Let me know if you have any other questions or if you'd like to schedule a test drive.`);
  }

  return responses.join("\n\n");
}

function detectCustomerIntent(message: string): string[] {
  const lower = message.toLowerCase();
  const intents: string[] = [];

  if (/price|cost|how much|\$/.test(lower)) intents.push("price");
  if (/history|accident|carfax|damage/.test(lower)) intents.push("history");
  if (/photo|picture|image|see/.test(lower)) intents.push("photos");
  if (/test drive|drive|try|testdrive/.test(lower)) intents.push("test_drive");
  if (/mileage|km|kilometer|miles/.test(lower)) intents.push("mileage");
  if (/payment|finance|loan|monthly/.test(lower)) intents.push("payment");
  if (/trade|trade-in|tradein/.test(lower)) intents.push("trade");
  if (/available|still|sold|hold/.test(lower)) intents.push("availability");

  return intents;
}

function calculateConfidenceScore(vehicle: AiTrainingVehicle): number {
  let score = 50;
  const { carfax } = vehicle;

  if (carfax) {
    if (!carfax.damageReported) score += 15;
    if (carfax.ownerCount === 1) score += 10;
    else if (carfax.ownerCount <= 2) score += 5;
    if (carfax.serviceRecordCount > 5) score += 10;
    if (!carfax.structuralDamage) score += 5;
    if (!carfax.totalLoss) score += 5;
    if (carfax.recallCount === 0) score += 5;
    if (carfax.buybackGuarantee) score += 5;
  }

  if (vehicle.photos && vehicle.photos.length >= 10) score += 5;
  if (vehicle.description && vehicle.description.length > 200) score += 5;

  return Math.min(100, score);
}
