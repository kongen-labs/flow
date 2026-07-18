import { WifiOff } from "lucide-react";
import { OFFLINE_BANNER_DETAIL, OFFLINE_BANNER_LABEL } from "@/lib/offline";

/**
 * Persistent offline indicator — a quiet pill shown while the device is
 * offline (App renders it only when `navigator.onLine` is false). It states
 * the STATE ("Offline · reading only"); the actionable reason ("reconnect to
 * send") lives on the send affordance in the composer, so the two never say
 * the same thing twice. Same amber attention treatment as the other
 * chat-input indicators (no-provider-keys, armed full-history), same
 * max-w-3xl centering as the routing indicator — one shared vocabulary.
 */
export function OfflineBanner() {
  return (
    <div className="mx-auto mt-2 w-full max-w-3xl px-4">
      <div
        role="status"
        aria-live="polite"
        data-testid="offline-banner"
        className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-100/70 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      >
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-medium">{OFFLINE_BANNER_LABEL}</span> ·{" "}
          {OFFLINE_BANNER_DETAIL}.
        </span>
      </div>
    </div>
  );
}
