/**
 * Full-screen App Lock surface. Rendered by AppLockGate INSTEAD of the app
 * tree while locked — conversations and keys are unreachable (in encrypted
 * mode cryptographically: the wrapping key exists only after a successful
 * PRF unlock; in gate mode via this UI gate, stated honestly in settings).
 *
 * The unlock button click is the required user gesture for the WebAuthn
 * ceremony (iOS Safari, incl. standalone PWA, will not run it otherwise).
 *
 * Recovery ("Can't unlock?") lives here because a lost passkey means the
 * user cannot reach settings: reset removes the lock and wipes stored API
 * keys (unrecoverable without the passkey by design); conversations are
 * not touched. Typed confirmation required.
 */

import { useState } from "react";
import { Fingerprint, Lock } from "lucide-react";
import { RESET_COPY, RESET_CONFIRM_WORD } from "@/lib/app-lock";
import { cn } from "@/lib/utils";

export function LockScreen({
  onUnlock,
  onReset,
  notice = null,
}: {
  /** Runs the WebAuthn ceremony; rejects with a user-readable message. */
  onUnlock: () => Promise<void>;
  /** Wipes lock config + stored keys (NOT conversations), then unlocks. */
  onReset: () => void;
  /**
   * Integrity notice (F2): shown when the lock store is inconsistent and
   * only reset can proceed. The recovery panel opens pre-expanded.
   */
  notice?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(() => Boolean(notice));
  const [confirmText, setConfirmText] = useState("");

  const handleUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await onUnlock();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background px-6 pb-[env(safe-area-inset-bottom)]">
      {/* Brand mark (matches first-run) + lock state */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10">
          <Lock className="h-6 w-6 text-brand-fg" />
        </div>
        <h1 className="text-2xl font-semibold md:text-xl">Flow</h1>
        <p className="text-xs text-muted-foreground">Locked</p>
      </div>

      <button
        type="button"
        onClick={() => void handleUnlock()}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white",
          "hover:bg-brand/90 transition-colors disabled:opacity-60",
        )}
      >
        <Fingerprint className="h-4 w-4" />
        {busy ? "Waiting for your device…" : "Unlock with Face ID / fingerprint"}
      </button>

      {notice && (
        <p
          className="max-w-sm text-center text-xs text-amber-600 dark:text-amber-400"
          role="alert"
        >
          {notice}
        </p>
      )}

      {error && error !== notice && (
        <p className="max-w-sm text-center text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Recovery */}
      <div className="mt-2 flex max-w-sm flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => setResetOpen((o) => !o)}
          className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
        >
          Can&apos;t unlock?
        </button>
        {resetOpen && (
          <div className="w-full space-y-2 rounded-lg border p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {RESET_COPY}
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`Type "${RESET_CONFIRM_WORD}" to confirm`}
              className="w-full rounded-md border bg-card px-2.5 py-2 text-[16px] md:text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              disabled={confirmText.trim().toLowerCase() !== RESET_CONFIRM_WORD}
              onClick={onReset}
              className={cn(
                "w-full rounded-lg border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive",
                "hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent",
              )}
            >
              Reset App Lock &amp; wipe stored API keys
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
