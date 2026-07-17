/**
 * PWA install support (Jul 17 2026: "make this something a customer
 * can download from the website and start using as an app on the iphone,
 * mac and windows").
 *
 * The install INFRASTRUCTURE already ships (manifest + SW + icons); this
 * module is the install EXPERIENCE: platform detection for the
 * instruction sheet, `beforeinstallprompt` capture on Chromium, and the
 * standalone check that swaps every install CTA for "you're using the
 * installed app".
 *
 * Copy discipline: all install copy is navigational — no product claims,
 * and deliberately NO offline claim (the SW caches the app shell only;
 * chat needs network — rather than qualify it, we skip it).
 *
 * Native wrappers (Tauri/Electron dmg+exe, iOS App Store) are a separate
 * parked track; this is the no-store PWA path.
 *
 * Pure detection functions take the UA string + hints as arguments so the
 * node vitest environment can cover every platform matrix cell.
 */

/** Where the user is, install-wise. Drives the instruction sheet. */
export type InstallPlatform =
  | "ios-safari" // Share > Add to Home Screen
  | "ios-other" // in-app / third-party iOS browser: must open in Safari
  | "mac-safari" // File > Add to Dock (Sonoma+)
  | "chromium-desktop" // Mac/Windows/Linux Chrome or Edge: prompt or omnibox icon
  | "android-chromium" // prompt or menu > Add to Home screen
  | "other"; // e.g. desktop Firefox: point at a capable browser

/**
 * UA/platform heuristics. `maxTouchPoints` disambiguates iPadOS, which
 * masquerades as "Macintosh" in its UA but reports touch points.
 */
export function detectInstallPlatform(
  ua: string,
  maxTouchPoints = 0,
): InstallPlatform {
  const isIpadOs = /Macintosh/.test(ua) && maxTouchPoints > 1;
  const isIos = /iPhone|iPad|iPod/.test(ua) || isIpadOs;

  if (isIos) {
    // Every iOS browser is WebKit, but only Safari proper can Add to Home
    // Screen. Third-party shells and in-app browsers self-identify:
    const nonSafari =
      /CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|Line\/|DuckDuckGo/.test(ua);
    return nonSafari ? "ios-other" : "ios-safari";
  }

  const isChromium = /Chrome\/|Chromium\/|Edg\//.test(ua);
  if (/Android/.test(ua)) {
    return isChromium ? "android-chromium" : "other";
  }
  if (/Macintosh/.test(ua)) {
    if (isChromium) return "chromium-desktop";
    if (/Safari\//.test(ua)) return "mac-safari";
    return "other";
  }
  if (/Windows|Linux|CrOS/.test(ua)) {
    return isChromium ? "chromium-desktop" : "other";
  }
  return "other";
}

/** Minimal window facade for the standalone check (node-testable). */
export interface StandaloneEnv {
  matchMedia?: (query: string) => { matches: boolean };
  /** iOS Safari legacy flag (navigator.standalone). */
  navigatorStandalone?: boolean;
}

/**
 * True when running as the installed app: `display-mode: standalone`
 * (all platforms) or the legacy iOS `navigator.standalone` flag.
 */
export function isStandaloneEnv(env: StandaloneEnv): boolean {
  if (env.navigatorStandalone === true) return true;
  try {
    return env.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  } catch {
    return false;
  }
}

/** Browser-bound helpers (thin wrappers over the pure functions). */
export function currentInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";
  return detectInstallPlatform(
    navigator.userAgent,
    navigator.maxTouchPoints ?? 0,
  );
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return isStandaloneEnv({
    matchMedia: window.matchMedia?.bind(window),
    navigatorStandalone: (
      navigator as Navigator & { standalone?: boolean }
    ).standalone,
  });
}

// ---------------------------------------------------------------------------
// beforeinstallprompt capture (Chromium). The event fires ONCE, early —
// capture at boot (main.tsx) or the install button can never trigger it.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;

/** Call once at boot, before first paint. Idempotent. */
export function initInstallPromptCapture(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our own button
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
  });
}

/** True right after an in-session install (before the standalone reload). */
export function wasInstalledThisSession(): boolean {
  return installed;
}

/** Whether the native Chromium prompt is available right now. */
export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

/**
 * Trigger the captured native prompt. "unavailable" = no captured event
 * (non-Chromium, already installed, or the browser withheld it) — the
 * caller falls back to the instruction sheet.
 */
export async function triggerInstallPrompt(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const prompt = deferredPrompt;
  if (!prompt) return "unavailable";
  deferredPrompt = null; // single-use per capture
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}
