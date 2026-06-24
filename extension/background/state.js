export const mediaStateCache = new Map();
export let currentConfig = {
  gain: 1.0,
  sampleRate: 44100,
  eq: [],
  compressor: { enabled: false },
  timeStretch: 1.0,
  visualize: false,
};
export function setConfig(c) { currentConfig = c; }
