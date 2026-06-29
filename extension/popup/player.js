// popup/player.js

import { $, formatTime } from "./ui.js";

const LOG = (msg, data) => console.log(`[AMP:popup:player] ${msg}`, data ?? "");
let _volumeDragging = false;

// Local reference storing the target tab currently driving the primary panel view
let currentPrimaryTab = null;

/**
 * Updates the local data binding reference for the primary panel controller.
 * This should be invoked by popup/main.js whenever the tabs array mutates.
 * @param {Object|null} tabState - The tab object at index [0] of the managed queue array
 */
export function setPrimaryTabState(tabState) {
  currentPrimaryTab = tabState;
}

/**
 * Synchronizes the entire primary Player UI view layer with the synchronized top queue element.
 */
export function updateUI() {
  // If no audio tabs are being managed by the background engine, clean slate the UI
  if (!currentPrimaryTab || !currentPrimaryTab.mediaState) {
    const trackInfoEl = $("track-info");
    const trackDomainEl = $("track-domain");
    const statusDotEl = $("status-dot");
    
    if (trackInfoEl) trackInfoEl.textContent = "No media detected";
    if (trackDomainEl) trackDomainEl.textContent = "";
    if (statusDotEl) statusDotEl.className = "";
    return;
  }

  const mediaState = currentPrimaryTab.mediaState;

  // 1. Update and trim track title safely
  const trackTitle = currentPrimaryTab.title || "Unknown Track";
  const trackInfoEl = $("track-info");
  if (trackInfoEl) {
    trackInfoEl.textContent = trackTitle.length > 45 ? trackTitle.slice(0, 45) + "…" : trackTitle;
  }

  // 2. Extract and display source media domain hostname
  const trackDomainEl = $("track-domain");
  if (trackDomainEl && currentPrimaryTab.url) {
    try { 
      trackDomainEl.textContent = new URL(currentPrimaryTab.url).hostname; 
    } catch { 
      trackDomainEl.textContent = ""; 
    }
  }

  // 3. Sync transport controls & progress timelines
  const playBtn = $("play-btn");
  if (playBtn) playBtn.textContent = mediaState.playing ? "⏸" : "▶";

  const seekBar = $("seek-bar");
  if (seekBar) {
    seekBar.max = mediaState.duration || 100;
    seekBar.value = mediaState.currentTime || 0;
  }

  const currentTimeLabel = $("current-time");
  const durationLabel = $("duration");
  if (currentTimeLabel && typeof formatTime === "function") {
    currentTimeLabel.textContent = formatTime(mediaState.currentTime);
  }
  if (durationLabel && typeof formatTime === "function") {
    durationLabel.textContent = formatTime(mediaState.duration);
  }

  // 4. Sync volume ranges — skip if user is actively dragging the slider
  const volumeSlider = $("volume-slider");
  const volumeLabel = $("volume-label");
  if (!_volumeDragging) {
    const targetVolumePct = Math.round((mediaState.volume !== undefined ? mediaState.volume : 1) * 100);
    if (volumeSlider) volumeSlider.value = targetVolumePct;
    if (volumeLabel) volumeLabel.textContent = `${targetVolumePct}`;
  }

  // 5. Update graphical status animation dot indicator
  const dot = $("status-dot");
  if (dot) {
    dot.className = mediaState.playing ? "on" : "paused";
  }
}

/**
 * Dispatches a targeted playback control command down to the specific tab capturing index [0].
 * @param {string} action - The string payload identifier ("toggle", "seek", "next", etc.)
 * @param {number|null} time - Optional target timeline timestamp configuration
 */
export async function sendPlaybackAction(action, time = null) {
  if (!currentPrimaryTab || !currentPrimaryTab.id) {
    LOG(`No active primary tab context, ignoring action: ${action}`);
    return;
  }

  const targetTabId = currentPrimaryTab.id;
  LOG(`Dispatching action=${action} time=${time} directly to targeted tab=${targetTabId}`);
  
  try {
    const payload = { type: "SET_PLAYBACK", action };
    if (time !== null) payload.time = time;

    // Send the execution directive targeted explicitly to the primary tab's isolated script
    await browser.tabs.sendMessage(targetTabId, payload);

    // Refresh UI from background cache after action for responsive feedback
    setTimeout(async () => {
      try {
        const resp = await browser.runtime.sendMessage({ type: "GET_ALL_MANAGED_TABS" });
        if (resp && resp.length > 0) {
          setPrimaryTabState(resp[0]);
          updateUI();
        }
      } catch (_) { /* popup might be closing */ }
    }, 150);
  } catch (err) { 
    LOG(`Targeted tab=${targetTabId} unreachable: ${err.message}`); 
  }
}

/**
 * Registers system listeners and assigns hooks to human interactive primary UI triggers.
 */
export function wirePlayerControls() {
  $("play-btn")?.addEventListener("click", () => sendPlaybackAction("toggle"));
  $("prev-btn")?.addEventListener("click", () => sendPlaybackAction("prev"));
  $("next-btn")?.addEventListener("click", () => sendPlaybackAction("next"));

  $("rewind-btn")?.addEventListener("click", () => {
    const current = currentPrimaryTab?.mediaState?.currentTime || 0;
    sendPlaybackAction("seek", Math.max(0, current - 10));
  });

  $("forward-btn")?.addEventListener("click", () => {
    const current = currentPrimaryTab?.mediaState?.currentTime || 0;
    sendPlaybackAction("seek", current + 10);
  });

  $("seek-bar")?.addEventListener("input", (e) => {
    const targetTime = parseFloat(e.target.value);
    sendPlaybackAction("seek", targetTime);
    
    const currentTimeLabel = $("current-time");
    if (currentTimeLabel && typeof formatTime === "function") {
      currentTimeLabel.textContent = formatTime(targetTime);
    }
  });

  $("volume-slider")?.addEventListener("input", (e) => {
    _volumeDragging = true;
    const val = parseInt(e.target.value);
    const normalized = val / 100;

    const volumeLabel = $("volume-label");
    if (volumeLabel) volumeLabel.textContent = `${val}`;

    if (currentPrimaryTab && currentPrimaryTab.id) {
      browser.tabs.sendMessage(currentPrimaryTab.id, {
        type: "SET_VOLUME",
        volume: normalized,
      }).catch((err) => LOG(`Volume slider relay payload failed: ${err.message}`));
    }
  });

  $("volume-slider")?.addEventListener("change", () => {
    _volumeDragging = false;
  });
  $("volume-slider")?.addEventListener("pointerup", () => {
    setTimeout(() => { _volumeDragging = false; }, 200);
  });
}
