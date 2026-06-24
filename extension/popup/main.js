import { $ } from "./ui.js";
import { setupCollapsible, restoreCollapsed } from "./ui.js";
import { initTheme } from "./theme.js";
import { wirePlayerControls, requestMediaState, updateUI } from "./player.js";
import { watchAudibleTabs } from "./tabs.js";
import { buildEQ, sendConfig, wireEqControls } from "./equalizer.js";
import { drawVisualizer } from "./visualizer.js";
import { setActiveTabId, setMediaState, audibleTabs } from "./store.js";

const LOG = (msg, data) => console.log(`[AMP:popup:main] ${msg}`, data ?? "");

async function getActiveTab() {
  try {
    const windows = await chrome.windows.getLastFocused();
    const tabs = await chrome.tabs.query({ active: true, windowId: windows.id });
    if (tabs[0]) {
      setActiveTabId(tabs[0].id);
      LOG(`active tab: id=${tabs[0].id} title="${tabs[0].title}" (via getLastFocused)`);
    } else {
      LOG("no active tab found via getLastFocused");
    }
  } catch {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        setActiveTabId(tabs[0].id);
        LOG(`active tab: id=${tabs[0].id} title="${tabs[0].title}" (via currentWindow fallback)`);
      } else {
        LOG("no active tab found via currentWindow fallback");
      }
    } catch { LOG("both methods failed"); }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  LOG("--- popup init start ---");
  try { await initTheme(); } catch (e) { LOG(`initTheme failed: ${e}`); }
  try { await getActiveTab(); } catch (e) { LOG(`getActiveTab failed: ${e}`); }
  try { buildEQ(); } catch (e) { LOG(`buildEQ failed: ${e}`); }
  try { await restoreCollapsed(); } catch (e) { LOG(`restoreCollapsed failed: ${e}`); }
  try { setupCollapsible(); } catch (e) { LOG(`setupCollapsible failed: ${e}`); }
  try { wirePlayerControls(); } catch (e) { LOG(`wirePlayerControls failed: ${e}`); }
  try { wireEqControls(); } catch (e) { LOG(`wireEqControls failed: ${e}`); }

  chrome.runtime.onMessage.addListener((msg) => {
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

  try { await requestMediaState(); } catch (e) { LOG(`initial requestMediaState failed: ${e}`); }
  try { await watchAudibleTabs(); } catch (e) { LOG(`initial watchAudibleTabs failed: ${e}`); }
  try { sendConfig(); } catch (e) { LOG(`initial sendConfig failed: ${e}`); }
  LOG("--- popup init complete ---");

  setInterval(() => { try { requestMediaState(); } catch {} }, 2500);

  let frames = 0;
  setInterval(() => { $("stat-fps").textContent = frames; frames = 0; }, 1000);
  const origDraw = drawVisualizer;
  drawVisualizer = (data) => { frames++; origDraw(data); };

  try { $("stat-tabs").textContent = audibleTabs.length; } catch {}
  setInterval(() => { try { $("stat-tabs").textContent = audibleTabs.length; } catch {} }, 3000);
});
