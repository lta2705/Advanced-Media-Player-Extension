export const mediaStateCache = new Map();
export let currentConfig = {
  gain: 1.0,
  sampleRate: 44100,
  eq: [],
  compressor: { enabled: false },
  timeStretch: 1.0,
  visualize: false,
};
export function setConfig(c) {
  currentConfig = c;
}

let managedAudioTabs = [];

const LOG = (msg, data) => {
  console.log(`[AMG:bg:state] ${msg}`, data ?? "");
};

/**
 * Returns the entire array of currently managed audio tabs.
 * Used by the background router to ship data over to the Popup list view.
 * * @returns {Array} List of all active media tab states
 */

export function getManagedTabs() {
  return managedAudioTabs;
}

/**
 * Returns the primary tab (index 0) which drives the main dashboard of the Popup UI.
 * * @returns {Object|null} The active primary tab state or null if empty
 */

export function getPrimaryTab() {
  return managedAudioTabs.length > 0 ? managedAudioTabs[0] : null;
}

/**
 * Pushes a new media tab to the end of the array (Queue Enqueue)
 * or updates its structural properties in place if it already exists.
 * * @param {number} tabId - The native browser tab identifier
 * @param {Object} stateUpdates - Incoming real-time media states (playing, currentTime, etc.)
 */
export function updateTabState(tabId, stateUpdates) {
  const existingIdx = managedAudioTabs.findIndex(t => t.tabId === tabId);

  if (existingIdx !== -1) {
    managedAudioTabs[existingIdx] = { ...managedAudioTabs[existingIdx], ...stateUpdates };
  } else {
    const newTab = { tabId, ...stateUpdates };
    managedAudioTabs.push(newTab);
    LOG(`Enqueued new tab ${tabId}. Total merged tabs": ${managedAudioTabs.length}`);
  }
}

/**
 * Filters out a tab from the managed array when it is closed, reloaded, or goes silent.
 * Automatically handles "Đôn đỉnh" (promotes the next tab in line to index 0) if the top tab drops.
 * * @param {number} tabId - The native browser tab identifier to strip out
 * @returns {boolean} True if the array layout mutated and requires a UI re-render signal
 */

 export function removeTabFromManaged(tabId) {
   const initialLength = managedAudioTabs.length;
   
   // Cleanly slice out the dead tab using immutable filtering
   managedAudioTabs = managedAudioTabs.filter(t => t.tabId !== tabId);
 
   if (managedAudioTabs.length !== initialLength) {
     STATE_LOG(`Removed tab=${tabId}. Remaining active tabs: ${managedAudioTabs.length}`);
     
     // If a shift occurred and we still have tabs, index 0 is now automatically occupied by the next runner-up
     if (managedAudioTabs.length > 0) {
       STATE_LOG(`Tab=${managedAudioTabs[0].tabId} automatically promoted to primary index [0]`);
     }
     return true; // Indicates mutations occurred
   }
   return false; 
 }

 /**
  * Promotes any sub-tab up to index 0, immediately swapping it into the main dashboard panel position.
  * * @param {number} tabId - The native browser tab identifier to be promoted
  * @returns {boolean} True if the promotion succeeded, false otherwise
  */
 export function promoteTabToPrimary(tabId) {
   const index = managedAudioTabs.findIndex(t => t.tabId === tabId);
   
   // Only promote if it exists and is not already at the top index [0]
   if (index > 0) {
     const [targetTab] = managedAudioTabs.splice(index, 1); // Extract from its current position
     managedAudioTabs.unshift(targetTab); // Inject directly into the front of the queue
     STATE_LOG(`Manually promoted tab=${tabId} to primary controller position [0]`);
     return true;
   }
   return false;
 }