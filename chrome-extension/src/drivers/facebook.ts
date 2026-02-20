import { PlatformDriver, PostJob } from "../types";

const FILL_CHANNEL = "LV_FILL_FACEBOOK";
const FB_VEHICLE_CREATE_URL = "https://www.facebook.com/marketplace/create/vehicle";
const FB_VEHICLE_CREATE_PATTERN = /facebook\.com\/marketplace\/create\/vehicle/;

async function ensureContentScriptInjected(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-facebook.js"],
    });
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function waitForPageLoad(tabId: number, maxWaitMs: number = 10000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") {
        await new Promise((r) => setTimeout(r, 1500));
        return;
      }
    } catch {
      throw new Error("Tab closed unexpectedly");
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  
  throw new Error("Page load timeout. Please try again.");
}

async function navigateToVehicleCreate(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  
  if (currentTab?.url && FB_VEHICLE_CREATE_PATTERN.test(currentTab.url)) {
    return currentTab;
  }
  
  const fbTabs = await chrome.tabs.query({ url: "*://*.facebook.com/*" });
  let targetTab: chrome.tabs.Tab | null = null;
  
  for (const tab of fbTabs) {
    if (tab.url && FB_VEHICLE_CREATE_PATTERN.test(tab.url)) {
      targetTab = tab;
      break;
    }
  }
  
  if (targetTab && targetTab.id) {
    await chrome.tabs.update(targetTab.id, { active: true });
    return targetTab;
  }
  
  if (fbTabs.length > 0 && fbTabs[0].id) {
    await chrome.tabs.update(fbTabs[0].id, { 
      url: FB_VEHICLE_CREATE_URL,
      active: true 
    });
    await waitForPageLoad(fbTabs[0].id);
    return await chrome.tabs.get(fbTabs[0].id);
  }
  
  const newTab = await chrome.tabs.create({ url: FB_VEHICLE_CREATE_URL, active: true });
  if (!newTab.id) {
    throw new Error("Failed to create new tab");
  }
  await waitForPageLoad(newTab.id);
  return await chrome.tabs.get(newTab.id);
}

export const facebookDriver: PlatformDriver = {
  platform: "facebook",
  name: "Facebook Marketplace",
  urlPatterns: [
    "*://*.facebook.com/marketplace/*/create/*",
    "*://*.facebook.com/marketplace/create/*",
    "*://www.facebook.com/marketplace/you/selling*",
  ],

  async fillForm(job: PostJob): Promise<void> {
    let targetTab: chrome.tabs.Tab;
    
    try {
      targetTab = await navigateToVehicleCreate();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Failed to navigate to Facebook Marketplace");
    }
    
    if (!targetTab.id) {
      throw new Error("No valid tab found");
    }
    
    try {
      await ensureContentScriptInjected(targetTab.id);
    } catch {
      throw new Error("Could not inject content script. Please refresh the Facebook page and try again.");
    }
    
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(targetTab.id!, { type: FILL_CHANNEL, payload: job }, (res) => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || "";
          if (msg.includes("Receiving end does not exist")) {
            reject(new Error("Content script not loaded. Please refresh the Facebook page and try again."));
          } else {
            reject(new Error(msg));
          }
          return;
        }
        if (res?.ok) {
          resolve();
        } else {
          reject(new Error(res?.error || "Form fill failed"));
        }
      });
    });
  },
};
