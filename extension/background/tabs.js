import { mediaStateCache } from "./state.js";

const LOG = (msg, data) => console.log(`[AMP:bg:tabs] ${msg}`, data ?? "");

export function getAudibleTabs() {
  return Promise.all([
    new Promise((resolve) => chrome.tabs.query({ audible: true }, resolve)),
    new Promise((resolve) => chrome.tabs.query({}, resolve)),
  ]).then(([audibleTabs, allTabs]) => {
    const seen = new Set();
    const merged = [];
    for (const tab of audibleTabs) {
      seen.add(tab.id);
      merged.push(tab);
    }
    for (const tab of allTabs) {
      if (seen.has(tab.id)) continue;
      if (mediaStateCache.has(tab.id)) {
        seen.add(tab.id);
        merged.push(tab);
      }
    }
    const result = merged.map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      audible: tab.audible,
      mutedInfo: tab.mutedInfo,
      mediaState: mediaStateCache.get(tab.id) || null,
      windowId: tab.windowId,
    }));
    LOG(`${audibleTabs.length} audible, ${merged.length} merged, ${mediaStateCache.size} cached`);
    return result;
  });
}
