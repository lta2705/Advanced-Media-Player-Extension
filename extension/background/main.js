// background/main.js

import { injectContentScript } from "./injector.js";
import { setupMediaSession, handleConfigUpdate, pollActiveTab } from "./media-session.js";
import { getEnrichedAudibleTabs, initializeTabLifecycleListeners } from "./tabs.js";
import { updateTabState, removeTabFromManaged, promoteTabToPrimary } from "./state.js";
import { currentConfig } from "./state.js"; // Retain existing global profile settings reference

const LOG = (msg, data) => console.log(`[AMP:bg:main] ${msg}`, data ?? "");

/**
 * Broadcasts an atomic update signal upward to notify the open Popup UI 
 * that the managed audio tabs queue structure has mutated.
 */
function broadcastTabsMutation() {
  browser.runtime.sendMessage({ type: "MANAGED_TABS_MUTATED" })
    .catch(() => { /* Silent fail if popup window context is currently closed */ });
}

// --- 1. EXTENSION LIFECYCLE INITIALIZATION ---

browser.runtime.onInstalled.addListener((details) => {
  LOG(`onInstalled: reason=${details.reason}`);
  browser.tabs.query({}, (tabs) => {
    LOG(`Injecting content scripts into ${tabs.length} existing tab(s)`);
    for (const tab of tabs) {
      injectContentScript(tab.id);
    }
  });
});

// Hook up browser-level closure listeners and forward tab termination updates to the UI
initializeTabLifecycleListeners(broadcastTabsMutation);

// --- 2. BROWSER TABS LIFECYCLE CONTROLLER ---

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Inject script automatically when DOM structure rendering completes
  if (changeInfo.status === "complete") {
    LOG(`onUpdated: tab=${tabId} status=complete url=${tab?.url}`);
    injectContentScript(tabId);
  }
  
  // If native audio state updates before content script takes over, push generic broadcast
  if (changeInfo.audible !== undefined || changeInfo.mutedInfo) {
    LOG(`onUpdated: tab=${tabId} audible=${tab?.audible} muted=${tab?.mutedInfo?.muted}`);
    
    // If a tab natively goes silent (audible: false), filter it out of our tracking queue
    if (changeInfo.audible === false) {
      const didMutate = removeTabFromManaged(tabId);
      if (didMutate) broadcastTabsMutation();
    } else {
      broadcastTabsMutation();
    }
  }
});

// --- 3. CENTRAL ROUTING MATRIX (MESSAGE HUB) ---

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  LOG(`onMessage: type=${msg.type} from=${sender.url ?? "?"} tab=${tabId}`);

  // Triggered when content.js captures a viable DOM media node
  if (msg.type === "MEDIA_ELEMENT_CAPTURED" && tabId) {
    LOG(`MEDIA_ELEMENT_CAPTURED: tab=${tabId}`);
    setupMediaSession(tabId);
    sendResponse({ ok: true });
    return false;
  }

  // Visualizer Spectrum bridge — broadcast to popup (not content script)
  if (msg.type === "AUDIO_FRAME") {
    browser.runtime.sendMessage({ type: "SPECTRUM", data: msg.data }).catch(() => {});
    return false;
  }

  // Global Equalizer / Volume hardware profile mutations
  if (msg.type === "UPDATE_CONFIG") {
    handleConfigUpdate(msg.config);
    sendResponse({ ok: true });
    return false;
  }

  // NEW EVENT-DRIVEN ENTRY: Content script continuously pushing runtime audio state telemetry
  if (msg.type === "MEDIA_STATE_UPDATE" && tabId) {
    // Inject updates straight into our managed array cache framework
    updateTabState(tabId, msg.state);
    broadcastTabsMutation();
    return false;
  }

  // NEW ROUTE: Popup UI requesting the sorted priority multi-tab array list
  if (msg.type === "GET_ALL_MANAGED_TABS") {
    getEnrichedAudibleTabs().then((enrichedTabs) => {
      sendResponse(enrichedTabs);
    });
    return true; // Keep message channel open asynchronously
  }

  // NEW ROUTE: User clicks a sub-tab row on Popup to shift it to the main controller position [0]
  if (msg.type === "PROMOTE_TAB_ACTION") {
    const success = promoteTabToPrimary(msg.tabId);
    if (success) {
      broadcastTabsMutation();
    }
    sendResponse({ ok: success });
    return false;
  }

  // Legacy profile config state getter routine
  if (msg.type === "GET_CONFIG") {
    sendResponse(currentConfig);
    return true; 
  }
});

// --- 4. LEGACY DELEGATION LIFECYCLE MANAGEMENT ---

setInterval(pollActiveTab, 1500);
LOG("Background script engine operational. Monitoring loops activated.");
