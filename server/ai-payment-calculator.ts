import { storage } from "./storage";
import type { CreditScoreTier, ModelYearTerm, DealershipFee } from "@shared/schema";

export interface PaymentResult {
  monthlyPayment: number;
  biweeklyPayment: number;
  totalFinanced: number;
  totalFees: number;
  interestRate: number;
  termMonths: number;
  tierName: string;
  feeBreakdown: { name: string; amount: number }[];
}

export interface PaymentSummary {
  vehiclePrice: number;
  payments: PaymentResult[];
  availableTerms: number[];
  creditTier: CreditScoreTier;
  disclaimer: string;
}

/**
 * Calculate monthly payment using standard amortization formula.
 * P = L[c(1+c)^n] / [(1+c)^n - 1]
 * where L = loan amount, c = monthly interest rate, n = number of payments
 */
function calculateMonthlyPayment(principal: number, annualRateBps: number, termMonths: number): number {
  const annualRate = annualRateBps / 10000; // basis points to decimal (575 -> 0.0575)
  const monthlyRate = annualRate / 12;

  if (monthlyRate === 0) {
    return principal / termMonths;
  }

  const factor = Math.pow(1 + monthlyRate, termMonths);
  return (principal * monthlyRate * factor) / (factor - 1);
}

/**
 * Get available loan terms for a vehicle's model year.
 */
async function getAvailableTerms(dealershipId: number, modelYear: number): Promise<number[]> {
  const yearTerms = await storage.getModelYearTerms(dealershipId);
  const activeTerms = yearTerms.filter(t => t.isActive);

  for (const term of activeTerms) {
    if (modelYear >= term.minModelYear && modelYear <= term.maxModelYear) {
      return term.availableTerms.map(t => parseInt(t)).filter(t => !isNaN(t)).sort((a, b) => a - b);
    }
  }

  // Default terms if no rule matches
  return [36, 48, 60, 72, 84];
}

/**
 * Get the credit score tier for a given score.
 */
async function getCreditTier(dealershipId: number, creditScore?: number): Promise<CreditScoreTier | undefined> {
  const tiers = await storage.getCreditScoreTiers(dealershipId);
  const activeTiers = tiers.filter(t => t.isActive);

  if (activeTiers.length === 0) return undefined;

  // If no score provided, return the "Good" tier or the middle tier
  if (!creditScore) {
    const goodTier = activeTiers.find(t => t.tierName.toLowerCase() === 'good');
    if (goodTier) return goodTier;
    // Sort by rate ascending and pick the middle one
    const sorted = [...activeTiers].sort((a, b) => a.interestRate - b.interestRate);
    return sorted[Math.floor(sorted.length / 2)];
  }

  // Find the tier that matches the score
  for (const tier of activeTiers) {
    if (creditScore >= tier.minScore && creditScore <= tier.maxScore) {
      return tier;
    }
  }

  // Fallback to lowest qualifying tier
  const sorted = [...activeTiers].sort((a, b) => a.minScore - b.minScore);
  return sorted[sorted.length - 1]; // worst tier as fallback
}

/**
 * Calculate total fees for a vehicle at a dealership.
 */
async function calculateFees(dealershipId: number, vehiclePrice: number): Promise<{ total: number; breakdown: { name: string; amount: number }[] }> {
  const fees = await storage.getDealershipFees(dealershipId);
  const activeFees = fees.filter(f => f.isActive && f.includeInPayment);

  let total = 0;
  const breakdown: { name: string; amount: number }[] = [];

  for (const fee of activeFees) {
    let amount: number;
    if (fee.isPercentage) {
      // feeAmount is percentage * 100 (e.g., 150 = 1.5%)
      amount = vehiclePrice * (fee.feeAmount / 10000);
    } else {
      // feeAmount is in cents
      amount = fee.feeAmount / 100;
    }
    total += amount;
    breakdown.push({ name: fee.feeName, amount: Math.round(amount * 100) / 100 });
  }

  return { total: Math.round(total * 100) / 100, breakdown };
}

