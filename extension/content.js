let worker = null;
let audioCtx = null;
let sourceNode = null;
let mediaElements = new WeakSet();

function initWorker() {
  if (worker) return;
  const url = chrome.runtime.getURL("worker.js");
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
}

function captureMediaElement(el) {
  if (!(el instanceof HTMLMediaElement) || mediaElements.has(el)) return;
  mediaElements.add(el);

  try {
    audioCtx = new AudioContext();
    sourceNode = audioCtx.createMediaElementSource(el);
    const gainNode = audioCtx.createGain();
    const analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;

    sourceNode.connect(gainNode);
    gainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

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
      audioCtx.resume();
      sendFrame();
    });

    el.addEventListener("pause", () => audioCtx.suspend());

    chrome.runtime.sendMessage({
      type: "MEDIA_ELEMENT_CAPTURED",
      tabId: undefined,
    });
  } catch (err) {
    console.warn("[Advanced Media Player] Could not capture media element:", err);
  }
}

function scanForMedia() {
  document.querySelectorAll("video, audio").forEach(captureMediaElement);
}

const observer = new MutationObserver(() => scanForMedia());
observer.observe(document.body, { childList: true, subtree: true });

scanForMedia();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_MEDIA_STATE") {
    const el = document.querySelector("video, audio");
    if (el) {
      sendResponse({
        playing: !el.paused,
        currentTime: el.currentTime,
        duration: el.duration,
        volume: el.volume,
        muted: el.muted,
        title: document.title,
        src: el.src,
      });
    } else {
      sendResponse(null);
    }
  }
  if (msg.type === "SET_PLAYBACK") {
    const el = document.querySelector("video, audio");
    if (el) {
      if (msg.action === "play") el.play();
      else if (msg.action === "pause") el.pause();
      else if (msg.action === "toggle") el.paused ? el.play() : el.pause();
      else if (msg.action === "seek" && typeof msg.time === "number") el.currentTime = msg.time;
    }
  }
  return true;
});
