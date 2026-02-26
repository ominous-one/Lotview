import { PostJob } from "./types";
import { sanitizeFormData, sanitizeNotificationText } from "./sanitize";

function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

const FILL_CHANNEL = "LV_FILL_FACEBOOK";
const MAX_WAIT_FOR_ELEMENT_MS = 15000; // Increased for Facebook's slow loading
const MUTATION_CHECK_INTERVAL_MS = 300; // Slightly longer between checks

// TIMING CONSTANTS - Facebook needs longer delays between actions
const DELAY_SHORT = 400;      // Was 100-200, now 400ms
const DELAY_MEDIUM = 800;     // Was 300-500, now 800ms  
const DELAY_LONG = 1500;      // Was 600-800, now 1500ms
const DELAY_DROPDOWN = 2000;  // Special delay for dropdown population

interface FillResult {
  success: boolean;
  filledFields: string[];
  missingFields: string[];
  warnings: string[];
}

interface SelectorConfig {
  selectors: string[];
  ariaLabels: string[];
  placeholders: string[];
  nearbyTexts: string[];
  testId?: string;
}

const FIELD_CONFIGS: Record<string, SelectorConfig> = {
  title: {
    selectors: [
      'input[name="title"]', 
      'input[data-testid="marketplace-create-title"]',
      'input[aria-label*="Title" i]',
      'input[placeholder*="Title" i]',
      'input[aria-label*="What are you selling" i]',
    ],
    ariaLabels: ["Title", "What are you selling", "Item title", "Listing title"],
    placeholders: ["Title", "What are you selling", "Item title", "Add a title"],
    nearbyTexts: ["title", "what are you selling", "listing title"],
    testId: "marketplace-create-title",
  },
  price: {
    selectors: [
      'input[name="price"]', 
      'input[data-testid="marketplace-create-price"]',
      'input[type="text"][inputmode="numeric"]',
      'input[aria-label*="Price" i]',
      'input[inputmode="decimal"]',
    ],
    ariaLabels: ["Price", "Enter your price", "Set price"],
    placeholders: ["Price", "0", "$0", "Enter price"],
    nearbyTexts: ["price", "enter your price"],
    testId: "marketplace-create-price",
  },
  description: {
    selectors: [
      'textarea[name="description"]', 
      'textarea[data-testid="marketplace-create-description"]',
      'textarea[aria-label*="Description" i]',
      'textarea[aria-label*="Seller" i]',
      'textarea[placeholder*="Description" i]',
      '[contenteditable="true"][aria-label*="Description" i]',
      '[contenteditable="true"][aria-label*="Seller" i]',
      '[contenteditable="true"][data-testid*="description" i]',
      'div[role="textbox"][aria-label*="Description" i]',
      'div[role="textbox"][aria-label*="Describe" i]',
      'div[role="textbox"][aria-label*="Tell buyers" i]',
      'div[role="textbox"][aria-label*="Seller" i]',
    ],
    ariaLabels: ["Description", "Describe your item", "Tell buyers", "Seller description", "Seller's description"],
    placeholders: ["Description", "Describe", "Tell buyers", "Seller description"],
    nearbyTexts: ["description", "describe", "tell buyers", "seller"],
    testId: "marketplace-create-description",
  },
  location: {
    selectors: [
      'input[name="location"]', 
      'input[data-testid="marketplace-location"]',
      'input[aria-label*="Location" i]',
      'input[placeholder*="Location" i]',
      'input[aria-label*="City" i]',
    ],
    ariaLabels: ["Location", "Enter location", "Set location", "City"],
    placeholders: ["Location", "Enter location", "City"],
    nearbyTexts: ["location", "city", "where"],
    testId: "marketplace-location",
  },
  year: {
    selectors: [
      'input[name="year"]',
      'input[aria-label*="Year" i]',
      'select[aria-label*="Year" i]',
      'div[role="combobox"][aria-label*="Year" i]',
    ],
    ariaLabels: ["Year", "Vehicle year", "Model year"],
    placeholders: ["Year", "Select year"],
    nearbyTexts: ["year"],
    testId: "marketplace-year",
  },
  make: {
    selectors: [
      'input[name="make"]',
      'input[aria-label*="Make" i]',
      'select[aria-label*="Make" i]',
      'div[role="combobox"][aria-label*="Make" i]',
    ],
    ariaLabels: ["Make", "Vehicle make", "Brand"],
    placeholders: ["Make", "Select make", "Brand"],
    nearbyTexts: ["make", "brand"],
    testId: "marketplace-make",
  },
  model: {
    selectors: [
      'input[name="model"]',
      'input[aria-label*="Model" i]',
      'select[aria-label*="Model" i]',
      'div[role="combobox"][aria-label*="Model" i]',
    ],
    ariaLabels: ["Model", "Vehicle model"],
    placeholders: ["Model", "Select model"],
    nearbyTexts: ["model"],
    testId: "marketplace-model",
  },
};

/**
 * Normalize vehicle make name for Facebook Marketplace dropdowns.
 * Facebook uses specific brand names that may differ from our scraped data.
 */
function normalizeMakeForFacebook(make: string): string {
  const makeLower = make.toLowerCase().replace(/\s+/g, ' ').trim();
  
  // Brand name normalization map for Facebook
  if (makeLower === 'mercedes benz' || makeLower === 'mercedes-benz' || makeLower === 'mercedes') {
    return 'Mercedes-Benz';
  } else if (makeLower === 'land rover' || makeLower === 'landrover') {
    return 'Land Rover';
  } else if (makeLower === 'alfa romeo' || makeLower === 'alfaromeo') {
    return 'Alfa Romeo';
  } else if (makeLower === 'aston martin' || makeLower === 'astonmartin') {
    return 'Aston Martin';
  } else if (makeLower === 'rolls royce' || makeLower === 'rolls-royce' || makeLower === 'rollsroyce') {
    return 'Rolls-Royce';
  } else if (makeLower === 'bmw') {
    return 'BMW';
  } else if (makeLower === 'gmc') {
    return 'GMC';
  } else if (makeLower === 'ram') {
    return 'RAM';
  } else if (makeLower === 'mini') {
    return 'MINI';
  } else if (makeLower === 'volkswagen' || makeLower === 'vw') {
    return 'Volkswagen';
  } else if (makeLower === 'chevrolet' || makeLower === 'chevy') {
    return 'Chevrolet';
  } else {
    // Capitalize first letter of each word for other makes
    return make.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ============================================================================
// WORLD-CLASS COLOR MATCHING SYSTEM
// ============================================================================

/**
 * Facebook's exact color options for vehicle listings
 */
const FACEBOOK_COLORS = ['Black', 'Blue', 'Brown', 'Gold', 'Gray', 'Green', 'Orange', 'Pink', 'Purple', 'Red', 'Silver', 'White', 'Yellow'] as const;

/**
 * Comprehensive color synonym database - maps dealer color names to Facebook colors
 */
const COLOR_SYNONYMS: Record<string, typeof FACEBOOK_COLORS[number]> = {
  // Black variations
  'black': 'Black', 'ebony': 'Black', 'onyx': 'Black', 'midnight': 'Black', 'jet': 'Black',
  'obsidian': 'Black', 'phantom': 'Black', 'raven': 'Black', 'noir': 'Black', 'carbon': 'Black',
  'graphite': 'Black', 'ink': 'Black', 'cosmos': 'Black', 'shadow': 'Black', 'eclipse': 'Black',
  
  // White variations
  'white': 'White', 'snow': 'White', 'pearl': 'White', 'ivory': 'White', 'cream': 'White',
  'arctic': 'White', 'polar': 'White', 'frost': 'White', 'glacier': 'White', 'alpine': 'White',
  'crystal': 'White', 'diamond': 'White', 'lunar': 'White', 'vanilla': 'White', 'ceramic': 'White',
  'quartz': 'White', 'chalk': 'White', 'porcelain': 'White',
  
  // Silver/Gray variations
  'silver': 'Silver', 'titanium': 'Silver', 'platinum': 'Silver', 'chrome': 'Silver', 'steel': 'Silver',
  'gray': 'Gray', 'grey': 'Gray', 'charcoal': 'Gray', 'slate': 'Gray', 'stone': 'Gray',
  'ash': 'Gray', 'pewter': 'Gray', 'smoke': 'Gray', 'cement': 'Gray', 'concrete': 'Gray',
  'gunmetal': 'Gray', 'iron': 'Gray', 'lead': 'Gray', 'tungsten': 'Gray', 'magnetic': 'Gray',
  
  // Blue variations
  'blue': 'Blue', 'azure': 'Blue', 'navy': 'Blue', 'cobalt': 'Blue', 'sapphire': 'Blue',
  'ocean': 'Blue', 'sea': 'Blue', 'sky': 'Blue', 'royal': 'Blue', 'indigo': 'Blue',
  'denim': 'Blue', 'pacific': 'Blue', 'atlantic': 'Blue', 'aegean': 'Blue', 'teal': 'Blue',
  'turquoise': 'Blue', 'aqua': 'Blue', 'cyan': 'Blue', 'marine': 'Blue', 'nautical': 'Blue',
  'abyss': 'Blue', 'twilight': 'Blue', 'midnight blue': 'Blue', 'electric blue': 'Blue',
  
  // Red variations
  'red': 'Red', 'crimson': 'Red', 'scarlet': 'Red', 'ruby': 'Red', 'cherry': 'Red',
  'burgundy': 'Red', 'maroon': 'Red', 'wine': 'Red', 'merlot': 'Red', 'garnet': 'Red',
  'vermillion': 'Red', 'cardinal': 'Red', 'brick': 'Red', 'rust': 'Red', 'cayenne': 'Red',
  'chili': 'Red', 'fire': 'Red', 'flame': 'Red', 'lava': 'Red', 'candy': 'Red',
  
  // Green variations
  'green': 'Green', 'olive': 'Green', 'emerald': 'Green', 'forest': 'Green', 'sage': 'Green',
  'moss': 'Green', 'jade': 'Green', 'lime': 'Green', 'mint': 'Green', 'hunter': 'Green',
  'pine': 'Green', 'spruce': 'Green', 'jungle': 'Green', 'fern': 'Green', 'army': 'Green',
  'khaki': 'Green', 'military': 'Green', 'camo': 'Green', 'bamboo': 'Green',
  
  // Brown variations
  'brown': 'Brown', 'tan': 'Brown', 'beige': 'Brown', 'bronze': 'Brown', 'copper': 'Brown',
  'coffee': 'Brown', 'mocha': 'Brown', 'espresso': 'Brown', 'chocolate': 'Brown', 'caramel': 'Brown',
  'chestnut': 'Brown', 'walnut': 'Brown', 'mahogany': 'Brown', 'hazel': 'Brown', 'cocoa': 'Brown',
  'sand': 'Brown', 'sandstone': 'Brown', 'earth': 'Brown', 'terra': 'Brown', 'sienna': 'Brown',
  'umber': 'Brown', 'sepia': 'Brown', 'cognac': 'Brown', 'saddle': 'Brown', 'cinnamon': 'Brown',
  
  // Gold/Yellow variations
  'gold': 'Gold', 'golden': 'Gold', 'champagne': 'Gold', 'brass': 'Gold', 'amber': 'Gold',
  'yellow': 'Yellow', 'lemon': 'Yellow', 'canary': 'Yellow', 'sunshine': 'Yellow', 'banana': 'Yellow',
  'mustard': 'Yellow', 'sunflower': 'Yellow', 'honey': 'Yellow', 'blonde': 'Yellow',
  
  // Orange variations
  'orange': 'Orange', 'tangerine': 'Orange', 'peach': 'Orange', 'coral': 'Orange', 'apricot': 'Orange',
  'pumpkin': 'Orange', 'papaya': 'Orange', 'mango': 'Orange', 'sunset': 'Orange', 'copper orange': 'Orange',
  
  // Purple variations
  'purple': 'Purple', 'violet': 'Purple', 'plum': 'Purple', 'lavender': 'Purple', 'grape': 'Purple',
  'amethyst': 'Purple', 'orchid': 'Purple', 'lilac': 'Purple', 'mauve': 'Purple', 'magenta': 'Purple',
  'fuchsia': 'Purple', 'berry': 'Purple', 'eggplant': 'Purple', 'aubergine': 'Purple',
  
  // Pink variations
  'pink': 'Pink', 'rose': 'Pink', 'blush': 'Pink', 'salmon': 'Pink', 'raspberry': 'Pink',
  'strawberry': 'Pink', 'bubblegum': 'Pink', 'flamingo': 'Pink', 'hot pink': 'Pink',
};

/**
 * Fuzzy color matching - handles multi-word color names like "Phantom Black Pearl"
 * Returns the best matching Facebook color
 */
function normalizeColorToFacebook(rawColor: string): string {
  if (!rawColor) return 'Black'; // Default
  
  const colorLower = rawColor.toLowerCase().trim();
  
  // First, check if any synonym keyword appears in the color string
  for (const [synonym, fbColor] of Object.entries(COLOR_SYNONYMS)) {
    if (colorLower.includes(synonym)) {
      console.log(`[LV] Color match: "${rawColor}" → "${fbColor}" (matched "${synonym}")`);
      return fbColor;
    }
  }
  
  // Split into words and check each word
  const words = colorLower.split(/[\s\-_]+/);
  for (const word of words) {
    if (COLOR_SYNONYMS[word]) {
      console.log(`[LV] Color word match: "${rawColor}" → "${COLOR_SYNONYMS[word]}" (word "${word}")`);
      return COLOR_SYNONYMS[word];
    }
  }
  
  // Fallback: try to find a Facebook color that starts with same letters
  for (const fbColor of FACEBOOK_COLORS) {
    if (colorLower.startsWith(fbColor.toLowerCase().slice(0, 3))) {
      console.log(`[LV] Color prefix match: "${rawColor}" → "${fbColor}"`);
      return fbColor;
    }
  }
  
  // Ultimate fallback
  console.log(`[LV] No color match found for "${rawColor}", defaulting to Gray`);
  return 'Gray';
}

// ============================================================================
// ADAPTIVE TIMEOUT SYSTEM
// ============================================================================

/**
 * Wait for an element to appear using adaptive polling
 * Returns element when found, or null if timeout
 */
async function waitForElementAdaptive(
  selector: string | (() => HTMLElement | null),
  maxWaitMs: number = 10000,
  pollIntervalMs: number = 200
): Promise<HTMLElement | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    let element: HTMLElement | null = null;
    
    if (typeof selector === 'function') {
      element = selector();
    } else {
      element = document.querySelector<HTMLElement>(selector);
    }
    
    if (element && element.offsetParent !== null) {
      console.log(`[LV] Element found after ${Date.now() - startTime}ms`);
      return element;
    }
    
    await sleep(pollIntervalMs);
  }
  
  console.log(`[LV] Element not found after ${maxWaitMs}ms timeout`);
  return null;
}

// ============================================================================
// FUEL TYPE & TRANSMISSION NORMALIZATION
// ============================================================================

/**
 * Facebook's fuel type options
 */
const FACEBOOK_FUEL_TYPES = ['Gasoline', 'Diesel', 'Electric', 'Hybrid', 'Flex fuel', 'Other'] as const;

/**
 * Normalize fuel type to Facebook's options
 */
function normalizeFuelType(rawFuel: string): string {
  if (!rawFuel) return 'Gasoline';

  const fuelLower = rawFuel.toLowerCase().trim();

  // Hybrid FIRST (most specific - catches "Hybrid Electric", "Plug-in Hybrid", "Gasoline/Electric Hybrid")
  if (fuelLower.includes('hybrid') || fuelLower.includes('phev') || fuelLower.includes('hev') ||
      fuelLower.includes('plug-in') || fuelLower.includes('plugin')) {
    return 'Hybrid';
  }

  // Electric (before Gas - catches "Electric" without matching "Gasoline/Electric" which is Hybrid above)
  if (fuelLower.includes('electric') || fuelLower.includes('ev') || fuelLower.includes('bev') ||
      fuelLower.includes('battery') || fuelLower === 'e') {
    return 'Electric';
  }

  // Diesel variations
  if (fuelLower.includes('diesel') || fuelLower.includes('biodiesel') || fuelLower.includes('dsl')) {
    return 'Diesel';
  }

  // Flex fuel variations
  if (fuelLower.includes('flex') || fuelLower.includes('e85') || fuelLower.includes('ffv') ||
      fuelLower.includes('ethanol')) {
    return 'Flex fuel';
  }

  // Gasoline variations (last - default catch-all for gas/petrol)
  if (fuelLower.includes('gas') || fuelLower.includes('petrol') || fuelLower.includes('unleaded') ||
      fuelLower.includes('regular') || fuelLower.includes('premium') || fuelLower.includes('super')) {
    return 'Gasoline';
  }

  // Default
  return 'Gasoline';
}

/**
 * Facebook's transmission options
 */
const FACEBOOK_TRANSMISSIONS = ['Automatic', 'Manual'] as const;

/**
 * Normalize transmission to Facebook's options
 */
function normalizeTransmission(rawTrans: string): string {
  if (!rawTrans) return 'Automatic';
  
  const transLower = rawTrans.toLowerCase().trim();
  
  // Manual variations
  if (transLower.includes('manual') || transLower.includes('stick') || transLower.includes('mt') ||
      transLower.includes('standard') || transLower.includes('5-speed') || transLower.includes('6-speed') ||
      transLower === '5spd' || transLower === '6spd') {
    // But not "automatic" or "at"
    if (!transLower.includes('auto')) {
      return 'Manual';
    }
  }
  
  // Automatic is default (CVT, DCT, etc. are all automatic in Facebook's view)
  return 'Automatic';
}

/**
 * Wait for dropdown options to appear (at least minCount options visible)
 */
