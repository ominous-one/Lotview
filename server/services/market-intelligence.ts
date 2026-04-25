/**
 * Market Intelligence Service — AI-Powered Pricing & Market Analysis
 * 
 * Provides:
 * - Price recommendations based on market data
 * - Days-on-market prediction
 * - Competitor price analysis
 * - Best time to post recommendations
 */

export interface MarketAnalysis {
  vehicleId: number;
  year: number;
  make: string;
  model: string;
  trim?: string;
  currentPrice: number;
  recommendedPrice: number;
  priceRange: [number, number]; // [low, high]
  marketAvgPrice: number;
  competitorPrices: number[];
  daysOnMarketEstimate: number;
  demandScore: number; // 0-100
  priceConfidence: number; // 0-100
  priceElasticity: number; // % change in interest per $1000 change
  seasonalityFactor: number; // 0.8-1.2 multiplier
  urgencyRecommendation: "price_drop" | "hold" | "raise" | "promote";
  reason: string;
}

export interface PriceRecommendation {
  action: "maintain" | "reduce" | "increase" | "promote";
  targetPrice: number;
  currentPrice: number;
  potentialSavings: number;
  expectedDaysToSell: number;
  confidence: number;
  reasoning: string[];
}

/**
 * Analyze market positioning for a vehicle.
 * Uses comparable sales data and inventory levels.
 */
export function analyzeMarketPosition(
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim?: string;
    price: number;
    odometer?: number;
    condition?: "excellent" | "good" | "fair" | "poor";
    carfaxScore?: number;
    photos?: number;
  },
  comparables: Array<{
    price: number;
    odometer: number;
    daysOnMarket: number;
    soldDate?: Date;
  }> = []
): MarketAnalysis {
  const now = new Date();
  const month = now.getMonth(); // 0-11

  // Seasonality: convertibles sell better in summer, SUVs in winter
  let seasonalityFactor = 1.0;
  const seasonalModels: Record<string, number[]> = {
    "convertible": [5, 6, 7, 8], // Summer
    "roadster": [5, 6, 7, 8],
    "cabriolet": [5, 6, 7, 8],
  };
  for (const [type, months] of Object.entries(seasonalModels)) {
    if (vehicle.model.toLowerCase().includes(type)) {
      seasonalityFactor = months.includes(month) ? 1.15 : 0.85;
    }
  }
  // SUVs/trucks better in winter
  if (vehicle.model.toLowerCase().includes("suv") ||
      vehicle.model.toLowerCase().includes("truck") ||
      vehicle.model.toLowerCase().includes("awd") ||
      vehicle.model.toLowerCase().includes("4x4")) {
    seasonalityFactor = [10, 11, 0, 1, 2].includes(month) ? 1.1 : 0.95;
  }

  // Base price calculation from comparables
  let marketAvgPrice = vehicle.price;
  let priceRange: [number, number] = [vehicle.price * 0.9, vehicle.price * 1.1];

  if (comparables.length > 0) {
    const prices = comparables.map(c => c.price).sort((a, b) => a - b);
    marketAvgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
    priceRange = [prices[Math.floor(prices.length * 0.25)], prices[Math.floor(prices.length * 0.75)]];
  }

  // Adjust for mileage
  const mileageAdjustment = vehicle.odometer
    ? Math.max(-0.15, Math.min(0.05, (50000 - vehicle.odometer) / 500000))
    : 0;

  // Adjust for condition
  const conditionMultiplier: Record<string, number> = {
    excellent: 1.05,
    good: 1.0,
    fair: 0.9,
    poor: 0.8,
  };
  const conditionMult = conditionMultiplier[vehicle.condition || "good"] || 1.0;

  // Adjust for Carfax score
  const carfaxMult = vehicle.carfaxScore ? (vehicle.carfaxScore / 100) * 0.1 + 0.95 : 1.0;

  // Adjust for photos
  const photoMult = vehicle.photos && vehicle.photos >= 15 ? 1.03 : 1.0;

  const recommendedPrice = Math.round(
    marketAvgPrice * seasonalityFactor * (1 + mileageAdjustment) * conditionMult * carfaxMult * photoMult
  );

  // Demand score based on comparable days on market
  let demandScore = 50;
  if (comparables.length > 0) {
    const avgDays = comparables.reduce((s, c) => s + c.daysOnMarket, 0) / comparables.length;
    demandScore = Math.max(10, Math.min(95, 100 - avgDays));
  }

  // Days on market estimate
  const daysEstimate = Math.round(30 + (100 - demandScore) * 0.5);

  // Price confidence
  const priceDiff = Math.abs(vehicle.price - recommendedPrice) / recommendedPrice;
  const priceConfidence = Math.max(50, Math.min(95, 100 - priceDiff * 100));

  // Elasticity: how sensitive buyers are to price
  const priceElasticity = demandScore > 70 ? 2.5 : demandScore > 40 ? 1.5 : 0.8;

  // Urgency recommendation
  let urgency: MarketAnalysis["urgencyRecommendation"];
  let reason: string;

  if (vehicle.price > recommendedPrice * 1.08) {
    urgency = "price_drop";
    reason = `Priced ${Math.round((vehicle.price / recommendedPrice - 1) * 100)}% above market. Consider reducing to $${recommendedPrice.toLocaleString()} for faster sale.`;
  } else if (vehicle.price < recommendedPrice * 0.92) {
    urgency = "raise";
    reason = `Priced below market. Room to increase to $${recommendedPrice.toLocaleString()} without losing competitiveness.`;
  } else if (demandScore < 30) {
    urgency = "promote";
    reason = `Low demand in current market. Consider promotions or feature in email campaigns.`;
  } else {
    urgency = "hold";
    reason = `Well-positioned in market. Monitor for ${daysEstimate} days before adjusting.`;
  }

  return {
    vehicleId: 0,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    currentPrice: vehicle.price,
    recommendedPrice,
    priceRange,
    marketAvgPrice,
    competitorPrices: comparables.map(c => c.price),
    daysOnMarketEstimate: daysEstimate,
    demandScore,
    priceConfidence,
    priceElasticity,
    seasonalityFactor,
    urgencyRecommendation: urgency,
    reason,
  };
}

