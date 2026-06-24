import { $ } from "./ui.js";
import { eqValues, setEqValues, eqEnabled, setEqEnabled, compressorEnabled, setCompressorEnabled } from "./store.js";

const LOG = (msg, data) => console.log(`[AMP:popup:eq] ${msg}`, data ?? "");

export const EQ_BANDS = [
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

let _eqValues = new Array(EQ_BANDS.length).fill(0);
setEqValues(_eqValues);

export function buildEQ() {
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
      _eqValues[i] = parseFloat(slider.value);
      sendConfig();
    });
    const label = document.createElement("label");
    label.textContent = band.label;
    div.appendChild(slider);
    div.appendChild(label);
    container.appendChild(div);
  });
}

export function getConfig() {
  return {
    gain: 1.0,
    sampleRate: 44100,
    eq: eqEnabled
      ? EQ_BANDS.map((band, i) => ({
          type: "peaking",
          freq: band.freq,
          gain_db: _eqValues[i],
          q: 1.41,
        })).filter((b) => b.gain_db !== 0)
      : [],
    compressor: { enabled: compressorEnabled, threshold: -24, ratio: 4, knee: 6, attack: 0.002, release: 0.1 },
    visualize: true,
  };
}

export function sendConfig() {
  const cfg = getConfig();
  LOG(`gain=${cfg.gain} eq=${cfg.eq.length} band(s) compressor=${cfg.compressor.enabled}`);
  browser.runtime.sendMessage({ type: "UPDATE_CONFIG", config: cfg });
}

export function wireEqControls() {
  $("eq-toggle").addEventListener("click", () => {
    const next = !eqEnabled;
    setEqEnabled(next);
    $("eq-toggle").textContent = next ? "EQ On" : "EQ Off";
    $("eq-toggle").classList.toggle("active", next);
    sendConfig();
  });

  $("compressor-toggle").addEventListener("click", () => {
    const next = !compressorEnabled;
    setCompressorEnabled(next);
    $("compressor-toggle").classList.toggle("active", next);
    sendConfig();
  });
}
