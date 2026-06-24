let audioCtx = null;
let mediaStateCache = new Map();
let currentConfig = {
  gain: 1.0,
  sampleRate: 44100,
  eq: [],
  compressor: { enabled: false },
  timeStretch: 1.0,
  visualize: false,
};

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function setupMediaSession(activeTabId) {
  if (!("mediaSession" in navigator)) return;
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

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch {}
}

async function initWorkerForTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "INIT_WORKER" });
  } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      injectContentScript(tab.id);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    injectContentScript(tabId);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === "MEDIA_ELEMENT_CAPTURED" && tabId) {
    setupMediaSession(tabId);
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "AUDIO_FRAME" && tabId) {
    chrome.tabs.sendMessage(tabId, { type: "SPECTRUM", data: msg.data }).catch(() => {});
    return;
  }

  if (msg.type === "UPDATE_CONFIG") {
    currentConfig = { ...currentConfig, ...msg.config };
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: "CONFIG_UPDATE",
          config: currentConfig,
        }).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "MEDIA_STATE_UPDATE" && tabId) {
    mediaStateCache.set(tabId, msg.state);
  }

  if (msg.type === "GET_CONFIG") {
    sendResponse(currentConfig);
    return true;
  }
});

setInterval(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "GET_MEDIA_STATE" }).then((resp) => {
        if (resp) {
          mediaStateCache.set(tabs[0].id, resp);
          chrome.runtime.sendMessage({ type: "MEDIA_STATE_UPDATE", state: resp });
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = resp.playing ? "playing" : "paused";
          }
        }
      }).catch(() => {});
    }
  });
}, 1500);