/**
 * Get price recommendation with detailed reasoning.
 */
export function getPriceRecommendation(
  vehicle: Parameters<typeof analyzeMarketPosition>[0],
  comparables: Parameters<typeof analyzeMarketPosition>[1] = []
): PriceRecommendation {
  const analysis = analyzeMarketPosition(vehicle, comparables);

  const reasoning: string[] = [];
  reasoning.push(analysis.reason);

  if (analysis.seasonalityFactor > 1.05) {
    reasoning.push(`Seasonal demand is strong (${Math.round((analysis.seasonalityFactor - 1) * 100)}% above baseline).`);
  } else if (analysis.seasonalityFactor < 0.95) {
    reasoning.push(`Seasonal demand is soft (${Math.round((1 - analysis.seasonalityFactor) * 100)}% below baseline).`);
  }

  if (analysis.demandScore < 40) {
    reasoning.push(`Low market demand (${analysis.demandScore}/100). Consider aggressive pricing or promotions.`);
  } else if (analysis.demandScore > 70) {
    reasoning.push(`Strong market demand (${analysis.demandScore}/100). Pricing power is favorable.`);
  }

  const diff = analysis.recommendedPrice - analysis.currentPrice;
  const action: PriceRecommendation["action"] =
    diff > 1000 ? "increase" :
    diff < -1000 ? "reduce" :
    analysis.demandScore < 30 ? "promote" : "maintain";

  return {
    action,
    targetPrice: analysis.recommendedPrice,
    currentPrice: analysis.currentPrice,
    potentialSavings: Math.abs(diff),
    expectedDaysToSell: analysis.daysOnMarketEstimate,
    confidence: analysis.priceConfidence,
    reasoning,
  };
}

/**
 * Generate urgency language based on market position.
 */
export function generateUrgencyLanguage(analysis: MarketAnalysis): string {
  const lines: string[] = [];

  if (analysis.demandScore > 75) {
    lines.push(`High demand alert: ${analysis.make} ${analysis.model} vehicles are moving fast right now.`);
    lines.push(`This price is competitive — similar vehicles are selling within ${Math.round(analysis.daysOnMarketEstimate * 0.7)} days.`);
  } else if (analysis.demandScore < 35) {
    lines.push(`Limited-time pricing: We've adjusted this ${analysis.make} ${analysis.model} below market to move it quickly.`);
    lines.push(`At $${analysis.currentPrice.toLocaleString()}, this is ${Math.round((1 - analysis.currentPrice / analysis.marketAvgPrice) * 100)}% below the market average of $${Math.round(analysis.marketAvgPrice).toLocaleString()}.`);
  }

  if (analysis.seasonalityFactor > 1.08) {
    lines.push(`Peak season pricing: Now is the best time of year to buy this type of vehicle.`);
  }

  return lines.join("\n");
}