async function waitForDropdownOptions(
  minCount: number = 3,
  maxWaitMs: number = 5000
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const options = document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"]');
    if (options.length >= minCount) {
      console.log(`[LV] Found ${options.length} dropdown options after ${Date.now() - startTime}ms`);
      return true;
    }
    await sleep(200);
  }
  
  console.log(`[LV] Only found ${document.querySelectorAll('[role="option"]').length} options after ${maxWaitMs}ms`);
  return false;
}

// ============================================================================
// VERIFICATION SYSTEM
// ============================================================================

/**
 * Verify a dropdown field was filled correctly by checking its displayed text
 */
function verifyDropdownValue(fieldName: string, expectedValue: string): boolean {
  // Find the field by label
  const labels = document.querySelectorAll('span, label');
  for (const label of labels) {
    const text = label.textContent?.trim().toLowerCase();
    if (text === fieldName.toLowerCase()) {
      // Look for the dropdown value nearby
      let parent: HTMLElement | null = label.parentElement;
      for (let i = 0; i < 6 && parent; i++) {
        const displayedText = parent.textContent?.toLowerCase() || '';
        if (displayedText.includes(expectedValue.toLowerCase())) {
          console.log(`[LV] Verified ${fieldName} = "${expectedValue}"`);
          return true;
        }
        parent = parent.parentElement;
      }
    }
  }
  return false;
}

/**
 * Verify a text input field was filled correctly
 */
function verifyInputValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLElement, expectedValue: string): boolean {
  const actualValue = input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
    ? input.value
    : input.textContent || '';
  
  const matches = actualValue.includes(expectedValue) || expectedValue.includes(actualValue);
  if (matches) {
    console.log(`[LV] Verified input value: "${actualValue.slice(0, 30)}..."`);
  } else {
    console.log(`[LV] Input verification FAILED: expected "${expectedValue.slice(0, 20)}...", got "${actualValue.slice(0, 20)}..."`);
  }
  return matches;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Use window.HTMLInputElement.prototype (not el.constructor.prototype) for React controlled inputs
  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLElement, value: string): void {
  el.focus();
  
  const isContentEditable = el.getAttribute('contenteditable') === 'true' || 
                            el.getAttribute('role') === 'textbox';
  
  if (isContentEditable) {
    const selection = window.getSelection();
    const range = document.createRange();
    
    el.textContent = '';
    range.selectNodeContents(el);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    
    document.execCommand('insertText', false, value);
    
    if (el.textContent !== value) {
      // SECURITY: Use DOM methods instead of innerHTML to prevent XSS
      el.textContent = '';
      const lines = value.split('\n');
      lines.forEach((line, i) => {
        el.appendChild(document.createTextNode(line));
        if (i < lines.length - 1) {
          el.appendChild(document.createElement('br'));
        }
      });
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    }
    
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, value);
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }
}

function isSearchInput(el: HTMLElement): boolean {
  const role = el.getAttribute('role')?.toLowerCase() || '';
  const type = el.getAttribute('type')?.toLowerCase() || '';
  const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
  const placeholder = el.getAttribute('placeholder')?.toLowerCase() || '';
  const name = el.getAttribute('name')?.toLowerCase() || '';
  const className = el.className?.toLowerCase() || '';
  
  if (role === 'searchbox' || role === 'search') return true;
  if (type === 'search') return true;
  if (ariaLabel.includes('search') && !ariaLabel.includes('vehicle')) return true;
  if (placeholder.includes('search')) return true;
  if (name.includes('search') || name.includes('query')) return true;
  if (className.includes('search')) return true;
  
  const parent = el.closest('[role="search"], [data-testid*="search"], form[action*="search"]');
  if (parent) return true;
  
  const isInHeader = el.closest('header, [role="banner"], [data-pagelet="FixedHeader"], nav, [data-pagelet*="header" i]');
  if (isInHeader) {
    console.log('[LV] Excluding element in header/navigation area');
    return true;
  }
  
  return false;
}

function isInVehicleForm(el: HTMLElement): boolean {
  const vehicleForm = el.closest('[role="dialog"]') || 
                      el.closest('form') || 
                      el.closest('[data-pagelet*="create"]') ||
                      el.closest('[aria-label*="Vehicle" i]');
  return vehicleForm !== null;
}

function validateFormContainer(container: HTMLElement): boolean {
  const isInHeaderArea = container.closest('header, [role="banner"], [data-pagelet="FixedHeader"], nav, [data-pagelet*="header" i]');
  if (isInHeaderArea) {
    console.log('[LV] Container rejected: inside header area');
    return false;
  }
  
  const priceInputs = container.querySelectorAll('input[inputmode="numeric"], input[inputmode="decimal"], input[type="number"]');
  const textInputs = container.querySelectorAll('input[type="text"]:not([role="searchbox"]):not([aria-label*="search" i])');
  const textareas = container.querySelectorAll('textarea, [contenteditable="true"], div[role="textbox"]');
  const comboboxes = container.querySelectorAll('div[role="combobox"], select');
  const fileInputs = container.querySelectorAll('input[type="file"]');
  
  const inputScore = 
    (priceInputs.length > 0 ? 2 : 0) +
    (textInputs.length > 0 ? 1 : 0) +
    (textareas.length > 0 ? 2 : 0) +
    (comboboxes.length > 0 ? 2 : 0) +
    (fileInputs.length > 0 ? 1 : 0);
  
  const text = container.textContent?.toLowerCase() || '';
  let textScore = 0;
  if (text.includes('price')) textScore++;
  if (text.includes('title') || text.includes('selling')) textScore++;
  if (text.includes('description')) textScore++;
  if (text.includes('photo') || text.includes('image')) textScore++;
  if (text.includes('location')) textScore++;
  
  const isValid = inputScore >= 3 || (inputScore >= 2 && textScore >= 2);
  console.log(`[LV] Container validation: inputScore=${inputScore}, textScore=${textScore}, valid=${isValid}`);
  return isValid;
}

function getVehicleFormContainer(): HTMLElement | null {
  const containerSelectors = [
    '[aria-label*="Create" i][aria-label*="listing" i]',
    '[aria-label*="Sell" i][aria-label*="vehicle" i]',
    '[role="main"] [role="dialog"]',
    '[data-pagelet*="create" i]',
    '[role="main"] form',
    'div[class*="marketplace"] form',
  ];
  
  for (const selector of containerSelectors) {
    try {
      const container = document.querySelector<HTMLElement>(selector);
      if (container && container.offsetParent !== null) {
        if (validateFormContainer(container)) {
          console.log(`[LV] Found vehicle form container via: ${selector}`);
          return container;
        }
      }
    } catch { continue; }
  }
  
  const mainContent = document.querySelector<HTMLElement>('[role="main"]');
  if (mainContent) {
    const forms = mainContent.querySelectorAll('form');
    for (const form of forms) {
      if ((form as HTMLElement).offsetParent !== null && validateFormContainer(form as HTMLElement)) {
        console.log('[LV] Found vehicle form container via [role="main"] form');
        return form as HTMLElement;
      }
    }
  }
  
  const allDivs = document.querySelectorAll<HTMLElement>('div');
  for (const div of allDivs) {
    const rect = div.getBoundingClientRect();
    if (rect.height > 400 && 
        rect.width > 200 &&
        validateFormContainer(div)) {
      console.log('[LV] Found vehicle form container via content heuristics');
      return div;
    }
  }
  
  console.log('[LV] No specific form container found, will use document-level search with semantic filtering');
  return null;
}

function isValidFormField(el: HTMLElement, container: HTMLElement | null): boolean {
  if (el.offsetParent === null) return false;
  
  if (isSearchInput(el)) return false;
  
  if (container && !container.contains(el)) {
    return false;
  }
  
  const rect = el.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 10) {
    return false;
  }
  
  return true;
}

let cachedFormContainer: HTMLElement | null = null;

function getFormContainer(): HTMLElement | null {
  if (!cachedFormContainer) {
    cachedFormContainer = getVehicleFormContainer();
  }
  return cachedFormContainer;
}

function resetFormContainerCache(): void {
  cachedFormContainer = null;
}

function findInputBySelectors(selectors: string[]): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null {
  const container = getFormContainer();
  const searchRoot = container || document;
  
  for (const sel of selectors) {
    try {
      const els = searchRoot.querySelectorAll<HTMLElement>(sel);
      for (const el of els) {
        if (isValidFormField(el, container)) {
          console.log(`[LV] Found field via selector: ${sel}`);
          return el;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

function findInputByAriaLabel(labels: string[]): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null {
  const container = getFormContainer();
  const searchRoot = container || document;
  
  for (const label of labels) {
    const els = searchRoot.querySelectorAll<HTMLElement>(
      `input[aria-label*="${label}" i], textarea[aria-label*="${label}" i], [contenteditable="true"][aria-label*="${label}" i], div[role="textbox"][aria-label*="${label}" i]`
    );
    for (const el of els) {
      if (isValidFormField(el, container)) {
        console.log(`[LV] Found field via aria-label: ${label}`);
        return el;
      }
    }
  }
  return null;
}

function findInputByPlaceholder(placeholders: string[]): HTMLElement | null {
  const container = getFormContainer();
  const searchRoot = container || document;
  
  for (const ph of placeholders) {
    const els = searchRoot.querySelectorAll<HTMLElement>(
      `input[placeholder*="${ph}" i], textarea[placeholder*="${ph}" i], [data-placeholder*="${ph}" i]`
    );
    for (const el of els) {
      if (isValidFormField(el, container)) {
        console.log(`[LV] Found field via placeholder: ${ph}`);
        return el;
      }
    }
  }
  return null;
}

function findInputByNearbyText(texts: string[]): HTMLElement | null {
  const container = getFormContainer();
  const searchRoot = container || document;
  
  for (const text of texts) {
    const spans = searchRoot.querySelectorAll("span, label, div");
    for (const span of spans) {
      const spanText = span.textContent?.trim().toLowerCase() || "";
      if (spanText === text.toLowerCase() || spanText.includes(text.toLowerCase())) {
        let parentContainer = span.parentElement;
        for (let i = 0; i < 5 && parentContainer; i++) {
          const input = parentContainer.querySelector<HTMLElement>("input:not([type='hidden']):not([type='file']), textarea, [contenteditable='true'], div[role='textbox']");
          if (input && input !== span && isValidFormField(input, container)) {
            console.log(`[LV] Found field via nearby text: ${text}`);
            return input;
          }
          parentContainer = parentContainer.parentElement;
        }
      }
    }
  }
  return null;
}

function scrollFormIntoView(): void {
  const scrollContainer = document.querySelector('[role="dialog"]') || document.querySelector('[data-pagelet]') || document.body;
  if (scrollContainer && scrollContainer !== document.body) {
    scrollContainer.scrollTop = 0;
    setTimeout(() => {
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
    }, 300);
  }
}

function logDOMStructure(): void {
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="file"]), textarea, [contenteditable="true"], div[role="textbox"]');
  console.log(`[LV] Found ${inputs.length} potential input fields:`);
  inputs.forEach((el, i) => {
    const tag = el.tagName.toLowerCase();
    const aria = el.getAttribute('aria-label') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const name = el.getAttribute('name') || '';
    const role = el.getAttribute('role') || '';
    const visible = (el as HTMLElement).offsetParent !== null;
    console.log(`[LV]   ${i}: <${tag}> aria="${aria}" placeholder="${placeholder}" name="${name}" role="${role}" visible=${visible}`);
  });
}

function findInputByRole(fieldType: "title" | "price" | "description" | "location" | "year" | "make" | "model"): HTMLElement | null {
  const container = getFormContainer();
  const searchRoot = container || document;
  
  const allInputs = searchRoot.querySelectorAll<HTMLElement>("input:not([type='hidden']):not([type='file']), textarea, [contenteditable='true'], div[role='textbox']");
  for (const input of allInputs) {
    if (!isValidFormField(input, container)) continue;
    const name = input.getAttribute('name')?.toLowerCase() || "";
    const id = input.id?.toLowerCase() || "";
    const className = input.className?.toLowerCase() || "";
    const ariaLabel = input.getAttribute('aria-label')?.toLowerCase() || "";
    if (name.includes(fieldType) || id.includes(fieldType) || className.includes(fieldType) || ariaLabel.includes(fieldType)) {
      console.log(`[LV] Found field via role matching: ${fieldType}`);
      return input;
    }
  }
  return null;
}

function findInput(config: SelectorConfig, fieldType?: string): HTMLElement | null {
  let el = findInputBySelectors(config.selectors);
  if (!el) el = findInputByAriaLabel(config.ariaLabels);
  if (!el) el = findInputByPlaceholder(config.placeholders);
  if (!el) el = findInputByNearbyText(config.nearbyTexts);
  if (!el && fieldType) el = findInputByRole(fieldType as "title" | "price" | "description" | "location" | "year" | "make" | "model");
  return el;
}

async function waitForElement(config: SelectorConfig, fieldType?: string): Promise<HTMLElement | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < MAX_WAIT_FOR_ELEMENT_MS) {
    const el = findInput(config, fieldType);
    if (el) return el;
    
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        const found = findInput(config, fieldType);
        if (found) {
          observer.disconnect();
          resolve();
        }
      });
      
      observer.observe(document.body, { childList: true, subtree: true });
      
      setTimeout(() => {
        observer.disconnect();
        resolve();
      }, MUTATION_CHECK_INTERVAL_MS);
    });
  }
  
  return findInput(config, fieldType);
}

async function setInputWithRetry(
  fieldType: string, 
  value: string, 
  maxRetries: number = 3
): Promise<boolean> {
  const config = FIELD_CONFIGS[fieldType];
  if (!config) return false;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const el = await waitForElement(config, fieldType);
    
    if (!el) {
      await sleep(DELAY_LONG * (attempt + 1)); // Increasing backoff with consistent timing
      continue;
    }
    
    setInputValue(el, value);
    
    await sleep(DELAY_SHORT);
    
    const isContentEditable = el.getAttribute('contenteditable') === 'true' || 
                              el.getAttribute('role') === 'textbox';
    const currentValue = isContentEditable 
      ? (el.textContent || el.innerText || '')
      : (el as HTMLInputElement | HTMLTextAreaElement).value;
    
    if (currentValue === value || currentValue.includes(value.substring(0, 20))) {
      return true;
    }
    
    await sleep(DELAY_MEDIUM);
  }
  
  return false;
}

const MAX_UPLOAD_IMAGES = 20;
const MAX_IMAGE_SIZE_MB = 10;

function extractFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").pop() || "image.jpg";
    return filename.includes(".") ? filename : `${filename}.jpg`;
  } catch {
    return `image-${Date.now()}.jpg`;
  }
}

async function fetchImageAsFile(url: string, proxyBaseUrl?: string): Promise<File | null> {
  const isImageContentType = (contentType: string | null): boolean => {
    if (!contentType) return false;
    return contentType.startsWith("image/");
  };

  // Method 1: Try direct fetch (works for same-origin or CORS-enabled resources)
  const tryDirectFetch = async (fetchUrl: string): Promise<Blob | null> => {
    try {
      const response = await fetch(fetchUrl, {
        mode: "cors",
        credentials: "omit",
      });
      
      if (!response.ok) {
        console.warn(`[LV] Direct fetch failed: ${response.status} ${fetchUrl}`);
        return null;
      }
      
      const contentType = response.headers.get("content-type");
      if (!isImageContentType(contentType)) {
        console.warn(`[LV] Not an image (${contentType}): ${fetchUrl}`);
        return null;
      }
      
      return await response.blob();
    } catch (err) {
      console.warn(`[LV] Direct fetch error (likely CORS):`, err);
      return null;
    }
  };

  // Method 2: Use background script (bypasses CORS)
  const tryBackgroundFetch = async (fetchUrl: string): Promise<Blob | null> => {
    try {
      console.log(`[LV] Using background script to fetch: ${fetchUrl.slice(0, 60)}...`);
      
      const response = await new Promise<{ ok: boolean; base64?: string; contentType?: string; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "FETCH_IMAGE_BLOB", payload: { url: fetchUrl } },
          (res) => resolve(res || { ok: false, error: "No response" })
        );
      });
      
      if (!response.ok || !response.base64) {
        console.warn(`[LV] Background fetch failed: ${response.error}`);
        return null;
      }
      
      // Convert base64 to blob
      const binaryString = atob(response.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      console.log(`[LV] Background fetch success: ${bytes.length} bytes`);
      return new Blob([bytes], { type: response.contentType || "image/jpeg" });
    } catch (err) {
      console.warn(`[LV] Background fetch error:`, err);
      return null;
    }
  };

  let blob = await tryDirectFetch(url);
  
  // If direct fetch failed (CORS), try background script
  if (!blob) {
    console.log(`[LV] Direct fetch failed, trying background script (bypasses CORS)...`);
    blob = await tryBackgroundFetch(url);
  }
  
  // Fallback: try proxy URL if provided
  if (!blob && proxyBaseUrl && !url.includes("/public-objects/")) {
    const proxyUrl = `${proxyBaseUrl}/api/public/image-proxy?url=${encodeURIComponent(url)}`;
    console.log(`[LV] Trying proxy: ${proxyUrl}`);
    blob = await tryDirectFetch(proxyUrl);
    
    // If proxy also fails due to CORS, try via background
    if (!blob) {
      blob = await tryBackgroundFetch(proxyUrl);
    }
  }
  
  if (!blob) {
    console.error(`[LV] All fetch attempts failed for: ${url}`);
    return null;
  }
  
  if (blob.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    console.warn(`[LV] Image too large: ${Math.round(blob.size / 1024 / 1024)}MB`);
    return null;
  }
  
  const filename = extractFilenameFromUrl(url);
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  
  return file;
}

let uploadInProgress = false;
const uploadedImageHashes = new Set<string>();
const uploadedPerceptualHashes = new Set<string>();

