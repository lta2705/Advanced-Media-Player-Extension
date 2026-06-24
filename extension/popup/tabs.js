import { $, escapeHtml } from "./ui.js";
import { activeTabId, setAudibleTabs, audibleTabs, mediaState } from "./store.js";

const LOG = (msg, data) => console.log(`[AMP:popup:tabs] ${msg}`, data ?? "");

function getFaviconUrl(tab) {
  return tab.favIconUrl || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(tab.url || "https://example.com").hostname)}&sz=32`;
}

export async function fetchAudibleTabs() {
  try {
    const resp = await browser.runtime.sendMessage({ type: "GET_AUDIBLE_TABS" });
    setAudibleTabs(resp?.tabs || []);
    LOG(`${audibleTabs.length} tab(s) returned`);
  } catch (err) {
    LOG(`error - ${err}`);
    setAudibleTabs([]);
  }
  renderTabs();
  $("tabs-badge").textContent = audibleTabs.length;
}

export async function watchAudibleTabs() {
  await fetchAudibleTabs();
  setInterval(fetchAudibleTabs, 2000);
}

function renderTabs() {
  const container = $("tabs-container");
  if (!audibleTabs.length) {
    container.innerHTML = '<div class="no-tabs">No tabs playing audio</div>';
    return;
  }

  container.innerHTML = audibleTabs
    .map((tab) => {
      const isCurrent = tab.id === activeTabId;
      const playing = tab.mediaState?.playing;
      const muted = tab.mutedInfo?.muted;
      const vol = Math.round((tab.mediaState?.volume ?? 1) * 100);
      return `
        <div class="tab-card${isCurrent ? " current" : ""}" data-tab-id="${tab.id}">
          <div class="tab-card-top">
            <div class="tab-card-title">
              <span class="tab-playing-indicator">${playing ? "▶" : "⏸"}</span>
              <img class="favicon" src="${getFaviconUrl(tab)}" alt="" loading="lazy" />
              <span class="name" title="${escapeHtml(tab.title || "")}">${escapeHtml(tab.title || "Untitled")}</span>
            </div>
            <div class="tab-card-actions">
              <button class="mute-btn${muted ? " muted" : ""}" data-action="mute" title="${muted ? "Unmute" : "Mute"}">${muted ? "🔇" : "🔊"}</button>
              <button class="focus-btn" data-action="focus" title="Switch to tab">↗</button>
              <button class="close-btn" data-action="close" title="Close tab">✕</button>
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

  container.querySelectorAll(".tab-card").forEach((card) => {
    const tabId = parseInt(card.dataset.tabId);
    card.querySelector("[data-action='mute']").addEventListener("click", () => toggleMute(tabId));
    card.querySelector("[data-action='focus']").addEventListener("click", () => focusTab(tabId));
    card.querySelector("[data-action='close']").addEventListener("click", () => closeTab(tabId));
    const volSlider = card.querySelector("[data-action='volume']");
    volSlider.addEventListener("input", (e) => setTabVolume(tabId, parseInt(e.target.value)));
  });
}

async function toggleMute(tabId) {
  const tab = audibleTabs.find((t) => t.id === tabId);
  if (!tab) return;
  const next = !tab.mutedInfo?.muted;
  LOG(`tab=${tabId} -> ${next ? "muted" : "unmuted"}`);
  await browser.tabs.update(tabId, { muted: next });
  fetchAudibleTabs();
}

async function focusTab(tabId) {
  LOG(`tab=${tabId}`);
  await browser.tabs.update(tabId, { active: true });
  await browser.windows.update((await browser.tabs.get(tabId)).windowId, { focused: true });
  window.close();
}

async function closeTab(tabId) {
  LOG(`tab=${tabId}`);
  await browser.tabs.remove(tabId);
  fetchAudibleTabs();
}

async function setTabVolume(tabId, vol) {
  const pct = vol / 100;
  LOG(`tab=${tabId} vol=${vol}%`);
  try {
    await browser.tabs.sendMessage(tabId, { type: "SET_VOLUME", volume: pct });
  } catch { LOG(`tab=${tabId} not reachable`); }
  if (tabId === activeTabId && mediaState) {
    mediaState.volume = pct;
  }
}
