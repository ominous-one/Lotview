/*
 * Craigslist Assisted Autopost (LotView)
 * - Prefills core fields and uploads photos (best effort)
 * - Validates required fields
 * - MUST STOP before final publish/submit
 */

import type { PostJob } from "./types";
import { withRetry, sleep } from "./automation/retry";

const FILL_CHANNEL = "LV_FILL_CRAIGSLIST";

type PostingArea = "TRI_CITIES_BC" | "SURREY_BC" | "WHISTLER";

const STORAGE_KEY_AREA = "lvCraigslistPostingArea";
const STORAGE_KEY_DRY_RUN = "lvDryRun"; // when true, never clicks any submit

const AREA_LABEL: Record<PostingArea, string> = {
  TRI_CITIES_BC: "Tri-Cities BC",
  SURREY_BC: "Surrey BC",
  WHISTLER: "Whistler area",
};

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[LV-CL]", ...args);
}

function $(sel: string): HTMLElement | null {
  return document.querySelector(sel);
}

function pickFirst<T extends Element>(sels: string[]): T | null {
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el) return el as T;
  }
  return null;
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setContentEditableValue(el: HTMLElement, value: string) {
  el.focus();
  try {
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, value);
  } catch {
    el.textContent = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function ensureOverlay(): HTMLDivElement {
  const existing = document.getElementById("lv-cl-overlay") as HTMLDivElement | null;
  if (existing) return existing;

  const root = document.createElement("div");
  root.id = "lv-cl-overlay";
  root.style.cssText = `
    position: fixed;
    right: 16px;
    top: 16px;
    width: 360px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1A202C;
  `;

  const card = document.createElement("div");
  card.style.cssText = `
    background: #fff;
    border: 1px solid rgba(26,32,44,0.12);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    padding: 14px;
  `;

  const title = document.createElement("div");
  title.textContent = "LotView — Craigslist Assist";
  title.style.cssText = "font-weight: 700; font-size: 14px; margin-bottom: 10px;";

  const status = document.createElement("div");
  status.id = "lv-cl-status";
  status.style.cssText = "font-size: 12px; line-height: 1.4; color: #4A5568;";
  status.textContent = "Ready.";

  const areaWrap = document.createElement("div");
  areaWrap.style.cssText = "margin-top: 10px; display: flex; gap: 8px; align-items: center;";
  const areaLabel = document.createElement("label");
  areaLabel.textContent = "Posting area";
  areaLabel.style.cssText = "font-size: 12px; color: #4A5568; width: 92px;";

  const select = document.createElement("select");
  select.id = "lv-cl-area";
  select.style.cssText = "flex: 1; padding: 6px 8px; border: 1px solid rgba(26,32,44,0.18); border-radius: 8px;";
  (Object.keys(AREA_LABEL) as PostingArea[]).forEach((k) => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = AREA_LABEL[k];
    select.appendChild(opt);
  });

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.style.cssText = "padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(26,32,44,0.18); background: #F7FAFC; cursor: pointer;";
  saveBtn.onclick = async () => {
    const val = (select.value || "TRI_CITIES_BC") as PostingArea;
    await chrome.storage.sync.set({ [STORAGE_KEY_AREA]: val });
    setStatus(`Saved posting area: ${AREA_LABEL[val]}`);
  };

  areaWrap.appendChild(areaLabel);
  areaWrap.appendChild(select);
  areaWrap.appendChild(saveBtn);

  const foot = document.createElement("div");
  foot.style.cssText = "margin-top: 12px; font-size: 12px; color: #4A5568;";
  foot.textContent = "LotView will NOT click Publish. Review and submit manually.";

  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  close.style.cssText = "position:absolute; right: 10px; top: 10px; border:none; background:transparent; font-size:18px; cursor:pointer; color:#4A5568;";
  close.onclick = () => root.remove();

  card.appendChild(close);
  card.appendChild(title);
  card.appendChild(status);
  card.appendChild(areaWrap);
  card.appendChild(foot);
  root.appendChild(card);
  document.body.appendChild(root);

  return root;
}

function setStatus(text: string, tone: "info" | "success" | "error" = "info") {
  const overlay = ensureOverlay();
  const status = overlay.querySelector("#lv-cl-status") as HTMLDivElement | null;
  if (!status) return;
  status.textContent = text;
  status.style.color =
    tone === "success" ? "#2F855A" : tone === "error" ? "#C53030" : "#4A5568";
}

async function getPrefs(): Promise<{ area: PostingArea; dryRun: boolean }> {
  const stored = await chrome.storage.sync.get([STORAGE_KEY_AREA]);
  const storedLocal = await chrome.storage.local.get([STORAGE_KEY_DRY_RUN]);
  const area = (stored[STORAGE_KEY_AREA] as PostingArea) || "TRI_CITIES_BC";
  const dryRun = storedLocal[STORAGE_KEY_DRY_RUN] !== false; // default true
  return { area, dryRun };
}

function validateRequired(job: PostJob): string[] {
  const missing: string[] = [];
  if (!job.formData?.title) missing.push("title");
  if (!job.formData?.price) missing.push("price");
  if (!job.formData?.description) missing.push("description");
  return missing;
}

