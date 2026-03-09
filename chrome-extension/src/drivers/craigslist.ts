import { PlatformDriver, PostJob } from "../types";

const FILL_CHANNEL = "LV_FILL_CRAIGSLIST";

async function ensureContentScriptInjected(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-craigslist.js"],
    });
    await new Promise((r) => setTimeout(r, 250));
  }
}

export const craigslistDriver: PlatformDriver = {
  platform: "craigslist",
  name: "Craigslist (Assist)",
  urlPatterns: [
    "*://*.craigslist.org/*",
  ],

  async fillForm(job: PostJob): Promise<void> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    // We intentionally do NOT auto-navigate into the multi-step CL posting flow.
    // User must be on the appropriate step (posting form and/or image upload step).
    if (!tab?.id || !tab.url || !/craigslist\.org\//i.test(tab.url)) {
      throw new Error(
        "Open Craigslist in the current tab (vancouver.craigslist.org or whistler.craigslist.org), start a new post, then click Fill again."
      );
    }

    await ensureContentScriptInjected(tab.id);

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id!, { type: FILL_CHANNEL, payload: job }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Craigslist content script error"));
          return;
        }
        if (res?.ok) resolve();
        else reject(new Error(res?.error || "Craigslist assist failed"));
      });
    });
  },
};
