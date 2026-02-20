import { useState, useMemo, useEffect } from "react";
import { Car, calculateMonthlyPayment } from "@/lib/types";
import { MapPin, Flame, Info, ChevronLeft, ChevronRight, Ban, Shield, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { usePayment, type FinanceTerm } from "@/contexts/PaymentContext";
import { trackCTAClick } from "@/lib/tracking";

// Helper to get working image URL
// AutoTrader CDN returns 404 for resize params (w=, h=), but quality/fit work fine
function getProxiedImageUrl(url: string): string {
  if (!url) return '/placeholder-car.jpg';
  
  // For AutoTrader CDN, strip resize params (w, h) which cause 404, keep quality/fit
  if (url.includes('autotradercdn.ca')) {
    try {
      const urlObj = new URL(url);
      // Remove problematic resize params that cause 404
      urlObj.searchParams.delete('w');
      urlObj.searchParams.delete('h');
      urlObj.searchParams.delete('auto'); // webp conversion also seems problematic
      // Keep quality and fit params which work fine
      return urlObj.toString();
    } catch {
      return url;
    }
  }
  
  // For other CDNs that might need proxying
  const needsProxy = url.includes('cargurus.com') || url.includes('cargurus.ca');
  if (needsProxy) {
    return `/api/public/image-proxy?url=${encodeURIComponent(url)}`;
  }
  
  return url;
}

interface VehicleCardProps {
  car: Car;
}

export function VehicleCard({ car }: VehicleCardProps) {
  const { downPayment, apr, selectedTerm, getAvailableTerms, getMaxTerm } = usePayment();
  const [, setLocation] = useLocation();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Get available terms for this vehicle based on its year
  const availableTerms = useMemo(() => getAvailableTerms(car.year), [car.year, getAvailableTerms]);
  
  // Use the global selected term, but clamp to max available for this vehicle
  const effectiveTerm = useMemo(() => {
    if (availableTerms.includes(selectedTerm)) {
      return selectedTerm;
    }
    // Fall back to the max available term for this vehicle
    return getMaxTerm(car.year);
  }, [selectedTerm, availableTerms, car.year, getMaxTerm]);
  
  // Local term override for this card (allows user to select different term within available options)
  const [localTerm, setLocalTerm] = useState<FinanceTerm | null>(null);
  
  // Reset local term when global term changes
  useEffect(() => {
    setLocalTerm(null);
  }, [selectedTerm]);
  
  // Use local term if set, otherwise use effective term
  const displayTerm = localTerm ?? effectiveTerm;
  
  const monthlyPayment = calculateMonthlyPayment(car.price, displayTerm, downPayment, apr);
  
  const nextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % car.images.length);
  };
  
  const prevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + car.images.length) % car.images.length);
  };

  // Parse badges to identify special badges
  const hasNoAccidents = car.badges.some(b => 
    b.toLowerCase().includes('no accident') || 
    b.toLowerCase().includes('clean history') ||
    b.toLowerCase().includes('accident-free')
  );
  const isOneOwner = car.badges.some(b => 
    b.toLowerCase().includes('one owner') || 
    b.toLowerCase().includes('1 owner') ||
    b.toLowerCase().includes('single owner')
  );
  const otherBadges = car.badges.filter(b => 
    !b.toLowerCase().includes('accident') && 
    !b.toLowerCase().includes('owner') &&
    !b.toLowerCase().includes('clean history')
  );

  return (
    <Link href={`/vehicle/${car.id}`}>
      <div className="group bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-border cursor-pointer h-full flex flex-col">
        {/* Image Container with Carousel */}
        <div className="relative aspect-[4/3] overflow-hidden">
          <img 
            src={getProxiedImageUrl(car.images[currentImageIndex])} 
            alt={`${car.year} ${car.make} ${car.model}`}
            className="w-full h-full object-cover transition-all duration-300"
            data-testid={`img-vehicle-${car.id}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80"></div>
          
          {/* Image Navigation Arrows - only show if multiple images */}
          {car.images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`button-prev-image-${car.id}`}
              >
                <ChevronLeft className="w-4 h-4 text-foreground" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`button-next-image-${car.id}`}
              >
                <ChevronRight className="w-4 h-4 text-foreground" />
              </button>
              
              {/* Image Indicators */}
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-1">
                {car.images.slice(0, 10).map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      idx === currentImageIndex ? 'bg-white w-4' : 'bg-white/50'
                    }`}
                  />
                ))}
                {car.images.length > 10 && (
                  <span className="text-white/70 text-[10px] ml-1">+{car.images.length - 10}</span>
                )}
              </div>
            </>
          )}
          
          {/* Feature Badges - Top Left */}
          <div className="absolute top-3 right-3 flex flex-wrap gap-1 justify-end max-w-[70%]">
            {car.dealRating && (
              <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg">
                {car.dealRating}
              </span>
            )}
            {hasNoAccidents && (
              <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                <Shield className="w-3 h-3" />
                No Accidents
              </span>
            )}
            {isOneOwner && (
              <span className="bg-blue-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1">
                <User className="w-3 h-3" />
                One Owner
              </span>
            )}
            {otherBadges.slice(0, 2).map((badge, i) => (
              <span key={i} className="bg-white/90 backdrop-blur-sm text-[10px] font-bold px-2 py-1 rounded text-primary shadow-sm flex items-center gap-1">
                <Flame className="w-3 h-3 text-orange-500" />
                {badge}
              </span>
            ))}
          </div>

          {/* Price Overlay */}
          <div className="absolute bottom-0 w-full p-4 text-white">
            <div className="flex justify-between items-end mb-2">
              {car.price > 0 ? (
                <>
                  <div>
                    <p className="text-2xl font-black">${monthlyPayment}<span className="text-xs font-normal opacity-70">/mo</span></p>
                    <p className="text-xs font-bold text-secondary">{displayTerm} months @ {apr}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">${car.price.toLocaleString()}</p>
                    <p className="text-[10px] opacity-70">Cash Price</p>
                  </div>
                </>
              ) : (
                <div className="w-full text-center">
                  <p className="text-xl font-bold">Contact for Price</p>
                  <p className="text-xs opacity-70">Call for details</p>
                </div>
              )}
            </div>
            
            {/* Term Selector - Only shows available terms for this vehicle (hide for Contact for Price) */}
            {car.price > 0 && (
              <>
                <div className="flex gap-1" onClick={(e) => e.preventDefault()}>
                  {availableTerms.map(term => (
                    <button
                      key={term}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLocalTerm(term); }}
                      className={`flex-1 py-1 rounded text-[10px] font-bold transition ${
                        displayTerm === term 
                          ? 'bg-secondary text-white' 
                          : 'bg-white/20 text-white/70 hover:bg-white/30'
                      }`}
                      data-testid={`button-term-${term}-vehicle-${car.id}`}
                    >
                      {term}mo
                    </button>
                  ))}
                </div>
                
                {/* Show max term message for older vehicles */}
                {availableTerms.length < 5 && (
                  <p className="text-[9px] text-white/50 mt-1 text-center">
                    Max {Math.max(...availableTerms)} months for {car.year} model year
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 flex flex-col">
          <div className="mb-3">
            <h3 className="text-lg font-bold text-foreground leading-tight" data-testid={`text-title-${car.id}`}>
              {car.year} {car.make} {car.model}
            </h3>
            {car.trim && (
              <p className="text-sm font-semibold text-primary mt-0.5" data-testid={`text-trim-${car.id}`}>{car.trim}</p>
            )}
            {car.highlights && (
              <p className="text-[11px] font-bold text-muted-foreground mt-1 uppercase tracking-wide leading-tight" data-testid={`text-highlights-${car.id}`}>
                {car.highlights}
              </p>
            )}
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {car.dealership}
              </span>
            </div>
          </div>

          <div className="mt-auto pt-3 border-t border-border flex justify-between items-center text-xs text-muted-foreground font-medium">
            <div className="flex items-center gap-1">
              <Info className="w-3 h-3" />
              {car.odometer.toLocaleString()} km
            </div>
            {car.views !== undefined && car.views > 0 && (
              <div className="flex items-center gap-1 text-orange-500">
                <Flame className="w-3 h-3" />
                {car.views} views (24h)
              </div>
            )}
          </div>
          
          {/* Dual CTA Buttons */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button 
              onClick={(e) => { 
                e.preventDefault(); 
                e.stopPropagation(); 
                trackCTAClick('test_drive', car);
                setLocation(`/vehicle/${car.id}?action=test-drive`);
              }}
              className="bg-primary text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-900 transition"
              data-testid={`button-test-drive-${car.id}`}
            >
              Book Test Drive
            </button>
            <button 
              onClick={(e) => { 
                e.preventDefault(); 
                e.stopPropagation(); 
                trackCTAClick('reserve', car);
                setLocation(`/vehicle/${car.id}?action=reserve`);
              }}
              className="bg-secondary text-white py-2 rounded-lg text-xs font-bold hover:bg-cyan-600 transition"
              data-testid={`button-reserve-${car.id}`}
            >
              Reserve Vehicle
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
