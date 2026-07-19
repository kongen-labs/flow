/**
 * First-run onboarding — step-per-screen wizard (Jul 17
 * 2026: "too many entry fields for Mobile. Text is too small. Consider an
 * onboarding wizard.") redesigned against impeccable.style guidance:
 *
 *  - "Ruthless subtraction. Strip designs to their essence." (distill) —
 *    one screen per decision, ONE input per screen; the four non-chosen
 *    providers move to Settings instead of stacking five key rows.
 *  - Anti-patterns "tiny body text" / "flat type hierarchy" — mobile type
 *    scales UP: 24px step titles, 15px body (was 11px), 12px footnotes;
 *    inputs stay 16px (iOS zoom rule).
 *  - Hierarchy/contrast/restraint — exactly one primary action per step
 *    (filled brand button); everything else is quiet. No gradients, no
 *    glassmorphism, no step transitions (motion conveys state only), no
 *    numbered "01/02/03" markers — a plain dot progress indicator.
 *  - System respect — existing tokens + the existing KeyRow (commit on
 *    Enter/blur/save, test-ping, remove) reused verbatim; nothing forked.
 *  - Feature preservation (adapt "without amputating features") — all
 *    contracts kept: Kongen key mandatory before chatting; provider key
 *    optional-at-onboarding (needed to send, addable in Settings); trust
 *    surfaces (About-Flow + public-source line) on the welcome step
 *    footer; re-onboarded users skip completed steps.
 *
 * Steps: 0 welcome (zero inputs) → 1 Kongen key (required) → 2 pick ONE
 * provider + its key → chat. Copy is approved-verbatim (explain-copy /
 * key-setup blurb); the only new strings are
 * navigational microcopy (step titles, "Back", "Continue"), not claims.
 *
 * TODO(K1): once POST /v1/flow/keys ships (email-verified self-mint, 500
 * free credits, referral codes), replace the signup link with the in-app
 * mint flow.
 *
 * Mobile-first: full-screen sheet below md (centered card on md+ — same
 * steps, no separate desktop layout), safe-area insets.
 */

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { availableProviders, type KeyStore } from "@/lib/keys";
import { LABEL_EXPLAIN } from "@/lib/explain-copy";
import { PROVIDER_LABELS, PROVIDERS, type Provider } from "@/lib/models";
import {
  SOURCE_PUBLIC_PREFIX,
  SOURCE_REPO_LABEL,
  SOURCE_REPO_URL,
} from "@/lib/source-link";
import { cn } from "@/lib/utils";
import { AboutFlowContent } from "./about-flow";
import { InstallCard } from "./install-sheet";
import { EntryCard } from "./ui/entry-card";
import {
  KONGEN_SIGNUP_URL,
  KeyRow,
  PROVIDER_KEY_URLS,
  PROVIDER_PLACEHOLDERS,
} from "./key-setup";

type Step = 0 | 1 | 2;

/** One primary action per step — the only filled button on screen. */
function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg px-5 text-base font-medium transition-colors md:min-h-[42px] md:text-sm",
        disabled
          ? "bg-muted text-muted-foreground cursor-not-allowed"
          : "bg-brand text-white hover:bg-brand/90",
      )}
    >
      {children}
    </button>
  );
}