/**
 * dHash (Difference Hash) - Perceptual image hashing
 * Compares adjacent pixel brightness to create a fingerprint
 * Similar images produce similar hashes (Hamming distance <= 5 = duplicate)
 */
async function computeDHash(file: File, size: number = 9): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // Create canvas for resizing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(''); // Fallback - can't compute hash
          return;
        }
        
        // Resize to (size x size-1) for difference hash
        canvas.width = size;
        canvas.height = size - 1;
        ctx.drawImage(img, 0, 0, size, size - 1);
        
        // Get grayscale pixel data
        const imageData = ctx.getImageData(0, 0, size, size - 1);
        const pixels = imageData.data;
        
        // Convert to grayscale values
        const gray: number[] = [];
        for (let i = 0; i < pixels.length; i += 4) {
          // Use luminosity formula for grayscale
          const g = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
          gray.push(g);
        }
        
        // Compute difference hash - compare adjacent pixels horizontally
        let hash = '';
        for (let y = 0; y < size - 1; y++) {
          for (let x = 0; x < size - 1; x++) {
            const idx = y * size + x;
            // 1 if left pixel brighter than right, 0 otherwise
            hash += gray[idx] > gray[idx + 1] ? '1' : '0';
          }
        }
        
        // Convert binary to hex (64 bits = 16 hex chars)
        let hexHash = '';
        for (let i = 0; i < hash.length; i += 4) {
          const nibble = hash.substring(i, i + 4);
          hexHash += parseInt(nibble, 2).toString(16);
        }
        
        resolve(hexHash);
      } catch (e) {
        console.warn('[LV] dHash computation failed:', e);
        resolve(''); // Fallback
      }
    };
    
    img.onerror = () => {
      resolve(''); // Can't load image
    };
    
    // Load from file
    const reader = new FileReader();
    reader.onload = () => {
      img.src = reader.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Calculate Hamming distance between two hex hashes
 * Returns number of differing bits (0 = identical, <= 5 = very similar)
 */
function hammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 999;
  
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const n1 = parseInt(hash1[i], 16);
    const n2 = parseInt(hash2[i], 16);
    // XOR and count bits
    let xor = n1 ^ n2;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Check if image is perceptually similar to any already uploaded
 * Returns true if duplicate detected
 */
function isPerceptualDuplicate(newHash: string): boolean {
  if (!newHash) return false;
  
  for (const existingHash of uploadedPerceptualHashes) {
    const dist = hammingDistance(newHash, existingHash);
    if (dist <= 5) {
      console.log(`[LV] Perceptual duplicate detected (distance=${dist}): ${newHash.slice(0,8)} ~ ${existingHash.slice(0,8)}`);
      return true;
    }
  }
  return false;
}

/**
 * Create a SHA-256 hash from file content for exact deduplication
 */
async function getFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalize image URL to detect duplicates even with different query strings
 */
function normalizeImageUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove ALL query params for aggressive dedup
    return urlObj.origin + urlObj.pathname;
  } catch {
    return url.split('?')[0].toLowerCase();
  }
}

/**
 * Extract a canonical path from URL for aggressive dedup
 * Strips size variations like 640x480, 1920x1080 etc
 */
function getCanonicalImagePath(url: string): string {
  try {
    const normalized = normalizeImageUrl(url);
    // Remove common size patterns
    return normalized
      .replace(/[-_]\d{2,4}x\d{2,4}/g, '') // Remove -640x480, _1920x1080
      .replace(/\/\d{2,4}x\d{2,4}\//g, '/') // Remove /640x480/
      .replace(/_(?:small|medium|large|thumb|thumbnail)/gi, ''); // Remove size suffixes
  } catch {
    return url;
  }
}

async function uploadImagesFromUrls(imageUrls: string[], proxyBaseUrl?: string): Promise<{ success: boolean; uploaded: number; skipped: number; method: string }> {
  console.log(`[LV] ========== IMAGE UPLOAD PIPELINE ==========`);
  console.log(`[LV] Input: ${imageUrls.length} image URLs`);
  console.log(`[LV] MAX_UPLOAD_IMAGES limit: ${MAX_UPLOAD_IMAGES}`);
  console.log(`[LV] Proxy base URL: ${proxyBaseUrl || 'none'}`);
  
  if (uploadInProgress) {
    console.warn(`[LV] Upload already in progress, skipping duplicate call`);
    return { success: false, uploaded: 0, skipped: imageUrls.length, method: "duplicate_blocked" };
  }
  
  uploadInProgress = true;
  uploadedImageHashes.clear();
  uploadedPerceptualHashes.clear();
  
  try {
    // STAGE 1: URL-based deduplication (canonical paths)
    const seenCanonicalPaths = new Set<string>();
    const uniqueUrls: string[] = [];
    
    console.log(`[LV] Stage 1: URL deduplication from ${imageUrls.length} images...`);
    
    for (const url of imageUrls) {
      const canonical = getCanonicalImagePath(url);
      if (!seenCanonicalPaths.has(canonical)) {
        seenCanonicalPaths.add(canonical);
        uniqueUrls.push(url);
      } else {
        console.log(`[LV] URL duplicate: ${url.slice(-50)}`);
      }
    }
    
    console.log(`[LV] Stage 1 result: ${uniqueUrls.length} unique URLs (removed ${imageUrls.length - uniqueUrls.length} URL duplicates)`);
    
    const urlsToFetch = uniqueUrls.slice(0, MAX_UPLOAD_IMAGES);
    const skippedCount = Math.max(0, uniqueUrls.length - MAX_UPLOAD_IMAGES);
    
    // STAGE 2: Content + Perceptual deduplication
    console.log(`[LV] Stage 2: Content & perceptual dedup on ${urlsToFetch.length} images...`);
    
    const files: File[] = [];
    
    for (const url of urlsToFetch) {
      const file = await fetchImageAsFile(url, proxyBaseUrl);
      if (!file) continue;
      
      // Check 1: Exact content hash (SHA-256)
      const contentHash = await getFileHash(file);
      if (uploadedImageHashes.has(contentHash)) {
        console.log(`[LV] Exact duplicate (SHA-256): ${file.name}`);
        continue;
      }
      
      // Check 2: Perceptual hash (dHash) - catches resized/recompressed versions
      const perceptualHash = await computeDHash(file);
      if (perceptualHash && isPerceptualDuplicate(perceptualHash)) {
        console.log(`[LV] Perceptual duplicate (dHash): ${file.name}`);
        continue;
      }
      
      // Not a duplicate - add to collection
      uploadedImageHashes.add(contentHash);
      if (perceptualHash) {
        uploadedPerceptualHashes.add(perceptualHash);
      }
      
      const uniqueName = `vehicle-${Date.now()}-${files.length}-${file.name}`;
      const uniqueFile = new File([file], uniqueName, { type: file.type });
      files.push(uniqueFile);
      
      console.log(`[LV] Added unique image ${files.length}: ${file.name} (pHash: ${perceptualHash?.slice(0,8) || 'N/A'})`);
    }
    
    console.log(`[LV] Stage 2 complete: ${files.length} truly unique images`);
    
    if (files.length === 0) {
      return { success: false, uploaded: 0, skipped: imageUrls.length, method: "fetch_failed" };
    }
    
    // Try multiple methods to find the file input
    console.log("[LV] Looking for file input element...");
    
    // First, scroll to top where photos should be
    window.scrollTo(0, 0);
    await sleep(DELAY_MEDIUM);
    
    // Method 1: Standard file input selectors (check ALL file inputs on page)
    let fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    console.log(`[LV] Found ${fileInputs.length} total file inputs on page`);
    
    // Log details about each file input found
    fileInputs.forEach((fi, idx) => {
      console.log(`[LV] File input ${idx}: accept="${fi.accept}", multiple=${fi.multiple}, name="${fi.name}", id="${fi.id}"`);
    });
    
    // Method 2: If no file inputs OR they don't accept images, click the photo upload area
    let needToClickPhotoArea = fileInputs.length === 0;
    if (!needToClickPhotoArea) {
      // Check if any input accepts images
      const hasImageInput = Array.from(fileInputs).some(fi => {
        const accept = fi.accept?.toLowerCase() || '';
        return accept.includes('image') || accept === '' || accept === '*/*';
      });
      needToClickPhotoArea = !hasImageInput;
    }
    
    if (needToClickPhotoArea) {
      console.log("[LV] Need to click photo upload area first...");
      
      // Look for photo area with multiple strategies
      const photoAreaSelectors = [
        // Facebook-specific patterns
        '[data-testid*="photo"]',
        '[data-testid*="image"]',
        '[aria-label*="Add photo" i]',
        '[aria-label*="Add photos" i]',
        '[aria-label*="Upload photo" i]',
        '[aria-label*="drag and drop" i]',
        // Generic patterns
        '[role="button"][aria-label*="photo" i]',
        'div[class*="photoUpload"]',
        'div[class*="photo-upload"]',
        'div[class*="imageUpload"]',
      ];
      
      let clicked = false;
      for (const selector of photoAreaSelectors) {
        if (clicked) break;
        const elements = document.querySelectorAll<HTMLElement>(selector);
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          // Photo area should be near top of viewport
          if (rect.top > 50 && rect.top < 500 && rect.width > 80 && rect.height > 40) {
            console.log(`[LV] Clicking photo area via selector "${selector}"`);
            el.click();
            await sleep(DELAY_LONG);
            clicked = true;
            break;
          }
        }
      }
      
      // Also try finding elements with "Add photo" text
      if (!clicked) {
        const allElements = document.querySelectorAll('div, span, button, a');
        for (const el of allElements) {
          const text = (el.textContent || '').trim().toLowerCase();
          if ((text === 'add photos' || text === 'add photo' || text.includes('upload photo')) && 
              (el as HTMLElement).getBoundingClientRect().top < 400) {
            console.log(`[LV] Clicking element with text: "${text}"`);
            (el as HTMLElement).click();
            await sleep(DELAY_LONG);
            clicked = true;
            break;
          }
        }
      }
      
      // Re-check for file inputs after clicking
      await sleep(DELAY_MEDIUM);
      fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
      console.log(`[LV] After clicking photo area: Found ${fileInputs.length} file inputs`);
    }
    
    let input: HTMLInputElement | null = null;
    
    // Prefer inputs that accept images
    for (const fi of fileInputs) {
      const accept = fi.accept?.toLowerCase() || '';
      const multiple = fi.multiple;
      console.log(`[LV] Checking file input: accept="${accept}", multiple=${multiple}`);
      
      if (accept.includes("image") || accept === "" || accept === "*/*") {
        input = fi;
        console.log("[LV] Found suitable file input for images");
        break;
      }
    }
    
    // If still no match, use the first file input found (Facebook often has generic file inputs)
    if (!input && fileInputs.length > 0) {
      input = fileInputs[0];
      console.log("[LV] Using first available file input as fallback");
    }
    
    // Method 3: Try hidden file inputs that might be triggered by labels
    if (!input) {
      console.log("[LV] Looking for hidden file inputs...");
      const hiddenInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
      for (const hi of hiddenInputs) {
        const accept = hi.accept?.toLowerCase() || '';
        if (accept.includes("image") || accept === "" || accept === "*/*") {
          input = hi;
          console.log("[LV] Found hidden file input");
          break;
        }
      }
    }
    
    // Facebook allows up to 20 photos total
    const MAX_FB_PHOTOS = 20;
    
    // Count existing image previews - only count actual photo previews in the upload area
    // Not generic [role="img"] which would count icons and other UI images
    const countImagePreviews = (): number => {
      // Look for blob URLs (uploaded images) or scontent URLs (Facebook CDN) in a constrained area
      // The photo preview area is typically in the top 500px of the form
      let count = 0;
      
      // Method 1: Count blob: images (these are locally uploaded previews)
      const blobImages = document.querySelectorAll('img[src^="blob:"]');
      count += blobImages.length;
      
      // Method 2: Count background-image with blob URLs
      const divs = document.querySelectorAll('div[style*="background-image"]');
      for (const div of divs) {
        const style = (div as HTMLElement).style.backgroundImage;
        if (style.includes('blob:')) {
          count++;
        }
      }
      
      // Method 3: Count scontent images in the top portion (photo area)
      const scontentImages = document.querySelectorAll('img[src*="scontent"]');
      for (const img of scontentImages) {
        const rect = img.getBoundingClientRect();
        // Only count if in photo preview area (top 500px) and reasonable size
        if (rect.top < 500 && rect.width > 30 && rect.height > 30) {
          count++;
        }
      }
      
      return count;
    };
    
    let previewsBeforeUpload = countImagePreviews();
    console.log(`[LV] Current photo preview count: ${previewsBeforeUpload}`);
    
    // Upload all files - don't try to skip based on count because we can't reliably
    // match which images are already uploaded. The dedup logic earlier (URL/hash/perceptual)
    // handles actual duplicate detection. This just uploads what we have.
    const filesToUpload = files.slice(0, MAX_FB_PHOTOS);
    console.log(`[LV] Uploading ${filesToUpload.length} images (max ${MAX_FB_PHOTOS} allowed by Facebook)`);

    // === METHOD 1: Click file input directly (trigger native picker behavior) ===
    if (input) {
      try {
        console.log(`[LV] Method 1: Using file input with native setter...`);
        const maxAttr = input.getAttribute('max');
        const multipleAttr = input.multiple;
        console.log(`[LV] File input attributes: max="${maxAttr}", multiple=${multipleAttr}`);
        
        // Create DataTransfer with ALL files at once
        const dataTransfer = new DataTransfer();
        filesToUpload.forEach((f, idx) => {
          dataTransfer.items.add(f);
          console.log(`[LV] Added file ${idx + 1}/${filesToUpload.length}: ${f.name} (${(f.size / 1024).toFixed(1)} KB)`);
        });
        
        console.log(`[LV] DataTransfer has ${dataTransfer.files.length} files total`);
        
        // Use native property setter to bypass React's controlled input
        const nativeFileSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
        if (nativeFileSetter) {
          nativeFileSetter.call(input, dataTransfer.files);
          console.log(`[LV] Used native setter, input.files now has ${input.files?.length || 0} files`);
        } else {
          input.files = dataTransfer.files;
          console.log(`[LV] Used direct assignment, input.files now has ${input.files?.length || 0} files`);
        }
        
        // Dispatch events with composed flag for shadow DOM compatibility
        input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        
        // Also dispatch a custom event that some frameworks listen for
        input.dispatchEvent(new CustomEvent("file-selected", { 
          bubbles: true, 
          composed: true,
          detail: { files: dataTransfer.files }
        }));
        
        // Wait for upload to process
        const uploadWaitTime = Math.min(3000 + (filesToUpload.length * 200), 8000);
        console.log(`[LV] Waiting ${uploadWaitTime}ms for images to upload...`);
        await sleep(uploadWaitTime);
        
        // VERIFY: Check if image previews increased
        const previewsAfterUpload = countImagePreviews();
        const newPreviews = previewsAfterUpload - previewsBeforeUpload;
        console.log(`[LV] Previews after upload: ${previewsAfterUpload} (added ${newPreviews})`);
        
        if (newPreviews > 0) {
          console.log(`[LV] ✓ Uploaded ${newPreviews} images via file input`);
          return { success: true, uploaded: newPreviews, skipped: skippedCount + (urlsToFetch.length - files.length), method: "file_input" };
        }
        
        console.log(`[LV] File input method didn't work, trying next method...`);
      } catch (err) {
        console.warn(`[LV] File input method failed:`, err);
      }
    } else {
      console.log("[LV] No file input found");
    }

    // === METHOD 2: Clipboard paste approach ===
    console.log(`[LV] Method 2: Trying clipboard paste approach...`);
    try {
      // Find the photo upload area to focus
      const photoArea = document.querySelector('[aria-label*="Add photo" i], [aria-label*="drag" i], [data-testid*="photo"]');
      if (photoArea) {
        (photoArea as HTMLElement).focus();
        await sleep(100);
        
        // Create a paste event with the files
        const clipboardData = new DataTransfer();
        filesToUpload.forEach(f => clipboardData.items.add(f));
        
        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clipboardData: clipboardData
        });
        
        photoArea.dispatchEvent(pasteEvent);
        document.dispatchEvent(pasteEvent);
        
        await sleep(3000);
        
        const previewsAfterPaste = countImagePreviews();
        const newPreviews = previewsAfterPaste - previewsBeforeUpload;
        console.log(`[LV] After paste: ${previewsAfterPaste} previews (added ${newPreviews})`);
        
        if (newPreviews > 0) {
          console.log(`[LV] ✓ Uploaded ${newPreviews} images via paste`);
          return { success: true, uploaded: newPreviews, skipped: skippedCount + (urlsToFetch.length - files.length), method: "paste" };
        }
      }
    } catch (err) {
      console.warn(`[LV] Paste method failed:`, err);
    }

    // === METHOD 3: Trigger label click to open native file picker ===
    console.log(`[LV] Method 3: Triggering native file picker via label...`);
    try {
      // Find label for file input
      const fileInputLabels = document.querySelectorAll('label[for], label');
      for (const label of fileInputLabels) {
        const forAttr = (label as HTMLLabelElement).htmlFor;
        if (forAttr && input && input.id === forAttr) {
          console.log(`[LV] Found label for file input, will trigger click`);
          // This will open native file picker - user must manually select files
          // We can't programmatically select files in the native picker
          break;
        }
      }
    } catch (err) {
      console.warn(`[LV] Label click method failed:`, err);
    }
    
    // === METHOD 4: Enhanced drag-drop with proper event composition ===
    console.log(`[LV] Method 4: Trying enhanced drag-drop...`);
    
    const dropZoneSelectors = [
      '[data-testid="photo-upload-zone"]',
      '[aria-label*="Add photo" i]',
      '[aria-label*="Add photos" i]',
      '[aria-label*="drag and drop" i]',
      '[role="button"][aria-label*="photo" i]',
      'div[class*="photo"]',
      // Facebook's newer photo upload areas
      '[class*="upload"]',
      '[class*="media"]',
    ];
    
    let dropZone: Element | null = null;
    for (const selector of dropZoneSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          // Photo area should be in upper portion of page
          if (rect.top > 50 && rect.top < 400 && rect.width > 60 && rect.height > 40) {
            dropZone = el;
            console.log(`[LV] Found drop zone via selector: ${selector}`);
            break;
          }
        }
        if (dropZone) break;
      } catch { continue; }
    }
    
    if (dropZone) {
      try {
        const dataTransfer = new DataTransfer();
        filesToUpload.forEach((f) => dataTransfer.items.add(f));
        
        // Set proper drop effect
        Object.defineProperty(dataTransfer, 'dropEffect', { value: 'copy', writable: false });
        Object.defineProperty(dataTransfer, 'effectAllowed', { value: 'all', writable: false });
        
        // Full drag event sequence with composed flag
        const createDragEvent = (type: string) => new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer,
        });
        
        // Simulate realistic drag sequence
        dropZone.dispatchEvent(createDragEvent("dragenter"));
        await sleep(100);
        dropZone.dispatchEvent(createDragEvent("dragover"));
        await sleep(100);
        dropZone.dispatchEvent(createDragEvent("dragover")); // Multiple dragover events like real drag
        await sleep(50);
        dropZone.dispatchEvent(createDragEvent("drop"));
        dropZone.dispatchEvent(createDragEvent("dragleave"));
        
        // Wait and verify
        await sleep(3000);
        const previewsAfterDrop = countImagePreviews();
        const newPreviews = previewsAfterDrop - previewsBeforeUpload;
        console.log(`[LV] After drag-drop: ${previewsAfterDrop} previews (added ${newPreviews})`);
        
        if (newPreviews > 0) {
          console.log(`[LV] ✓ Uploaded ${newPreviews} images via drag-drop`);
          return { success: true, uploaded: newPreviews, skipped: skippedCount + (urlsToFetch.length - files.length), method: "drag_drop" };
        }
      } catch (err) {
        console.error(`[LV] Drag-drop method failed:`, err);
      }
    }
    
    // === METHOD 5: chrome.debugger API (nuclear option) ===
    console.log(`[LV] Method 5: Trying chrome.debugger API for file upload...`);
    try {
      // Get the current tab ID
      const tabInfo = await new Promise<{ tabId?: number }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "GET_CURRENT_TAB_ID" },
          (response) => resolve(response || {})
        );
      });

      // If GET_CURRENT_TAB_ID is not implemented, get tabId from background context
      const currentTabId = tabInfo?.tabId;

      if (currentTabId) {
        const debuggerResponse = await new Promise<{ ok: boolean; uploaded?: number; error?: string }>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "DEBUGGER_UPLOAD_IMAGES", payload: { tabId: currentTabId, imageUrls } },
            (response) => resolve(response || { ok: false, error: "No response" })
          );
        });

        if (debuggerResponse.ok && debuggerResponse.uploaded && debuggerResponse.uploaded > 0) {
          console.log(`[LV] Debugger upload success, waiting for previews...`);
          await sleep(5000);

          const previewsAfterDebugger = countImagePreviews();
          const newPreviews = previewsAfterDebugger - previewsBeforeUpload;
          console.log(`[LV] After debugger: ${previewsAfterDebugger} previews (added ${newPreviews})`);

          if (newPreviews > 0) {
            console.log(`[LV] Uploaded ${newPreviews} images via chrome.debugger`);
            return { success: true, uploaded: newPreviews, skipped: skippedCount + (urlsToFetch.length - files.length), method: "debugger" };
          }

          // Debugger set files but no previews appeared - dispatch change event
          if (input) {
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.dispatchEvent(new Event("input", { bubbles: true }));
            await sleep(3000);

            const previewsAfterRetrigger = countImagePreviews();
            const newPreviewsRetrigger = previewsAfterRetrigger - previewsBeforeUpload;
            if (newPreviewsRetrigger > 0) {
              console.log(`[LV] Uploaded ${newPreviewsRetrigger} images via debugger + re-trigger`);
              return { success: true, uploaded: newPreviewsRetrigger, skipped: skippedCount + (urlsToFetch.length - files.length), method: "debugger_retrigger" };
            }
          }
        }

        console.log(`[LV] Debugger method failed: ${debuggerResponse.error || "no previews appeared"}`);
      } else {
        console.log(`[LV] Could not get current tab ID for debugger approach`);
      }
    } catch (err) {
      console.warn(`[LV] chrome.debugger method failed:`, err);
    }

    // === METHOD 6: Batch fetch via background + retry all methods with fresh files ===
    console.log(`[LV] Method 6: Batch fetch via background and retry...`);
    try {
      const batchResponse = await new Promise<{ ok: boolean; images?: Array<{ dataUrl: string; filename: string; mimeType: string } | null> }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "FETCH_IMAGES_AS_BLOBS", payload: { urls: imageUrls.slice(0, MAX_UPLOAD_IMAGES) } },
          (response) => resolve(response || { ok: false })
        );
      });

      if (batchResponse.ok && batchResponse.images) {
        const bgFiles: File[] = [];
        for (const img of batchResponse.images) {
          if (!img) continue;
          try {
            // Convert data URL to File
            const response = await fetch(img.dataUrl);
            const blob = await response.blob();
            bgFiles.push(new File([blob], img.filename, { type: img.mimeType }));
          } catch { continue; }
        }

        if (bgFiles.length > 0 && input) {
          console.log(`[LV] Batch fetched ${bgFiles.length} files, retrying file input...`);

          const dt = new DataTransfer();
          bgFiles.forEach(f => dt.items.add(f));

          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
          if (nativeSetter) {
            nativeSetter.call(input, dt.files);
          } else {
            input.files = dt.files;
          }

          // Fire React-compatible events
          input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
          input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));

          // Also try: create a native change event with target set
          const nativeEvent = new Event("change", { bubbles: true, cancelable: false });
          Object.defineProperty(nativeEvent, "target", { writable: false, value: input });
          input.dispatchEvent(nativeEvent);

          await sleep(5000);

          const previewsAfterBatch = countImagePreviews();
          const newPreviews = previewsAfterBatch - previewsBeforeUpload;
          if (newPreviews > 0) {
            console.log(`[LV] Uploaded ${newPreviews} images via batch fetch + file input`);
            return { success: true, uploaded: newPreviews, skipped: skippedCount + (imageUrls.length - bgFiles.length), method: "batch_file_input" };
          }
        }
      }
    } catch (err) {
      console.warn(`[LV] Batch fetch retry failed:`, err);
    }

    // All automated methods exhausted - download images for user as last resort
    console.log(`[LV] All automated upload methods exhausted`);
    console.log(`[LV] Downloading images to user's Downloads folder as fallback...`);

    try {
      const vehicleInfo = document.querySelector('input[placeholder*="title" i], input[placeholder*="year" i]')?.getAttribute('value') || "vehicle";

      const downloadResponse = await new Promise<{ok: boolean; downloadedCount?: number; folderName?: string; error?: string}>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "DOWNLOAD_IMAGES", payload: { imageUrls, vehicleInfo } },
          (response) => resolve(response || { ok: false, error: "No response" })
        );
      });

      if (downloadResponse.ok && downloadResponse.downloadedCount) {
        console.log(`[LV] Downloaded ${downloadResponse.downloadedCount} images to ${downloadResponse.folderName}`);
        showPhotoUploadInstructions(downloadResponse.downloadedCount, downloadResponse.folderName || "Lotview-Photos");

        return {
          success: false,
          uploaded: 0,
          skipped: imageUrls.length,
          method: "downloaded_for_manual"
        };
      }
    } catch (err) {
      console.error(`[LV] Download failed:`, err);
    }

    return {
      success: false,
      uploaded: 0,
      skipped: imageUrls.length,
      method: "manual_required"
    };
  } finally {
    uploadInProgress = false;
  }
}