/**
 * Calculate full payment options for a vehicle.
 */
export async function calculatePayments(
  dealershipId: number,
  vehiclePrice: number,
  modelYear: number,
  creditScore?: number
): Promise<PaymentSummary | null> {
  const creditTier = await getCreditTier(dealershipId, creditScore);
  if (!creditTier) return null;

  const availableTerms = await getAvailableTerms(dealershipId, modelYear);
  const { total: totalFees, breakdown: feeBreakdown } = await calculateFees(dealershipId, vehiclePrice);

  const totalFinanced = vehiclePrice + totalFees;

  const payments: PaymentResult[] = availableTerms.map(termMonths => {
    const monthly = calculateMonthlyPayment(totalFinanced, creditTier.interestRate, termMonths);
    const biweekly = (monthly * 12) / 26; // 26 bi-weekly periods per year

    return {
      monthlyPayment: Math.round(monthly * 100) / 100,
      biweeklyPayment: Math.round(biweekly * 100) / 100,
      totalFinanced: Math.round(totalFinanced * 100) / 100,
      totalFees: Math.round(totalFees * 100) / 100,
      interestRate: creditTier.interestRate / 100, // basis points to percentage (575 -> 5.75)
      termMonths,
      tierName: creditTier.tierName,
      feeBreakdown,
    };
  });

  return {
    vehiclePrice,
    payments,
    availableTerms,
    creditTier,
    disclaimer: "Payments are estimates only. Final terms subject to credit approval. OAC. Taxes and licensing extra.",
  };
}

/**
 * Format a payment result into a concise string for AI responses.
 */
export function formatPaymentForChat(vehiclePrice: number, payment: PaymentResult): string {
  const rate = (payment.interestRate).toFixed(2);
  return `$${Math.round(payment.monthlyPayment).toLocaleString()}/mo or $${Math.round(payment.biweeklyPayment).toLocaleString()} bi-weekly over ${payment.termMonths} months at ${rate}% (${payment.tierName} credit). Total financed: $${Math.round(payment.totalFinanced).toLocaleString()} including fees. OAC.`;
}

/**
 * Build a payment summary string the AI can include in its context.
 */
export async function buildPaymentContext(
  dealershipId: number,
  vehiclePrice: number,
  modelYear: number
): Promise<string> {
  const summary = await calculatePayments(dealershipId, vehiclePrice, modelYear);
  if (!summary) {
    return "Payment calculation unavailable — financing rules not configured for this dealership.";
  }

  const lines = [`Vehicle Price: $${vehiclePrice.toLocaleString()} CAD`];

  if (summary.payments.length > 0) {
    // Show the most popular term (72 months) or the longest available
    const preferredTerms = [72, 60, 84, 48];
    let featured: PaymentResult | undefined;
    for (const term of preferredTerms) {
      featured = summary.payments.find(p => p.termMonths === term);
      if (featured) break;
    }
    if (!featured) featured = summary.payments[summary.payments.length - 1];

    lines.push(`Estimated Payment (${featured.tierName} credit, ${featured.interestRate.toFixed(2)}%): ~$${Math.round(featured.monthlyPayment)}/mo or ~$${Math.round(featured.biweeklyPayment)} bi-weekly over ${featured.termMonths} months`);

    // Fee breakdown
    if (featured.feeBreakdown.length > 0) {
      const feeStr = featured.feeBreakdown.map(f => `${f.name}: $${f.amount.toLocaleString()}`).join(', ');
      lines.push(`Fees included: ${feeStr}`);
    }

    // Other term options
    const otherTerms = summary.payments.filter(p => p.termMonths !== featured!.termMonths);
    if (otherTerms.length > 0) {
      const otherStr = otherTerms.map(p => `${p.termMonths}mo: ~$${Math.round(p.monthlyPayment)}/mo`).join(' | ');
      lines.push(`Other term options: ${otherStr}`);
    }
  }

  lines.push(summary.disclaimer);

  return lines.join('\n');
}
