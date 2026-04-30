/**
 * Stub: AI Payment Calculator
 */
export async function calculatePayment(price: number, downPayment: number, rate: number, term: number): Promise<number> {
  const principal = price - downPayment;
  const monthlyRate = rate / 12 / 100;
  const numPayments = term * 12;
  return principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments) / (Math.pow(1 + monthlyRate, numPayments) - 1);
}

export async function calculatePayments(..._args: unknown[]): Promise<any> {
  return null;
}

export function formatPaymentForChat(_payments: unknown): string {
  return "Payment options are not configured for this dealership.";
}

export async function buildPaymentContext(..._args: unknown[]): Promise<string | undefined> {
  return undefined;
}
