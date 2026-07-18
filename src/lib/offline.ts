/**
 * Offline state — the honest network boundary (Jul 17 2026:
 * "access to chats offline. gpt based function need active connection").
 *
 * The TRUE offline story, as shipped:
 *  - READ works offline. The service worker (public/sw.js) caches the app
 *    shell + hashed assets; conversations live in IndexedDB (lib/db.ts).
 *    So with no network the app boots and all past conversations are
 *    readable, navigable, and exportable — zero network on the boot/read
 *    path (main.tsx registers the SW with a catch; App opens IndexedDB and
 *    reads localStorage; no fetch fires at load).
 *  - SEND needs a connection. The LLM stream (browser → provider) and
 *    Auto-mode scoring (→ Kongen /v1/logic/score) both require network.
 *    Offline, the send affordance is disabled WITH a precise reason and the
 *    drafted text is preserved — never a silent failure.
 *
 * This module keeps the offline vocabulary + the (pure, node-testable)
 * online-watch wiring in one place. The React hook lives in
 * lib/use-online.ts so this file stays framework-free and unit-testable in
 * the `node` vitest environment.
 */

/**
 * The send-disabled reason shown while offline. Verbatim per the directive —
 * states the boundary AND reassures that history is intact. One message.
 */
export const OFFLINE_SEND_MESSAGE =
  "You're offline — reconnect to send. Your conversations are here and fully readable.";

/** Quiet pill label for the persistent offline indicator (state, not action). */
export const OFFLINE_BANNER_LABEL = "Offline";

/** The pill's secondary clause — what still works (read-only is fully live). */
export const OFFLINE_BANNER_DETAIL = "your conversations are all here to read";

/**
 * Whether the send affordance may fire. Sending needs the network (provider
 * stream + Auto scoring), so `online` is a hard gate alongside the existing
 * empty/busy gates. Pure — exercised directly in offline.test.ts.
 */
export function canSend(opts: {
  online: boolean;
  isEmpty: boolean;
  busy: boolean;
}): boolean {
  return opts.online && !opts.isEmpty && !opts.busy;
}

/** Minimal surface of `window` needed to watch connectivity — injectable. */
export interface OnlineTarget {
  getOnline: () => boolean;
  addEventListener: (type: "online" | "offline", cb: () => void) => void;
  removeEventListener: (type: "online" | "offline", cb: () => void) => void;
}

/**
 * Subscribe to connectivity changes. Fires `onChange` with the current
 * online value on every `online`/`offline` event. Returns an unsubscribe.
 * Pure wiring over an injected target so it is testable without a browser.
 */
export function watchOnline(
  target: OnlineTarget,
  onChange: (online: boolean) => void,
): () => void {
  const handler = () => onChange(target.getOnline());
  target.addEventListener("online", handler);
  target.addEventListener("offline", handler);
  return () => {
    target.removeEventListener("online", handler);
    target.removeEventListener("offline", handler);
  };
}

/** The real browser target (used by the React hook). */
export function browserOnlineTarget(): OnlineTarget {
  return {
    getOnline: () =>
      typeof navigator === "undefined" ? true : navigator.onLine,
    addEventListener: (type, cb) => window.addEventListener(type, cb),
    removeEventListener: (type, cb) => window.removeEventListener(type, cb),
  };
}
