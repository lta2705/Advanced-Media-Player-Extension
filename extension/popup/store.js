export let activeTabId = null;
export function setActiveTabId(id) { activeTabId = id; }

export let mediaState = null;
export function setMediaState(s) { mediaState = s; }

export let eqValues = [];
export function setEqValues(v) { eqValues = v; }

export let eqEnabled = true;
export function setEqEnabled(v) { eqEnabled = v; }

export let compressorEnabled = false;
export function setCompressorEnabled(v) { compressorEnabled = v; }

export let audibleTabs = [];
export function setAudibleTabs(t) { audibleTabs = t; }
