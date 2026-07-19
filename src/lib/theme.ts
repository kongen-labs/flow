/**
 * Dark-mode preference — persisted, defaulting to the system setting.
 *
 * Tokens for `.dark` were already ported in globals.css; this module only
 * flips the class on <html> and keeps <meta name="theme-color"> in sync.
 * Pure logic (resolve/read/write) is separated from DOM application so it
 * is testable in the node vitest environment.
 */

export type ThemePref = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "flow-local:theme:v1";

/** Kongen tokens: paper (light bg) / dark paper (hsl(27 25% 8%)). */
const THEME_COLOR_LIGHT = "#f4efe8";
const THEME_COLOR_DARK = "#1a140f";

/** Minimal storage facade (matches keys.ts) so tests can inject a fake. */
export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isThemePref(value: unknown): value is ThemePref {
  return value === "light" || value === "dark" || value === "system";
}

/** Read the stored preference; anything missing/invalid means "system". */
export function getStoredPref(storage: StringStorage): ThemePref {
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    return isThemePref(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function setStoredPref(storage: StringStorage, pref: ThemePref): void {
  storage.setItem(THEME_STORAGE_KEY, pref);
}

/** Resolve a preference to a concrete theme given the system state. */
export function resolveTheme(
  pref: ThemePref,
  systemPrefersDark: boolean,
): "light" | "dark" {
  if (pref === "system") return systemPrefersDark ? "dark" : "light";
  return pref;
}

// ---------------------------------------------------------------------------
// DOM side (browser only)
// ---------------------------------------------------------------------------

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Apply a preference to the document: `.dark` class + theme-color metas. */
export function applyTheme(pref: ThemePref): void {
  const dark = resolveTheme(pref, systemPrefersDark()) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  // index.html ships two media-scoped theme-color metas (light/dark) that iOS
  // reads at launch; rewrite BOTH to the resolved color so an explicit
  // preference (e.g. light while the system is dark) still wins over the
  // media query. Keeps the installed-PWA status-bar strip matching the app.
  const color = dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", color));
}

/** Persist + apply. */
export function setTheme(pref: ThemePref): void {
  setStoredPref(window.localStorage, pref);
  applyTheme(pref);
}

export function getThemePref(): ThemePref {
  return getStoredPref(window.localStorage);
}

/**
 * Boot-time init: apply the stored preference and re-apply on system theme
 * changes while the preference is "system".
 */
export function initTheme(): void {
  applyTheme(getThemePref());
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (getThemePref() === "system") applyTheme("system");
    });
}
