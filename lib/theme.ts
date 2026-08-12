export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "linki-theme";

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(pref: ThemePreference) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute(
    "data-theme",
    resolved === "dark" ? "linki-dark" : "linki-light"
  );
  document.documentElement.style.colorScheme = resolved;
}

export function setTheme(pref: ThemePreference) {
  localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
}

export function initTheme() {
  const pref = getStoredTheme();
  applyTheme(pref);
  if (typeof window !== "undefined" && pref === "system") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }
  return () => {};
}
