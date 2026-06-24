const LOG = (msg, data) => console.log(`[AMP:bg:injector] ${msg}`, data ?? "");

export async function injectContentScript(tabId) {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    LOG(`injected: tab=${tabId}`);
  } catch (e) { LOG(`failed: tab=${tabId} ${e}`); }
}

export async function initWorkerForTab(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "INIT_WORKER" });
    LOG(`worker init sent: tab=${tabId}`);
  } catch { LOG(`worker init: tab=${tabId} not reachable`); }
}
