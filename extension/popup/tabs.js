// popup/tabs.js

import { $, escapeHtml } from "./ui.js";

const LOG = (msg, data) => console.log(`[AMP:popup:tabs] ${msg}`, data ?? "");

// Local cache array to store the managed tabs list for internal interaction logic
let localManagedTabs = [];

/**
 * Returns a secure fallback favicon image using Google's favicon service if native icon is missing
 * @param {Object} tab - The enhanced tab state context object
 * @returns {string} Fully qualified favicon URL path
 */
function getFaviconUrl(tab) {
  if (tab.favIconUrl) return tab.favIconUrl;
  try {
    const host = new URL(tab.url || "https://example.com").hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch {
    return "";
  }
}

/**
 * Updates the local data array binding and handles the rendering process for the sub-tabs list.
 * @param {Array} tabsArray - The global updated array dispatched from the background service worker
 */
export function updateTabsList(tabsArray) {
  localManagedTabs = tabsArray;
  renderTabs();
}

/**
 * Renders the queue list, strictly filtering out index [0] (assigned to the main panel player.js)
 */
function renderTabs() {
  const container = $("tabs-container");
  if (!container) return;

  // Slice the array from index 1 onwards to isolate only the background queue sub-tabs
  const subTabs = localManagedTabs.slice(1);

  // Synchronize dynamic badge counter indicating background queue depth
  const tabsBadge = $("tabs-badge");
  if (tabsBadge) {
    tabsBadge.textContent = subTabs.length;
  }

  if (!subTabs.length) {
    container.innerHTML = '<div class="no-tabs">No background audio tracks in queue</div>';
    return;
  }

  container.innerHTML = subTabs
    .map((tab) => {
      const playing = tab.mediaState?.playing;
      const muted = tab.mutedInfo?.muted;
      const vol = Math.round((tab.mediaState?.volume ?? 1) * 100);
      
      return `
        <div class="tab-card sub-queue-item" data-tab-id="${tab.id}">
          <div class="tab-card-top">
            <div class="tab-card-title promote-trigger" title="Click to promote to main controller">
              <span class="tab-playing-indicator">${playing ? "▶" : "⏸"}</span>
              <img class="favicon" src="${getFaviconUrl(tab)}" alt="" loading="lazy" />
              <span class="name">${escapeHtml(tab.title || "Untitled Track")}</span>
            </div>
            <div class="tab-card-actions">
              <button class="mute-btn${muted ? " muted" : ""}" data-action="mute" title="${muted ? "Unmute" : "Mute"}">${muted ? "🔇" : "🔊"}</button>
              <button class="focus-btn" data-action="focus" title="Switch to tab browser focus">↗</button>
              <button class="close-btn" data-action="close" title="Terminate tab closure">✕</button>
            </div>
          </div>
          <div class="tab-card-volume">
            <input type="range" min="0" max="100" value="${vol}" data-action="volume" />
            <span class="vol-pct">${vol}%</span>
          </div>
        </div>
      `;
    })
    .join("");

  // Attach precise targeted UI listener hooks for each independent sub-card item
  container.querySelectorAll(".tab-card").forEach((card) => {
    const tabId = parseInt(card.dataset.tabId);
    
    // Manual queue promotion event 
    card.querySelector(".promote-trigger").addEventListener("click", () => promoteTab(tabId));
    
    // Core systemic management directives
    card.querySelector("[data-action='mute']").addEventListener("click", () => toggleMute(tabId));
    card.querySelector("[data-action='focus']").addEventListener("click", () => focusTab(tabId));
    card.querySelector("[data-action='close']").addEventListener("click", () => closeTab(tabId));
    
    const volSlider = card.querySelector("[data-action='volume']");
    volSlider.addEventListener("input", (e) => setTabVolume(tabId, parseInt(e.target.value)));
  });
}

/**
 * Fires an orchestration event forcing the targeted tab to index [0], swapping it into the primary UI view
 */
async function promoteTab(tabId) {
  LOG(`Requesting promotion for tabId=${tabId} to index [0]`);
  try {
    await browser.runtime.sendMessage({ type: "PROMOTE_TAB_ACTION", tabId });
  } catch (err) {
    LOG(`Promotion action dispatch failed: ${err.message}`);
  }
}

async function toggleMute(tabId) {
  const tab = localManagedTabs.find((t) => t.id === tabId);
  if (!tab) return;
  const nextMuteState = !tab.mutedInfo?.muted;
  LOG(`Toggling tabId=${tabId} mute state to: ${nextMuteState}`);
  await browser.tabs.update(tabId, { muted: nextMuteState });
}

async function focusTab(tabId) {
  LOG(`Focusing browser window to tabId=${tabId}`);
  try {
    await browser.tabs.update(tabId, { active: true });
    const nativeTab = await browser.tabs.get(tabId);
    await browser.windows.update(nativeTab.windowId, { focused: true });
    window.close(); // Close extension popup to smoothly complete transition context
  } catch (err) {
    LOG(`Focus operation failed: ${err.message}`);
  }
}

async function closeTab(tabId) {
  LOG(`Terminating native browser tabId=${tabId}`);
  await browser.tabs.remove(tabId);
}

async function setTabVolume(tabId, vol) {
  const normalizedVolume = vol / 100;
  LOG(`Relaying isolated volume update to tabId=${tabId} volume=${vol}%`);
  try {
    await browser.tabs.sendMessage(tabId, { type: "SET_VOLUME", volume: normalizedVolume });
  } catch (err) { 
    LOG(`Volume message relay down to tabId=${tabId} failed: ${err.message}`); 
  }
}