async function uploadImagesBestEffort(job: PostJob): Promise<string[]> {
  const warnings: string[] = [];
  const urls = (job.imageUrls || []).slice(0, 24);
  if (urls.length === 0) return warnings;

  const input = pickFirst<HTMLInputElement>([
    'input[type="file"][multiple]',
    'input[type="file"]',
  ]);
  if (!input) {
    warnings.push("Photo upload input not found on this step. Navigate to the image upload step and run Assist again.");
    return warnings;
  }

  const files: File[] = [];
  for (const url of urls) {
    try {
      const res = await withRetry(
        async () => {
          const r = await fetch(url, { method: "GET" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r;
        },
        { retries: 2, baseDelayMs: 600, maxDelayMs: 4000, jitterPct: 0.25 }
      );

      const blob = await res.blob();
      const contentType = blob.type || "image/jpeg";
      const name = (() => {
        try {
          const u = new URL(url);
          const last = u.pathname.split("/").pop() || "photo.jpg";
          return last.includes(".") ? last : `${last}.jpg`;
        } catch {
          return "photo.jpg";
        }
      })();

      files.push(new File([blob], name, { type: contentType }));
    } catch (err) {
      warnings.push(`Could not fetch image for upload: ${url}`);
      log("Image fetch failed", err);
    }
  }

  if (files.length === 0) {
    warnings.push("No images could be fetched for upload. You may need to drag-and-drop photos manually.");
    return warnings;
  }

  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));

  return warnings;
}

async function fillCraigslist(job: PostJob) {
  ensureOverlay();

  const prefs = await getPrefs();
  const overlay = ensureOverlay();
  const select = overlay.querySelector("#lv-cl-area") as HTMLSelectElement | null;
  if (select) select.value = prefs.area;

  const missing = validateRequired(job);
  if (missing.length) {
    setStatus(`Missing required data from LotView: ${missing.join(", ")}`, "error");
    throw new Error(`Missing required data: ${missing.join(", ")}`);
  }

  setStatus("Finding fields…");

  // These IDs are stable on Craigslist posting form steps.
  const titleEl = pickFirst<HTMLInputElement>(["#PostingTitle", "input[name='PostingTitle']"]);
  const priceEl = pickFirst<HTMLInputElement>(["#price", "input[name='price']"]);
  const geoEl = pickFirst<HTMLInputElement>(["#GeographicArea", "input[name='GeographicArea']"]);
  const postalEl = pickFirst<HTMLInputElement>(["#postal_code", "input[name='postal_code']"]);
  const bodyTextArea = pickFirst<HTMLTextAreaElement>(["#PostingBody", "textarea[name='PostingBody']"]);
  const bodyEditable = pickFirst<HTMLElement>(["[contenteditable='true'][name='PostingBody']"]);

  const filled: string[] = [];
  const warnings: string[] = [];

  if (titleEl) {
    setInputValue(titleEl, String(job.formData.title));
    filled.push("title");
  } else {
    warnings.push("Title field not found (PostingTitle)");
  }

  if (priceEl) {
    setInputValue(priceEl, String(job.formData.price).replace(/[^0-9]/g, ""));
    filled.push("price");
  } else {
    warnings.push("Price field not found");
  }

  if (geoEl && job.formData.location) {
    setInputValue(geoEl, String(job.formData.location));
    filled.push("geographicArea");
  }

  if (postalEl && job.formData.postalCode) {
    setInputValue(postalEl, String(job.formData.postalCode));
    filled.push("postalCode");
  }

  if (bodyTextArea) {
    setInputValue(bodyTextArea, String(job.formData.description));
    filled.push("description");
  } else if (bodyEditable) {
    setContentEditableValue(bodyEditable, String(job.formData.description));
    filled.push("description");
  } else {
    warnings.push("Description field not found (PostingBody)");
  }

  await sleep(250);

  // Images (best effort)
  setStatus("Uploading photos (best effort)…");
  const imageWarnings = await uploadImagesBestEffort(job);
  warnings.push(...imageWarnings);

  // Validate required fields presence in DOM
  const requiredMissing: string[] = [];
  if (!titleEl?.value?.trim()) requiredMissing.push("title");
  if (!priceEl?.value?.trim()) requiredMissing.push("price");
  const descVal = bodyTextArea?.value?.trim() || bodyEditable?.textContent?.trim() || "";
  if (!descVal) requiredMissing.push("description");

  if (requiredMissing.length) {
    setStatus(
      `Filled with warnings. Missing on page: ${requiredMissing.join(", ")}. Craigslist may have changed the form.`,
      "error"
    );
    throw new Error(`Craigslist form incomplete: missing ${requiredMissing.join(", ")}`);
  }

  // Hard rule: do not click publish/continue.
  if (prefs.dryRun) {
    setStatus(
      `Filled (${filled.join(", ")}). Dry-run ON: LotView will not click Continue/Publish. Review and submit manually.`,
      "success"
    );
  } else {
    setStatus(
      `Filled (${filled.join(", ")}). LotView will not click Publish. Review and submit manually.`,
      "success"
    );
  }

  if (warnings.length) {
    log("Warnings:", warnings);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type !== FILL_CHANNEL) return false;

  (async () => {
    try {
      const job = message.payload as PostJob;
      await fillCraigslist(job);
      sendResponse({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Craigslist assist failed";
      setStatus(msg, "error");
      sendResponse({ ok: false, error: msg });
    }
  })();

  return true;
});
