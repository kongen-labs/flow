/**
 * Text & icon size preference — persisted, applied at the document root.
 *
 * One knob scales the WHOLE UI: because Tailwind sizing is rem-based (text-*,
 * spacing, and lucide icon `h-*`/`w-*` classes all resolve to rem), setting
 * the document root font-size scales BOTH text and icons app-wide, cascading
 * through every component. It is orthogonal to (and composes with) the
 * light/dark theme in lib/theme.ts.
 *
 * Note: the composer/rename inputs use an explicit `text-[16px]` (px, not rem)
 * precisely so they never drop below the iOS 16px auto-zoom threshold — that
 * anti-zoom guard is intentionally independent of this scale.
 *
 * Pure logic (resolve/read/write) is separated from DOM application so it is
 * testable in the node vitest environment (mirrors lib/theme.ts).
 */

export type TextScale = "small" | "default" | "large";

export const TEXT_SCALE_STORAGE_KEY = "flow-local:text-scale:v1";

/**
 * Root font-size (px) per scale. 16px is the browser default ("default"),
 * which every rem-based token is authored against; small/large step it down/up
 * proportionally (~94% / ~113%).
 */
export const TEXT_SCALE_PX: Record<TextScale, number> = {
  small: 15,
  default: 16,
  large: 18,
};

export const TEXT_SCALE_LABELS: Record<TextScale, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
};

/** Minimal storage facade (matches theme.ts) so tests can inject a fake. */
export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isTextScale(value: unknown): value is TextScale {
  return value === "small" || value === "default" || value === "large";
}

/** Read the stored scale; anything missing/invalid means "default". */
export function getStoredScale(storage: StringStorage): TextScale {
  try {
    const raw = storage.getItem(TEXT_SCALE_STORAGE_KEY);
    return isTextScale(raw) ? raw : "default";
  } catch {
    return "default";
  }
}

export function setStoredScale(storage: StringStorage, scale: TextScale): void {
  storage.setItem(TEXT_SCALE_STORAGE_KEY, scale);
}

/** Root font-size (px) for a scale. */
export function scaleFontSizePx(scale: TextScale): number {
  return TEXT_SCALE_PX[scale];
}

// ---------------------------------------------------------------------------
// DOM side (browser only)
// ---------------------------------------------------------------------------

/** Apply a scale to the document root font-size (rem cascade). */
export function applyTextScale(scale: TextScale): void {
  document.documentElement.style.fontSize = `${scaleFontSizePx(scale)}px`;
}

/** Persist + apply. */
export function setTextScale(scale: TextScale): void {
  setStoredScale(window.localStorage, scale);
  applyTextScale(scale);
}

export function getTextScale(): TextScale {
  return getStoredScale(window.localStorage);
}

/** Boot-time init: apply the stored scale before first paint (no flash). */
export function initTextScale(): void {
  applyTextScale(getTextScale());
}
