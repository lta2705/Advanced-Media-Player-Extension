// popup/main.js

import { $ } from "./ui.js";
import { setupCollapsible, restoreCollapsed } from "./ui.js";
import { initTheme } from "./theme.js";
import { wirePlayerControls, setPrimaryTabState, updateUI as updatePlayerUI } from "./player.js";
import { updateTabsList } from "./tabs.js";
import { buildEQ, sendConfig, wireEqControls } from "./equalizer.js";
import { drawVisualizer } from "./visualizer.js";

const LOG = (msg, data) => console.log(`[AMP:popup:main] ${msg}`, data ?? "");

/**
 * Fetches the centralized multi-tab state array from the background script
 * and distributes the data layers across specific sub-UI components.
 */
async function syncDataFromBackground() {
  try {
    // Request the source-of-truth managed tabs array from the background worker
    const enrichedTabs = await browser.runtime.sendMessage({ type: "GET_ALL_MANAGED_TABS" });
    const tabsArray = enrichedTabs || [];

    // 1. Distribute index [0] to drive the primary standalone dashboard panel
    const primaryTab = tabsArray.length > 0 ? tabsArray[0] : null;
    setPrimaryTabState(primaryTab);
    updatePlayerUI();

    // 2. Distribute the array to the sub-queue listing controller module
    updateTabsList(tabsArray);

    // 3. Update the lower telemetry stat metrics layout view
    const tabsElement = $("stat-tabs");
    if (tabsElement) {
      tabsElement.textContent = tabsArray.length;
    }
  } catch (err) {
    LOG(`Failed to sync runtime state data matrix from background: ${err.message}`);
  }
}

/**
 * Main Orchestrator Execution Context Flow
 */
document.addEventListener("DOMContentLoaded", async () => {
  LOG("--- popup event-driven orchestrator initialization start ---");

  // Static UI & Layout System Wiring
  try { await initTheme(); } catch (e) { LOG(`initTheme failed: ${e}`); }
  try { buildEQ(); } catch (e) { LOG(`buildEQ failed: ${e}`); }
  try { await restoreCollapsed(); } catch (e) { LOG(`restoreCollapsed failed: ${e}`); }
  try { setupCollapsible(); } catch (e) { LOG(`setupCollapsible failed: ${e}`); }
  try { wirePlayerControls(); } catch (e) { LOG(`wirePlayerControls failed: ${e}`); }
  try { wireEqControls(); } catch (e) { LOG(`wireEqControls failed: ${e}`); }

  // --- RUNTIME EVENT DRIVEN MATRIX LISTENERS ---
  browser.runtime.onMessage.addListener((msg) => {
    
    // Triggered whenever background registers any timeline changes or tab closures
    if (msg.type === "MANAGED_TABS_MUTATED") {
      LOG("Managed queue array mutation intercepted. Forcing active UI re-sync.");
      syncDataFromBackground();
    }
    
    // Low-latency visualizer spectrum buffer relay route mapping
    if (msg.type === "SPECTRUM") {
      frames++;
      drawVisualizer(msg.data);
    }
  });

  // Execute initial layout recovery synchronization handshakes
  await syncDataFromBackground();
  try { sendConfig(); } catch (e) { LOG(`initial sendConfig failed: ${e}`); }

  LOG("--- popup orchestrator initialization complete ---");

  // --- PERFORMANCE TELEMETRY: VISUALIZER REFRESH RATE (FPS) ---
  let frames = 0;
  setInterval(() => { 
    const fpsElement = $("stat-fps");
    if (fpsElement) fpsElement.textContent = frames; 
    frames = 0; 
  }, 1000);
});