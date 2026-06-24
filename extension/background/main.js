import { injectContentScript } from "./injector.js";
import { setupMediaSession, handleConfigUpdate, pollActiveTab } from "./media-session.js";
import { getAudibleTabs } from "./tabs.js";
import { mediaStateCache, currentConfig } from "./state.js";

const LOG = (msg, data) => console.log(`[AMP:bg:main] ${msg}`, data ?? "");

browser.runtime.onInstalled.addListener((details) => {
  LOG(`onInstalled: reason=${details.reason}`);
  browser.tabs.query({}, (tabs) => {
    LOG(`injecting into ${tabs.length} existing tab(s)`);
    for (const tab of tabs) injectContentScript(tab.id);
  });
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    LOG(`onUpdated: tab=${tabId} status=complete url=${tab?.url}`);
    injectContentScript(tabId);
  }
  if (changeInfo.audible !== undefined || changeInfo.mutedInfo) {
    LOG(`onUpdated: tab=${tabId} audible=${tab?.audible} muted=${tab?.mutedInfo?.muted}`);
    browser.runtime.sendMessage({ type: "AUDIBLE_TABS_CHANGED" }).catch(() => {});
  }
});

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  LOG(`onMessage: type=${msg.type} from=${sender.url ?? "?"} tab=${tabId}`);

  if (msg.type === "MEDIA_ELEMENT_CAPTURED" && tabId) {
    LOG(`MEDIA_ELEMENT_CAPTURED: tab=${tabId}`);
    setupMediaSession(tabId);
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "AUDIO_FRAME" && tabId) {
    browser.tabs.sendMessage(tabId, { type: "SPECTRUM", data: msg.data }).catch(() => {});
    return;
  }

  if (msg.type === "UPDATE_CONFIG") {
    handleConfigUpdate(msg.config);
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "MEDIA_STATE_UPDATE" && tabId) {
    mediaStateCache.set(tabId, msg.state);
    LOG(`MEDIA_STATE_UPDATE: tab=${tabId} playing=${msg.state?.playing}`);
  }

  if (msg.type === "GET_AUDIBLE_TABS") {
    getAudibleTabs().then((tabs) => sendResponse({ tabs }));
    return true;
  }

  if (msg.type === "GET_CONFIG") {
    sendResponse(currentConfig);
    return true;
  }
});

setInterval(pollActiveTab, 1500);
LOG("background script loaded, polling started");
