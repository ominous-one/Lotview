// Content script for Facebook Marketplace vehicle listing.
// Responsibilities:
// 1) Detect Marketplace create listing page.
// 2) Listen for fill commands from background/popup.
// 3) Fill title/price/description/category/location and upload images with pacing.
// 4) Report success/failure back to background for logging.

import { PostJob } from "./types";

const FILL_CHANNEL = "LV_FILL_FACEBOOK";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setInput(selector: string, value: string) {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!el) throw new Error(`Missing selector: ${selector}`);
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function uploadImages(selector: string, files: File[]) {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error("Photo input not found");
  const dataTransfer = new DataTransfer();
  files.forEach((f) => dataTransfer.items.add(f));
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function fillFacebook(job: PostJob) {
  const { formData, images } = job;

  // Selectors may drift; keep a fallback list to update as needed.
  setInput('input[name="title"]', (formData.title as string) || "");
  await sleep(300 + Math.random() * 300);

  if (formData.price !== null && formData.price !== undefined) {
    setInput('input[name="price"]', String(formData.price));
    await sleep(200 + Math.random() * 200);
  }

  setInput('textarea[name="description"]', (formData.description as string) || "");
  await sleep(400 + Math.random() * 400);

  // Location may need manual selection; leave as-is if selector missing.
  if (formData.location) {
    try {
      setInput('input[aria-label="Location"]', formData.location as string);
      await sleep(400 + Math.random() * 400);
    } catch (_) {
      // best-effort
    }
  }

  // Category selection is often pre-set for vehicles; skip if not found.

  if (images && images.length > 0) {
    await uploadImages('input[type="file"]', images);
    await sleep(1000 + Math.random() * 800);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type !== FILL_CHANNEL) return;
    try {
      const job: PostJob = message.payload;
      await fillFacebook(job);
      sendResponse({ ok: true });
    } catch (err: any) {
      sendResponse({ ok: false, error: err?.message || "Fill failed" });
    }
  })();
  return true;
});