async function selectVehicleType(): Promise<boolean> {
  console.log("[LV] === VEHICLE TYPE SELECTION START ===");
  
  // STEP 1: Find the Vehicle type dropdown by scanning ALL visible text
  // Facebook's form has a clickable div that contains "Vehicle type" text
  let dropdown: HTMLElement | null = null;
  
  // Method 1: Find span/div with exact "Vehicle type" text and get clickable parent
  const allElements = document.querySelectorAll('span, div');
  console.log(`[LV] Scanning ${allElements.length} elements for "Vehicle type" text...`);
  
  for (const el of allElements) {
    const text = el.textContent?.trim();
    if (text === 'Vehicle type' || text === 'vehicle type') {
      console.log(`[LV] Found "Vehicle type" text in element:`, el.tagName);
      // Find the clickable parent - look for tabindex or role="button" or role="combobox"
      let parent: HTMLElement | null = el.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const tabindex = parent.getAttribute('tabindex');
        const role = parent.getAttribute('role');
        if (tabindex !== null || role === 'button' || role === 'combobox' || role === 'listbox') {
          dropdown = parent;
          console.log(`[LV] Found clickable parent at level ${i}: role=${role}, tabindex=${tabindex}`);
          break;
        }
        parent = parent.parentElement;
      }
      if (dropdown) break;
    }
  }
  
  // Method 2: Try aria-label selectors
  if (!dropdown) {
    console.log("[LV] Method 1 failed, trying aria-label selectors...");
    const ariaSelectors = [
      '[aria-label="Vehicle type"]',
      '[aria-label*="Vehicle type"]',
      '[aria-label*="vehicle type"]',
    ];
    for (const sel of ariaSelectors) {
      dropdown = document.querySelector<HTMLElement>(sel);
      if (dropdown) {
        console.log(`[LV] Found dropdown via aria-label: ${sel}`);
        break;
      }
    }
  }
  
  // Method 3: Find first combobox in form area (not in header)
  if (!dropdown) {
    console.log("[LV] Method 2 failed, looking for combobox elements...");
    const comboboxes = document.querySelectorAll<HTMLElement>('[role="combobox"]');
    for (const cb of comboboxes) {
      const rect = cb.getBoundingClientRect();
      // Skip elements in header area (top 80px) or not visible
      if (rect.top < 80 || rect.width === 0) continue;
      const text = cb.textContent?.toLowerCase() || '';
      if (text.includes('vehicle') || text.includes('type')) {
        dropdown = cb;
        console.log(`[LV] Found combobox at y=${rect.top} with text containing "vehicle/type"`);
        break;
      }
    }
  }
  
  if (!dropdown) {
    console.log("[LV] ERROR: Vehicle type dropdown NOT FOUND after all methods");
    console.log("[LV] Page may already have vehicle type selected or form structure changed");
    
    // Check if Year field already exists (meaning form is already expanded)
    const yearField = document.querySelector('[aria-label*="Year" i], span:contains("Year")');
    if (yearField) {
      console.log("[LV] Year field found - form may already be expanded, continuing...");
      return true;
    }
    return false;
  }
  
  // STEP 2: Click the dropdown using simulated real click for React compatibility
  console.log(`[LV] Clicking Vehicle type dropdown...`);
  dropdown.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(DELAY_MEDIUM);
  simulateRealClick(dropdown);
  await sleep(DELAY_LONG);
  
  // STEP 3: Find and click "Car/Truck" option
  console.log("[LV] Looking for Car/Truck option...");
  
  // Wait for options to appear
  let attempts = 0;
  let carTruckOption: HTMLElement | null = null;
  
  while (attempts < 5 && !carTruckOption) {
    // Look for option elements or any clickable items containing "Car" text
    const optionSelectors = [
      '[role="option"]',
      '[role="menuitem"]',
      '[role="menuitemradio"]',
    ];
    
    for (const sel of optionSelectors) {
      const options = document.querySelectorAll<HTMLElement>(sel);
      console.log(`[LV] Found ${options.length} elements with selector: ${sel}`);
      for (const opt of options) {
        const text = opt.textContent?.trim().toLowerCase() || '';
        if (text === 'car/truck' || text.includes('car/truck') || text === 'cars & trucks') {
          carTruckOption = opt;
          console.log(`[LV] Found Car/Truck option: "${opt.textContent?.trim()}"`);
          break;
        }
      }
      if (carTruckOption) break;
    }
    
    if (!carTruckOption) {
      // Also try spans with the text
      const spans = document.querySelectorAll('span, div');
      for (const span of spans) {
        const text = span.textContent?.trim().toLowerCase();
        if (text === 'car/truck') {
          carTruckOption = span.closest('[role="option"], [role="menuitem"], [tabindex]') as HTMLElement || span as HTMLElement;
          console.log(`[LV] Found Car/Truck via text search`);
          break;
        }
      }
    }
    
    if (!carTruckOption) {
      console.log(`[LV] Attempt ${attempts + 1}: Car/Truck not found, waiting...`);
      await sleep(DELAY_MEDIUM);
      attempts++;
    }
  }
  
  if (!carTruckOption) {
    console.log("[LV] ERROR: Car/Truck option NOT FOUND in dropdown");
    simulateRealClick(document.body); // Close any open dropdown
    return false;
  }
  
  // Click the option using simulated real click for React compatibility
  console.log("[LV] Clicking Car/Truck option...");
  carTruckOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(DELAY_SHORT);
  simulateRealClick(carTruckOption);
  await sleep(DELAY_DROPDOWN); // Use DELAY_DROPDOWN for dropdown selection
  
  console.log("[LV] === VEHICLE TYPE SELECTION COMPLETE ===");
  return true;
}

async function waitForVehicleFields(maxWaitMs: number = 5000): Promise<boolean> {
  console.log("[LV] Waiting for Year/Make/Model fields to appear...");
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    resetFormContainerCache();
    const formContainer = getFormContainer();
    const searchRoot = formContainer || document;
    
    try {
      const yearFields = searchRoot.querySelectorAll('div[aria-label*="Year" i], input[aria-label*="Year" i]');
      const makeFields = searchRoot.querySelectorAll('div[aria-label*="Make" i], input[aria-label*="Make" i]');
      
      for (const field of yearFields) {
        if ((field as HTMLElement).offsetParent !== null && !isSearchInput(field as HTMLElement)) {
          console.log("[LV] Vehicle Year field detected via aria-label!");
          return true;
        }
      }
      for (const field of makeFields) {
        if ((field as HTMLElement).offsetParent !== null && !isSearchInput(field as HTMLElement)) {
          console.log("[LV] Vehicle Make field detected via aria-label!");
          return true;
        }
      }
    } catch { /* ignore selector errors */ }
    
    const allLabels = searchRoot.querySelectorAll('span, label');
    for (const label of allLabels) {
      if (isSearchInput(label as HTMLElement)) continue;
      const text = label.textContent?.trim().toLowerCase();
      if (text === 'year' || text === 'make' || text === 'model') {
        console.log(`[LV] Found vehicle field label: ${text}`);
        return true;
      }
    }
    
    await sleep(MUTATION_CHECK_INTERVAL_MS);
  }
  
  console.log("[LV] Vehicle fields did not appear within timeout");
  return false;
}

