const EQ_BANDS = [
  { freq: 60, label: "60" },
  { freq: 170, label: "170" },
  { freq: 310, label: "310" },
  { freq: 600, label: "600" },
  { freq: 1000, label: "1k" },
  { freq: 3000, label: "3k" },
  { freq: 6000, label: "6k" },
  { freq: 12000, label: "12k" },
  { freq: 16000, label: "16k" },
];

let activeTabId = null;
let mediaState = null;
let eqValues = new Array(EQ_BANDS.length).fill(0);
let eqEnabled = true;
let compressorEnabled = false;
let animationId = null;

const $ = (id) => document.getElementById(id);

function formatTime(sec) {
  if (!sec || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) activeTabId = tabs[0].id;
}

async function requestMediaState() {
  if (!activeTabId) return;
  try {
    const resp = await chrome.tabs.sendMessage(activeTabId, { type: "GET_MEDIA_STATE" });
    if (resp) {
      mediaState = resp;
      updateUI();
    }
  } catch {
    $("track-info").textContent = "No media page detected";
    $("status-indicator").textContent = "● Idle";
  }
}

function updateUI() {
  if (!mediaState) return;
  const trackInfo = mediaState.title || "Unknown";
  $("track-info").textContent = trackInfo.length > 40 ? trackInfo.slice(0, 40) + "…" : trackInfo;
  $("play-btn").textContent = mediaState.playing ? "⏸" : "▶";
  $("seek-bar").max = mediaState.duration || 100;
  $("seek-bar").value = mediaState.currentTime || 0;
  $("current-time").textContent = formatTime(mediaState.currentTime);
  $("duration").textContent = formatTime(mediaState.duration);
  $("volume-slider").value = (mediaState.volume || 1) * 100;
  $("volume-label").textContent = `${Math.round((mediaState.volume || 1) * 100)}%`;
  $("status-indicator").textContent = mediaState.playing ? "▶ Playing" : "⏸ Paused";
}

function buildEQ() {
  const container = $("eq-bands");
  container.innerHTML = "";
  EQ_BANDS.forEach((band, i) => {
    const div = document.createElement("div");
    div.className = "eq-band";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "-12";
    slider.max = "12";
    slider.value = "0";
    slider.step = "0.5";
    slider.dataset.index = i;
    slider.addEventListener("input", () => {
      eqValues[i] = parseFloat(slider.value);
      sendConfig();
    });
    const label = document.createElement("label");
    label.textContent = band.label;
    div.appendChild(slider);
    div.appendChild(label);
    container.appendChild(div);
  });
}

function getConfig() {
  const gain = parseInt($("volume-slider").value) / 100;
  return {
    gain,
    sampleRate: 44100,
    eq: eqEnabled
      ? EQ_BANDS.map((band, i) => ({
          type: "peaking",
          freq: band.freq,
          gain_db: eqValues[i],
          q: 1.41,
        })).filter((b) => b.gain_db !== 0)
      : [],
    compressor: { enabled: compressorEnabled, threshold: -24, ratio: 4, knee: 6, attack: 0.002, release: 0.1 },
    visualize: true,
  };
}

function sendConfig() {
  chrome.runtime.sendMessage({ type: "UPDATE_CONFIG", config: getConfig() });
}

async function sendPlaybackAction(action, time) {
  if (!activeTabId) return;
  try {
    await chrome.tabs.sendMessage(activeTabId, { type: "SET_PLAYBACK", action, time });
    if (action !== "seek") setTimeout(requestMediaState, 150);
  } catch {}
}

function drawVisualizer(data) {
  const canvas = $("visualizer");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!data || data.length === 0) return;
  const barCount = Math.min(data.length, 64);
  const barWidth = w / barCount;
  ctx.fillStyle = "#e94560";
  for (let i = 0; i < barCount; i++) {
    const barHeight = Math.min(data[i] * 2, h);
    ctx.fillRect(i * barWidth, h - barHeight, barWidth - 1, barHeight);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await getActiveTab();
  buildEQ();

  $("play-btn").addEventListener("click", () => sendPlaybackAction("toggle"));
  $("prev-btn").addEventListener("click", () => sendPlaybackAction("seek", Math.max(0, (mediaState?.currentTime || 0) - 10)));
  $("next-btn").addEventListener("click", () => sendPlaybackAction("seek", (mediaState?.currentTime || 0) + 30));

  $("seek-bar").addEventListener("input", (e) => {
    sendPlaybackAction("seek", parseFloat(e.target.value));
    $("current-time").textContent = formatTime(parseFloat(e.target.value));
  });

  $("volume-slider").addEventListener("input", (e) => {
    const val = parseInt(e.target.value);
    $("volume-label").textContent = `${val}%`;
    sendConfig();
  });

  $("eq-toggle").addEventListener("click", () => {
    eqEnabled = !eqEnabled;
    $("eq-toggle").textContent = eqEnabled ? "EQ On" : "EQ Off";
    $("eq-toggle").classList.toggle("active", eqEnabled);
    sendConfig();
  });

  $("compressor-toggle").addEventListener("click", () => {
    compressorEnabled = !compressorEnabled;
    $("compressor-toggle").classList.toggle("active", compressorEnabled);
    sendConfig();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "MEDIA_STATE_UPDATE") {
      mediaState = msg.state;
      updateUI();
    }
    if (msg.type === "SPECTRUM") {
      drawVisualizer(msg.data);
    }
  });

  await requestMediaState();
  sendConfig();

  setInterval(requestMediaState, 2000);
});
