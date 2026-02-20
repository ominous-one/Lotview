import { useState, useEffect, useCallback, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { ChatBot } from "@/components/ChatBot";
import { getVehicleById, trackVehicleView } from "@/lib/api";
import { calculateMonthlyPayment } from "@/lib/types";
import { ArrowLeft, Calendar, CheckCircle2, MapPin, Gauge, Flame, Share2, Heart, ChevronLeft, ChevronRight, DollarSign, Car, FileText, ExternalLink, Settings, Fuel, ShieldCheck, ChevronDown, Wrench, Sparkles, Music, Armchair } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { usePayment, type FinanceTerm } from "@/contexts/PaymentContext";
import { useChat } from "@/contexts/ChatContext";
import { trackVehicleView as trackGTMVehicleView, trackCTAClick, trackPaymentCalculation } from "@/lib/tracking";
import useEmblaCarousel from 'embla-carousel-react';

// Helper function to get working image URL
// AutoTrader CDN returns 404 for resize params (w=, h=), but quality/fit work fine
function upgradeImageUrl(url: string): string {
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
  
  // For other CDNs that might need proxying (hotlink protection bypass)
  const needsProxy = url.includes('cargurus.com') || url.includes('cargurus.ca');
  if (needsProxy) {
    return `/api/public/image-proxy?url=${encodeURIComponent(url)}`;
  }
  
  return url;
}

export default function VehicleDetail() {
  const [match, params] = useRoute("/vehicle/:id");
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { downPayment, apr, selectedTerm: globalTerm, getAvailableTerms, getMaxTerm } = usePayment();
  const { openChat } = useChat();
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random()}`);
  const [localTerm, setLocalTerm] = useState<FinanceTerm | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [expandedSpecs, setExpandedSpecs] = useState<string[]>([]);

  const vehicleId = Number(params?.id);
  
  // Read action from query parameter - reactive to location changes
  const action = new URLSearchParams(location.split('?')[1]).get('action');

  const { data: car, isLoading } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => getVehicleById(vehicleId),
    enabled: !!vehicleId,
  });

  const trackViewMutation = useMutation({
    mutationFn: () => trackVehicleView(vehicleId, sessionId),
  });

  // Embla Carousel hooks
  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentImageIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (car) {
      // Track view for remarketing after 2 seconds
      const timer = setTimeout(() => {
        trackViewMutation.mutate();
        trackGTMVehicleView(car); // GTM tracking
        console.log(`Tracked view for vehicle ${car.id} for remarketing.`);
      }, 2000);
      
      // Check if vehicle is liked
      const likedVehicles = JSON.parse(localStorage.getItem('likedVehicles') || '[]');
      setIsLiked(likedVehicles.includes(car.id));
      
      return () => clearTimeout(timer);
    }
  }, [car]);

  const handleShare = async () => {
    if (!car) return;
    
    const shareData = {
      title: `${car.year} ${car.make} ${car.model}`,
      text: `Check out this ${car.year} ${car.make} ${car.model} for $${car.price.toLocaleString()}`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        toast({
          title: "Shared successfully!",
          description: "Thanks for sharing this vehicle.",
        });
      } else {
        // Fallback: copy link to clipboard
        await navigator.clipboard.writeText(window.location.href);
        toast({
          title: "Link copied!",
          description: "Share link has been copied to your clipboard.",
        });
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error sharing:', error);
      }
    }
  };

  const handleLike = () => {
    if (!car) return;
    
    const likedVehicles = JSON.parse(localStorage.getItem('likedVehicles') || '[]');
    
    if (isLiked) {
      // Remove from liked
      const updated = likedVehicles.filter((id: number) => id !== car.id);
      localStorage.setItem('likedVehicles', JSON.stringify(updated));
      setIsLiked(false);
      toast({
        title: "Removed from favorites",
        description: "This vehicle has been removed from your favorites.",
      });
    } else {
      // Add to liked
      likedVehicles.push(car.id);
      localStorage.setItem('likedVehicles', JSON.stringify(likedVehicles));
      setIsLiked(true);
      toast({
        title: "Added to favorites!",
        description: "This vehicle has been saved to your favorites.",
      });
    }
  };

  const handleAction = (actionType: string) => {
    if (!car) return;
    
    // Map action text to tracking type and chat message
    const ctaMap: Record<string, { trackingType: string; message: string }> = {
      'Get Pre-Approved': {
        trackingType: 'get_approved',
        message: `I'd like to get pre-approved for financing on the ${car.year} ${car.make} ${car.model}.`
      },
      'Book Test Drive': {
        trackingType: 'test_drive',
        message: `I'd like to book a test drive for the ${car.year} ${car.make} ${car.model}.`
      },
      'Value Your Trade-in': {
        trackingType: 'value_trade',
        message: `I'd like to get a trade-in value for my vehicle toward the ${car.year} ${car.make} ${car.model}.`
      },
      'Reserve Vehicle': {
        trackingType: 'reserve',
        message: `I'd like to reserve the ${car.year} ${car.make} ${car.model}.`
      },
    };
    
    const ctaData = ctaMap[actionType];
    if (ctaData) {
      // Track CTA click in GTM
      trackCTAClick(ctaData.trackingType as any, car);
      
      // Open chat widget with pre-filled message
      openChat(ctaData.message);
    }
  };

  // IMPORTANT: All hooks must be called before any early returns to follow React's Rules of Hooks
  // Get available terms for this vehicle based on its year (handles null car)
  const availableTerms = useMemo(() => {
    if (!car) return [36, 48, 60, 72, 84] as FinanceTerm[];
    return getAvailableTerms(car.year);
  }, [car, getAvailableTerms]);
  
  // Use the global selected term, but clamp to max available for this vehicle
  const effectiveTerm = useMemo(() => {
    if (!car) return globalTerm;
    if (availableTerms.includes(globalTerm)) {
      return globalTerm;
    }
    return getMaxTerm(car.year);
  }, [globalTerm, availableTerms, car, getMaxTerm]);
  
  // Use local term if set, otherwise use effective term
  const selectedTerm = localTerm ?? effectiveTerm;

  // Calculate monthly payment (handles null car)
  const monthlyPayment = useMemo(() => {
    if (!car) return 0;
    return calculateMonthlyPayment(car.price, selectedTerm, downPayment, apr);
  }, [car, selectedTerm, downPayment, apr]);

  // Parse tech specs JSON
  interface TechSpecs {
    features?: string[];
    mechanical?: string[];
    exterior?: string[];
    interior?: string[];
    entertainment?: string[];
    safety?: string[];
  }
  
  const techSpecs: TechSpecs | null = useMemo(() => {
    if (!car?.techSpecs) return null;
    try {
      return JSON.parse(car.techSpecs);
    } catch {
      return null;
    }
  }, [car?.techSpecs]);

  const toggleSpecSection = (section: string) => {
    setExpandedSpecs(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!car) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Vehicle not found</h1>
          <button onClick={() => setLocation("/")} className="text-primary hover:underline">
            Back to Inventory
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-28 pb-20 px-4 max-w-7xl mx-auto">
        <button 
          onClick={() => setLocation("/")}
          className="mb-6 flex items-center gap-2 text-muted-foreground hover:text-primary transition font-medium"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Inventory
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Full Carousel */}
          <div className="space-y-4">
            {/* Main Carousel - Swipeable */}
            <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-lg relative group">
              <div className="overflow-hidden h-full" ref={emblaRef}>
                <div className="flex h-full">
                  {car.images.map((img, index) => (
                    <div key={index} className="flex-[0_0_100%] min-w-0">
                      <img 
                        src={upgradeImageUrl(img) || '/placeholder-car.jpg'} 
                        alt={`${car.model} - Image ${index + 1}`} 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Dealership Badge */}
              <div className="absolute top-4 left-4 z-10">
                <span className="bg-primary text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {car.dealership}
                </span>
              </div>

              {/* CarGurus Deal Rating Badge */}
              {car.dealRating && (
                <div className="absolute top-4 left-4 mt-12 z-10">
                  <span className="bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                    {car.dealRating}
                  </span>
                </div>
              )}

              <div className="absolute top-4 right-4 flex gap-2 z-10">
                <button 
                  onClick={handleLike}
                  className={`p-2 bg-white/90 backdrop-blur rounded-full transition shadow-sm ${
                    isLiked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500'
                  }`}
                  data-testid="button-like-vehicle"
                >
                  <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
                </button>
                <button 
                  onClick={handleShare}
                  className="p-2 bg-white/90 backdrop-blur rounded-full text-muted-foreground hover:text-primary transition shadow-sm"
                  data-testid="button-share-vehicle"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </div>

              {/* Carousel Navigation - Always Visible on Mobile */}
              {car.images.length > 1 && (
                <>
                  <button
                    onClick={scrollPrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-foreground md:opacity-0 md:group-hover:opacity-100 transition shadow-lg hover:scale-110 z-10"
                    data-testid="button-prev-image"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={scrollNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-foreground md:opacity-0 md:group-hover:opacity-100 transition shadow-lg hover:scale-110 z-10"
                    data-testid="button-next-image"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}

              {/* Image Indicators */}
              {car.images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                  {car.images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => emblaApi?.scrollTo(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === currentImageIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/50'
                      }`}
                      data-testid={`indicator-image-${i}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* AI-Generated Vehicle Video (Gemini Veo) */}
            {car.videoUrl && (
              <div className="aspect-video rounded-2xl overflow-hidden shadow-lg relative group bg-black">
                <video 
                  src={`/${car.videoUrl}`}
                  controls
                  loop
                  muted
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                  data-testid="video-vehicle-showcase"
                />
                <div className="absolute top-4 left-4 z-10">
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                    </svg>
                    AI-Generated Video
                  </span>
                </div>
              </div>
            )}

            {/* Thumbnail Grid - Sliding window that follows carousel position */}
            <div className="grid grid-cols-5 gap-2">
              {(() => {
                const totalImages = car.images.length;
                const windowSize = 5;
                // Calculate start index to center current image when possible
                let start = Math.max(0, currentImageIndex - 2);
                if (start + windowSize > totalImages) {
                  start = Math.max(0, totalImages - windowSize);
                }
                const visibleImages = car.images.slice(start, start + windowSize);
                
                return visibleImages.map((img, idx) => {
                  const actualIndex = start + idx;
                  return (
                    <button
                      key={actualIndex}
                      onClick={() => {
                        setCurrentImageIndex(actualIndex);
                        emblaApi?.scrollTo(actualIndex);
                      }}
                      className={`aspect-[4/3] rounded-lg overflow-hidden shadow-sm cursor-pointer transition-all ${
                        actualIndex === currentImageIndex ? 'ring-2 ring-primary opacity-100' : 'opacity-60 hover:opacity-100'
                      }`}
                      data-testid={`thumbnail-${actualIndex}`}
                    >
                      <img src={upgradeImageUrl(img)} alt={`Thumbnail ${actualIndex + 1}`} className="w-full h-full object-cover" />
                    </button>
                  );
                });
              })()}
            </div>

            {/* View Carfax Button - Under Carousel */}
            {car.carfaxUrl ? (
              <a
                href={car.carfaxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-gradient-to-r from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 text-white py-4 rounded-xl font-bold text-base shadow-lg transition flex items-center justify-center gap-2"
                data-testid="button-view-carfax"
              >
                <ShieldCheck className="w-5 h-5" /> View Carfax Report
              </a>
            ) : car.dealerVdpUrl && (
              <a
                href={car.dealerVdpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-gradient-to-r from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 text-white py-4 rounded-xl font-bold text-base shadow-lg transition flex items-center justify-center gap-2"
                data-testid="button-view-carfax-dealer"
              >
                <ShieldCheck className="w-5 h-5" /> View Carfax on Dealer Site
              </a>
            )}

            {/* VDP Overview & Description */}
            <div className="glass-panel p-8 rounded-2xl space-y-6">
              {/* Overview from VDP */}
              {car.vdpDescription && (
                <div>
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Overview
                  </h3>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{car.vdpDescription}</p>
                </div>
              )}
              
              {/* Carfax Badges */}
              {car.carfaxBadges && car.carfaxBadges.length > 0 && (
                <div className="border-t border-border pt-6">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-green-600" />
                    Vehicle History
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {car.carfaxBadges.map((badge: string, idx: number) => (
                      <span 
                        key={idx}
                        className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium border border-green-200"
                        data-testid={`carfax-badge-${idx}`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Fallback to AI-generated description if no VDP description */}
              {!car.vdpDescription && car.description && (
                <div>
                  <h3 className="font-bold text-lg mb-4">Vehicle Description</h3>
                  <p className="text-muted-foreground leading-relaxed">{car.description}</p>
                </div>
              )}
            </div>

            {/* Tech Specs Accordion */}
            {techSpecs && (
              <div className="glass-panel p-8 rounded-2xl">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-primary" />
                  Technical Specifications
                </h3>
                
                <div className="space-y-2">
                  {/* Features */}
                  {techSpecs.features && techSpecs.features.length > 0 && (
                    <div className="border border-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleSpecSection('features')}
                        className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition"
                        data-testid="accordion-features"
                      >
                        <span className="font-medium flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          Features ({techSpecs.features.length})
                        </span>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedSpecs.includes('features') ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedSpecs.includes('features') && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                          {techSpecs.features.map((feature: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                              {feature}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mechanical */}
                  {techSpecs.mechanical && techSpecs.mechanical.length > 0 && (
                    <div className="border border-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleSpecSection('mechanical')}
                        className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition"
                        data-testid="accordion-mechanical"
                      >
                        <span className="font-medium flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-slate-500" />
                          Mechanical ({techSpecs.mechanical.length})
                        </span>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedSpecs.includes('mechanical') ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedSpecs.includes('mechanical') && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                          {techSpecs.mechanical.map((item: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                              {item}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Exterior */}
                  {techSpecs.exterior && techSpecs.exterior.length > 0 && (
                    <div className="border border-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleSpecSection('exterior')}
                        className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition"
                        data-testid="accordion-exterior"
                      >
                        <span className="font-medium flex items-center gap-2">
                          <Car className="w-4 h-4 text-blue-500" />
                          Exterior ({techSpecs.exterior.length})
                        </span>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedSpecs.includes('exterior') ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedSpecs.includes('exterior') && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                          {techSpecs.exterior.map((item: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                              {item}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Interior */}
                  {techSpecs.interior && techSpecs.interior.length > 0 && (
                    <div className="border border-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleSpecSection('interior')}
                        className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition"
                        data-testid="accordion-interior"
                      >
                        <span className="font-medium flex items-center gap-2">
                          <Armchair className="w-4 h-4 text-purple-500" />
                          Interior ({techSpecs.interior.length})
                        </span>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedSpecs.includes('interior') ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedSpecs.includes('interior') && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                          {techSpecs.interior.map((item: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                              {item}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Entertainment */}
                  {techSpecs.entertainment && techSpecs.entertainment.length > 0 && (
                    <div className="border border-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleSpecSection('entertainment')}
                        className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition"
                        data-testid="accordion-entertainment"
                      >
                        <span className="font-medium flex items-center gap-2">
                          <Music className="w-4 h-4 text-pink-500" />
                          Entertainment ({techSpecs.entertainment.length})
                        </span>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedSpecs.includes('entertainment') ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedSpecs.includes('entertainment') && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                          {techSpecs.entertainment.map((item: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                              {item}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {techSpecs.safety && techSpecs.safety.length > 0 && (
                    <div className="border border-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleSpecSection('safety')}
                        className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition"
                        data-testid="accordion-safety"
                      >
                        <span className="font-medium flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-red-500" />
                          Safety ({techSpecs.safety.length})
                        </span>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedSpecs.includes('safety') ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedSpecs.includes('safety') && (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                          {techSpecs.safety.map((item: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                              {item}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Details */}
          <div className="space-y-6">
            <div className="glass-panel p-8 rounded-2xl">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h1 className="text-3xl font-black text-foreground mb-2">{car.year} {car.make} {car.model}</h1>
                  <p className="text-lg text-muted-foreground font-medium">{car.trim}</p>
                  {car.highlights && (
                    <p className="text-sm font-bold text-muted-foreground/70 mt-1 uppercase tracking-wide">{car.highlights}</p>
                  )}
                </div>
                <div className="text-right">
                  {car.price > 0 ? (
                    <>
                      <p className="text-3xl font-black text-primary">${car.price.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">Cash Price</p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-black text-primary">Contact for Price</p>
                      <p className="text-sm text-muted-foreground">Call for details</p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mb-6 flex-wrap">
                {car.badges.map((b: string) => (
                  <span key={b} className="bg-blue-50 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border border-blue-100 flex items-center gap-1">
                    <Flame className="w-3 h-3 text-orange-500" />
                    {b}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8 p-4 bg-muted rounded-xl border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-muted-foreground shadow-sm"><Gauge className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground font-bold uppercase">Odometer</p>
                    <p className="font-bold text-foreground">{car.odometer.toLocaleString()} km</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-muted-foreground shadow-sm"><MapPin className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground font-bold uppercase">Location</p>
                    <p className="font-bold text-foreground">{car.location}</p>
                  </div>
                </div>
                 <div className="flex items-center gap-3 col-span-2">
                  <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-orange-400 shadow-sm"><Flame className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground font-bold uppercase">Interest (24h)</p>
                    <p className="font-bold text-foreground">{car.views} people viewing</p>
                  </div>
                </div>
                {car.vin && (
                  <div className="flex items-center gap-3 col-span-2">
                    <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-muted-foreground shadow-sm"><FileText className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground font-bold uppercase">VIN</p>
                      <p className="font-bold text-foreground font-mono text-sm">{car.vin}</p>
                    </div>
                  </div>
                )}
                {car.stockNumber && (
                  <div className="flex items-center gap-3 col-span-2">
                    <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-muted-foreground shadow-sm"><FileText className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground font-bold uppercase">Stock #</p>
                      <p className="font-bold text-foreground">{car.stockNumber}</p>
                    </div>
                  </div>
                )}
                {car.exteriorColor && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-muted-foreground shadow-sm"><Car className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground font-bold uppercase">Exterior</p>
                      <p className="font-bold text-foreground">{car.exteriorColor}</p>
                    </div>
                  </div>
                )}
                {car.interiorColor && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-muted-foreground shadow-sm"><Car className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground font-bold uppercase">Interior</p>
                      <p className="font-bold text-foreground">{car.interiorColor}</p>
                    </div>
                  </div>
                )}
                {car.transmission && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-muted-foreground shadow-sm"><Settings className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground font-bold uppercase">Transmission</p>
                      <p className="font-bold text-foreground">{car.transmission}</p>
                    </div>
                  </div>
                )}
                {car.fuelType && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-muted-foreground shadow-sm"><Fuel className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground font-bold uppercase">Fuel Type</p>
                      <p className="font-bold text-foreground">{car.fuelType}</p>
                    </div>
                  </div>
                )}
                {car.carfaxUrl && (
                  <div className="flex items-center gap-3 col-span-2">
                    <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-green-600 shadow-sm"><FileText className="w-5 h-5" /></div>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Vehicle History</p>
                      <a 
                        href={car.carfaxUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-bold text-green-600 hover:text-green-700 transition"
                        data-testid="link-carfax-report"
                      >
                        View CARFAX Report <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {car.price > 0 && (
                <div className="bg-primary/5 border border-primary/10 p-6 rounded-xl mb-4">
                  <div className="flex justify-between items-center mb-3">
                    <p className="font-bold text-foreground">Estimated Finance</p>
                    <p className="text-2xl font-black text-primary">${monthlyPayment}<span className="text-sm text-muted-foreground font-medium">/mo</span></p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Based on {apr}% APR, ${downPayment.toLocaleString()} down. Taxes and fees extra.
                  </p>
                  
                  {/* Term Selector - Shows available terms for this vehicle based on model year */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Select Term</p>
                    <div className={`grid gap-2 ${availableTerms.length <= 3 ? 'grid-cols-3' : availableTerms.length === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
                      {availableTerms.map((term: FinanceTerm) => (
                        <button
                          key={term}
                          onClick={() => setLocalTerm(term)}
                          className={`py-2 rounded-lg text-sm font-bold transition ${
                            selectedTerm === term 
                              ? 'bg-secondary text-white shadow-md' 
                              : 'bg-card text-muted-foreground hover:bg-muted border border-border'
                          }`}
                          data-testid={`button-term-${term}`}
                        >
                          {term}mo
                        </button>
                      ))}
                    </div>
                    {availableTerms.length < 5 && (
                      <p className="text-xs text-muted-foreground text-center">
                        Max {Math.max(...availableTerms)} months for {car.year} model year
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Primary CTAs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button 
                  onClick={() => handleAction("Get Pre-Approved")} 
                  className="w-full bg-secondary hover:bg-secondary/90 text-white py-4 rounded-xl font-bold text-base shadow-lg shadow-cyan-500/20 transition flex items-center justify-center gap-2"
                  data-testid="button-get-approved"
                >
                  <CheckCircle2 className="w-5 h-5" /> Get Pre-Approved
                </button>
                <button 
                  onClick={() => handleAction("Book Test Drive")} 
                  className="w-full bg-primary hover:bg-blue-900 text-white py-4 rounded-xl font-bold text-base shadow-lg transition flex items-center justify-center gap-2"
                  data-testid="button-book-test-drive"
                >
                  <Calendar className="w-5 h-5" /> Book Test Drive
                </button>
              </div>

              {/* Secondary CTAs */}
              <div className="grid grid-cols-2 gap-3 mt-3">
                <button 
                  onClick={() => handleAction("Value Your Trade-in")} 
                  className="w-full bg-card border-2 border-border hover:border-primary text-foreground hover:text-primary py-3 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2"
                  data-testid="button-value-trade"
                >
                  <DollarSign className="w-4 h-4" /> Value Trade-in
                </button>
                <button 
                  onClick={() => handleAction("Reserve Vehicle")} 
                  className="w-full bg-card border-2 border-border hover:border-secondary text-foreground hover:text-secondary py-3 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2"
                  data-testid="button-reserve-vehicle"
                >
                  <Car className="w-4 h-4" /> Reserve Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ChatBot 
        vehicleName={`${car.year} ${car.make} ${car.model}`} 
        action={action}
        vehicle={{
          id: car.id,
          make: car.make,
          model: car.model,
          year: car.year,
          price: car.price,
          vin: car.vin,
          dealership: car.dealership,
          type: car.type
        }}
      />
    </div>
  );
}
