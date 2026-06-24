const LOG = (msg, data) => console.log(`[AMP:popup:ui] ${msg}`, data ?? "");

export const $ = (id) => document.getElementById(id);

export function formatTime(sec) {
  if (!sec || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

export function setupCollapsible() {
  document.querySelectorAll(".section-header").forEach((header) => {
    header.addEventListener("click", () => {
      const key = header.dataset.section;
      const body = document.getElementById(`section-${key}`);
      const chevron = header.querySelector(".chevron");
      const isOpen = body.classList.toggle("open");
      chevron.classList.toggle("open", isOpen);
      browser.storage.local.set({ [`section_${key}`]: isOpen });
    });
  });
}

export async function restoreCollapsed() {
  const stored = await browser.storage.local.get(null);
  document.querySelectorAll(".section-header").forEach((header) => {
    const key = header.dataset.section;
    const body = document.getElementById(`section-${key}`);
    const chevron = header.querySelector(".chevron");
    const storedVal = stored[`section_${key}`];
    if (storedVal === false) {
      body.classList.remove("open");
      chevron.classList.remove("open");
    }
  });
}