/** Plain dot progress — state, not decoration (and not 01/02/03 markers). */
function Progress({ step }: { step: Step }) {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-label={`Step ${step + 1} of 3`}>
      {([0, 1, 2] as const).map((s) => (
        <span
          key={s}
          className={cn(
            "h-1.5 rounded-full transition-all",
            s === step ? "w-5 bg-brand" : "w-1.5 bg-muted-foreground/25",
          )}
        />
      ))}
    </div>
  );
}

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

  // Re-onboarding: skip completed steps. Existing users forced through by
  // the mandatory-key gate (have providers, no Kongen key) land straight
  // on the Kongen step; users with a Kongen key land on the provider step.
  const [step, setStep] = useState<Step>(() =>
    hasKongen ? 2 : hasProvider ? 1 : 0,
  );
  // Provider picker: pre-select the first already-configured provider on
  // re-onboarding so the step shows its saved state.
  const [chosenProvider, setChosenProvider] = useState<Provider | null>(
    () => configured[0] ?? null,
  );
  const [aboutOpen, setAboutOpen] = useState(false);
  // One-tap flow (Jul 17 2026: "difficult to understand that I have
  // to hit the key icon and then the continue button"): the primary button
  // enables while the input holds text; tapping it blurs the input, which
  // COMMITS the pending key (KeyRow's blur handler, guaranteed to fire
  // before the click), then the click handler advances. The key icon
  // remains a redundant affordance, never a required step.
  const [kongenPending, setKongenPending] = useState(false);
  const [providerPending, setProviderPending] = useState(false);

  return (
    <div
      className={cn(
        // Mobile: full-screen sheet with safe-area padding.
        "flex min-h-full flex-col bg-card",
        "pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
        // md+: the same steps in a centered card — no separate desktop layout.
        "md:bg-background md:items-center md:justify-center md:p-4",
      )}
    >
      <div
        className={cn(
          "flex w-full flex-1 flex-col overflow-y-auto px-6 md:flex-none md:max-w-md",
          "md:rounded-xl md:border md:bg-card md:p-6 md:shadow-md",
        )}
      >
        {/* ---- Step 0 — welcome: the wedge, big type, zero inputs ---- */}
        {step === 0 && (
          <>
            <div className="flex flex-1 flex-col justify-center space-y-5 py-10 text-center md:flex-none md:py-4">
              <img
                src="./icons/icon.svg"
                alt=""
                className="mx-auto h-16 w-16 md:h-12 md:w-12"
              />
              <h1 className="text-3xl font-semibold md:text-2xl">Flow</h1>
              {/* Shipped hero copy, verbatim (retired-claims clean). */}
              <p className="mx-auto max-w-xs text-[15px] leading-relaxed text-muted-foreground md:text-sm">
                GPTs come and go. You stay in control — your conversations stay
                on your device, and each prompt is routed to the model best
                suited to it. Bring your own keys; they never leave this device.
              </p>
            </div>

            <div className="space-y-5 pb-2">
              <PrimaryButton onClick={() => setStep(1)}>
                Get started
                <ArrowRight className="h-4 w-4" />
              </PrimaryButton>

              {/* Quiet trust footer — proper tappable cards (settings-v3
                  row pattern), not bare links. */}
              <div className="space-y-2 text-left">
                {/* Install affordance (hidden when already installed). */}
                <InstallCard />
                <EntryCard
                  icon={ShieldCheck}
                  title="How Flow works & what data we save"
                  subtitle="A quick tour, and exactly what stays on your device."
                  onClick={() => setAboutOpen((o) => !o)}
                  expanded={aboutOpen}
                />
                {aboutOpen && (
                  // Slim, self-contained disclosure — the "what data we save"
                  // copy is long (audited/verbatim), so bound it to a
                  // scrollable panel instead of letting it consume the whole
                  // screen and push the primary action off-view (Jul 17
                  // 2026: "make the consent box thinner… on mobile it covers
                  // the entire screen almost"). Container reflow only — copy
                  // unchanged.
                  <div className="max-h-[40vh] overflow-y-auto overscroll-contain rounded-lg border bg-background/40 p-3 text-left">
                    <AboutFlowContent />
                  </div>
                )}
                {/* Softened approved claim only — see lib/source-link.ts. */}
                <p className="pt-1 text-center text-xs leading-relaxed text-muted-foreground/60">
                  {SOURCE_PUBLIC_PREFIX}{" "}
                  <a
                    href={SOURCE_REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-brand-fg"
                  >
                    {SOURCE_REPO_LABEL}
                  </a>
                </p>
              </div>
            </div>
          </>
        )}

        {/* ---- Step 1 — Kongen key (required): ONE field ---- */}
        {step === 1 && (
          <div className="flex flex-1 flex-col space-y-5 py-6 md:flex-none md:py-2">
            <h2 className="text-2xl font-semibold md:text-xl">Kongen key</h2>
            {/* Approved sentence, verbatim (explain-copy kongenKeyRequired). */}
            <p className="text-[15px] leading-relaxed text-muted-foreground md:text-sm">
              {LABEL_EXPLAIN.kongenKeyRequired}
            </p>

            <KeyRow
              slot="kongen"
              label="Kongen"
              placeholder="kk-..."
              keys={keys}
              onChanged={onChanged}
              onPendingChange={setKongenPending}
              accent
            />

            {/* No key yet? Getting one is the obvious alternative action —
                a full secondary button, not a footnote link. Hidden as
                soon as text is PENDING (not just committed): the blur
                commit fired by tapping Continue must not unmount this CTA
                mid-tap, or the primary button shifts up and the click
                lands nowhere (one-tap contract). */}
            {!hasKongen && !kongenPending && (
              <a
                href={KONGEN_SIGNUP_URL}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-lg",
                  "border border-brand-fg/40 px-4 text-base font-medium text-brand-fg md:min-h-[42px] md:text-sm",
                  "hover:bg-brand-fg/10 transition-colors",
                )}
              >
                Get a free Kongen key
                <ExternalLink className="h-4 w-4" />
              </a>
            )}

            <div className="mt-auto space-y-3 pb-2 md:mt-2">
              <PrimaryButton
                onClick={() => {
                  // The tap already blurred the input -> pending committed.
                  if (keys.get("kongen")) setStep(2);
                }}
                disabled={!hasKongen && !kongenPending}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </PrimaryButton>
              {!hasKongen && !kongenPending && (
                <p className="text-center text-xs text-muted-foreground/60">
                  Paste a Kongen key to continue.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ---- Step 2 — ONE provider: pick a card, paste ONE key ---- */}
        {step === 2 && (
          <div className="flex flex-1 flex-col space-y-5 py-6 md:flex-none md:py-2">
            <h2 className="text-2xl font-semibold md:text-xl">
              Your main provider
            </h2>
            {/* Approved sentence, verbatim (explain-copy providerKeys). */}
            <p className="text-[15px] leading-relaxed text-muted-foreground md:text-sm">
              {LABEL_EXPLAIN.providerKeys}
            </p>

            {/* 5 large tappable cards — the one decision on this screen. */}
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((provider) => {
                const chosen = chosenProvider === provider;
                const ready = configured.includes(provider);
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => {
                      setChosenProvider(provider);
                      setProviderPending(false); // fresh KeyRow, no pending
                    }}
                    aria-pressed={chosen}
                    className={cn(
                      "flex min-h-[52px] items-center justify-center gap-1.5 rounded-lg border px-3 text-[15px] font-medium transition-colors md:min-h-[44px] md:text-sm",
                      chosen
                        ? "border-brand bg-brand/5 text-foreground ring-1 ring-brand"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {ready && <Check className="h-4 w-4 text-emerald-500" />}
                    {PROVIDER_LABELS[provider]}
                  </button>
                );
              })}
            </div>

            {chosenProvider && (
              <KeyRow
                key={chosenProvider}
                slot={chosenProvider}
                label={PROVIDER_LABELS[chosenProvider]}
                placeholder={PROVIDER_PLACEHOLDERS[chosenProvider]}
                keys={keys}
                onChanged={onChanged}
                onPendingChange={setProviderPending}
              />
            )}

            {/* No key for the chosen provider? The path to get one is the
                obvious alternative action (full secondary button, matching
                step 1's Kongen CTA — not a footnote link). Hidden while
                text is pending so the blur commit fired by tapping Start
                chatting causes no layout shift under it (one-tap). */}
            {chosenProvider &&
              !configured.includes(chosenProvider) &&
              !providerPending && (
              <a
                href={PROVIDER_KEY_URLS[chosenProvider]}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-lg",
                  "border px-4 text-base font-medium text-foreground md:min-h-[42px] md:text-sm",
                  "hover:bg-muted transition-colors",
                )}
              >
                Get your {PROVIDER_LABELS[chosenProvider]} key
                <ExternalLink className="h-4 w-4" />
              </a>
            )}

            {/* Navigational microcopy, not a claim. */}
            <p className="text-xs leading-relaxed text-muted-foreground/60">
              Add more providers later in Settings.
            </p>

            <div className="mt-auto space-y-3 pb-2 md:mt-2">
              <PrimaryButton
                onClick={() => {
                  // The tap already blurred the input -> pending committed.
                  if (!keys.get("kongen")) return;
                  if (availableProviders(keys).length === 0) return;
                  onFinish();
                }}
                disabled={!hasKongen || (!hasProvider && !providerPending)}
              >
                Start chatting
                <ArrowRight className="h-4 w-4" />
              </PrimaryButton>
              {/* No-provider path is an explicit, quiet CHOICE (live
                  bug follow-up): landing in a chat that can't send must be
                  a decision, not an accident. Provider stays optional at
                  onboarding by design. Status copy verbatim. */}
              {!hasProvider && (
                <>
                  <p className="text-center text-xs text-muted-foreground/60">
                    Add a provider key to send.
                  </p>
                  <button
                    type="button"
                    onClick={onFinish}
                    disabled={!hasKongen}
                    className="mx-auto block min-h-[44px] text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors md:min-h-0"
                  >
                    Skip for now — add in Settings
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ---- Wizard chrome: back + progress ---- */}
        <div className="flex items-center justify-between pt-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors md:min-h-0 md:min-w-0 md:p-1.5"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <span className="min-w-[44px] md:min-w-0" />
          )}
          <Progress step={step} />
          <span className="min-w-[44px] md:min-w-0" />
        </div>
      </div>
    </div>
  );
}
