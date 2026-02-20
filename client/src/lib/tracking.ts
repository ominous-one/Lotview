// Google Tag Manager and Remarketing Pixel tracking utility

declare global {
  interface Window {
    dataLayer: any[];
    fbq?: (...args: any[]) => void;
    gtag?: (...args: any[]) => void;
  }
}

// Initialize dataLayer if it doesn't exist
if (typeof window !== 'undefined') {
  window.dataLayer = window.dataLayer || [];
}

// Tracking configuration (loaded from API)
interface TrackingConfig {
  gtmContainerId: string | null;
  googleAnalyticsId: string | null;
  googleAdsId: string | null;
  facebookPixelId: string | null;
}

let trackingConfig: TrackingConfig | null = null;

/**
 * Initialize tracking pixels from API configuration
 * Should be called once on app load
 */
export async function initializeTracking(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    const response = await fetch('/api/public/tracking-config');
    if (response.ok) {
      trackingConfig = await response.json();
      
      // Initialize Facebook Pixel if configured
      if (trackingConfig?.facebookPixelId) {
        initFacebookPixel(trackingConfig.facebookPixelId);
      }
      
      // Initialize Google gtag if GA4 or Google Ads is configured
      if (trackingConfig?.googleAnalyticsId || trackingConfig?.googleAdsId) {
        initGoogleTag(trackingConfig.googleAnalyticsId, trackingConfig.googleAdsId);
      }
    }
  } catch (error) {
    console.warn('Failed to load tracking config:', error);
  }
}

/**
 * Initialize Facebook Pixel
 */
