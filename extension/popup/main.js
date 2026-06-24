import { $ } from "./ui.js";
import { setupCollapsible, restoreCollapsed } from "./ui.js";
import { initTheme } from "./theme.js";
import { wirePlayerControls, requestMediaState, updateUI } from "./player.js";
import { watchAudibleTabs } from "./tabs.js";
import { buildEQ, sendConfig, wireEqControls } from "./equalizer.js";
import { drawVisualizer } from "./visualizer.js";
import { setActiveTabId, setMediaState, audibleTabs } from "./store.js";


const LOG = (msg, data) => console.log(`[AMP:popup:main] ${msg}`, data ?? "");

/**
 * Safely fetches the currently active tab from the last focused window 
 * and commits its ID to the central store.
 */
async function getActiveTab() {
  try {
    // Attempt method 1: Get active tab via last focused window
    const windowInfo = await browser.windows.getLastFocused();
    const tabs = await browser.tabs.query({ active: true, windowId: windowInfo.id });
    
    if (tabs[0]) {
      setActiveTabId(tabs[0].id);
      LOG(`active tab verified: id=${tabs[0].id} title="${tabs[0].title}" (via getLastFocused)`);
      return tabs[0].id;
    } else {
      LOG("no active tab found via getLastFocused");
    }
  } catch (err) {
    LOG(`getLastFocused failed, trying fallback method: ${err.message}`);
    try {
      //Get active tab via current window context
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        setActiveTabId(tabs[0].id);
        LOG(`active tab verified: id=${tabs[0].id} title="${tabs[0].title}" (via currentWindow fallback)`);
        return tabs[0].id;
      } else {
        LOG("no active tab found via currentWindow fallback");
      }
    } catch (fallbackErr) {
      LOG(`both active tab resolution methods failed: ${fallbackErr.message}`);
    }
  }
  return null;
}

/**
 * Main Orchestrator Execution Context
 */
document.addEventListener("DOMContentLoaded", async () => {
  LOG("--- popup init start ---");
  
  //Static UI UI & Layout System Wiring
  try { await initTheme(); } catch (e) { LOG(`initTheme failed: ${e}`); }
  try { buildEQ(); } catch (e) { LOG(`buildEQ failed: ${e}`); }
  try { await restoreCollapsed(); } catch (e) { LOG(`restoreCollapsed failed: ${e}`); }
  try { setupCollapsible(); } catch (e) { LOG(`setupCollapsible failed: ${e}`); }
  try { wirePlayerControls(); } catch (e) { LOG(`wirePlayerControls failed: ${e}`); }
  try { wireEqControls(); } catch (e) { LOG(`wireEqControls failed: ${e}`); }

  // Runtime Event Communication Listeners
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "MEDIA_STATE_UPDATE") {
      LOG(`MEDIA_STATE_UPDATE playing=${msg.state?.playing}`);
      setMediaState(msg.state);
      updateUI();
    }
    if (msg.type === "SPECTRUM") {
      LOG(`SPECTRUM ${msg.data?.length ?? 0} samples`);
      drawVisualizer(msg.data);
    }
  });

  const resolvedTabId = await getActiveTab();

  //Initial State Recovery and Handshakes
  if (resolvedTabId) {
    try { await requestMediaState(); } catch (e) { LOG(`initial requestMediaState failed: ${e}`); }
    try { sendConfig(); } catch (e) { LOG(`initial sendConfig failed: ${e}`); }
  } else {
    LOG("Skipping initial data fetch: No valid active tab found.");
  }
  
  try { await watchAudibleTabs(); } catch (e) { LOG(`initial watchAudibleTabs failed: ${e}`); }
  
  LOG("--- popup init complete ---");

  //Active Polling Loops & Performance Monitoring Telemetry
  
  // Periodically pull current playback metrics (e.g. current time sliders)
  setInterval(() => { 
    try { requestMediaState(); } catch (err) { LOG("Polling requestMediaState failed quietly"); } 
  },0);

  // Performance Telemetry: Visualizer Refresh Rate (FPS Counter)
  let frames = 0;
  setInterval(() => { 
    const fpsElement = $("stat-fps");
    if (fpsElement) fpsElement.textContent = frames; 
    frames = 0; 
  }, 1000);
  
  // Wrap original visualizer renderer hook to tap into execution frames counter
  const origDraw = drawVisualizer;
  drawVisualizer = (data) => { 
    frames++; 
    if (typeof origDraw === "function") origDraw(data); 
  };

  // Performance Telemetry: Audible Tabs Monitor Counter
  const updateTabsCounter = () => {
    try { 
      const tabsElement = $("stat-tabs");
      // Check if global audibleTabs array exists and element is rendered
      if (tabsElement && typeof audibleTabs !== "undefined") {
        tabsElement.textContent = audibleTabs.length; 
      }
    } catch (err) { /* Silent fail to avoid polluting the log context */ }
  };

  // Invoke instantly and register internal polling window
  updateTabsCounter();
  setInterval(updateTabsCounter, 3000);
});