async function fillVehicleDropdown(fieldName: string, value: string): Promise<boolean> {
  if (!value) return false;
  
  console.log(`[LV] === FILLING DROPDOWN ${fieldName.toUpperCase()} with "${value}" ===`);
  
  // STEP 1: Find the dropdown by looking for the label text
  // IMPORTANT: For Year/Make/Model, we specifically look for COMBOBOX elements, NOT text inputs
  // This avoids accidentally typing into the Location text input
  let fieldElement: HTMLElement | null = null;
  
  // Find all span/label elements with the field name
  const allLabels = document.querySelectorAll('span, label');
  for (const label of allLabels) {
    const text = label.textContent?.trim();
    if (text === fieldName || text?.toLowerCase() === fieldName.toLowerCase()) {
      const rect = (label as HTMLElement).getBoundingClientRect();
      // Must be visible and not in header area
      if (rect.top < 100 || rect.width === 0) continue;
      
      console.log(`[LV] Found "${fieldName}" label at y=${rect.top}`);
      
      // Walk up to find a COMBOBOX or clickable dropdown - NOT a text input
      let parent: HTMLElement | null = label.parentElement;
      for (let i = 0; i < 8 && parent; i++) {
        const role = parent.getAttribute('role');
        const ariaHaspopup = parent.getAttribute('aria-haspopup');
        const tabindex = parent.getAttribute('tabindex');
        
        // Look specifically for combobox/listbox (dropdown pattern)
        if (role === 'combobox' || role === 'listbox' || ariaHaspopup === 'listbox') {
          fieldElement = parent;
          console.log(`[LV] Found ${fieldName} combobox: role=${role}, aria-haspopup=${ariaHaspopup}`);
          break;
        }
        
        // Also accept div with tabindex that doesn't contain a text input (dropdown indicator)
        if (tabindex !== null && role !== 'textbox') {
          // Check if this is a dropdown (has arrow icon or similar) not a text input
          const hasInput = parent.querySelector('input[type="text"]');
          if (!hasInput) {
            fieldElement = parent;
            console.log(`[LV] Found ${fieldName} dropdown via tabindex (no text input inside)`);
            break;
          }
        }
        
        parent = parent.parentElement;
      }
      if (fieldElement) break;
    }
  }
  
  // Method 2: Find by aria-label on combobox elements only
  if (!fieldElement) {
    console.log(`[LV] Method 1 failed for ${fieldName}, trying aria-label on comboboxes...`);
    const comboboxes = document.querySelectorAll<HTMLElement>('[role="combobox"], [aria-haspopup="listbox"]');
    for (const cb of comboboxes) {
      const ariaLabel = cb.getAttribute('aria-label')?.toLowerCase() || '';
      const innerText = cb.textContent?.toLowerCase() || '';
      if (ariaLabel.includes(fieldName.toLowerCase()) || innerText.includes(fieldName.toLowerCase())) {
        const rect = cb.getBoundingClientRect();
        if (rect.top > 100) {
          fieldElement = cb;
          console.log(`[LV] Found ${fieldName} combobox via aria-label search`);
          break;
        }
      }
    }
  }
  
  if (!fieldElement) {
    console.log(`[LV] ERROR: ${fieldName} dropdown NOT FOUND (combobox search failed)`);
    return false;
  }
  
  // STEP 2: Click to open the dropdown using simulated real click
  fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(DELAY_MEDIUM);
  console.log(`[LV] Clicking ${fieldName} dropdown...`);
  simulateRealClick(fieldElement);
  await sleep(DELAY_LONG); // Wait longer for dropdown options to appear
  
  // STEP 3: Find and select matching option
  console.log(`[LV] Looking for option matching "${value}"...`);
  
  // Cache fieldElement for use in nested function (already verified non-null above)
  const verifiedFieldElement = fieldElement;
  
  /**
   * Helper to click an option with multiple methods and verify selection
   */
  async function clickOption(opt: HTMLElement, matchType: string): Promise<boolean> {
    const optionText = opt.textContent?.trim() || '';
    console.log(`[LV] Clicking ${matchType} option: "${optionText}"`);
    opt.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(DELAY_SHORT);
    
    // Capture initial state of options count
    const initialOptions = document.querySelectorAll('[role="option"], [role="menuitem"]').length;
    
    // Try native click first
    opt.click();
    await sleep(DELAY_MEDIUM);
    
    // Verification: Check if dropdown closed (options reduced significantly)
    const optionsAfterClick = document.querySelectorAll('[role="option"], [role="menuitem"]').length;
    const dropdownClosed = optionsAfterClick < initialOptions / 2 || optionsAfterClick < 3;
    
    // Also verify by checking if the field element now contains the selected value
    const fieldText = verifiedFieldElement.textContent?.toLowerCase() || '';
    const valueSelected = fieldText.includes(value.toLowerCase().slice(0, 10)) || 
                          fieldText.includes(optionText.toLowerCase().slice(0, 10));
    
    if (dropdownClosed || valueSelected) {
      console.log(`[LV] ${fieldName} verified: dropdown closed=${dropdownClosed}, value visible=${valueSelected}`);
      return true;
    }
    
    // Try simulated real click if native click didn't work
    console.log(`[LV] Native click may not have worked, trying simulated click...`);
    simulateRealClick(opt);
    await sleep(DELAY_MEDIUM);
    
    // Re-verify after simulated click
    const optionsAfterSimClick = document.querySelectorAll('[role="option"], [role="menuitem"]').length;
    const closedAfterSim = optionsAfterSimClick < initialOptions / 2 || optionsAfterSimClick < 3;
    
    // Final field text check
    const finalFieldText = verifiedFieldElement.textContent?.toLowerCase() || '';
    const finalValueSelected = finalFieldText.includes(value.toLowerCase().slice(0, 8)) || 
                                finalFieldText.includes(optionText.toLowerCase().slice(0, 8));
    
    if (closedAfterSim || finalValueSelected) {
      console.log(`[LV] ${fieldName} filled via simulated click: closed=${closedAfterSim}, value=${finalValueSelected}`);
      return true;
    }
    
    // Selection NOT verified - return FALSE to try next option
    console.log(`[LV] ${fieldName} click NOT verified (dropdown still open, value not visible) - trying next option`);
    return false;
  }
  
  // REDUCED from 8 to 3 attempts to prevent long hangs
  const MAX_DROPDOWN_ATTEMPTS = 3;
  let attempts = 0;
  let lastOptionCount = -1;
  let retriedDropdownOpen = false;
  
  while (attempts < MAX_DROPDOWN_ATTEMPTS) {
    // Look for role-based options first
    let options = document.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"], [role="menuitemradio"]');
    console.log(`[LV] Attempt ${attempts + 1}/${MAX_DROPDOWN_ATTEMPTS}: Found ${options.length} role-based options`);
    
    // RECOVERY: If no options found and haven't retried, try to re-open dropdown
    if (options.length === 0 && !retriedDropdownOpen) {
      console.log(`[LV] No options found, attempting to re-open ${fieldName} dropdown...`);
      retriedDropdownOpen = true;
      
      // Close any open dropdown first
      simulateRealClick(document.body);
      await sleep(DELAY_MEDIUM);
      
      // Re-click the field element to open dropdown
      if (fieldElement) {
        fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(DELAY_SHORT);
        simulateRealClick(fieldElement);
        await sleep(DELAY_LONG);
        
        // Check again for options
        options = document.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"], [role="menuitemradio"]');
        console.log(`[LV] After re-open attempt: Found ${options.length} options`);
      }
    }
    
    // EARLY EXIT: If still no options after recovery attempt
    if (options.length === 0 && retriedDropdownOpen) {
      console.log(`[LV] No options found for ${fieldName} even after re-open - dropdown may not work`);
      break;
    }
    
    lastOptionCount = options.length;
    
    // Try role-based options first (exact match priority)
    for (const opt of options) {
      const optText = opt.textContent?.trim() || '';
      if (optText === value) {
        if (await clickOption(opt, 'exact match')) return true;
      }
    }
    
    // Try partial matches (case insensitive, bidirectional)
    for (const opt of options) {
      const optText = opt.textContent?.trim() || '';
      const optLower = optText.toLowerCase();
      const valLower = value.toLowerCase();
      if (optLower === valLower ||
          optLower.startsWith(valLower) ||
          optLower.includes(valLower) ||
          valLower.startsWith(optLower) ||
          valLower.includes(optLower)) {
        if (await clickOption(opt, 'partial match')) return true;
      }
    }
    
    // Try matching first word only (e.g., "Soul" matches "Soul GT")
    const firstWord = value.split(' ')[0].toLowerCase();
    for (const opt of options) {
      const optText = opt.textContent?.trim() || '';
      const optFirstWord = optText.split(' ')[0].toLowerCase();
      if (optFirstWord === firstWord) {
        if (await clickOption(opt, `first-word (${firstWord})`)) return true;
      }
    }
    
    // Fallback: Look for any visible list items or divs with exact text
    // Facebook sometimes renders options as simple list items without role attributes
    const listItems = document.querySelectorAll<HTMLElement>('div[tabindex="-1"], li, span[dir="auto"]');
    for (const item of listItems) {
      const itemText = item.textContent?.trim();
      if (itemText === value && item.offsetParent !== null) {
        const rect = item.getBoundingClientRect();
        // Must be in visible dropdown area (below the form header)
        if (rect.top > 150 && rect.height > 0 && rect.height < 60) {
          if (await clickOption(item, 'list item')) return true;
        }
      }
    }
    
    attempts++;
    await sleep(DELAY_MEDIUM);
  }
  
  console.log(`[LV] Failed to select "${value}" for ${fieldName} after ${attempts} attempts`);
  simulateRealClick(document.body); // Close any open dropdown
  await sleep(DELAY_SHORT);
  return false;
}

async function fillTextInput(fieldName: string, value: string): Promise<boolean> {
  if (!value) return false;
  
  console.log(`[LV] === FILLING TEXT INPUT ${fieldName.toUpperCase()} with "${value}" ===`);
  
  /**
   * Set native value on input using Object.getOwnPropertyDescriptor
   * This is more reliable for React controlled inputs
   */
  function setNativeValue(input: HTMLInputElement, newValue: string): void {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, newValue);
    } else {
      input.value = newValue;
    }
  }
  
  /**
   * Simulate keyboard typing with full event sequence for React apps
   */
  async function typeWithKeyboard(input: HTMLInputElement, text: string): Promise<boolean> {
    // Store original value for comparison
    const originalValue = input.value;
    
    // Clear field first
    input.focus();
    await sleep(50);
    
    // Select all and delete
    input.select();
    await sleep(30);
    
    // Use native setter to clear
    setNativeValue(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);
    
    // Type each character using full keyboard event sequence
    for (const char of text) {
      // KeyboardEvent sequence for each character
      input.dispatchEvent(new KeyboardEvent('keydown', { 
        key: char, 
        code: `Key${char.toUpperCase()}`,
        bubbles: true,
        cancelable: true 
      }));
      
      input.dispatchEvent(new KeyboardEvent('keypress', { 
        key: char, 
        bubbles: true,
        cancelable: true 
      }));
      
      // Update value
      setNativeValue(input, input.value + char);
      
      // InputEvent with insertText type
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: char,
      }));
      
      input.dispatchEvent(new KeyboardEvent('keyup', { 
        key: char, 
        bubbles: true 
      }));
      
      await sleep(20);
    }
    
    // Finalize with change event
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    await sleep(50);
    
    // VALIDATION: Check if value was set correctly
    const actualValue = input.value;
    console.log(`[LV] Typed "${text}" into input, final value: "${actualValue}"`);
    
    if (actualValue !== text) {
      console.log(`[LV] WARNING: Value mismatch! Expected "${text}", got "${actualValue}"`);
      // Try direct assignment as fallback
      setNativeValue(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(50);
      
      const retryValue = input.value;
      console.log(`[LV] After direct assignment: "${retryValue}"`);
      return retryValue === text;
    }
    
    return true;
  }
  
  // Collect all candidate inputs
  const candidateInputs: Array<{input: HTMLInputElement, label: Element, distance: number}> = [];
  
  // Search in multiple possible containers (not just dialog)
  const searchContainers = [
    document.querySelector('[role="dialog"]'),
    document.querySelector('form'),
    document.querySelector('[aria-label*="Create"]'),
    document.body
  ].filter(Boolean) as Element[];
  
  for (const container of searchContainers) {
    const allSpans = container.querySelectorAll('span, label');
    
    for (const span of allSpans) {
      const text = span.textContent?.trim();
      if (text !== fieldName && text?.toLowerCase() !== fieldName.toLowerCase()) continue;
      
      const labelRect = (span as HTMLElement).getBoundingClientRect();
      if (labelRect.top < 100 || labelRect.width === 0) continue;
      
      // Find input in parent hierarchy
      let parent: HTMLElement | null = span.parentElement;
      for (let i = 0; i < 6 && parent; i++) {
        const inputs = parent.querySelectorAll<HTMLInputElement>(
          'input[type="text"], input[type="tel"], input[type="number"], input:not([type])'
        );
        
        for (const input of inputs) {
          if (input.type === 'hidden' || input.type === 'file' || input.type === 'checkbox') continue;
          if (!input.offsetParent) continue;

          // Skip Location input when filling non-Location fields (e.g. Model)
          if (fieldName.toLowerCase() !== 'location') {
            const ariaLabel = input.getAttribute('aria-label')?.toLowerCase() || '';
            const role = input.getAttribute('role') || '';
            const closestCombobox = input.closest('[role="combobox"]');
            const comboboxAria = closestCombobox?.getAttribute('aria-label')?.toLowerCase() || '';
            if (ariaLabel.includes('location') || comboboxAria.includes('location') ||
                (role === 'combobox' && ariaLabel.includes('location'))) {
              console.log(`[LV] Skipping Location input when filling ${fieldName}`);
              continue;
            }
          }

          const inputRect = input.getBoundingClientRect();
          if (inputRect.width < 50 || inputRect.height < 20) continue;

          // Calculate distance between label and input
          const distance = Math.abs(labelRect.top - inputRect.top) + Math.abs(labelRect.left - inputRect.left);

          // Avoid duplicates
          if (!candidateInputs.some(c => c.input === input)) {
            candidateInputs.push({ input, label: span, distance });
          }
        }
        parent = parent.parentElement;
      }
    }
    
    // Break if we found candidates in this container
    if (candidateInputs.length > 0) break;
  }
  
  // Sort by distance (closest label-input pair first)
  candidateInputs.sort((a, b) => a.distance - b.distance);
  
  console.log(`[LV] Found ${candidateInputs.length} candidate inputs for "${fieldName}"`);
  
  // Try candidates in order until one succeeds
  for (const { input, distance } of candidateInputs) {
    console.log(`[LV] Trying input (distance=${distance}, type="${input.type}", placeholder="${input.placeholder || 'none'}"), current value: "${input.value}"`);
    
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(DELAY_SHORT);
    
    const success = await typeWithKeyboard(input, value);
    
    if (success) {
      await sleep(DELAY_SHORT);
      console.log(`[LV] ${fieldName} filled successfully!`);
      return true;
    } else {
      console.log(`[LV] Input failed validation, trying next candidate...`);
    }
  }
  
  // Fallback: Try aria-label
  const ariaInput = document.querySelector<HTMLInputElement>(`input[aria-label*="${fieldName}" i]`);
  if (ariaInput && ariaInput.offsetParent !== null && ariaInput.type !== 'hidden') {
    // Skip Location input when filling non-Location fields
    const ariaLabelVal = ariaInput.getAttribute('aria-label')?.toLowerCase() || '';
    if (fieldName.toLowerCase() !== 'location' && ariaLabelVal.includes('location')) {
      console.log(`[LV] Skipping Location input in aria-label fallback for ${fieldName}`);
    } else {
      console.log(`[LV] Found ${fieldName} via aria-label, current value: "${ariaInput.value}"`);
      ariaInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(DELAY_SHORT);

      const success = await typeWithKeyboard(ariaInput, value);
      if (success) {
        await sleep(DELAY_SHORT);
        return true;
      }
    }
  }
  
  console.log(`[LV] ERROR: ${fieldName} text input NOT FOUND or all candidates failed`);
  return false;
}

/**
 * Simulate a real mouse click with proper event sequence for React
 */
function simulateRealClick(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  
  // Full event sequence that React listens to
  const eventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
  };
  
  element.dispatchEvent(new MouseEvent('mousedown', eventInit));
  element.dispatchEvent(new MouseEvent('mouseup', eventInit));
  element.dispatchEvent(new MouseEvent('click', eventInit));
}

async function fillLocationField(locationValue: string): Promise<boolean> {
  console.log(`[LV] === FILLING LOCATION with "${locationValue}" ===`);
  
  // Scroll down to make sure location field is visible
  window.scrollBy(0, 400);
  await sleep(DELAY_MEDIUM);
  
  // Find all visible inputs and look for one near "Location" text
  const allInputs = document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])');
  let locationInput: HTMLInputElement | null = null;
  
  for (const input of allInputs) {
    const rect = input.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 20 || rect.top < 100) continue;
    if (isSearchInput(input)) continue;
    
    // Check if this input is near "Location" text
    const parent = input.closest('div')?.parentElement?.parentElement;
    const parentText = parent?.textContent?.toLowerCase() || '';
    const siblingText = input.closest('div')?.previousElementSibling?.textContent?.toLowerCase() || '';
    
    if (parentText.includes('location') || siblingText.includes('location') ||
        input.placeholder?.toLowerCase().includes('location')) {
      locationInput = input;
      console.log(`[LV] Found location input near "Location" text`);
      break;
    }
  }
  
  // Fallback: Find the first visible text input after scrolling to bottom
  if (!locationInput) {
    console.log("[LV] No location input by context, trying last visible text input...");
    const visibleInputs = Array.from(allInputs).filter(inp => {
      const r = inp.getBoundingClientRect();
      return r.width > 100 && r.height > 20 && r.top > 400 && r.top < 900 && !isSearchInput(inp);
    });
    if (visibleInputs.length > 0) {
      locationInput = visibleInputs[visibleInputs.length - 1];
      console.log(`[LV] Using last visible input as location field`);
    }
  }
  
  if (!locationInput) {
    console.log("[LV] ERROR: Location input NOT FOUND");
    return false;
  }
  
  // Extract the city name from locationValue (take first part before comma)
  // e.g. "Vancouver, BC" -> "Vancouver", "Los Angeles, CA" -> "Los Angeles"
  const searchText = locationValue.split(",")[0].trim();
  const searchTextLower = searchText.toLowerCase();

  locationInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(DELAY_MEDIUM);
  locationInput.focus();
  await sleep(DELAY_SHORT);
  
  // Use setNativeValue for React compatibility
  setNativeValue(locationInput, '');
  await sleep(100);
  
  // Type the city name character by character
  for (const char of searchText) {
    locationInput.value += char;
    locationInput.dispatchEvent(new Event('input', { bubbles: true }));
    locationInput.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
    await sleep(50);
  }
  
  console.log(`[LV] Typed "${searchText}", waiting for autocomplete suggestions...`);
  await sleep(2500); // Wait 2.5 seconds for autocomplete
  
  // Now find the first matching suggestion and click it
  let optionClicked = false;
  
  // Method 1: Find by text match in suggestions area
  const allElements = document.querySelectorAll('*');
  const inputRect = locationInput.getBoundingClientRect();
  
  // Collect potential suggestion elements
  const suggestions: {el: HTMLElement; text: string; score: number}[] = [];
  
  for (const el of allElements) {
    if (!(el instanceof HTMLElement)) continue;
    const rect = el.getBoundingClientRect();
    const text = el.textContent?.trim() || '';
    
    // Must be below or near the input field, visible, and contain the search text
    if (rect.width < 100 || rect.height < 15 || rect.height > 100) continue;
    if (rect.top < inputRect.top - 50) continue; // Not above input
    if (rect.top > inputRect.bottom + 400) continue; // Not too far below
    if (!text.toLowerCase().includes(searchTextLower)) continue;
    if (el.tagName === 'INPUT') continue; // Skip the input itself
    
    // Score by how good a match this is
    let score = 0;
    // Best: exact match with the full locationValue (e.g. "Vancouver, British Columbia")
    if (text.toLowerCase() === locationValue.toLowerCase()) score += 100;
    // Good: starts with the full locationValue
    else if (text.toLowerCase().startsWith(locationValue.toLowerCase())) score += 80;
    // Decent: contains the full locationValue
    else if (text.toLowerCase().includes(locationValue.toLowerCase())) score += 60;
    // OK: starts with the city name
    else if (text.toLowerCase().startsWith(searchTextLower)) score += 40;
    // Fallback: contains the city name (already filtered above)
    else score += 20;
    
    // Prefer elements that are direct text (not nested)
    if (el.children.length === 0) score += 20;
    
    // Prefer elements below the input
    if (rect.top > inputRect.bottom) score += 10;
    
    if (score > 0) {
      suggestions.push({ el, text, score });
    }
  }
  
  // Sort by score (best first)
  suggestions.sort((a, b) => b.score - a.score);
  
  console.log(`[LV] Found ${suggestions.length} potential location suggestions`);
  if (suggestions.length > 0) {
    console.log(`[LV] Top suggestions: ${suggestions.slice(0, 3).map(s => `"${s.text}" (score ${s.score})`).join(', ')}`);
  }
  
  // Try clicking the best suggestion
  for (const suggestion of suggestions) {
    console.log(`[LV] Trying to click: "${suggestion.text}"`);
    
    // First try native click
    suggestion.el.click();
    await sleep(DELAY_SHORT);
    
    // Check if input value changed (indicating selection worked)
    if (locationInput.value !== searchText && locationInput.value.toLowerCase().includes(searchTextLower)) {
      console.log(`[LV] Location selected via click: "${locationInput.value}"`);
      optionClicked = true;
      break;
    }
    
    // Try simulated real click
    simulateRealClick(suggestion.el);
    await sleep(DELAY_SHORT);
    
    if (locationInput.value !== searchText && locationInput.value.toLowerCase().includes(searchTextLower)) {
      console.log(`[LV] Location selected via simulated click: "${locationInput.value}"`);
      optionClicked = true;
      break;
    }
    
    // Try clicking parent element
    const parent = suggestion.el.parentElement;
    if (parent && parent.tagName !== 'BODY' && parent.tagName !== 'HTML') {
      simulateRealClick(parent);
      await sleep(DELAY_SHORT);
      
      if (locationInput.value !== searchText && locationInput.value.toLowerCase().includes(searchTextLower)) {
        console.log(`[LV] Location selected via parent click: "${locationInput.value}"`);
        optionClicked = true;
        break;
      }
    }
  }
  
  // Method 2: Try keyboard selection if click didn't work
  if (!optionClicked) {
    console.log("[LV] Click methods failed, trying keyboard navigation...");
    locationInput.focus();
    await sleep(DELAY_SHORT);
    
    // Arrow down to highlight first option
    locationInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, keyCode: 40 }));
    await sleep(DELAY_MEDIUM);
    
    // Enter to select
    locationInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, keyCode: 13 }));
    await sleep(DELAY_SHORT);
    
    if (locationInput.value.toLowerCase().includes(searchTextLower)) {
      console.log(`[LV] Location selected via keyboard: "${locationInput.value}"`);
      optionClicked = true;
    }
  }
  
  locationInput.blur();
  
  if (optionClicked) {
    console.log("[LV] Location field FILLED successfully!");
    return true;
  } else {
    console.log("[LV] WARNING: Location typed but suggestion may not have been selected");
    // Still return true if we at least typed the value
    return true;
  }
}

