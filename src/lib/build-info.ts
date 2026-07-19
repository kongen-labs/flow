/**
 * App version + build stamp for the quiet Legal & About footer.
 *
 * Values are injected at build time by vite `define` (see vite.config.ts):
 * __APP_VERSION__ from package.json, __APP_BUILD__ a best-effort short git
 * commit (empty string when git is unavailable). Kept out of legal-copy.ts
 * because these are generated, not reviewed copy.
 */

// Guarded so unit tests (no vite define pass) don't throw on the globals.
export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

export const APP_BUILD: string =
  typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "";

/** Human-readable footer, e.g. "Flow v0.1.0 · a1b2c3d" or "Flow v0.1.0". */
export const APP_VERSION_LINE = APP_BUILD
  ? `Flow v${APP_VERSION} · ${APP_BUILD}`
  : `Flow v${APP_VERSION}`;