function initFacebookPixel(pixelId: string): void {
  if (typeof window === 'undefined' || window.fbq) return;
  
  // Facebook Pixel base code
  (function(f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function() {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  
  window.fbq!('init', pixelId);
  window.fbq!('track', 'PageView');
}

/**
 * Initialize Google Analytics 4 / Google Ads gtag
 */
function initGoogleTag(gaId: string | null, adsId: string | null): void {
  if (typeof window === 'undefined') return;
  
  const measurementId = gaId || adsId;
  if (!measurementId) return;
  
  // Load gtag.js script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
  
  // Initialize gtag
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  
  if (gaId) {
    window.gtag('config', gaId);
  }
  if (adsId) {
    window.gtag('config', adsId);
  }
}

/**
 * Get or create session ID for tracking
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  
  let sessionId = localStorage.getItem('session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('session_id', sessionId);
  }
  return sessionId;
}

interface VehicleData {
  id: number;
  vin?: string | null;
  make: string;
  model: string;
  year: number;
  price: number;
  dealership: string;
  type: string;
}

interface PaymentContext {
  creditScore: string;
  downPayment: number;
  apr: number;
  term?: number;
}

/**
 * Track vehicle view (detail page)
 * Sends events to GTM, Facebook Pixel, and Google Ads
 */
export function trackVehicleView(vehicle: VehicleData) {
  if (typeof window === 'undefined') return;
  
  // Push to GTM dataLayer
  window.dataLayer.push({
    event: 'vehicle_viewed',
    vehicle_id: vehicle.id,
    vehicle_vin: vehicle.vin || 'N/A',
    vehicle_make: vehicle.make,
    vehicle_model: vehicle.model,
    vehicle_year: vehicle.year,
    vehicle_price: vehicle.price,
    vehicle_dealership: vehicle.dealership,
    vehicle_type: vehicle.type,
  });
  
  // Facebook Pixel - ViewContent event for remarketing
  if (window.fbq) {
    window.fbq('track', 'ViewContent', {
      content_ids: [vehicle.id.toString()],
      content_name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      content_type: 'vehicle',
      content_category: vehicle.type,
      value: vehicle.price,
      currency: 'CAD',
    });
  }
  
  // Google Ads remarketing - view_item event
  if (window.gtag && trackingConfig?.googleAdsId) {
    window.gtag('event', 'view_item', {
      send_to: trackingConfig.googleAdsId,
      items: [{
        id: vehicle.id.toString(),
        name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        category: vehicle.type,
        price: vehicle.price,
      }],
    });
  }
}

/**
 * Track vehicle impression (card visible in inventory)
 */
export function trackVehicleImpression(vehicle: VehicleData, position: number) {
  if (typeof window === 'undefined') return;
  
  window.dataLayer.push({
    event: 'vehicle_impression',
    vehicle_id: vehicle.id,
    vehicle_make: vehicle.make,
    vehicle_model: vehicle.model,
    vehicle_price: vehicle.price,
    list_position: position,
  });
}

/**
 * Track CTA clicks (Test Drive, Reserve, etc.)
 * Sends events to GTM, Facebook Pixel (Lead), and Google Ads
 */
export function trackCTAClick(
  ctaType: 'test_drive' | 'reserve' | 'get_approved' | 'value_trade' | 'chat_open',
  vehicle: VehicleData
) {
  if (typeof window === 'undefined') return;
  
  // Push to GTM dataLayer
  window.dataLayer.push({
    event: 'cta_click',
    cta_type: ctaType,
    vehicle_id: vehicle.id,
    vehicle_vin: vehicle.vin || 'N/A',
    vehicle_make: vehicle.make,
    vehicle_model: vehicle.model,
    vehicle_year: vehicle.year,
    vehicle_price: vehicle.price,
    vehicle_dealership: vehicle.dealership,
    vehicle_type: vehicle.type,
  });
  
  // Facebook Pixel - Lead event for high-intent actions
  if (window.fbq) {
    const fbEventName = ctaType === 'get_approved' ? 'InitiateCheckout' : 'Lead';
    window.fbq('track', fbEventName, {
      content_ids: [vehicle.id.toString()],
      content_name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      content_type: 'vehicle',
      content_category: ctaType,
      value: vehicle.price,
      currency: 'CAD',
    });
  }
  
  // Google Ads conversion tracking
  if (window.gtag && trackingConfig?.googleAdsId) {
    window.gtag('event', 'conversion', {
      send_to: trackingConfig.googleAdsId,
      event_category: 'engagement',
      event_label: ctaType,
      value: vehicle.price,
    });
  }
}

/**
 * Track chat message sent
 */
export function trackChatMessage(vehicle?: VehicleData, messageCount?: number) {
  if (typeof window === 'undefined') return;
  
  window.dataLayer.push({
    event: 'chat_message_sent',
    vehicle_id: vehicle?.id,
    vehicle_vin: vehicle?.vin || 'N/A',
    vehicle_make: vehicle?.make,
    vehicle_model: vehicle?.model,
    vehicle_year: vehicle?.year,
    vehicle_price: vehicle?.price,
    vehicle_dealership: vehicle?.dealership,
    vehicle_type: vehicle?.type,
    message_count: messageCount || 1,
  });
}

/**
 * Track chat opened
 */
export function trackChatOpen(vehicle?: VehicleData, triggerType?: 'cta' | 'auto' | 'manual') {
  if (typeof window === 'undefined') return;
  
  window.dataLayer.push({
    event: 'chat_opened',
    vehicle_id: vehicle?.id,
    vehicle_vin: vehicle?.vin || 'N/A',
    vehicle_make: vehicle?.make,
    vehicle_model: vehicle?.model,
    vehicle_year: vehicle?.year,
    vehicle_price: vehicle?.price,
    vehicle_dealership: vehicle?.dealership,
    vehicle_type: vehicle?.type,
    trigger_type: triggerType || 'manual',
  });
}

/**
 * Track payment calculator interaction
 */
export function trackPaymentCalculation(
  vehicle: VehicleData,
  paymentContext: PaymentContext,
  monthlyPayment: number
) {
  if (typeof window === 'undefined') return;
  
  window.dataLayer.push({
    event: 'payment_calculated',
    vehicle_id: vehicle.id,
    vehicle_price: vehicle.price,
    credit_score: paymentContext.creditScore,
    down_payment: paymentContext.downPayment,
    apr: paymentContext.apr,
    term_months: paymentContext.term,
    monthly_payment: monthlyPayment,
  });
}

/**
 * Track filter changes in inventory
 */
export function trackFilterChange(filterType: string, filterValue: string | number) {
  if (typeof window === 'undefined') return;
  
  window.dataLayer.push({
    event: 'filter_changed',
    filter_type: filterType,
    filter_value: filterValue,
  });
}

/**
 * Track page view
 */
export function trackPageView(pageName: string, pageType: string) {
  if (typeof window === 'undefined') return;
  
  window.dataLayer.push({
    event: 'page_view',
    page_name: pageName,
    page_type: pageType,
  });
}
