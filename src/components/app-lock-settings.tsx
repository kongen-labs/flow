/**
 * Settings → "App Lock" section. Enable/disable the biometric lock,
 * idle auto-lock, and "Lock now". Rendered inside SettingsDrawer.
 *
 * Honesty contract: always show which mode the user
 * actually got — feature detection decides, not marketing. The mode copy
 * lives in lib/app-lock.ts (LOCK_MODE_COPY) where unit tests enforce that
 * gate mode never claims encryption.
 */

import { useState } from "react";
import { Fingerprint, Lock, ShieldCheck, ShieldAlert } from "lucide-react";
import { LOCK_MODE_COPY } from "@/lib/app-lock";
import { cn } from "@/lib/utils";
import { useAppLock } from "./app-lock-gate";
import { ThemedSelect } from "./ui/select";

const IDLE_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 5, label: "After 5 minutes" },
  { value: 15, label: "After 15 minutes" },
];

export function AppLockSettings() {
  const api = useAppLock();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!api) return null;

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.enable(); // resulting mode shows via the notice below
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.disable();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Group header ("Security") comes from the settings drawer; this
          sub-label keeps the feature name visible inside the group. */}
      <h4 className="text-[11px] font-medium text-foreground">App Lock</h4>

      {!api.supported ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/70">
          Face ID / fingerprint lock isn&apos;t available in this browser
          (passkeys unsupported).
        </p>
      ) : !api.enabled ? (
        <>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Require Face ID, fingerprint, or your device PIN to open Flow.
            Where your browser supports passkey encryption (PRF), your API
            keys are also encrypted at rest; otherwise this is a screen lock
            only — you&apos;ll see which one you got.
          </p>
          <button
            type="button"
            onClick={() => void handleEnable()}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 md:py-1.5 text-xs font-medium",
              "hover:bg-muted transition-colors disabled:opacity-60",
            )}
          >
            <Fingerprint className="h-3.5 w-3.5" />
            {busy ? "Waiting for your device…" : "Turn on App Lock"}
          </button>
        </>
      ) : (
        <>
          {/* Which mode you actually got — feature-detected, stated plainly */}
          <div
            className={cn(
              "rounded-lg border p-2.5",
              api.mode === "encrypted"
                ? "border-emerald-600/30 bg-emerald-500/5"
                : "border-amber-500/40 bg-amber-500/5",
            )}
          >
            <p className="flex items-center gap-1.5 text-xs font-medium">
              {api.mode === "encrypted" ? (
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              )}
              {LOCK_MODE_COPY[api.mode!].title}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {LOCK_MODE_COPY[api.mode!].body}
            </p>
          </div>

          {/* Idle auto-lock */}
          <label className="block text-[11px] text-muted-foreground">
            Auto-lock when idle
            <ThemedSelect
              value={api.idleMinutes}
              onChange={(e) => api.setIdleMinutes(Number(e.target.value))}
              className="mt-1"
            >
              {IDLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </ThemedSelect>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => api.lockNow()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 md:py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              <Lock className="h-3.5 w-3.5" />
              Lock now
            </button>
            <button
              type="button"
              onClick={() => void handleDisable()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 md:py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-60"
            >
              Turn off
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground/60">
            Lost the passkey (new device, credential removed)? The lock
            screen&apos;s &ldquo;Can&apos;t unlock?&rdquo; resets App Lock —
            that wipes stored API keys; conversations stay.
          </p>
        </>
      )}

      {error && (
        <p className="text-[11px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
