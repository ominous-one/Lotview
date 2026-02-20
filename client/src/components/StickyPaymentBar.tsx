import { usePayment } from '@/contexts/PaymentContext';
import { DollarSign, TrendingUp } from 'lucide-react';

function getCreditLabel(score: number): string {
  if (score >= 720) return 'Excellent';
  if (score >= 680) return 'Good';
  if (score >= 620) return 'Fair';
  return 'Poor';
}

function getCreditColor(score: number): string {
  if (score >= 720) return 'bg-green-500/20 text-green-200';
  if (score >= 680) return 'bg-blue-500/20 text-blue-200';
  if (score >= 620) return 'bg-yellow-500/20 text-yellow-200';
  return 'bg-red-500/20 text-red-200';
}

export function StickyPaymentBar() {
  const { 
    creditScore, 
    setCreditScore, 
    downPayment, 
    setDownPayment, 
    apr,
    creditTierName,
  } = usePayment();

  return (
    <div className="fixed md:sticky bottom-0 md:top-16 left-0 right-0 z-40 bg-gradient-to-r from-primary to-blue-700 text-white shadow-lg border-t md:border-t-0 md:border-b border-blue-800">
      <div className="max-w-7xl mx-auto px-3 md:px-4 py-2 md:py-3">
        {/* Mobile: Use pr-20 to reserve space for floating chat bubble on the right */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-4 pr-16 md:pr-0">
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            <TrendingUp className="w-5 h-5" />
            <span className="font-bold text-sm">Payment Calculator</span>
          </div>

          {/* Credit Score Slider */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-0.5 md:mb-1">
              <label className="text-[10px] md:text-xs font-medium" htmlFor="credit-score">
                Credit Score: {creditScore}
              </label>
              <span className={`text-[10px] md:text-xs font-bold px-1.5 md:px-2 py-0.5 md:py-1 rounded ${getCreditColor(creditScore)}`}>
                {creditTierName}
              </span>
            </div>
            <input
              id="credit-score"
              type="range"
              min="550"
              max="850"
              step="10"
              value={creditScore}
              onChange={(e) => setCreditScore(parseInt(e.target.value))}
              className="w-full h-1.5 md:h-2 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 md:[&::-webkit-slider-thumb]:w-4 md:[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 md:[&::-moz-range-thumb]:w-4 md:[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg"
              data-testid="slider-credit-score"
            />
            <div className="flex justify-between text-[9px] md:text-xs opacity-60 mt-0.5">
              <span>550</span>
              <span className="hidden md:inline">APR: {apr}%</span>
              <span>850</span>
            </div>
          </div>

          {/* Down Payment Slider */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-0.5 md:mb-1">
              <label className="text-[10px] md:text-xs font-medium" htmlFor="down-payment">
                Down Payment
              </label>
              <span className="text-[10px] md:text-xs font-bold bg-white/20 px-1.5 md:px-2 py-0.5 md:py-1 rounded flex items-center gap-0.5 md:gap-1">
                <DollarSign className="w-2.5 h-2.5 md:w-3 md:h-3" />
                {downPayment.toLocaleString()}
              </span>
            </div>
            <input
              id="down-payment"
              type="range"
              min="0"
              max="50000"
              step="500"
              value={downPayment}
              onChange={(e) => setDownPayment(parseInt(e.target.value))}
              className="w-full h-1.5 md:h-2 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 md:[&::-webkit-slider-thumb]:w-4 md:[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-secondary [&::-webkit-slider-thumb]:shadow-lg [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 md:[&::-moz-range-thumb]:w-4 md:[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-secondary [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg"
              data-testid="slider-down-payment"
            />
            <div className="flex justify-between text-[9px] md:text-xs opacity-60 mt-0.5">
              <span>$0</span>
              <span>$50K</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
