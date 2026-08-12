export type ThemePreference = "light" | "dark";

const STORAGE_KEY = "linki-theme";

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark") return v;
  // Legacy "system" values (or nothing stored yet) fall back to a real preference
  // instead of tracking the OS — resolve once against prefers-color-scheme and persist it.
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

export function applyTheme(pref: ThemePreference) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(
    "data-theme",
    pref === "dark" ? "linki-dark" : "linki-light"
  );
  document.documentElement.style.colorScheme = pref;
}

export function setTheme(pref: ThemePreference) {
  localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
}

export function initTheme() {
  const pref = getStoredTheme();
  applyTheme(pref);
  return () => {};
}