async function checkCleanTitleCheckbox(): Promise<boolean> {
  console.log("[LV] Looking for Clean title checkbox...");
  
  // Find the "This vehicle has a clean title" text and nearby checkbox
  const allElements = document.querySelectorAll('span, div, label');
  for (const el of allElements) {
    const text = el.textContent?.toLowerCase() || '';
    if (text.includes('clean title') || text.includes('no significant damage')) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.top < 100 || rect.width === 0) continue;
      
      console.log(`[LV] Found "clean title" text at y=${rect.top}`);
      
      // Look for checkbox near this element
      let parent: HTMLElement | null = el.parentElement;
      for (let i = 0; i < 6 && parent; i++) {
        // Look for checkbox input or role="checkbox"
        const checkbox = parent.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (checkbox) {
          if (!checkbox.checked) {
            checkbox.click();
            await sleep(100);
            console.log("[LV] Clicked checkbox input");
          }
          console.log("[LV] Clean title checkbox checked!");
          return true;
        }
        
        // Try role="checkbox" div
        const roleCheckbox = parent.querySelector<HTMLElement>('[role="checkbox"]');
        if (roleCheckbox) {
          const isChecked = roleCheckbox.getAttribute('aria-checked') === 'true';
          if (!isChecked) {
            roleCheckbox.click();
            await sleep(100);
            console.log("[LV] Clicked role=checkbox element");
          }
          console.log("[LV] Clean title checkbox checked!");
          return true;
        }
        
        parent = parent.parentElement;
      }
    }
  }
  
  // Fallback: look for any visible checkbox in the form area
  const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  for (const cb of checkboxes) {
    const rect = cb.getBoundingClientRect();
    if (rect.top > 300 && rect.top < 1200 && !cb.checked) {
      const label = cb.closest('label')?.textContent?.toLowerCase() || '';
      const nearby = cb.parentElement?.textContent?.toLowerCase() || '';
      if (label.includes('title') || nearby.includes('title') || label.includes('damage') || nearby.includes('damage')) {
        cb.click();
        await sleep(100);
        console.log("[LV] Clicked checkbox via fallback");
        return true;
      }
    }
  }
  
  console.log("[LV] Clean title checkbox NOT FOUND");
  return false;
}

