const LOG = (msg, data) => console.log(`[AMP:content] ${msg}`, data ?? "");

let worker = null;
let audioCtx = null;
let sourceNode = null;
let mediaElements = new WeakSet();

LOG("content script loaded");

function initWorker() {
  if (worker) {
    LOG("initWorker: already initialized");
    return;
  }
  const url = chrome.runtime.getURL("worker.js");
  LOG(`initWorker: url=${url}`);
  worker = new Worker(url);
  worker.onmessage = (e) => {
    const { type, data } = e.data;
    if (type === "PROCESSED_AUDIO") {
      chrome.runtime.sendMessage({
        type: "AUDIO_FRAME",
        data: data,
        tabId: undefined,
      });
    }
  };
  worker.onerror = (e) => LOG(`worker error: ${e.message}`);
}

function captureMediaElement(el) {
  if (!(el instanceof HTMLMediaElement)) {
    LOG(`captureMediaElement: not an HTMLMediaElement, skipping`);
    return;
  }
  if (mediaElements.has(el)) {
    LOG(`captureMediaElement: already captured, skipping`);
    return;
  }
  mediaElements.add(el);
  LOG(`captureMediaElement: capturing <${el.tagName.toLowerCase()}> src="${el.src || el.currentSrc || "?"}" title="${document.title}"`);

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(el);
    const gainNode = audioCtx.createGain();
    const analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;

    sourceNode.connect(gainNode);
    gainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    LOG("captureMediaElement: Audio graph connected successfully");

    initWorker();

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    function sendFrame() {
      if (el.paused || el.ended) return;
      analyserNode.getFloatTimeDomainData(dataArray);
      worker.postMessage({ type: "PROCESS_AUDIO", samples: dataArray.buffer }, [dataArray.buffer]);
      requestAnimationFrame(sendFrame);
    }

    el.addEventListener("play", () => {
      LOG("media element: play event");
      audioCtx.resume();
      sendFrame();
    });

    el.addEventListener("pause", () => {
      LOG("media element: pause event");
      audioCtx.suspend();
    });

    chrome.runtime.sendMessage({
      type: "MEDIA_ELEMENT_CAPTURED",
      tabId: undefined,
    });
    LOG("MEDIA_ELEMENT_CAPTURED sent to background");
  } catch (err) {
    LOG(`captureMediaElement failed: ${err.message}`);
    console.warn("[Advanced Media Player] Could not capture media element:", err);
  }
}

function scanForMedia() {
  const els = document.querySelectorAll("video, audio");
  LOG(`scanForMedia: found ${els.length} media element(s)`);
  els.forEach(captureMediaElement);
}

const observer = new MutationObserver(() => {
  LOG("MutationObserver: DOM changed, rescanning");
  scanForMedia();
});
observer.observe(document.body, { childList: true, subtree: true });

scanForMedia();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  LOG(`onMessage: type=${msg.type}`);

  if (msg.type === "GET_MEDIA_STATE") {
    const el = document.querySelector("video, audio");
    if (el) {
      const state = {
        playing: !el.paused,
        currentTime: el.currentTime,
        duration: el.duration,
        volume: el.volume,
        muted: el.muted,
        title: document.title,
        src: el.src,
      };
      LOG(`GET_MEDIA_STATE: responding playing=${state.playing} time=${state.currentTime}/${state.duration}`);
      sendResponse(state);
    } else {
      LOG("GET_MEDIA_STATE: no media element found, responding null");
      sendResponse(null);
    }
  }
  if (msg.type === "SET_VOLUME") {
    const el = document.querySelector("video, audio");
    if (el) {
      el.volume = Math.max(0, Math.min(1, msg.volume));
      LOG(`SET_VOLUME: ${msg.volume}`);
    } else {
      LOG("SET_VOLUME: no media element found");
    }
  }
  if (msg.type === "SET_PLAYBACK") {
    const el = document.querySelector("video, audio");
    if (el) {
      LOG(`SET_PLAYBACK: action=${msg.action} time=${msg.time}`);
      if (msg.action === "play") el.play().then(() => LOG("play succeeded")).catch((e) => LOG(`play failed: ${e}`));
      else if (msg.action === "pause") el.pause();
      else if (msg.action === "toggle") el.paused ? el.play() : el.pause();
      else if (msg.action === "seek" && typeof msg.time === "number") el.currentTime = msg.time;
    } else {
      LOG("SET_PLAYBACK: no media element found");
    }
  }
  return true;
});
