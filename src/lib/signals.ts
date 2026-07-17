/**
 * Message-signal vocabulary + the pure signal-update transition.
 *
 * Lives in lib/ so the Pin/Default/Ignore wiring — the user-facing label
 * vocabulary (rename Jul 16 2026: Pin/Ignore over Flag/Dismiss), the
 * immutable state transition behind every signal control (ribbon popover,
 * relevance selector, user-row panel), and its downstream effect on
 * lib/context selectContext() — is testable in the node vitest environment
 * (components are not: vitest runs `src/**\/*.test.ts` under node).
 *
 * Internal signal values stay `critical` / `dismissed` — storage and
 * classifier vocabulary is unchanged; only labels are user-facing.
 */

import type { SignalLevel } from "./classify-message";

export type { SignalLevel };

export interface SignalOption {
  /** Internal value (storage/classifier vocabulary — unchanged). */
  level: SignalLevel;
  /** User-facing label. */
  label: string;
}

/** Segmented-control order: Pin · Default · Ignore. */
export const SIGNAL_OPTIONS: readonly SignalOption[] = [
  { level: "critical", label: "Pin" },
  { level: "default", label: "Default" },
  { level: "dismissed", label: "Ignore" },
] as const;

/**
 * Immutable one-message signal update — the exact transition App.tsx's
 * handleSignalChange applies to UI state (the same value is persisted via
 * db.updateMessage). Untouched messages keep their identity so memoized
 * bubbles don't re-render.
 */
export function applySignal<T extends { id: string; signal?: SignalLevel }>(
  messages: readonly T[],
  messageId: string,
  signal: SignalLevel,
): T[] {
  return messages.map((m) => (m.id === messageId ? { ...m, signal } : m));
}
