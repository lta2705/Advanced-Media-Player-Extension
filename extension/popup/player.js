import { $, formatTime } from "./ui.js";
import { activeTabId, setMediaState, mediaState } from "./store.js";

const LOG = (msg, data) => console.log(`[AMP:popup:player] ${msg}`, data ?? "");
let _volumeDragging = false;

/**
 * Periodically requests the current media state from the content script
 * running in the active tab context.
 */
export async function requestMediaState() {
  if (typeof activeTabId === "undefined" || !activeTabId) {
    LOG("requestMediaState: no activeTabId, skipping");
    return;
  }
  try {
    const resp = await browser.tabs.sendMessage(activeTabId, { type: "GET_MEDIA_STATE" });
    if (resp) {
      setMediaState(resp);
      LOG(`playing=${resp.playing} time=${resp.currentTime}/${resp.duration} title="${resp.title}"`);
      updateUI();
    } else {
      LOG("null response (no media element)");
    }
  } catch (err) {
    LOG(`tab=${activeTabId} not reachable or no content script: ${err.message}`);
    const trackInfo = document.getElementById("track-info");
    const trackDomain = document.getElementById("track-domain");
    const statusDot = document.getElementById("status-dot");

    if (trackInfo) trackInfo.textContent = "No media detected";
    if (trackDomain) trackDomain.textContent = "";
    if (statusDot) statusDot.className = "";
  }
}

/**
 * Synchronizes the entire Player UI view layer with the latest cached mediaState object.
 */
export function updateUI() {
  // mediaState is managed globally by popup/store.js
  if (typeof mediaState === "undefined" || !mediaState) return;
  
  const $ = (id) => document.getElementById(id);

  // 1. Update and trim track title safely
  const trackInfo = mediaState.title || "Unknown";
  const trackInfoEl = $("track-info");
  if (trackInfoEl) {
    trackInfoEl.textContent = trackInfo.length > 45 ? trackInfo.slice(0, 45) + "…" : trackInfo;
  }

  // 2. Extract and display source media domain hostname
  const trackDomainEl = $("track-domain");
  if (trackDomainEl && mediaState.src) {
    try { 
      trackDomainEl.textContent = new URL(mediaState.src).hostname; 
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

  // 4. Sync volume ranges — skip if user is actively dragging
  const volumeSlider = $("volume-slider");
  const volumeLabel = $("volume-label");
  if (!_volumeDragging) {
    const targetVolumePct = Math.round((mediaState.volume !== undefined ? mediaState.volume : 1) * 100);
    if (volumeSlider) volumeSlider.value = targetVolumePct;
    if (volumeLabel) volumeLabel.textContent = `${targetVolumePct}`;
  }

  // 5. Update graphical connection availability matrix status dot
  const dot = document.getElementById("status-dot");
  if (dot) {
    dot.className = mediaState.playing ? "on" : "paused";
  }
}

/**
 * Dispatches a high-priority structural playback control command downwards to the targeted active tab.
 */
export async function sendPlaybackAction(action, time = null) {
  if (typeof activeTabId === "undefined" || !activeTabId) {
    LOG(`no activeTabId, ignoring ${action}`);
    return;
  }
  LOG(`action=${action} time=${time} tab=${activeTabId}`);
  try {
    const payload = { type: "SET_PLAYBACK", action };
    if (time !== null) payload.time = time;

    await browser.tabs.sendMessage(activeTabId, payload);
    
    // Smooth responsive UI fallback refresh loop execution window
    if (action !== "seek") setTimeout(requestMediaState, 150);
  } catch (err) { 
    LOG(`tab=${activeTabId} not reachable: ${err.message}`); 
  }
}

/**
 * Registers system listeners and assigns hooks to human interactive UI triggers.
 */
export function wirePlayerControls() {
  const $ = (id) => document.getElementById(id);

  $("play-btn")?.addEventListener("click", () => sendPlaybackAction("toggle"));
  $("prev-btn")?.addEventListener("click", () => sendPlaybackAction("prev"));
  $("next-btn")?.addEventListener("click", () => sendPlaybackAction("next"));

  $("rewind-btn")?.addEventListener("click", () => {
    const current = typeof mediaState !== "undefined" ? mediaState?.currentTime || 0 : 0;
    sendPlaybackAction("seek", Math.max(0, current - 10));
  });

  $("forward-btn")?.addEventListener("click", () => {
    const current = typeof mediaState !== "undefined" ? mediaState?.currentTime || 0 : 0;
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

    if (typeof activeTabId !== "undefined" && activeTabId) {
      browser.tabs.sendMessage(activeTabId, {
        type: "SET_VOLUME",
        volume: normalized,
      }).catch((err) => LOG(`Volume message relay down failed: ${err.message}`));
    }
  });

  $("volume-slider")?.addEventListener("change", () => {
    _volumeDragging = false;
  });
  $("volume-slider")?.addEventListener("pointerup", () => {
    setTimeout(() => { _volumeDragging = false; }, 200);
  });
}
