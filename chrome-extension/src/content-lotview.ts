const LOTVIEW_CHANNEL = "LV_EXTRACT_IMAGES";

interface ImageExtractionResult {
  images: string[];
  totalFound: number;
  method: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickAllThumbnails(): Promise<void> {
  const thumbnailSelectors = [
    '.photo-gallery__thumbnail',
    '.gallery-thumbnail',
    '.thumbnail-item',
    '.vehicle-thumbnail',
    '[data-thumbnail]',
    '.swiper-slide-thumb-active',
    '.slick-dots li',
    '.carousel-indicators li',
  ];

  for (const selector of thumbnailSelectors) {
    const thumbnails = document.querySelectorAll<HTMLElement>(selector);
    if (thumbnails.length > 0) {
      console.log(`[LV] Found ${thumbnails.length} thumbnails with selector: ${selector}`);
      for (const thumb of thumbnails) {
        try {
          thumb.click();
          await sleep(200);
        } catch (e) {
          console.log(`[LV] Error clicking thumbnail:`, e);
        }
      }
      break;
    }
  }
}

async function scrollGalleryToEnd(): Promise<void> {
  const gallerySelectors = [
    '.photo-gallery',
    '.vehicle-gallery',
    '.swiper-container',
    '.carousel',
  ];

  for (const selector of gallerySelectors) {
    const gallery = document.querySelector(selector);
    if (gallery) {
      const scrollable = gallery.querySelector('.swiper-wrapper') || gallery;
      if (scrollable instanceof HTMLElement) {
        scrollable.scrollLeft = scrollable.scrollWidth;
        await sleep(300);
        scrollable.scrollLeft = 0;
      }
      break;
    }
  }
}

function extractAllGalleryImages(): string[] {
  const images: string[] = [];
  const seenUrls = new Set<string>();

  const blockedPatterns = [
    'logo', 'icon', 'badge', 'banner', 'promo', 'button', 'arrow',
    'chevron', 'social', 'facebook', 'twitter', 'placeholder',
    'no-image', 'coming-soon', 'spinner', 'loading', '1x1', 'tracking',
  ];

  const isValidVehicleImage = (src: string): boolean => {
    if (!src || src.length < 30) return false;
    if (src.startsWith('data:') || src.startsWith('blob:')) return false;
    const lower = src.toLowerCase();
    for (const blocked of blockedPatterns) {
      if (lower.includes(blocked)) return false;
    }
    if (!/\.(jpg|jpeg|png|webp|avif)/i.test(lower)) {
      if (!lower.includes('cloudinary') && !lower.includes('cloudfront') && !lower.includes('cdn')) {
        return false;
      }
    }
    return true;
  };

  const normalizeUrl = (url: string): string => {
    return url.split('?')[0].toLowerCase();
  };

  const galleryContainers = document.querySelectorAll([
    '.photo-gallery',
    '.vehicle-gallery',
    '.gallery-main',
    '.main-gallery',
    '[class*="gallery"]',
    '.swiper-container',
    '.carousel',
  ].join(','));

  for (const container of galleryContainers) {
    const containerText = container.className?.toLowerCase() || '';
    if (containerText.includes('similar') || containerText.includes('recommend')) continue;

    const imgs = container.querySelectorAll('img');
    for (const img of imgs) {
      const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
      if (isValidVehicleImage(src)) {
        const normalized = normalizeUrl(src);
        if (!seenUrls.has(normalized)) {
          seenUrls.add(normalized);
          images.push(src);
        }
      }
    }

    const bgElements = container.querySelectorAll<HTMLElement>('[style*="background"]');
    for (const el of bgElements) {
      const style = el.style.backgroundImage || '';
      const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (match && match[1]) {
        const src = match[1];
        if (isValidVehicleImage(src)) {
          const normalized = normalizeUrl(src);
          if (!seenUrls.has(normalized)) {
            seenUrls.add(normalized);
            images.push(src);
          }
        }
      }
    }
  }

  if (images.length < 5) {
    const allImgs = document.querySelectorAll('img');
    for (const img of allImgs) {
      const src = img.src || '';
      if (isValidVehicleImage(src)) {
        if (img.width > 200 || img.height > 200 || !img.complete) {
          const normalized = normalizeUrl(src);
          if (!seenUrls.has(normalized)) {
            seenUrls.add(normalized);
            images.push(src);
          }
        }
      }
    }
  }

  return images;
}

function extractFromScriptTags(): string[] {
  const images: string[] = [];
  const seenUrls = new Set<string>();

  const scripts = document.querySelectorAll('script:not([src])');
  for (const script of scripts) {
    const content = script.textContent || '';
    
    const imageUrlRegex = /(https?:\/\/[^\s"']+\.(jpg|jpeg|png|webp))/gi;
    let match;
    while ((match = imageUrlRegex.exec(content)) !== null) {
      const url = match[1];
      if (url.length > 50 && !url.includes('logo') && !url.includes('icon')) {
        const normalized = url.split('?')[0].toLowerCase();
        if (!seenUrls.has(normalized)) {
          seenUrls.add(normalized);
          images.push(url);
        }
      }
    }
  }

  return images;
}

async function extractImages(): Promise<ImageExtractionResult> {
  console.log("[LV] Starting comprehensive image extraction from Lotview page...");
  
  await clickAllThumbnails();
  await sleep(500);
  
  await scrollGalleryToEnd();
  await sleep(300);
  
  const galleryImages = extractAllGalleryImages();
  console.log(`[LV] Found ${galleryImages.length} images from gallery`);
  
  const scriptImages = extractFromScriptTags();
  console.log(`[LV] Found ${scriptImages.length} images from script tags`);
  
  const seenUrls = new Set<string>();
  const allImages: string[] = [];
  
  for (const img of [...galleryImages, ...scriptImages]) {
    const normalized = img.split('?')[0].toLowerCase();
    if (!seenUrls.has(normalized)) {
      seenUrls.add(normalized);
      allImages.push(img);
    }
  }
  
  console.log(`[LV] Total unique images: ${allImages.length}`);
  
  return {
    images: allImages,
    totalFound: allImages.length,
    method: 'lotview_page_extraction'
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type !== LOTVIEW_CHANNEL) {
    return false;
  }

  (async () => {
    try {
      const result = await extractImages();
      sendResponse({ ok: true, data: result });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : "Image extraction failed";
      console.error("[LV] Image extraction error:", error);
      sendResponse({ ok: false, error });
    }
  })();

  return true;
});

console.log("[LV] Lotview content script loaded - ready to extract images");
