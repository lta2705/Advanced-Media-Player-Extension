import { $ } from "./ui.js";

const LOG = (msg, data) => console.log(`[AMP:popup:viz] ${msg}`, data ?? "");

export function drawVisualizer(data) {
  const canvas = $("visualizer");
  const placeholder = canvas.parentElement.querySelector(".vis-placeholder");
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  if (!data || data.length === 0) {
    placeholder.style.display = "flex";
    return;
  }
  placeholder.style.display = "none";

  const barCount = Math.min(data.length, 64);
  const barWidth = w / barCount;

  for (let i = 0; i < barCount; i++) {
    const barHeight = Math.max(1, Math.min(data[i] * 2.5, h));
    const x = i * barWidth;
    const gradient = ctx.createLinearGradient(x, h, x, h - barHeight);
    gradient.addColorStop(0, "#e94560");
    gradient.addColorStop(1, "#ff6b6b");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x + 1, h - barHeight, barWidth - 2, barHeight, [1, 1, 0, 0]);
    ctx.fill();
  }
}
