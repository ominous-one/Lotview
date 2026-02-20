export interface Car {
  id: number;
  year: number;
  make: string;
  model: string;
  trim: string;
  highlights?: string | null;
  type: string;
  price: number;
  odometer: number;
  images: string[];
  badges: string[];
  views?: number;
  location: string;
  dealership: string;
  description: string;
  vin?: string | null;
  stockNumber?: string | null;
  cargurusPrice?: number | null;
  cargurusUrl?: string | null;
  dealRating?: string | null;
  carfaxUrl?: string | null;
  dealerVdpUrl?: string | null;
  videoUrl?: string | null;
  filterGroupId?: number | null;
}

export interface FilterState {
  type: string;
  priceMax: number;
  location: string;
  dealership: string;
  search: string;
  make: string;
  sortBy: 'default' | 'price_low' | 'price_high' | 'km_low' | 'km_high';
  filterGroup: string;
}

export interface FilterGroup {
  id: number;
  dealershipId: number;
  groupName: string;
  groupSlug: string;
  description: string | null;
  displayOrder: number;
  isDefault: boolean;
  isActive: boolean;
}

export const FINANCE_TERMS = [24, 36, 48, 60, 72, 84] as const;
export type FinanceTerm = typeof FINANCE_TERMS[number];

export function calculateMonthlyPayment(price: number, termMonths: FinanceTerm, downPayment: number = 0, apr: number = 6.99): number {
  // Cap principal at zero to prevent negative monthly payments
  const principal = Math.max(0, price - downPayment);
  
  // If principal is zero or APR is zero, return 0
  if (principal === 0 || apr === 0) {
    return 0;
  }
  
  const monthlyRate = apr / 100 / 12;
  const payment = (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
                  (Math.pow(1 + monthlyRate, termMonths) - 1);
  return Math.floor(payment);
}
