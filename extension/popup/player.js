import { $, formatTime } from "./ui.js";
import { activeTabId, setMediaState, mediaState } from "./store.js";
import { sendConfig } from "./equalizer.js";

const LOG = (msg, data) => console.log(`[AMP:popup:player] ${msg}`, data ?? "");

export async function requestMediaState() {
  if (!activeTabId) {
    LOG("requestMediaState: no activeTabId, skipping");
    return;
  }
  try {
    const resp = await chrome.tabs.sendMessage(activeTabId, { type: "GET_MEDIA_STATE" });
    if (resp) {
      setMediaState(resp);
      LOG(`playing=${resp.playing} time=${resp.currentTime}/${resp.duration} title="${resp.title}"`);
      updateUI();
    } else {
      LOG("null response (no media element)");
    }
  } catch {
    LOG(`tab=${activeTabId} not reachable or no content script`);
    $("track-info").textContent = "No media detected";
    $("track-domain").textContent = "";
    document.getElementById("status-dot").className = "";
  }
}

export function updateUI() {
  if (!mediaState) return;
  const trackInfo = mediaState.title || "Unknown";
  $("track-info").textContent = trackInfo.length > 45 ? trackInfo.slice(0, 45) + "…" : trackInfo;
  if (mediaState.src) {
    try { $("track-domain").textContent = new URL(mediaState.src).hostname; } catch {}
  }
  $("play-btn").textContent = mediaState.playing ? "⏸" : "▶";
  $("seek-bar").max = mediaState.duration || 100;
  $("seek-bar").value = mediaState.currentTime || 0;
  $("current-time").textContent = formatTime(mediaState.currentTime);
  $("duration").textContent = formatTime(mediaState.duration);
  $("volume-slider").value = (mediaState.volume || 1) * 100;
  $("volume-label").textContent = `${Math.round((mediaState.volume || 1) * 100)}`;
  const dot = document.getElementById("status-dot");
  dot.className = mediaState.playing ? "on" : "paused";
}

export async function sendPlaybackAction(action, time) {
  if (!activeTabId) {
    LOG(`no activeTabId, ignoring ${action}`);
    return;
  }
  LOG(`action=${action} time=${time} tab=${activeTabId}`);
  try {
    await chrome.tabs.sendMessage(activeTabId, { type: "SET_PLAYBACK", action, time });
    if (action !== "seek") setTimeout(requestMediaState, 150);
  } catch { LOG(`tab=${activeTabId} not reachable`); }
}

export function wirePlayerControls() {
  $("play-btn").addEventListener("click", () => sendPlaybackAction("toggle"));
  $("prev-btn").addEventListener("click", () => sendPlaybackAction("seek", Math.max(0, (mediaState?.currentTime || 0) - 10)));
  $("rewind-btn").addEventListener("click", () => sendPlaybackAction("seek", Math.max(0, (mediaState?.currentTime || 0) - 10)));
  $("next-btn").addEventListener("click", () => sendPlaybackAction("seek", (mediaState?.currentTime || 0) + 30));
  $("forward-btn").addEventListener("click", () => sendPlaybackAction("seek", (mediaState?.currentTime || 0) + 10));

  $("seek-bar").addEventListener("input", (e) => {
    sendPlaybackAction("seek", parseFloat(e.target.value));
    $("current-time").textContent = formatTime(parseFloat(e.target.value));
  });

  $("volume-slider").addEventListener("input", (e) => {
    const val = parseInt(e.target.value);
    $("volume-label").textContent = `${val}`;
    sendConfig();
  });
}