async function fillFacebook(job: PostJob): Promise<FillResult> {
  const { formData: rawFormData, imageUrls, proxyBaseUrl } = job;
  
  // Decode HTML entities on rawFormData BEFORE sanitize (fixes &#x2F; in title/trim/highlights)
  const rfd = rawFormData as Record<string, unknown>;
  for (const key of ['title', 'description', 'model', 'trim', 'highlights'] as const) {
    if (typeof rfd[key] === 'string') rfd[key] = decodeHtmlEntities(rfd[key] as string);
  }
  
  const formData = sanitizeFormData(rawFormData);

  // Decode HTML entities (e.g., SUN&#x2F;MOON ROOF → SUN/MOON ROOF)
  const fd = formData as Record<string, unknown>;
  if (typeof fd.title === "string") fd.title = decodeHtmlEntities(fd.title);
  if (typeof fd.description === "string") fd.description = decodeHtmlEntities(fd.description);
  if (typeof fd.model === "string") fd.model = decodeHtmlEntities(fd.model);
  if (typeof fd.highlights === "string") fd.highlights = decodeHtmlEntities(fd.highlights);

  const filledFields: string[] = [];
  const missingFields: string[] = [];
  const warnings: string[] = [];

  console.log("[LV] Starting Facebook form fill...");
  console.log("[LV] === DEBUG: Form data received ===");
  console.log("[LV] exteriorColor:", (formData as Record<string, unknown>).exteriorColor);
  console.log("[LV] interiorColor:", (formData as Record<string, unknown>).interiorColor);
  console.log("[LV] fuelType:", (formData as Record<string, unknown>).fuelType);
  console.log("[LV] transmission:", (formData as Record<string, unknown>).transmission);
  console.log("[LV] imageUrls count:", imageUrls?.length || 0);
  console.log("[LV] First 3 imageUrls:", imageUrls?.slice(0, 3));
  console.log("[LV] proxyBaseUrl:", proxyBaseUrl);
  
  resetFormContainerCache();
  
  logDOMStructure();
  
  scrollFormIntoView();
  await sleep(DELAY_LONG);
  
  const container = getFormContainer();
  if (container) {
    console.log(`[LV] Form container found at y=${container.getBoundingClientRect().top}`);
  } else {
    console.log("[LV] No specific form container found - using semantic filtering");
  }

  // UPLOAD PHOTOS FIRST - they appear at the top of the form
  if (imageUrls && imageUrls.length > 0) {
    console.log("[LV] === UPLOADING PHOTOS FIRST (top of form) ===");
    // Scroll to top where photos area is
    window.scrollTo(0, 0);
    await sleep(DELAY_LONG);
    
    // Try multiple methods to find and click the photo upload area
    let photoAreaClicked = false;
    
    // Method 1: Find "Add photos" button or clickable photo area
    const photoSelectors = [
      '[aria-label*="Add photo" i]',
      '[aria-label*="drag and drop" i]',
      '[aria-label*="photo" i][role="button"]',
      'div[class*="photo"][role="button"]',
      'div[class*="upload"][role="button"]',
      'input[type="file"][accept*="image"]',
    ];
    
    for (const selector of photoSelectors) {
      if (photoAreaClicked) break;
      const elements = document.querySelectorAll<HTMLElement>(selector);
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        // Photo area should be in top portion of page
        if (rect.top > 50 && rect.top < 400 && rect.width > 50) {
          console.log(`[LV] Found photo area via: ${selector}, clicking...`);
          el.click();
          await sleep(DELAY_LONG);
          photoAreaClicked = true;
          break;
        }
      }
    }
    
    // Method 2: Look for any element with "Add photos" or similar text
    if (!photoAreaClicked) {
      const allElements = document.querySelectorAll('div, span, button');
      for (const el of allElements) {
        const text = el.textContent?.trim().toLowerCase() || '';
        const rect = (el as HTMLElement).getBoundingClientRect();
        if ((text === 'add photos' || text === 'add photo' || text.includes('drag and drop')) 
            && rect.top > 50 && rect.top < 400) {
          console.log(`[LV] Found photo area by text: "${text}"`);
          (el as HTMLElement).click();
          await sleep(DELAY_LONG);
          photoAreaClicked = true;
          break;
        }
      }
    }
    
    console.log(`[LV] Attempting to upload ${imageUrls.length} images...`);
    
    // Try upload with retry logic
    let uploadResult = await uploadImagesFromUrls(imageUrls, proxyBaseUrl);
    
    // Retry if first attempt failed
    if (!uploadResult.success && uploadResult.uploaded === 0) {
      console.log("[LV] First upload attempt failed, retrying after clicking photo area again...");
      await sleep(DELAY_MEDIUM);
      
      // Try clicking the visible photo icons/buttons
      const photoIcons = document.querySelectorAll<HTMLElement>('[role="img"][aria-label*="photo" i], svg, [class*="photo"]');
      for (const icon of photoIcons) {
        const rect = icon.getBoundingClientRect();
        if (rect.top > 50 && rect.top < 400 && rect.width > 20) {
          const clickable = icon.closest('[role="button"], button, [tabindex]') as HTMLElement;
          if (clickable) {
            console.log("[LV] Clicking photo icon/button for retry...");
            clickable.click();
            await sleep(DELAY_LONG);
            break;
          }
        }
      }
      
      uploadResult = await uploadImagesFromUrls(imageUrls, proxyBaseUrl);
    }
    
    if (uploadResult.success) {
      filledFields.push(`images (${uploadResult.uploaded} via ${uploadResult.method})`);
      if (uploadResult.skipped > 0) {
        warnings.push(`${uploadResult.skipped} images skipped`);
      }
      console.log("[LV] Photos uploaded successfully!");
    } else {
      // Provide clear message about manual photo upload
      warnings.push("Photos need to be added manually - click 'Add photos' above");
      console.log(`[LV] Photo upload result: ${uploadResult.method} - manual upload required`);
    }
    await sleep(DELAY_LONG);
  }

  const vehicleTypeSelected = await selectVehicleType();
  if (vehicleTypeSelected) {
    console.log("[LV] Vehicle type selected, waiting for form to expand...");
    const fieldsAppeared = await waitForVehicleFields(5000);
    
    if (fieldsAppeared) {
      const titleStr = typeof rawFormData.title === 'string' ? rawFormData.title : String(rawFormData.title || '');
      const rawYear = (formData as Record<string, unknown>).year;
      const yearValue = rawYear ? String(rawYear) : titleStr.match(/^(\d{4})/)?.[1] || "";
      console.log(`[LV] Year: raw=${rawYear} (${typeof rawYear}), resolved="${yearValue}"`);
      const makeValue = (formData as Record<string, unknown>).make as string ||
                        titleStr.split(' ')[1] || "";
      const baseModel = (formData as Record<string, unknown>).model as string ||
                         titleStr.split(' ').slice(2).join(' ') || "";
      const trimValue = (formData as Record<string, unknown>).trim as string || "";
      // Combine model + trim for the Model field (e.g., "Venue Ultimate Edition")
      const modelValue = trimValue ? `${baseModel} ${trimValue}`.trim() : baseModel;
      
      if (yearValue) {
        const yearFilled = await fillVehicleDropdown("Year", yearValue);
        if (yearFilled) filledFields.push("year");
        else warnings.push("Year field not filled");
        await sleep(DELAY_MEDIUM);
      }
      
      // Store normalized make for use in Model retry logic
      let normalizedMake = makeValue ? normalizeMakeForFacebook(makeValue) : '';
      
      let makeFilled = false;
      if (makeValue) {
        console.log(`[LV] === FILLING MAKE: "${makeValue}" → "${normalizedMake}" ===`);
        makeFilled = await fillVehicleDropdown("Make", normalizedMake);
        
        // Try original value if normalized failed
        if (!makeFilled && normalizedMake !== makeValue) {
          console.log(`[LV] Trying original make: "${makeValue}"`);
          makeFilled = await fillVehicleDropdown("Make", makeValue);
        }
        
        // VERIFY Make selection before proceeding to Model
        if (makeFilled) {
          await sleep(DELAY_SHORT);
          const makeVerified = verifyDropdownValue("Make", normalizedMake) || verifyDropdownValue("Make", makeValue);
          if (!makeVerified) {
            console.log(`[LV] WARNING: Make selection not verified in UI - Model dropdown may not populate correctly`);
            warnings.push("Make selection may not have worked - verify manually");
          } else {
            console.log(`[LV] ✓ Make selection verified in UI`);
          }
        }
        
        if (makeFilled) filledFields.push("make");
        else warnings.push("Make field not filled");
        await sleep(DELAY_MEDIUM);
      }
      
      // GUARD: Only attempt Model fill if Make was successfully filled
      // On Facebook vehicle forms, Model field only appears/enables after Make selection
      if (modelValue && makeFilled) {
        console.log(`[LV] === FILLING MODEL TEXT INPUT with "${modelValue}" ===`);
        
        // Wait for Model field to appear (may be dependent on Make selection)
        await sleep(DELAY_LONG);
        
        // Model is a TEXT INPUT (not a dropdown) - fill with model + trim + highlights
        // e.g., "Soul GT-Line Limited | ONE OWNER | NO ACCIDENTS"
        const modelFilled = await fillTextInput("Model", modelValue);
        
        if (modelFilled) {
          filledFields.push("model");
          console.log(`[LV] ✓ Model text input filled successfully`);
        } else {
          warnings.push("Model text input not filled");
          console.log(`[LV] Model text input not filled - trying fallback within form container`);
          
          // Fallback: Search within the vehicle form container only
          // Look for input fields labeled specifically as "Model"
          const formContainer = document.querySelector('[role="dialog"], form, [aria-label*="Create"]');
          if (formContainer) {
            const labels = formContainer.querySelectorAll('span, label');
            for (const label of labels) {
              if (label.textContent?.trim().toLowerCase() === 'model') {
                // Found exact "Model" label - look for input sibling/child
                const parent = label.closest('div[class]');
                if (parent) {
                  const inp = parent.querySelector<HTMLInputElement>('input');
                  if (inp && inp.type !== 'file' && inp.type !== 'hidden') {
                    console.log(`[LV] Found Model input via label search within form`);
                    inp.focus();
                    await sleep(100);
                    inp.value = modelValue;
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                    filledFields.push("model (fallback)");
                    break;
                  }
                }
              }
            }
          }
        }
        await sleep(DELAY_MEDIUM);
      } else if (modelValue && !makeFilled) {
        // Make failed, so skip Model entirely
        console.log(`[LV] SKIPPING Model fill - Make was not successfully selected`);
        warnings.push("Model skipped - Make selection failed");
      }
      
      // Fill Mileage/Odometer field (FB rejects values below 300 km)
      let odometerValue = (formData as Record<string, unknown>).odometer as string || "";
      if (odometerValue && parseInt(odometerValue, 10) < 300) {
        console.log(`[LV] Odometer ${odometerValue} below minimum, using 300`);
        odometerValue = "300";
      }
      if (odometerValue) {
        console.log(`[LV] === FILLING MILEAGE with "${odometerValue}" ===`);
        const mileageFilled = await fillTextInput("Mileage", odometerValue);
        if (mileageFilled) filledFields.push("mileage");
        else warnings.push("Mileage field not filled");
        await sleep(DELAY_MEDIUM);
      }
      
      // Scroll down to reveal Vehicle appearance and features section
      console.log("[LV] Scrolling to reveal Body style and color fields...");
      window.scrollBy(0, 350);
      await sleep(DELAY_LONG);
      
      // Fill Body style dropdown (SUV, Sedan, Coupe, etc.)
      // Use DB bodyType as primary source, model name matching as fallback
      const dbBodyType = String((formData as Record<string, unknown>).bodyType || "").toLowerCase().trim();
      const drivetrainValue = (formData as Record<string, unknown>).drivetrain as string || "";
      const modelForBodyStyle = modelValue.toLowerCase();
      const makeForBodyStyle = (normalizedMake || (formData as Record<string, unknown>).make as string || "").toLowerCase();
      let bodyStyle = "Sedan"; // Default

      // Primary: use DB bodyType if available
      if (dbBodyType) {
        if (dbBodyType.includes('suv') || dbBodyType.includes('sport utility') || dbBodyType.includes('crossover')) {
          bodyStyle = "SUV";
        } else if (dbBodyType.includes('truck') || dbBodyType.includes('pickup')) {
          bodyStyle = "Truck";
        } else if (dbBodyType.includes('coupe')) {
          bodyStyle = "Coupe";
        } else if (dbBodyType.includes('convertible') || dbBodyType.includes('roadster') || dbBodyType.includes('cabriolet')) {
          bodyStyle = "Convertible";
        } else if (dbBodyType.includes('wagon') || dbBodyType.includes('estate')) {
          bodyStyle = "Wagon";
        } else if (dbBodyType.includes('van') || dbBodyType.includes('minivan')) {
          bodyStyle = "Van";
        } else if (dbBodyType.includes('hatchback') || dbBodyType.includes('5-door')) {
          bodyStyle = "Hatchback";
        } else if (dbBodyType.includes('sedan')) {
          bodyStyle = "Sedan";
        }
        console.log(`[LV] Body style from DB bodyType "${dbBodyType}" → "${bodyStyle}"`);
      } else {
        console.log(`[LV] No DB bodyType, falling back to model name matching`);
      
      // Truck models (check first since some could match SUV patterns)
      if (modelForBodyStyle.includes("gladiator") || modelForBodyStyle.includes("pickup") ||
          modelForBodyStyle.includes("f-150") || modelForBodyStyle.includes("f150") ||
          modelForBodyStyle.includes("silverado") || modelForBodyStyle.includes("sierra") ||
          modelForBodyStyle.includes("ram") || modelForBodyStyle.includes("tacoma") ||
          modelForBodyStyle.includes("tundra") || modelForBodyStyle.includes("frontier") ||
          modelForBodyStyle.includes("colorado") || modelForBodyStyle.includes("ranger") ||
          modelForBodyStyle.includes("ridgeline") || modelForBodyStyle.includes("titan") ||
          modelForBodyStyle.includes("maverick")) {
        bodyStyle = "Truck";
      // SUV/Crossover models (comprehensive list)  
      } else if (modelForBodyStyle.includes("suv") || modelForBodyStyle.includes("crossover") ||
          // Jeep (ALL Jeeps except Gladiator are SUVs)
          makeForBodyStyle.includes("jeep") ||
          modelForBodyStyle.includes("wrangler") || modelForBodyStyle.includes("cherokee") ||
          modelForBodyStyle.includes("compass") || modelForBodyStyle.includes("renegade") ||
          modelForBodyStyle.includes("wagoneer") || modelForBodyStyle.includes("grand wagoneer") ||
          // Hyundai SUVs
          modelForBodyStyle.includes("santa fe") || modelForBodyStyle.includes("tucson") || 
          modelForBodyStyle.includes("kona") || modelForBodyStyle.includes("palisade") || 
          modelForBodyStyle.includes("venue") || modelForBodyStyle.includes("ioniq 5") ||
          // Subaru SUVs
          modelForBodyStyle.includes("crosstrek") || modelForBodyStyle.includes("forester") ||
          modelForBodyStyle.includes("outback") || modelForBodyStyle.includes("ascent") ||
          // Toyota SUVs
          modelForBodyStyle.includes("rav4") || modelForBodyStyle.includes("highlander") ||
          modelForBodyStyle.includes("4runner") || modelForBodyStyle.includes("sequoia") ||
          modelForBodyStyle.includes("land cruiser") || modelForBodyStyle.includes("venza") ||
          // Honda SUVs
          modelForBodyStyle.includes("cr-v") || modelForBodyStyle.includes("hr-v") ||
          modelForBodyStyle.includes("pilot") || modelForBodyStyle.includes("passport") ||
          // Acura SUVs
          modelForBodyStyle.includes("rdx") || modelForBodyStyle.includes("mdx") ||
          modelForBodyStyle.includes("zdx") ||
          // Ford SUVs
          modelForBodyStyle.includes("explorer") || modelForBodyStyle.includes("escape") ||
          modelForBodyStyle.includes("bronco") || modelForBodyStyle.includes("expedition") ||
          modelForBodyStyle.includes("edge") ||
          // Chevy SUVs
          modelForBodyStyle.includes("equinox") || modelForBodyStyle.includes("traverse") ||
          modelForBodyStyle.includes("blazer") || modelForBodyStyle.includes("tahoe") ||
          modelForBodyStyle.includes("suburban") || modelForBodyStyle.includes("trailblazer") ||
          // BMW/Mercedes SUVs
          modelForBodyStyle.includes("x1") || modelForBodyStyle.includes("x3") ||
          modelForBodyStyle.includes("x5") || modelForBodyStyle.includes("x7") ||
          modelForBodyStyle.includes("gle") || modelForBodyStyle.includes("glc") ||
          modelForBodyStyle.includes("gls") || modelForBodyStyle.includes("glb") ||
          // Audi SUVs
          modelForBodyStyle.includes("q3") || modelForBodyStyle.includes("q5") ||
          modelForBodyStyle.includes("q7") || modelForBodyStyle.includes("q8") ||
          // Lexus SUVs
          modelForBodyStyle.includes("rx") || modelForBodyStyle.includes("nx") ||
          modelForBodyStyle.includes("gx") || modelForBodyStyle.includes("lx") ||
          // Kia SUVs
          modelForBodyStyle.includes("sportage") || modelForBodyStyle.includes("sorento") ||
          modelForBodyStyle.includes("telluride") || modelForBodyStyle.includes("seltos") ||
          modelForBodyStyle.includes("soul") || modelForBodyStyle.includes("niro") ||
          // Nissan SUVs
          modelForBodyStyle.includes("rogue") || modelForBodyStyle.includes("murano") ||
          modelForBodyStyle.includes("pathfinder") || modelForBodyStyle.includes("armada") ||
          modelForBodyStyle.includes("kicks") ||
          // Mazda SUVs
          modelForBodyStyle.includes("cx-") ||
          // AWD/4WD drive usually means SUV
          drivetrainValue.toLowerCase().includes("awd") || drivetrainValue.toLowerCase().includes("4wd")) {
        bodyStyle = "SUV";
      } else if (modelForBodyStyle.includes("coupe") || modelForBodyStyle.includes("gt") ||
          modelForBodyStyle.includes("mustang") || modelForBodyStyle.includes("camaro") ||
          modelForBodyStyle.includes("challenger") || modelForBodyStyle.includes("corvette")) {
        bodyStyle = "Coupe";
      } else if (modelForBodyStyle.includes("convertible") || modelForBodyStyle.includes("roadster") ||
          modelForBodyStyle.includes("cabriolet") || modelForBodyStyle.includes("spyder")) {
        bodyStyle = "Convertible";
      } else if (modelForBodyStyle.includes("wagon") || modelForBodyStyle.includes("estate") ||
          modelForBodyStyle.includes("avant") || modelForBodyStyle.includes("allroad")) {
        bodyStyle = "Wagon";
      } else if (modelForBodyStyle.includes("van") || modelForBodyStyle.includes("minivan") ||
          modelForBodyStyle.includes("sienna") || modelForBodyStyle.includes("odyssey") ||
          modelForBodyStyle.includes("pacifica") || modelForBodyStyle.includes("carnival") ||
          modelForBodyStyle.includes("transit") || modelForBodyStyle.includes("sprinter")) {
        bodyStyle = "Van";
      } else if (modelForBodyStyle.includes("hatchback") || modelForBodyStyle.includes("5-door") ||
          modelForBodyStyle.includes("golf") || modelForBodyStyle.includes("civic hatch")) {
        bodyStyle = "Hatchback";
      }
      } // end else (no DB bodyType)
      console.log(`[LV] === FILLING BODY STYLE with "${bodyStyle}" ===`);
      const bodyStyleFilled = await fillVehicleDropdown("Body style", bodyStyle);
      if (bodyStyleFilled) filledFields.push("bodyStyle");
      else warnings.push("Body style field not filled");
      await sleep(DELAY_MEDIUM);
      
      // Fill Exterior color dropdown using comprehensive color matching
      const rawExteriorColor = (formData as Record<string, unknown>).exteriorColor as string || "";
      if (rawExteriorColor) {
        const normalizedColor = normalizeColorToFacebook(rawExteriorColor);
        console.log(`[LV] === FILLING EXTERIOR COLOR: "${rawExteriorColor}" → "${normalizedColor}" ===`);
        
        let exteriorFilled = await fillVehicleDropdown("Exterior color", normalizedColor);
        
        // Verify the selection stuck
        if (exteriorFilled) {
          await sleep(DELAY_SHORT);
          const verified = verifyDropdownValue("Exterior color", normalizedColor);
          if (!verified) {
            console.log(`[LV] Exterior color verification failed, retrying...`);
            exteriorFilled = await fillVehicleDropdown("Exterior color", normalizedColor);
          }
        }
        
        // Try original value if normalized failed
        if (!exteriorFilled && normalizedColor !== rawExteriorColor) {
          console.log(`[LV] Trying original exterior color: "${rawExteriorColor}"`);
          exteriorFilled = await fillVehicleDropdown("Exterior color", rawExteriorColor);
        }
        
        if (exteriorFilled) filledFields.push("exteriorColor");
        else warnings.push(`Exterior color "${rawExteriorColor}" not filled (tried "${normalizedColor}")`);
        await sleep(DELAY_MEDIUM);
      }
      
      // Fill Interior color dropdown using comprehensive color matching
      const rawInteriorColor = (formData as Record<string, unknown>).interiorColor as string || "Black";
      if (rawInteriorColor) {
        const normalizedIntColor = normalizeColorToFacebook(rawInteriorColor);
        console.log(`[LV] === FILLING INTERIOR COLOR: "${rawInteriorColor}" → "${normalizedIntColor}" ===`);
        
        let interiorFilled = await fillVehicleDropdown("Interior color", normalizedIntColor);
        
        // Verify the selection stuck
        if (interiorFilled) {
          await sleep(DELAY_SHORT);
          const verified = verifyDropdownValue("Interior color", normalizedIntColor);
          if (!verified) {
            console.log(`[LV] Interior color verification failed, retrying...`);
            interiorFilled = await fillVehicleDropdown("Interior color", normalizedIntColor);
          }
        }
        
        // Try original value if normalized failed
        if (!interiorFilled && normalizedIntColor !== rawInteriorColor) {
          console.log(`[LV] Trying original interior color: "${rawInteriorColor}"`);
          interiorFilled = await fillVehicleDropdown("Interior color", rawInteriorColor);
        }
        
        if (interiorFilled) filledFields.push("interiorColor");
        else warnings.push(`Interior color "${rawInteriorColor}" not filled (tried "${normalizedIntColor}")`);
        await sleep(DELAY_MEDIUM);
      }
      
      // Check the "Clean title" checkbox - always check it
      console.log("[LV] === CHECKING CLEAN TITLE CHECKBOX ===");
      const cleanTitleChecked = await checkCleanTitleCheckbox();
      if (cleanTitleChecked) filledFields.push("cleanTitle");
      else warnings.push("Clean title checkbox not checked");
      await sleep(DELAY_SHORT);
      
      // Fill Vehicle condition dropdown - always "Excellent"
      console.log(`[LV] === FILLING VEHICLE CONDITION ===`);
      const conditionFilled = await fillVehicleDropdown("Vehicle condition", "Excellent");
      if (conditionFilled) filledFields.push("vehicleCondition");
      else warnings.push("Vehicle condition field not filled");
      await sleep(DELAY_MEDIUM);
      
      // Fill Fuel type dropdown using comprehensive normalization
      const rawFuelType = (formData as Record<string, unknown>).fuelType as string || "";
      const normalizedFuel = normalizeFuelType(rawFuelType);
      console.log(`[LV] === FILLING FUEL TYPE: "${rawFuelType || '(none)'}" → "${normalizedFuel}" ===`);
      
      let fuelFilled = await fillVehicleDropdown("Fuel type", normalizedFuel);
      
      // Verify and retry if needed
      if (fuelFilled) {
        await sleep(DELAY_SHORT);
        const verified = verifyDropdownValue("Fuel type", normalizedFuel);
        if (!verified) {
          console.log(`[LV] Fuel type verification failed, retrying...`);
          fuelFilled = await fillVehicleDropdown("Fuel type", normalizedFuel);
        }
      }
      
      if (fuelFilled) filledFields.push("fuelType");
      else warnings.push(`Fuel type "${rawFuelType}" not filled (tried "${normalizedFuel}")`);
      await sleep(DELAY_MEDIUM);
      
      // Fill Transmission dropdown using comprehensive normalization
      const rawTransmission = (formData as Record<string, unknown>).transmission as string || "";
      const normalizedTrans = normalizeTransmission(rawTransmission);
      console.log(`[LV] === FILLING TRANSMISSION: "${rawTransmission || '(none)'}" → "${normalizedTrans}" ===`);
      
      let transFilled = await fillVehicleDropdown("Transmission", normalizedTrans);
      
      // Try variant names if failed
      if (!transFilled && normalizedTrans === 'Automatic') {
        console.log("[LV] Trying 'Automatic transmission' variant...");
        transFilled = await fillVehicleDropdown("Transmission", "Automatic transmission");
      }
      if (!transFilled && normalizedTrans === 'Manual') {
        console.log("[LV] Trying 'Manual transmission' variant...");
        transFilled = await fillVehicleDropdown("Transmission", "Manual transmission");
      }
      
      // Verify and retry if needed  
      if (transFilled) {
        await sleep(DELAY_SHORT);
        const verified = verifyDropdownValue("Transmission", normalizedTrans);
        if (!verified) {
          console.log(`[LV] Transmission verification failed, retrying...`);
          transFilled = await fillVehicleDropdown("Transmission", normalizedTrans);
        }
      }
      
      // Final fallback: try original value
      if (!transFilled && rawTransmission && normalizedTrans !== rawTransmission) {
        console.log(`[LV] Trying original transmission: "${rawTransmission}"`);
        transFilled = await fillVehicleDropdown("Transmission", rawTransmission);
      }
      
      if (transFilled) filledFields.push("transmission");
      else warnings.push(`Transmission "${rawTransmission || 'none'}" not filled (tried "${normalizedTrans}")`);
      await sleep(DELAY_MEDIUM);
    }
  } else {
    console.log("[LV] No vehicle type dropdown found - proceeding with standard form fill");
  }

  // For vehicle forms, Facebook auto-generates title from Year/Make/Model
  // Only try to fill title if we didn't successfully fill vehicle fields
  let titleFilled = false;
  const isVehicleForm = filledFields.includes("year") || filledFields.includes("make") || filledFields.includes("model");
  
  if (isVehicleForm) {
    console.log("[LV] Vehicle form detected - skipping title field (auto-generated from Year/Make/Model)");
    titleFilled = true; // Consider it filled since Facebook generates it
  } else {
    console.log("[LV] Attempting to fill title field...");
    const titleValue = typeof formData.title === "string" ? formData.title : "";
    titleFilled = await setInputWithRetry("title", titleValue);
  
    if (!titleFilled) {
      console.log("[LV] Title not found with standard selectors, trying broader search...");
      const formContainer = getFormContainer();
      const searchRoot = formContainer || document;
      const allInputs = searchRoot.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])');
      for (const input of allInputs) {
        if (isSearchInput(input)) {
          console.log(`[LV] Skipping search input in title fallback`);
          continue;
        }
        if (input.offsetParent !== null && !input.value && input.type === 'text') {
          const parent = input.closest('[role="dialog"]') || input.closest('form') || input.parentElement;
          const parentText = parent?.textContent?.toLowerCase() || '';
          if (parentText.includes('title') || parentText.includes('selling')) {
            console.log(`[LV] Found potential title input via DOM traversal`);
            setInputValue(input, titleValue);
            await sleep(100);
            if (input.value.includes(titleValue.substring(0, 10))) {
              titleFilled = true;
              break;
            }
          }
        }
      }
    }
    
    if (titleFilled) {
      filledFields.push("title");
      console.log("[LV] Title filled successfully");
    } else {
      missingFields.push("title");
      console.log("[LV] Title field NOT found");
    }
  }
  await sleep(DELAY_MEDIUM);

  // Scroll down to reveal more fields (Price, Description, etc.)
  console.log("[LV] Scrolling to reveal Price and Description fields...");
  window.scrollBy(0, 400);
  await sleep(DELAY_LONG);
  
  console.log("[LV] === FILLING PRICE FIELD ===");
  if (formData.price !== null && formData.price !== undefined && formData.price !== "") {
    // Extract numeric price only (remove $ and commas)
    const priceValue = String(formData.price).replace(/[^0-9]/g, '');
    console.log(`[LV] Price value to fill: "${priceValue}"`);
    
    let priceFilled = false;
    let priceInput: HTMLInputElement | null = null;
    
    // METHOD 1: Direct selectors from FIELD_CONFIGS.price (most reliable)
    const priceSelectors = [
      'input[name="price"]',
      'input[data-testid="marketplace-create-price"]',
      'input[type="text"][inputmode="numeric"]',
      'input[aria-label*="Price" i]',
      'input[inputmode="decimal"]',
    ];
    
    for (const selector of priceSelectors) {
      const inp = document.querySelector<HTMLInputElement>(selector);
      if (inp && inp.offsetParent !== null) {
        console.log(`[LV] Found Price input via selector: ${selector}`);
        priceInput = inp;
        break;
      }
    }
    
    // METHOD 2: Search ALL visible inputs and find one near "Price" text
    if (!priceInput) {
      console.log(`[LV] Trying aggressive input search for Price...`);
      const allInputs = document.querySelectorAll<HTMLInputElement>('input');
      
      for (const inp of allInputs) {
        // Skip hidden, file, checkbox, radio inputs
        if (inp.type === 'hidden' || inp.type === 'file' || inp.type === 'checkbox' || inp.type === 'radio') continue;
        if (!inp.offsetParent) continue; // Not visible
        
        // Check if this input is near "Price" text
        let parent: HTMLElement | null = inp.parentElement;
        for (let i = 0; i < 6 && parent; i++) {
          const parentText = parent.textContent?.toLowerCase() || '';
          // Look for price-related text but NOT mileage/year/location
          if ((parentText.includes('price') || parentText.includes('$')) && 
              !parentText.includes('mileage') && !parentText.includes('odometer') &&
              !parentText.includes('year') && !parentText.includes('location') &&
              !parentText.includes('search')) {
            console.log(`[LV] Found Price input via parent text search`);
            priceInput = inp;
            break;
          }
          parent = parent.parentElement;
        }
        if (priceInput) break;
      }
    }
    
    // METHOD 3: fillTextInput approach (label-based)
    if (!priceInput && !priceFilled) {
      console.log(`[LV] Trying fillTextInput for Price...`);
      priceFilled = await fillTextInput("Price", priceValue);
      if (priceFilled) {
        console.log(`[LV] ✓ Price filled via fillTextInput`);
      }
    }
    
    // METHOD 4: Search for exact "Price" label and find sibling input
    if (!priceInput && !priceFilled) {
      console.log(`[LV] Trying exact label search for Price...`);
      const allLabels = document.querySelectorAll('span, label, div');
      
      for (const label of allLabels) {
        const labelText = label.textContent?.trim() || '';
        // Match exact "Price" label (not "Enter your price..." which is helper text)
        if (labelText === 'Price') {
          console.log(`[LV] Found exact "Price" label`);
          // Look for input in same container or nearby
          let container: HTMLElement | null = label.parentElement;
          for (let i = 0; i < 6 && container && !priceInput; i++) {
            const inp = container.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])');
            if (inp && inp.offsetParent !== null) {
              console.log(`[LV] Found Price input via exact label`);
              priceInput = inp;
              break;
            }
            container = container.parentElement;
          }
          if (priceInput) break;
        }
      }
    }
    
    // METHOD 5: Find input with placeholder="Price" (Facebook often uses this)
    if (!priceInput && !priceFilled) {
      console.log(`[LV] Trying placeholder search for Price...`);
      const placeholderInputs = document.querySelectorAll<HTMLInputElement>('input[placeholder="Price"], input[placeholder="price"], input[placeholder*="price" i]');
      for (const inp of placeholderInputs) {
        if (inp.offsetParent !== null && inp.type !== 'hidden') {
          console.log(`[LV] Found Price input via placeholder: "${inp.placeholder}"`);
          priceInput = inp;
          break;
        }
      }
    }
    
    // METHOD 6: Last resort - find input near "Price" label with numeric characteristics
    if (!priceInput && !priceFilled) {
      console.log(`[LV] Trying constrained position-based search for Price...`);
      
      // First, find the "Price" label element
      const priceLabels = Array.from(document.querySelectorAll('span, label, div')).filter(el => {
        const text = el.textContent?.trim();
        return text === 'Price' && (el as HTMLElement).getBoundingClientRect().width > 20;
      });
      
      if (priceLabels.length > 0) {
        const priceLabel = priceLabels[0] as HTMLElement;
        const labelRect = priceLabel.getBoundingClientRect();
        console.log(`[LV] Found "Price" label at y=${labelRect.top}`);
        
        // Find inputs near this label (within 150px vertically)
        const nearbyInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input')).filter(inp => {
          if (!inp.offsetParent) return false;
          if (inp.type === 'hidden' || inp.type === 'file' || inp.type === 'checkbox') return false;
          const rect = inp.getBoundingClientRect();
          // Must be below the label and within 150px
          return rect.top >= labelRect.top && rect.top <= labelRect.top + 150 && rect.width > 60;
        });
        
        // Prefer inputs with numeric inputmode
        for (const inp of nearbyInputs) {
          const inputmode = inp.getAttribute('inputmode')?.toLowerCase() || '';
          if (inputmode === 'numeric' || inputmode === 'decimal') {
            console.log(`[LV] Found Price input via label proximity + numeric inputmode`);
            priceInput = inp;
            break;
          }
        }
        
        // Fall back to first nearby input if no numeric inputmode found
        if (!priceInput && nearbyInputs.length > 0) {
          const firstNearby = nearbyInputs[0];
          // Only use if empty or placeholder suggests price
          if (!firstNearby.value || firstNearby.placeholder?.toLowerCase().includes('price')) {
            console.log(`[LV] Found Price input via label proximity (first nearby)`);
            priceInput = firstNearby;
          }
        }
      }
    }
    
    // Fill the price input if found
    if (priceInput && !priceFilled) {
      priceInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(DELAY_SHORT);
      priceInput.focus();
      await sleep(100);
      
      // Clear existing value using native setter (React compatible)
      setNativeValue(priceInput, '');
      await sleep(50);

      // Set full value via React-compatible native setter
      setNativeValue(priceInput, priceValue);
      await sleep(500);

      // Verify the value stuck
      if (priceInput.value === priceValue || priceInput.value.includes(priceValue)) {
        console.log(`[LV] ✓ Price filled successfully: "${priceInput.value}"`);
        priceFilled = true;
      } else {
        // Retry: focus, select all (Ctrl+A), then type value using keyboard events
        console.log(`[LV] setNativeValue didn't stick (got "${priceInput.value}"), trying select-all + keyboard...`);
        priceInput.focus();
        await sleep(100);

        // Select all existing content
        priceInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));
        priceInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));
        document.execCommand('selectAll', false);
        await sleep(50);

        // Delete selected content
        priceInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
        await sleep(50);

        // Type the full value using insertText (works with React)
        document.execCommand('insertText', false, priceValue);
        priceInput.dispatchEvent(new Event('input', { bubbles: true }));
        priceInput.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(DELAY_SHORT);

        if (priceInput.value === priceValue || priceInput.value.includes(priceValue)) {
          console.log(`[LV] ✓ Price filled via select-all + keyboard: "${priceInput.value}"`);
          priceFilled = true;
        } else {
          console.log(`[LV] Price still wrong: expected "${priceValue}", got "${priceInput.value}"`);
        }
      }
    }
    
    if (priceFilled) {
      filledFields.push("price");
      console.log("[LV] ✓ Price filled successfully");
    } else {
      missingFields.push("price");
      console.log("[LV] ✗ Price field NOT found after all methods");
    }
    await sleep(DELAY_MEDIUM);
  }

  // Scroll down more to reveal Description field
  console.log("[LV] Scrolling to reveal Description field...");
  window.scrollBy(0, 300);
  await sleep(DELAY_LONG);
  
  console.log("[LV] Attempting to fill description field...");
  const descValue = typeof formData.description === "string" ? formData.description : "";
  let descFilled = false;
  
  if (descValue) {
    // Method 1: Find by label text "Description"
    const allLabels = document.querySelectorAll('span, label');
    for (const label of allLabels) {
      const text = label.textContent?.trim();
      if (text === "Description" || text?.toLowerCase() === "description") {
        const rect = (label as HTMLElement).getBoundingClientRect();
        if (rect.top < 100 || rect.width === 0) continue;
        
        console.log(`[LV] Found "Description" label at y=${rect.top}`);
        
        // Find textarea or textbox in parent hierarchy
        let parent: HTMLElement | null = label.parentElement;
        for (let i = 0; i < 8 && parent; i++) {
          const textarea = parent.querySelector<HTMLElement>('textarea, div[role="textbox"], [contenteditable="true"]');
          if (textarea && textarea.offsetParent !== null) {
            console.log(`[LV] Found description field, filling...`);
            textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(100);
            textarea.focus();
            await sleep(100);
            
            // Set content
            if (textarea.tagName === 'TEXTAREA') {
              (textarea as HTMLTextAreaElement).value = descValue;
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              // For contenteditable divs
              textarea.textContent = descValue;
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await sleep(200);
            descFilled = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (descFilled) break;
      }
    }
    
    // Method 2: Standard input retry
    if (!descFilled) {
      console.log("[LV] Description label not found, trying standard selectors...");
      descFilled = await setInputWithRetry("description", descValue);
    }
    
    // Method 3: All textareas/textboxes
    if (!descFilled) {
      console.log("[LV] Trying all visible textareas...");
      const textareas = document.querySelectorAll<HTMLElement>('textarea, div[role="textbox"], [contenteditable="true"]');
      for (const ta of textareas) {
        const rect = ta.getBoundingClientRect();
        if (rect.top < 100 || rect.width === 0) continue;
        if (isSearchInput(ta)) continue;
        
        const aria = ta.getAttribute('aria-label')?.toLowerCase() || '';
        const placeholder = ta.getAttribute('placeholder')?.toLowerCase() || '';
        const parentText = ta.parentElement?.textContent?.toLowerCase().slice(0, 100) || '';
        
        if (aria.includes('description') || placeholder.includes('description') || 
            aria.includes('seller') || parentText.includes('description')) {
          console.log(`[LV] Found description via attributes/parent text`);
          ta.focus();
          await sleep(100);
          if (ta.tagName === 'TEXTAREA') {
            (ta as HTMLTextAreaElement).value = descValue;
          } else {
            ta.textContent = descValue;
          }
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          await sleep(100);
          descFilled = true;
          break;
        }
      }
    }
    
    // Method 4: Scroll more and find any large textarea/textbox
    if (!descFilled) {
      console.log("[LV] Method 4: Scrolling and looking for large text areas...");
      window.scrollBy(0, 300);
      await sleep(DELAY_MEDIUM);
      
      const textAreas = document.querySelectorAll<HTMLElement>('textarea, div[role="textbox"], [contenteditable="true"]');
      for (const ta of textAreas) {
        const rect = ta.getBoundingClientRect();
        // Description fields are typically wider and taller than single-line inputs
        if (rect.height < 40 || rect.width < 200) continue;
        if (rect.top < 100 || rect.top > 900) continue;
        if (isSearchInput(ta)) continue;
        
        // Skip if already has content
        const currentContent = ta.tagName === 'TEXTAREA' 
          ? (ta as HTMLTextAreaElement).value 
          : ta.textContent || '';
        if (currentContent.length > 20) continue;
        
        console.log(`[LV] Method 4: Found large text area at y=${rect.top}, size=${rect.width}x${rect.height}`);
        ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(DELAY_SHORT);
        ta.focus();
        await sleep(DELAY_SHORT);
        
        // Fill using execCommand for contenteditable
        if (ta.getAttribute('contenteditable') === 'true' || ta.getAttribute('role') === 'textbox') {
          document.execCommand('insertText', false, descValue);
        } else if (ta.tagName === 'TEXTAREA') {
          (ta as HTMLTextAreaElement).value = descValue;
        }
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(DELAY_SHORT);
        
        descFilled = true;
        console.log("[LV] Method 4: Description filled!");
        break;
      }
    }
  }
  
  if (descFilled) {
    filledFields.push("description");
    console.log("[LV] Description filled successfully");
  } else {
    warnings.push("Description field not filled");
    console.log("[LV] Description field NOT found");
  }
  await sleep(randomDelay(300, 500));

  // Fill Location field with hardcoded "Vancouver, BC"
  console.log("[LV] Filling Location field with 'Vancouver, BC'");
  const locationFilled = await fillLocationField("Vancouver, BC");
  if (locationFilled) {
    filledFields.push("location");
    console.log("[LV] Location field filled successfully");
  } else {
    warnings.push("Location field not filled");
    console.log("[LV] WARNING: Location field not filled");
  }

  // Photos were already uploaded at the beginning - no need to do it again here

  const requiredFields = ["title", "price"];
  const missingRequired = requiredFields.filter((f) => missingFields.includes(f));

  console.log(`[LV] Fill complete. Filled: ${filledFields.join(', ')}. Missing: ${missingFields.join(', ')}`);

  // Auto-click Next button, then Publish
  await sleep(1000);
  const nextBtn = Array.from(document.querySelectorAll('div[role="button"], button'))
    .find(el => el.textContent?.trim().toLowerCase() === 'next');
  if (nextBtn) {
    (nextBtn as HTMLElement).click();
    console.log('[LV] Clicked Next button');

    // Wait for Publish screen to load
    await sleep(3000);

    const publishBtn = Array.from(document.querySelectorAll('div[role="button"], button'))
      .find(el => el.textContent?.trim().toLowerCase() === 'publish');
    if (publishBtn) {
      (publishBtn as HTMLElement).click();
      console.log('[LV] Clicked Publish button');
    } else {
      warnings.push("Publish button not found");
      console.log('[LV] Publish button not found');
    }
  } else {
    warnings.push("Next button not found");
    console.log('[LV] Next button not found');
  }

  return {
    success: missingRequired.length === 0,
    filledFields,
    missingFields,
    warnings,
  };
}

function showPhotoUploadInstructions(photoCount: number, folderName: string): void {
  // Remove any existing instruction overlay
  const existing = document.getElementById("lv-photo-instructions");
  if (existing) existing.remove();
  
  const overlay = document.createElement("div");
  overlay.id = "lv-photo-instructions";
  overlay.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 12px;
    padding: 24px 32px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.25);
    z-index: 999999;
    max-width: 450px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    text-align: center;
  `;
  
  // SECURITY: Use DOM creation methods instead of innerHTML to prevent XSS
  // Even though data is sanitized, innerHTML in content scripts on facebook.com is risky
  const safeCount = Number(photoCount) || 0;

  // Camera emoji
  const emojiDiv = document.createElement('div');
  emojiDiv.style.cssText = 'font-size: 48px; margin-bottom: 12px;';
  emojiDiv.textContent = '📸';
  overlay.appendChild(emojiDiv);

  // Title
  const title = document.createElement('h3');
  title.style.cssText = 'margin: 0 0 12px 0; color: #1a1a1a; font-size: 18px;';
  title.textContent = 'Photos Downloaded!';
  overlay.appendChild(title);

  // Description paragraph
  const desc = document.createElement('p');
  desc.style.cssText = 'margin: 0 0 16px 0; color: #666; font-size: 14px; line-height: 1.5;';
  const countStrong = document.createElement('strong');
  countStrong.textContent = safeCount + ' photos';
  desc.appendChild(countStrong);
  desc.appendChild(document.createTextNode(' have been saved to your'));
  desc.appendChild(document.createElement('br'));
  const folderStrong = document.createElement('strong');
  folderStrong.textContent = 'Downloads/' + folderName;
  desc.appendChild(folderStrong);
  desc.appendChild(document.createTextNode(' folder'));
  overlay.appendChild(desc);

  // Instructions box
  const instructionsBox = document.createElement('div');
  instructionsBox.style.cssText = 'background: #f0f7ff; border-radius: 8px; padding: 16px; margin-bottom: 16px;';

  const instructionsTitle = document.createElement('p');
  instructionsTitle.style.cssText = 'margin: 0; color: #1a73e8; font-size: 14px; font-weight: 500;';
  instructionsTitle.textContent = 'To add photos:';
  instructionsBox.appendChild(instructionsTitle);

  const ol = document.createElement('ol');
  ol.style.cssText = 'margin: 8px 0 0 0; padding-left: 20px; text-align: left; color: #333; font-size: 13px;';

  const steps = [
    'Open your Downloads folder',
    null, // placeholder for step 2 which has a <strong> element
    'Select all photos (Ctrl+A or Cmd+A)',
    'Drag them to the photo area above',
  ];

  steps.forEach((stepText, idx) => {
    const li = document.createElement('li');
    if (idx < 3) li.style.marginBottom = '4px';
    if (stepText !== null) {
      li.textContent = stepText;
    } else {
      // Step 2: "Find the <folderName> folder"
      li.appendChild(document.createTextNode('Find the '));
      const folderBold = document.createElement('strong');
      folderBold.textContent = folderName;
      li.appendChild(folderBold);
      li.appendChild(document.createTextNode(' folder'));
    }
    ol.appendChild(li);
  });

  instructionsBox.appendChild(ol);
  overlay.appendChild(instructionsBox);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.id = 'lv-photo-instructions-close';
  closeBtn.style.cssText = 'background: #1a73e8; color: white; border: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;';
  closeBtn.textContent = 'Got it';
  closeBtn.addEventListener('click', () => overlay.remove());
  overlay.appendChild(closeBtn);

  document.body.appendChild(overlay);

  // Auto-close after 30 seconds
  setTimeout(() => overlay.remove(), 30000);
}

function showNotification(message: string, type: "success" | "error" | "info"): void {
  const existing = document.getElementById("lv-notification");
  if (existing) existing.remove();
  
  const sanitizedMessage = sanitizeNotificationText(message);
  
  const div = document.createElement("div");
  div.id = "lv-notification";
  div.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    border-radius: 8px;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    max-width: 350px;
    background: ${type === "success" ? "#22c55e" : type === "error" ? "#ef4444" : "#3b82f6"};
  `;
  div.textContent = sanitizedMessage;
  document.body.appendChild(div);
  
  setTimeout(() => div.remove(), 6000);
}

function cleanupNotification(): void {
  const existing = document.getElementById("lv-notification");
  if (existing) existing.remove();
}

window.addEventListener("beforeunload", cleanupNotification);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    cleanupNotification();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type !== FILL_CHANNEL) {
    return false;
  }

  (async () => {
    try {
      showNotification("Filling form...", "info");
      const job: PostJob = message.payload;
      const result = await fillFacebook(job);
      
      if (!result.success) {
        const errorMsg = `Form fill failed: Could not find ${result.missingFields.join(", ")} field(s). Facebook may have changed their page layout.`;
        showNotification(errorMsg, "error");
        sendResponse({ ok: false, error: errorMsg, details: result });
        return;
      }
      
      let successMsg = `Form filled! Completed: ${result.filledFields.join(", ")}.`;
      if (result.warnings.length > 0) {
        successMsg += ` Note: ${result.warnings.join("; ")}`;
      }
      successMsg += " Review and click Publish.";
      
      showNotification(successMsg, "success");
      sendResponse({ ok: true, details: result });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : "Fill failed";
      showNotification(`Error: ${error}`, "error");
      sendResponse({ ok: false, error });
    }
  })();
  
  return true;
});
