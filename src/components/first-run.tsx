/**
 * First-run setup — Kongen key required.
 *
 * Order: 1) Kongen key (mandatory — "Start chatting" stays disabled without
 * it; the free routed-prompt allowance keeps this near-zero friction), 2) provider
 * keys (BYO, progressive disclosure; at least one is needed to actually
 * send, but it can also be added later in Settings). No password, no
 * profile ("no login" is a retired claim — the Kongen key is
 * email-verified).
 *
 * TODO: key-mint flow — replace the signup link with an in-app mint flow
 * when one ships.
 *
 * Mobile-first: full-screen sheet below md (card on md+), safe-area insets.
 */

import { useState } from "react";
import { ArrowRight, Check, ChevronDown, ExternalLink, KeyRound } from "lucide-react";
import { availableProviders, type KeyStore } from "@/lib/keys";
import { cn } from "@/lib/utils";
import { AboutFlowContent } from "./about-flow";
import {
  KONGEN_SIGNUP_URL,
  KongenKeySection,
  ProviderKeysSection,
} from "./key-setup";

export function FirstRun({
  keys,
  onChanged,
  onFinish,
}: {
  keys: KeyStore;
  onChanged: () => void;
  onFinish: () => void;
}) {
  const configured = availableProviders(keys);
  const hasProvider = configured.length > 0;
  const hasKongen = Boolean(keys.get("kongen"));
  const canStart = hasKongen;
  // Progressive disclosure for the BYO provider step.
  const [providersOpen, setProvidersOpen] = useState(hasProvider);
  // Trust surface: "How Flow works" right where we ask for keys.
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <div
      className={cn(
        // Mobile: full-screen sheet with safe-area padding.
        "flex min-h-full flex-col bg-card",
        "pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
        // md+: centered card on the page background.
        "md:bg-background md:items-center md:justify-center md:p-4",
      )}
    >
      <div
        className={cn(
          "flex w-full flex-1 flex-col px-6 md:flex-none md:max-w-md",
          "md:rounded-xl md:border md:bg-card md:p-6 md:shadow-md",
        )}
      >
        {/* Brand mark + wedge */}
        <div className="space-y-3 pt-6 text-center md:pt-0">
          <img
            src="./icons/icon.svg"
            alt=""
            className="mx-auto h-14 w-14 md:h-12 md:w-12"
          />
          <h1 className="text-2xl font-semibold md:text-xl">Flow</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            GPTs come and go — your conversations stay with you. Local-first —
            no password, no profile. Bring your own keys; they never leave
            this device.
          </p>
        </div>

        {/* Step 1 — Kongen key (required) */}
        <div className="mt-6 space-y-4">
          <KongenKeySection keys={keys} onChanged={onChanged} />
          {!hasKongen && (
            <a
              href={KONGEN_SIGNUP_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg",
                "border border-brand-fg/40 px-4 py-2 text-sm font-medium text-brand-fg",
                "hover:bg-brand-fg/10 transition-colors",
              )}
            >
              Get a free Kongen key
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          {/* Step 2 — provider keys (BYO, needed to send) */}
          <button
            type="button"
            onClick={() => setProvidersOpen((o) => !o)}
            aria-expanded={providersOpen}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium",
              "hover:bg-muted transition-colors",
            )}
          >
            <span className="flex items-center gap-2">
              {hasProvider ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <KeyRound className="h-4 w-4 text-muted-foreground" />
              )}
              {hasProvider
                ? `${configured.length} provider${configured.length > 1 ? "s" : ""} ready`
                : "Add provider keys"}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                providersOpen && "rotate-180",
              )}
            />
          </button>
          {!providersOpen && !hasProvider && (
            <p className="px-1 text-[11px] text-muted-foreground/70">
              You&apos;ll need at least one provider key (Anthropic, OpenAI,
              Google, Mistral, or DeepSeek) to send messages — add it now or
              later in Settings.
            </p>
          )}
          {providersOpen && (
            <ProviderKeysSection keys={keys} onChanged={onChanged} />
          )}

          {/* Trust link — full transparency at the moment we ask for keys. */}
          <button
            type="button"
            onClick={() => setAboutOpen((o) => !o)}
            aria-expanded={aboutOpen}
            className="min-h-[32px] text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
          >
            {aboutOpen
              ? "Hide: how Flow works & what data we save"
              : "How Flow works & what data we save →"}
          </button>
          {aboutOpen && (
            <div className="rounded-lg border bg-background/40 p-3 text-left">
              <AboutFlowContent />
            </div>
          )}
        </div>

        {/* Action pinned to the bottom on mobile */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-8 md:mt-0 md:pt-6">
          <span className="text-[11px] text-muted-foreground/60">
            {canStart
              ? hasProvider
                ? "Ready."
                : "Add a provider key to send."
              : "Paste a Kongen key to start."}
          </span>
          <button
            type="button"
            onClick={onFinish}
            disabled={!canStart}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium transition-colors md:min-h-0 md:px-4",
              canStart
                ? "bg-brand text-white hover:bg-brand/90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            Start chatting
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
