const LOG = (msg, data) => console.log(`[AMP:content] ${msg}`, data ?? "");

let worker = null;
let audioCtx = null;
let sourceNode = null;
let gainNode = null;
let mediaElements = new WeakSet();

LOG("content script loaded");

function getMediaState(el) {
  return {
    playing: !el.paused,
    currentTime: el.currentTime,
    duration: el.duration || 0,
    volume: gainNode ? gainNode.gain.value : (el.volume || 1),
    muted: el.muted,
    title: document.title,
    src: el.src || el.currentSrc || "",
  };
}

function sendMediaState(el) {
  const state = getMediaState(el);
  browser.runtime.sendMessage({ type: "MEDIA_STATE_UPDATE", state });
}

function initWorker() {
  if (worker) return;
  const url = browser.runtime.getURL("worker.js");
  worker = new Worker(url);
  worker.onmessage = (e) => {
    const { type, data } = e.data;
    if (type === "PROCESSED_AUDIO") {
      browser.runtime.sendMessage({ type: "AUDIO_FRAME", data, tabId: undefined });
    }
  };
  worker.onerror = (e) => LOG(`worker error: ${e.message}`);
}

function captureMediaElement(el) {
  if (!(el instanceof HTMLMediaElement)) return;
  if (mediaElements.has(el)) return;
  mediaElements.add(el);
  LOG(`capturing <${el.tagName.toLowerCase()}> title="${document.title}"`);

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(el);
    gainNode = audioCtx.createGain();
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
      worker.postMessage({ type: "PROCESS_AUDIO", samples: dataArray.buffer }, [
        dataArray.buffer,
      ]);
      requestAnimationFrame(sendFrame);
    }

    el.addEventListener("timeupdate", () => sendMediaState(el));
    el.addEventListener("play", () => {
      audioCtx.resume();
      sendMediaState(el);
      sendFrame();
    });
    el.addEventListener("pause", () => {
      audioCtx.suspend();
      sendMediaState(el);
    });

    sendMediaState(el);
    browser.runtime.sendMessage({ type: "MEDIA_ELEMENT_CAPTURED", tabId: undefined });
  } catch (err) {
    LOG(`capture failed: ${err.message}`);
  }
}

function scanForMedia() {
  document.querySelectorAll("video, audio").forEach(captureMediaElement);
}

const observer = new MutationObserver(() => scanForMedia());
observer.observe(document.body, { childList: true, subtree: true });
scanForMedia();

const SITE_SELECTORS = {
  "youtube.com": {
    next: ".ytp-next-button",
    prev: ".ytp-prev-button",
  },
  "music.youtube.com": {
    next: "ytmusic-player-bar tp-yt-paper-icon-button.next-button",
    prev: "ytmusic-player-bar tp-yt-paper-icon-button.previous-button",
  },
  "soundcloud.com": {
    next: ".skipControl__next",
    prev: ".skipControl__previous",
  },
  "spotify.com": {
    next: "[data-testid='control-button-skip-forward']",
    prev: "[data-testid='control-button-skip-back']",
  },
};

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_MEDIA_STATE") {
    const el = document.querySelector("video, audio");
    sendResponse(el ? getMediaState(el) : null);
  }

  if (msg.type === "SET_VOLUME") {
    const v = Math.max(0, Math.min(2, msg.volume));
    if (gainNode) {
      gainNode.gain.setTargetAtTime(v, audioCtx.currentTime, 0.02);
    } else {
      const el = document.querySelector("video, audio");
      if (el) el.volume = Math.min(1, v);
    }
  }

  if (msg.type === "SET_PLAYBACK") {
    const el = document.querySelector("video, audio");
    if (!el) { sendResponse({}); return; }

    if (msg.action === "play") {
      el.play().catch(() => {});
    } else if (msg.action === "pause") {
      el.pause();
    } else if (msg.action === "toggle") {
      el.paused ? el.play() : el.pause();
    } else if (msg.action === "seek" && typeof msg.time === "number") {
      el.currentTime = msg.time;
    } else if (msg.action === "next" || msg.action === "prev") {
      const hostname = window.location.hostname;

      if (hostname.includes("youtube.com")) {
        const keyChar = msg.action === "next" ? "N" : "P";
        const keyCode = msg.action === "next" ? 78 : 80;
        if (msg.action === "prev") el.currentTime = 0;
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: keyChar,
            code: "Key" + keyChar,
            keyCode,
            which: keyCode,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
        return;
      }

      const matchedKey = Object.keys(SITE_SELECTORS).find((key) =>
        hostname.includes(key),
      );
      let clickSuccess = false;

      if (matchedKey) {
        const btn = document.querySelector(SITE_SELECTORS[matchedKey][msg.action]);
        if (btn) {
          if (msg.action === "prev") el.currentTime = 0;
          btn.click();
          clickSuccess = true;
        }
      }

      if (!clickSuccess && msg.action === "next") {
        el.currentTime = el.duration - 0.5;
      }
    }
  }

  return true;
});
