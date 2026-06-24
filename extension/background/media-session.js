import { mediaStateCache, currentConfig, setConfig } from "./state.js";

const LOG = (msg, data) => console.log(`[AMP:bg:session] ${msg}`, data ?? "");

export function setupMediaSession(activeTabId) {
  if (!("mediaSession" in navigator)) {
    LOG("mediaSession not available");
    return;
  }
  LOG(`tab=${activeTabId}`);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: "Advanced Media Player",
    artist: mediaStateCache.get(activeTabId)?.title || "Unknown",
    album: "Firefox Extension",
  });

  navigator.mediaSession.setActionHandler("play", () => {
    chrome.tabs.sendMessage(activeTabId, { type: "SET_PLAYBACK", action: "play" });
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    chrome.tabs.sendMessage(activeTabId, { type: "SET_PLAYBACK", action: "pause" });
  });
  navigator.mediaSession.setActionHandler("seekforward", () => {
    chrome.tabs.sendMessage(activeTabId, { type: "SET_PLAYBACK", action: "seek", time: (mediaStateCache.get(activeTabId)?.currentTime || 0) + 30 });
  });
  navigator.mediaSession.setActionHandler("seekbackward", () => {
    chrome.tabs.sendMessage(activeTabId, { type: "SET_PLAYBACK", action: "seek", time: Math.max(0, (mediaStateCache.get(activeTabId)?.currentTime || 0) - 10) });
  });
  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (details.seekTime) {
      chrome.tabs.sendMessage(activeTabId, { type: "SET_PLAYBACK", action: "seek", time: details.seekTime });
    }
  });
}

export function handleConfigUpdate(config) {
  setConfig({ ...currentConfig, ...config });
  LOG(`gain=${currentConfig.gain} eq=${currentConfig.eq?.length} band(s)`);
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, {
        type: "CONFIG_UPDATE",
        config: currentConfig,
      }).catch(() => {});
    }
  });
}

export async function pollActiveTab() {
  try {
    const win = await new Promise((r) => chrome.windows.getLastFocused(r));
    const tabs = await new Promise((r) => chrome.tabs.query({ active: true, windowId: win.id }, r));
    if (!tabs[0]?.id) {
      LOG("poll: no active tab found");
      return;
    }
    const resp = await new Promise((r) => chrome.tabs.sendMessage(tabs[0].id, { type: "GET_MEDIA_STATE" }, r));
    if (!resp) {
      LOG(`poll: tab=${tabs[0].id} no media state`);
      return;
    }
    mediaStateCache.set(tabs[0].id, resp);
    LOG(`poll: tab=${tabs[0].id} playing=${resp.playing} ${Math.round(resp.currentTime)}/${Math.round(resp.duration)}s`);
    chrome.runtime.sendMessage({ type: "MEDIA_STATE_UPDATE", state: resp }).catch(() => {});
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = resp.playing ? "playing" : "paused";
    }
  } catch (e) { LOG(`poll error: ${e}`); }
}
