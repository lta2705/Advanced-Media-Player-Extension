const LOG = (msg, data) => console.log(`[AMP:popup:theme] ${msg}`, data ?? "");

const STORAGE_THEME_KEY = "theme";

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("theme-toggle");
  btn.textContent = theme === "dark" ? "🌙" : "☀️";
}

export async function initTheme() {
  const stored = (await browser.storage.local.get(STORAGE_THEME_KEY))[STORAGE_THEME_KEY];
  const theme = stored || getSystemTheme();
  applyTheme(theme);
  LOG(`theme applied: ${theme}${stored ? " (stored)" : " (system)"}`);

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    browser.storage.local.get(STORAGE_THEME_KEY, (result) => {
      if (!result[STORAGE_THEME_KEY]) {
        const sys = getSystemTheme();
        applyTheme(sys);
        LOG(`system theme changed: ${sys}`);
      }
    });
  });

  document.getElementById("theme-toggle").addEventListener("click", async () => {
    const current = document.documentElement.dataset.theme || getSystemTheme();
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    browser.storage.local.set({ [STORAGE_THEME_KEY]: next });
    LOG(`theme toggled: ${next}`);
  });
}
