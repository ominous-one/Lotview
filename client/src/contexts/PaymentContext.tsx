import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFinancingRules, type FinancingRules, type CreditTier, type ModelYearTerm } from '@/lib/api';

export type FinanceTerm = 24 | 36 | 48 | 60 | 72 | 84;
export const ALL_TERMS: FinanceTerm[] = [24, 36, 48, 60, 72, 84];

interface PaymentContextType {
  creditScore: number;
  setCreditScore: (score: number) => void;
  downPayment: number;
  setDownPayment: (amount: number) => void;
  selectedTerm: FinanceTerm;
  setSelectedTerm: (term: FinanceTerm) => void;
  apr: number;
  creditTierName: string;
  getAvailableTerms: (vehicleYear: number) => FinanceTerm[];
  getMaxTerm: (vehicleYear: number) => FinanceTerm;
  financingRules: FinancingRules | null;
  isLoading: boolean;
}

const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

// Default fallback values if API fails
const DEFAULT_CREDIT_TIERS: CreditTier[] = [
  { tierName: 'Excellent', minScore: 720, maxScore: 850, interestRate: 5.99 },
  { tierName: 'Good', minScore: 680, maxScore: 719, interestRate: 7.99 },
  { tierName: 'Fair', minScore: 620, maxScore: 679, interestRate: 9.99 },
  { tierName: 'Poor', minScore: 300, maxScore: 619, interestRate: 12.99 },
];

const DEFAULT_MODEL_YEAR_TERMS: ModelYearTerm[] = [
  { minModelYear: 2025, maxModelYear: 2099, availableTerms: [24, 36, 48, 60, 72, 84] },
  { minModelYear: 2022, maxModelYear: 2024, availableTerms: [24, 36, 48, 60, 72] },
  { minModelYear: 2018, maxModelYear: 2021, availableTerms: [24, 36, 48, 60] },
  { minModelYear: 2010, maxModelYear: 2017, availableTerms: [24, 36, 48] },
];

export function PaymentProvider({ children }: { children: ReactNode }) {
  const [creditScore, setCreditScore] = useState(700);
  const [downPayment, setDownPayment] = useState(0);
  const [selectedTerm, setSelectedTerm] = useState<FinanceTerm>(72);

  // Fetch financing rules from database
  const { data: financingRules, isLoading } = useQuery({
    queryKey: ['financing-rules'],
    queryFn: getFinancingRules,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
  });

  // Get credit tiers (use defaults if not available)
  const creditTiers = useMemo(() => 
    financingRules?.creditTiers ?? DEFAULT_CREDIT_TIERS,
    [financingRules]
  );

  // Get model year terms (use defaults if not available)
  const modelYearTerms = useMemo(() => 
    financingRules?.modelYearTerms ?? DEFAULT_MODEL_YEAR_TERMS,
    [financingRules]
  );

  // Find the tier matching the current credit score
  const currentTier = useMemo(() => {
    const tier = creditTiers.find(
      t => creditScore >= t.minScore && creditScore <= t.maxScore
    );
    return tier ?? creditTiers[creditTiers.length - 1]; // Fallback to lowest tier
  }, [creditScore, creditTiers]);

  const apr = currentTier?.interestRate ?? 9.99;
  const creditTierName = currentTier?.tierName ?? 'Fair';

  // Get available terms for a specific vehicle year
  const getAvailableTerms = useCallback((vehicleYear: number): FinanceTerm[] => {
    const termRule = modelYearTerms.find(
      t => vehicleYear >= t.minModelYear && vehicleYear <= t.maxModelYear
    );
    
    if (!termRule) {
      // Very old vehicles get shortest terms
      return [36, 48];
    }
    
    return termRule.availableTerms.filter(
      (t): t is FinanceTerm => ALL_TERMS.includes(t as FinanceTerm)
    );
  }, [modelYearTerms]);

  // Get max term for a specific vehicle year
  const getMaxTerm = useCallback((vehicleYear: number): FinanceTerm => {
    const terms = getAvailableTerms(vehicleYear);
    return Math.max(...terms) as FinanceTerm;
  }, [getAvailableTerms]);

  return (
    <PaymentContext.Provider 
      value={{ 
        creditScore, 
        setCreditScore, 
        downPayment, 
        setDownPayment, 
        selectedTerm,
        setSelectedTerm,
        apr,
        creditTierName,
        getAvailableTerms,
        getMaxTerm,
        financingRules: financingRules ?? null,
        isLoading,
      }}
    >
      {children}
    </PaymentContext.Provider>
  );
}

export function usePayment() {
  const context = useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayment must be used within PaymentProvider');
  }
  return context;
}
