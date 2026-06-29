import { mediaStateCache, getManagedTabs, removeTabFromManaged } from "./state.js";

const LOG = (msg, data) => console.log(`[AMP:bg:tabs] ${msg}`, data ?? "");

/**
 * Enriches the tracked managed tabs array with native browser metadata
 * (like favIconUrl and live windowId) before shipping it to the Popup UI.
 * * @returns {Promise<Array>} A structured array ready for the Popup rendering engine
 */
export async function getEnrichedAudibleTabs() {
  // Grab our source-of-truth priority array from state.js
  const managedTabs = getManagedTabs();

  if (managedTabs.length === 0) return [];

  try {
    // Fetch only the specific tabs we are currently managing to save CPU cycles
    const tabPromises = managedTabs.map(
      (t) => browser.tabs.get(t.tabId).catch(() => null), // Prevent crash if a tab just closed
    );

    const nativeTabs = await Promise.all(tabPromises);

    // Map native window properties (icons, titles) directly onto our managed timeline array
    return managedTabs.map((managedTab, index) => {
      const native = nativeTabs.find((n) => n && n.id === managedTab.tabId);
      return {
        id: managedTab.tabId,
        title: native?.title || managedTab.title || "Unknown Track",
        url: native?.url || "",
        favIconUrl: native?.favIconUrl || "",
        mutedInfo: native?.mutedInfo || null,
        audible: native?.audible || managedTab.playing || false,
        isPrimaryPanel: index === 0, // Explicit flag signaling this tab owns index [0]
        mediaState: {
          playing: managedTab.playing,
          currentTime: managedTab.currentTime,
          duration: managedTab.duration,
          volume: managedTab.volume,
        },
      };
    });
  } catch (err) {
    LOG(`Error enriching managed tabs array: ${err.message}`);
    return managedTabs; // Fallback to raw data if native fetch fails
  }
}

/**
 * Registers global event hooks with Firefox to clear the queue array immediately
 * when a user destroys or navigates away from a tracked media tab.
 * * @param {Function} notifyPopupCallback - Triggered to signal the Popup to flush and re-render
 */
export function initializeTabLifecycleListeners(notifyPopupCallback) {
  // Intercept when a user clicks the "X" button to close a tab
  browser.tabs.onRemoved.addListener((tabId) => {
    LOG(`Intercepted tab closure for tabId=${tabId}`);

    // removeTabFromManaged handles the filter action and automatic index [0] promotion ("Đôn đỉnh")
    const didMutate = removeTabFromManaged(tabId);
    if (didMutate && typeof notifyPopupCallback === "function") {
      notifyPopupCallback(); // Send update signal immediately to open Popup
    }
  });

  // Intercept when a tracked tab changes its URL or reloads
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") {
      LOG(
        `Tracked tabId=${tabId} navigated to a new URL. Purging from active queue.`,
      );

      const didMutate = removeTabFromManaged(tabId);
      if (didMutate && typeof notifyPopupCallback === "function") {
        notifyPopupCallback();
      }
    }
  });
}
