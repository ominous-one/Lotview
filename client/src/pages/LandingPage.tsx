import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Car, 
  MessageSquare, 
  Calculator, 
  Users, 
  Facebook, 
  Building2,
  ArrowRight,
  Check,
  Zap,
  Shield,
  BarChart3,
  Globe,
  ChevronRight,
  Play,
  Sparkles,
  Mail,
  Phone
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getVehicles } from "@/lib/api";
import lotviewLogo from "@assets/Gemini_Generated_Image_x5uznsx5uznsx5uz_(1)_1764799238587.png";

export default function LandingPage() {
  const [isVisible, setIsVisible] = useState(false);
  
  // Fetch real vehicles for the preview
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles-preview"],
    queryFn: getVehicles,
  });
  
  // Get first 3 vehicles for the hero preview
  const previewVehicles = vehicles.slice(0, 3);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img 
                src={lotviewLogo} 
                alt="Lotview.ai" 
                className="h-10 w-auto"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.parentElement!.innerHTML = '<div class="flex items-center gap-2"><div class="w-8 h-8 bg-gradient-to-br from-[#022d60] to-[#00aad2] rounded-lg flex items-center justify-center"><svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0H9m-6-6h15m-6 0V6"></path></svg></div><span class="text-xl font-bold text-[#022d60]">Lotview.ai</span></div>';
                }}
              />
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-600 hover:text-[#022d60] transition-colors" data-testid="link-features">Features</a>
              <a href="#how-it-works" className="text-sm text-gray-600 hover:text-[#022d60] transition-colors" data-testid="link-how-it-works">How It Works</a>
              <a href="#pricing" className="text-sm text-gray-600 hover:text-[#022d60] transition-colors" data-testid="link-pricing">Pricing</a>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost" className="text-[#022d60]" data-testid="button-signin">
                  Sign In
                </Button>
              </Link>
              <a href="mailto:charlie@lotview.ai?subject=Demo%20Request">
                <Button className="bg-[#022d60] hover:bg-[#022d60]/90 text-white" data-testid="button-demo">
                  Get Free Demo
                </Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 to-white pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-radial from-[#00aad2]/10 to-transparent rounded-full blur-3xl" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div 
              className={`transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              <Badge className="mb-6 bg-gradient-to-r from-amber-400 to-amber-500 text-white border-amber-400 hover:from-amber-500 hover:to-amber-600 font-semibold shadow-lg shadow-amber-500/25">
                <Sparkles className="w-3 h-3 mr-1" />
                Truly Autonomous
              </Badge>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#022d60] tracking-tight leading-[1.1] mb-6">
                Your Inventory Is Burning Cash.
                <span className="block bg-gradient-to-r from-[#022d60] via-[#00aad2] to-[#022d60] bg-clip-text text-transparent">
                  Let AI Turn It Into Profit 24/7.
                </span>
              </h1>
              
              <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
                Stop letting leads die in your CRM. LotView engages every lead, answers every question, and books firm appointments while your BDC is asleep.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a href="mailto:charlie@lotview.ai?subject=Demo%20Request">
                  <Button size="lg" className="bg-[#022d60] hover:bg-[#022d60]/90 text-white px-8 py-6 text-lg rounded-xl shadow-lg shadow-[#022d60]/25 hover:shadow-xl hover:shadow-[#022d60]/30 transition-all" data-testid="button-hero-demo">
                    Get Your Free Demo
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </a>
                <a href="#how-it-works">
                  <Button size="lg" variant="outline" className="px-8 py-6 text-lg rounded-xl border-gray-200 hover:border-[#022d60]/30 hover:bg-gray-50" data-testid="button-hero-tour">
                    <Play className="mr-2 w-5 h-5" />
                    See How It Works
                  </Button>
                </a>
              </div>
            </div>
            
            {/* Hero Image/Mockup */}
            <div 
              className={`mt-16 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
            >
              <div className="relative mx-auto max-w-5xl">
                <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-10 pointer-events-none" />
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl shadow-gray-900/20 p-2 sm:p-4">
                  <div className="bg-gray-900 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/50 border-b border-gray-700/50">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                      </div>
                      <div className="flex-1 flex justify-center">
                        <div className="bg-gray-700/50 rounded-md px-4 py-1 text-xs text-gray-400">
                          yourdealership.lotview.ai
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-100 p-4 sm:p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {previewVehicles.length > 0 ? (
                          previewVehicles.map((vehicle, i) => {
                            const monthlyPayment = vehicle.price ? Math.round(vehicle.price / 72) : 0;
                            const badges = [];
                            if (vehicle.odometer && vehicle.odometer < 50000) badges.push("Low Kilometers");
                            if (i === 1) badges.push("No Accidents");
                            if (i === 0) badges.push("One Owner");
                            
                            return (
                              <div key={vehicle.id || i} className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
                                {/* Image with watermark and badges */}
                                <div className="relative aspect-[4/3]">
                                  <div className="absolute top-2 left-2 z-20">
                                    <div className="bg-[#022d60]/90 text-white text-[8px] px-1.5 py-0.5 rounded font-bold">
                                      LOTVIEW
                                    </div>
                                  </div>
                                  {badges.length > 0 && (
                                    <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
                                      {badges.slice(0, 2).map((badge, idx) => (
                                        <span key={idx} className={`text-[7px] px-1.5 py-0.5 rounded-full font-medium ${
                                          badge === "No Accidents" ? "bg-green-500 text-white" : 
                                          badge === "One Owner" ? "bg-orange-500 text-white" :
                                          "bg-[#00aad2] text-white"
                                        }`}>
                                          {badge}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                                    <Car className="w-8 h-8 text-gray-400" />
                                  </div>
                                  {vehicle.images && vehicle.images[0] && (
                                    <img 
                                      src={vehicle.images[0]} 
                                      alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                                      className="absolute inset-0 w-full h-full object-cover"
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                      }}
                                    />
                                  )}
                                  {/* Payment overlay */}
                                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                                    <div className="flex items-end justify-between">
                                      <div>
                                        <div className="text-white font-bold text-lg">${monthlyPayment}<span className="text-xs font-normal">/mo</span></div>
                                        <div className="text-white/70 text-[8px]">@ 7.99%</div>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-white/60 text-[8px]">Cash Price</div>
                                        <div className="text-white font-semibold text-sm">${vehicle.price?.toLocaleString()}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Term selector */}
                                <div className="flex border-b border-gray-100">
                                  {["24", "36", "48", "60", "72", "84"].map((term, idx) => (
                                    <div key={term} className={`flex-1 text-center py-1 text-[7px] font-medium ${
                                      term === "72" ? "bg-[#00aad2] text-white" : "text-gray-400 hover:bg-gray-50"
                                    }`}>
                                      {term}mo
                                    </div>
                                  ))}
                                </div>
                                
                                {/* Vehicle info */}
                                <div className="p-2">
                                  <div className="font-semibold text-[#022d60] text-xs truncate">
                                    {vehicle.year} {vehicle.make} {vehicle.model}
                                  </div>
                                  <div className="text-gray-500 text-[8px] truncate">{vehicle.trim || "Premium"}</div>
                                  <div className="flex items-center justify-between mt-1 text-[8px] text-gray-400">
                                    <span>{vehicle.odometer?.toLocaleString() || "15,000"} km</span>
                                    <span className="text-[#00aad2]">{12 + i * 5} views (24h)</span>
                                  </div>
                                </div>
                                
                                {/* CTAs */}
                                <div className="flex gap-1 p-2 pt-0">
                                  <button className="flex-1 bg-[#00aad2] text-white text-[8px] py-1.5 rounded font-medium hover:bg-[#0099c0]">
                                    Book Test Drive
                                  </button>
                                  <button className="flex-1 border border-[#022d60] text-[#022d60] text-[8px] py-1.5 rounded font-medium hover:bg-gray-50">
                                    Reserve Vehicle
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          [1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 animate-pulse">
                              <div className="aspect-[4/3] bg-gray-200 flex items-center justify-center">
                                <Car className="w-8 h-8 text-gray-300" />
                              </div>
                              <div className="p-3 space-y-2">
                                <div className="h-3 bg-gray-200 rounded w-3/4" />
                                <div className="h-2 bg-gray-100 rounded w-1/2" />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Lead Generation Description */}
            <div className={`mt-8 transition-all duration-1000 delay-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed bg-gray-50 rounded-xl p-6 border border-gray-100">
                We generate brand new leads for you through Google Ads and Facebook Marketplace, then nurture them into appointments that get forwarded to your management team. We follow-up better than any sales person with 100% accuracy.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* Features Section */}
      <section id="features" className="py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-4 bg-[#00aad2]/10 text-[#00aad2] border-[#00aad2]/20">
              Features
            </Badge>
            <h2 className="text-4xl lg:text-5xl font-bold text-[#022d60] mb-6">
              Everything You Need to Sell More Cars
            </h2>
            <p className="text-lg text-gray-600">
              A complete platform designed for modern dealerships. From inventory management to customer engagement, we've got you covered.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Car,
                title: "We Sync With Your DMS. You Do Nothing.",
                description: "Direct integration with PBS, CDK, vAuto, and more. No manual uploads. No stale listings. If it's on your lot, it's online.",
                color: "from-blue-500 to-blue-600"
              },
              {
                icon: MessageSquare,
                title: "The BDC Rep That Never Sleeps, Calls in Sick, or Quits.",
                description: "Our AI handles every message and call—qualifying leads, answering questions, and booking appointments at 3 AM while your team rests.",
                color: "from-purple-500 to-purple-600"
              },
              {
                icon: Calculator,
                title: "Instant Trade-In Appraisals That Close Deals.",
                description: "Give customers accurate valuations using real market data. Build trust, eliminate back-and-forth, and get them in the door faster.",
                color: "from-green-500 to-green-600"
              },
              {
                icon: BarChart3,
                title: "Know Exactly How to Price Every Car.",
                description: "See how your inventory stacks up against every competitor in your market. Price smarter. Sell faster. Stop guessing.",
                color: "from-orange-500 to-orange-600"
              },
              {
                icon: Facebook,
                title: "Hijack Facebook Traffic Automatically.",
                description: "We post your entire inventory to Marketplace daily. When a car sells, we pull it down. Zero admin work. Maximum exposure.",
                color: "from-sky-500 to-sky-600"
              },
              {
                icon: Building2,
                title: "One Dashboard. Every Location.",
                description: "Each store gets its own branded site. Manage inventory, leads, and staff from one place with role-based access control.",
                color: "from-rose-500 to-rose-600"
              }
            ].map((feature, index) => (
              <Card 
                key={index} 
                className="group relative overflow-hidden border-gray-100 hover:border-[#00aad2]/30 hover:shadow-xl transition-all duration-300"
                data-testid={`card-feature-${index}`}
              >
                <CardContent className="p-8">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform`}>
                    <feature.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-[#022d60] mb-3">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </CardContent>
                <div className="absolute inset-0 bg-gradient-to-br from-[#00aad2]/0 to-[#00aad2]/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 lg:py-32 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-4 bg-[#022d60]/10 text-[#022d60] border-[#022d60]/20">
              How It Works
            </Badge>
            <h2 className="text-4xl lg:text-5xl font-bold text-[#022d60] mb-6">
              Truly Autonomous
            </h2>
            <p className="text-lg text-gray-600">
              Getting started with Lotview is simple. We handle the heavy lifting so you can focus on selling cars.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                step: "01",
                icon: Globe,
                title: "We Plug In",
                description: "We connect to your DMS and AutoTrader in minutes, not weeks. Zero IT headaches."
              },
              {
                step: "02",
                icon: Sparkles,
                title: "We Brand It",
                description: "Your logo, your colors, your financing rules. It looks and feels like you—because it is you."
              },
              {
                step: "03",
                icon: Zap,
                title: "Go Live",
                description: "Your new AI showroom is active on your branded subdomain. Instantly."
              },
              {
                step: "04",
                icon: BarChart3,
                title: "Auto-Pilot",
                description: "Our AI starts handling inquiries immediately. You start closing more deals."
              }
            ].map((item, index) => (
              <div key={index} className="relative" data-testid={`step-${index}`}>
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white border-2 border-[#022d60]/10 shadow-lg mb-6">
                    <item.icon className="w-8 h-8 text-[#00aad2]" />
                  </div>
                  <div className="text-xs font-bold text-[#00aad2] mb-2">STEP {item.step}</div>
                  <h3 className="text-xl font-semibold text-[#022d60] mb-3">{item.title}</h3>
                  <p className="text-gray-600">{item.description}</p>
                </div>
                {index < 3 && (
                  <div className="hidden lg:block absolute top-8 left-[calc(100%_-_1rem)] w-8">
                    <ChevronRight className="w-6 h-6 text-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-[#022d60]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              Dealers See Real Results
            </h2>
            <p className="text-lg text-white/70">
              Join the dealerships already transforming their digital presence.
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { value: "40%", label: "More Leads", sublabel: "from website chat" },
              { value: "2x", label: "Faster Updates", sublabel: "inventory sync speed" },
              { value: "24/7", label: "Customer Engagement", sublabel: "AI never sleeps" },
              { value: "100%", label: "Inventory Accuracy", sublabel: "real-time sync" }
            ].map((stat, index) => (
              <div key={index} className="text-center" data-testid={`stat-${index}`}>
                <div className="text-4xl lg:text-5xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-lg font-medium text-[#00aad2]">{stat.label}</div>
                <div className="text-sm text-white/50">{stat.sublabel}</div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Pricing Section */}
      <section id="pricing" className="py-24 lg:py-32 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-4 bg-[#022d60]/10 text-[#022d60] border-[#022d60]/20">
              Pricing
            </Badge>
            <h2 className="text-4xl lg:text-5xl font-bold text-[#022d60] mb-6">
              Costs Less Than One Sold Car
            </h2>
            <p className="text-lg text-gray-600">
              Pay for yourself with a single extra sale each month. All plans include our AI inventory platform.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                name: "The Independent",
                price: "$1,999",
                period: "/month",
                description: "For dealerships ready to automate their sales.",
                features: [
                  "1 dealership location",
                  "Zero-touch inventory sync",
                  "AI BDC chatbot",
                  "Payment calculator on every vehicle",
                  "Facebook Marketplace posting",
                  "Priority support"
                ],
                cta: "Start Selling",
                highlighted: false
              },
              {
                name: "The Volume Dealer",
                price: "$3,999",
                period: "/month",
                description: "For larger dealerships that want it all.",
                features: [
                  "Everything in Independent",
                  "DMS integration included",
                  "Nurture old leads automatically",
                  "Up to 5 locations",
                  "Advanced AI + CRM sync",
                  "Dedicated account manager"
                ],
                cta: "Start Selling",
                highlighted: true
              },
              {
                name: "Dealer Group",
                price: "Custom",
                period: "",
                description: "For empires with custom requirements.",
                features: [
                  "Unlimited locations",
                  "Everything in Volume Dealer",
                  "Custom DMS integrations",
                  "White-label branding",
                  "SLA & 24/7 support"
                ],
                cta: "Contact Sales",
                highlighted: false
              }
            ].map((plan, index) => (
              <Card 
                key={index} 
                className={`relative overflow-hidden ${plan.highlighted ? 'border-2 border-[#00aad2] shadow-xl shadow-[#00aad2]/10' : 'border-gray-200'}`}
                data-testid={`pricing-${plan.name.toLowerCase()}`}
              >
                {plan.highlighted && (
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-[#022d60] to-[#00aad2] text-white text-center py-1 text-sm font-medium">
                    Most Popular
                  </div>
                )}
                <CardContent className={`p-8 ${plan.highlighted ? 'pt-12' : ''}`}>
                  <h3 className="text-xl font-semibold text-[#022d60] mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-4xl font-bold text-[#022d60]">{plan.price}</span>
                    <span className="text-gray-500">{plan.period}</span>
                  </div>
                  <p className="text-gray-600 mb-6">{plan.description}</p>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="w-5 h-5 text-[#00aad2]" />
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="mailto:charlie@lotview.ai?subject=Pricing%20Inquiry">
                    <Button 
                      className={`w-full ${plan.highlighted ? 'bg-[#022d60] hover:bg-[#022d60]/90 text-white' : 'bg-white border-2 border-[#022d60] text-[#022d60] hover:bg-gray-50'}`}
                      data-testid={`button-pricing-${plan.name.toLowerCase()}`}
                    >
                      {plan.cta}
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 lg:py-32 bg-gradient-to-br from-[#022d60] via-[#022d60] to-[#00aad2]/80 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjAzIi8+PC9nPjwvc3ZnPg==')] opacity-30" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            Ready to Modernize Your Dealership?
          </h2>
          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
            Join the dealerships already using Lotview to sell more cars. Get started in 24 hours with a platform designed for the modern automotive industry.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="mailto:charlie@lotview.ai?subject=Demo%20Request">
              <Button size="lg" className="bg-white text-[#022d60] hover:bg-gray-100 px-8 py-6 text-lg rounded-xl shadow-lg" data-testid="button-cta-demo">
                Get Your Free Demo
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </a>
            <a href="mailto:charlie@lotview.ai?subject=Free%20Trial%20Request">
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 px-8 py-6 text-lg rounded-xl" data-testid="button-cta-trial">
                See How It Works
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-[#022d60] to-[#00aad2] rounded-lg flex items-center justify-center">
                  <Car className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">Lotview.ai</span>
              </div>
              <p className="text-sm">
                The AI-powered inventory platform for modern Canadian dealerships.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="mailto:charlie@lotview.ai" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-800 text-center text-sm">
            <p>&copy; {new Date().getFullYear()} Lotview.ai — Built for Canadian Dealerships</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
