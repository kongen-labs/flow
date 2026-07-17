/**
 * Install experience — the platform-detected instruction sheet + the
 * single entry point (`openInstall`) every "Install Flow" affordance
 * calls (wizard welcome line, Settings row).
 *
 * Behavior on tap: standalone -> sheet in its "installed ✓" state;
 * Chromium with a captured `beforeinstallprompt` -> trigger the native
 * prompt directly, falling back to the sheet if dismissed/unavailable;
 * everywhere else -> the sheet with platform instructions.
 *
 * DEEP LINK: `#install` (or `?install`) opens the sheet on load — the app
 * IS the website, so this doubles as the landing "Download" surface for
 * marketing links (flow.kongenlabs.life/#install).
 *
 * Decoupling: trigger surfaces live in different trees (wizard vs chat),
 * so InstallHost (mounted once in main.tsx) listens for a custom event
 * instead of threading context everywhere.
 *
 * Copy: navigational only; NO offline claim (SW caches the app shell
 * only — chat needs network, so we say nothing rather than qualify).
 */

import { useEffect, useState } from "react";
import { Check, MonitorDown, Share, SquarePlus, X } from "lucide-react";
import {
  canPromptInstall,
  currentInstallPlatform,
  isStandalone,
  triggerInstallPrompt,
  wasInstalledThisSession,
  type InstallPlatform,
} from "@/lib/install";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "flow-local:install:open";

/**
 * The one entry point for every install affordance. Native prompt first
 * (Chromium), instruction sheet as the universal fallback.
 */
export async function openInstall(): Promise<void> {
  if (!isStandalone() && canPromptInstall()) {
    const outcome = await triggerInstallPrompt();
    if (outcome === "accepted") return; // appinstalled handles the rest
  }
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** Per-platform instruction block (navigational copy only). */
function Instructions({ platform }: { platform: InstallPlatform }) {
  const step = "flex items-start gap-2 text-sm leading-relaxed md:text-[13px]";
  const glyph = "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground";
  switch (platform) {
    case "ios-safari":
      return (
        <ol className="space-y-2.5">
          <li className={step}>
            <Share className={glyph} />
            <span>
              Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
            </span>
          </li>
          <li className={step}>
            <SquarePlus className={glyph} />
            <span>
              Choose <strong>Add to Home Screen</strong>, then{" "}
              <strong>Add</strong>. Flow opens from your Home Screen like any
              app.
            </span>
          </li>
        </ol>
      );
    case "ios-other":
      return (
        <div className="space-y-2.5">
          <p className="text-sm leading-relaxed md:text-[13px]">
            Open this page in <strong>Safari</strong> to install — in-app and
            third-party iOS browsers can&apos;t add apps to the Home Screen.
          </p>
          <p className={step}>
            <Share className={glyph} />
            <span>
              Then: <strong>Share ▸ Add to Home Screen</strong>.
            </span>
          </p>
        </div>
      );
    case "mac-safari":
      return (
        <p className="text-sm leading-relaxed md:text-[13px]">
          In Safari: <strong>File ▸ Add to Dock</strong> (or{" "}
          <strong>Share ▸ Add to Dock</strong>). Flow opens from your Dock
          like any app.
        </p>
      );
    case "chromium-desktop":
      return (
        <p className="text-sm leading-relaxed md:text-[13px]">
          Use the <strong>install icon</strong> at the right end of the
          address bar (or the browser menu ▸ <strong>Install Flow</strong>).
          Flow opens in its own window from your Dock / taskbar / Start menu.
        </p>
      );
    case "android-chromium":
      return (
        <p className="text-sm leading-relaxed md:text-[13px]">
          Browser menu ▸ <strong>Add to Home screen</strong> (Chrome may also
          offer an Install banner). Flow opens from your Home Screen like any
          app.
        </p>
      );
    default:
      return (
        <p className="text-sm leading-relaxed md:text-[13px]">
          Install works from <strong>Chrome</strong>, <strong>Edge</strong>,
          or <strong>Safari</strong> — open Flow in one of those browsers to
          add it as an app on your device.
        </p>
      );
  }
}

/**
 * Mount ONCE (main.tsx). Renders nothing until an install affordance (or
 * the #install deep link) opens the sheet.
 */
export function InstallHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    // Deep link: #install or ?install opens the sheet on load.
    const { hash, search } = window.location;
    if (hash === "#install" || new URLSearchParams(search).has("install")) {
      setOpen(true);
    }
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  if (!open) return null;

  const installed = isStandalone() || wasInstalledThisSession();
  const platform = currentInstallPlatform();
  const showPromptButton =
    !installed &&
    canPromptInstall() &&
    (platform === "chromium-desktop" || platform === "android-chromium");

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-label="Install Flow"
        data-testid="install-sheet"
        className={cn(
          // Mobile: bottom sheet; md+: centered card.
          "fixed inset-x-0 bottom-0 z-[70] rounded-t-2xl border-t bg-card p-5 shadow-lg",
          "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
          "md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-sm md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold md:text-base">
              Install Flow
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground md:text-[13px]">
              Use Flow as an app on iPhone, Mac, and Windows — no app store
              needed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Close"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors md:min-h-0 md:min-w-0 md:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          {installed ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              You&apos;re using the installed app
            </p>
          ) : (
            <>
              <Instructions platform={platform} />
              {showPromptButton && (
                <button
                  type="button"
                  onClick={() => {
                    void triggerInstallPrompt().then((outcome) => {
                      if (outcome === "accepted") setOpen(false);
                    });
                  }}
                  className={cn(
                    "mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg",
                    "bg-brand px-5 text-base font-medium text-white hover:bg-brand/90 transition-colors md:min-h-[42px] md:text-sm",
                  )}
                >
                  <MonitorDown className="h-4 w-4" />
                  Install Flow
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Quiet inline trigger (wizard welcome step). Hidden when installed. */
export function InstallLink() {
  if (isStandalone()) return null;
  return (
    <button
      type="button"
      onClick={() => void openInstall()}
      className="min-h-[32px] text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
    >
      Install Flow as an app &rarr;
    </button>
  );
}
