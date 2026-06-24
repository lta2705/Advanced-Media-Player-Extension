const LOG = (msg, data) => console.log(`[AMP:content] ${msg}`, data ?? "");

let worker = null;
let audioCtx = null;
let sourceNode = null;
let gainNode = null;
let mediaElements = new WeakSet();

LOG("content script loaded");

function initWorker() {
  if (worker) {
    LOG("initWorker: already initialized");
    return;
  }
  const url = browser.runtime.getURL("worker.js");
  LOG(`initWorker: url=${url}`);
  worker = new Worker(url);
  worker.onmessage = (e) => {
    const { type, data } = e.data;
    if (type === "PROCESSED_AUDIO") {
      browser.runtime.sendMessage({
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
  LOG(
    `captureMediaElement: capturing <${el.tagName.toLowerCase()}> src="${el.src || el.currentSrc || "?"}" title="${document.title}"`,
  );

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(el);
    gainNode = audioCtx.createGain();
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
      worker.postMessage({ type: "PROCESS_AUDIO", samples: dataArray.buffer }, [
        dataArray.buffer,
      ]);
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

    browser.runtime.sendMessage({
      type: "MEDIA_ELEMENT_CAPTURED",
      tabId: undefined,
    });
    LOG("MEDIA_ELEMENT_CAPTURED sent to background");
  } catch (err) {
    LOG(`captureMediaElement failed: ${err.message}`);
    console.warn(
      "[Advanced Media Player] Could not capture media element:",
      err,
    );
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
  LOG(`onMessage: type=${msg.type}`);

  if (msg.type === "GET_MEDIA_STATE") {
    const el = document.querySelector("video, audio");
    if (el) {

      const actualVolume = (typeof gainNode !== "undefined" && gainNode) ? gainNode.gain.value : el.volume;
      
      const state = {
        playing: !el.paused,
        currentTime: el.currentTime,
        duration: el.duration,
        volume: actualVolume,
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

    const v = Math.max(0, Math.min(2, msg.volume)); 
    
    if (typeof gainNode !== "undefined" && gainNode) {

      gainNode.gain.setTargetAtTime(v, audioCtx.currentTime, 0.02);
      LOG(`SET_VOLUME: gainNode=${v.toFixed(2)}`);
    } else {

      const el = document.querySelector("video, audio");
      if (el) {
        el.volume = Math.max(0, Math.min(1, v));
        LOG(`SET_VOLUME: el.volume=${v.toFixed(2)} (fallback)`);
      } else {
        LOG("SET_VOLUME: no media element found");
      }
    }
  }
  
  if (msg.type === "SET_PLAYBACK") {
    const el = document.querySelector("video, audio");
    if (el) {
      LOG(`SET_PLAYBACK: action=${msg.action} time=${msg.time}`);

      if (msg.action === "play") {
        el.play()
          .then(() => LOG("play succeeded"))
          .catch((e) => LOG(`play failed: ${e}`));
      } 
      else if (msg.action === "pause") el.pause();
      else if (msg.action === "toggle") el.paused ? el.play() : el.pause();
      else if (msg.action === "seek" && typeof msg.time === "number") el.currentTime = msg.time;
      
      else if (msg.action === "next" || msg.action === "prev") {
        const hostname = window.location.hostname;

        if (hostname.includes("youtube.com")) {
          const keyChar = msg.action === "next" ? "N" : "P";
          const keyCode = msg.action === "next" ? 78 : 80;
          
          if (msg.action === "prev") {
            el.currentTime = 0;
          }

          document.dispatchEvent(new KeyboardEvent("keydown", {
            key: keyChar,
            code: "Key" + keyChar,
            keyCode: keyCode,
            which: keyCode,
            shiftKey: true,
            bubbles: true,
            cancelable: true
          }));

          LOG(`SET_PLAYBACK: Bypassed DOM, sent Shift+${keyChar} shortcut to YouTube`);
          return;
        }

        const matchedKey = Object.keys(SITE_SELECTORS).find((key) => hostname.includes(key));
        let clickSuccess = false;

        if (matchedKey) {
          const selector = SITE_SELECTORS[matchedKey][msg.action];
          const btn = document.querySelector(selector);

          if (btn) {
            // Apply the same 3-second bypass rule generically
            if (msg.action === "prev") {
              el.currentTime = 0;
            }

            btn.click();
            LOG(`SET_PLAYBACK: Clicked ${msg.action} button on ${matchedKey}`);
            clickSuccess = true;
          }
        }

        // [C] FALLBACK FOR UNKNOWN SITES
        // Force the video timeline to its absolute end to trigger the site's native Autoplay algorithm
        if (!clickSuccess && msg.action === "next") {
          LOG("SET_PLAYBACK: Selector not found or unmapped site. Forcing video end fallback.");
          el.currentTime = el.duration - 0.5;
        }
      }
    } else {
      LOG("SET_PLAYBACK: no media element found");
    }
  }
  
  // Return true to indicate asynchronous response handling if needed in the future
  return true; 
});