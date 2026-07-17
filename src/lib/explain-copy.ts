/**
 * Explainer copy — one plain-language line per informational label
 * (tapping an info label shows more info so it is clear what it is).
 *
 * TERMINOLOGY: user-facing "Pin/Pinned" (message) replaces
 * "Flagged/flame" ("flagged is used to report issues"), and "Ignore/
 * Ignored" replaces "Dismissed". Internal signal values stay `critical` /
 * `dismissed` (storage + classifier untouched). Collision rule: model
 * contexts always say "pinned model"; message contexts say "pinned
 * message" where ambiguous; explainers cross-reference the other meaning.
 *
 * Pure strings, kept in lib/ so completeness is testable in the node
 * vitest environment. Depth links to Settings → "How Flow works & your
 * data" instead of duplicating long text.
 */

import type { Regime } from "./models";
import type { SignalLevel } from "./classify-message";
import type { ExclusionReason, InclusionReason } from "./context";
import type { RoutedVia } from "./send";

/** Reasoning regimes (Kongen Logic score tiers). */
export const REGIME_EXPLAIN: Record<Regime, string> = {
  trivial:
    "Kongen scored this prompt as trivial — the lightest reasoning tier. A small, fast model answers it.",
  fast: "Kongen scored this prompt as fast — light reasoning. A quick, inexpensive model answers it.",
  moderate:
    "Kongen scored this prompt as moderate — everyday reasoning. A balanced mid-tier model answers it.",
  deep: "Kongen scored this prompt as deep — heavy reasoning. A stronger (pricier) model answers it.",
  exhaustive:
    "Kongen scored this prompt as exhaustive — the heaviest tier. A frontier model answers it.",
};

/** Chain-view / drawer reasons: what each means for what was sent. */
export const REASON_EXPLAIN: Record<InclusionReason | ExclusionReason, string> =
  {
    critical:
      "Pinned messages are always sent with your prompts, from anywhere in the conversation. (Different from pinning a model, which fixes which model answers.)",
    "same-topic":
      "This message belongs to the topic chain your prompt matched, so it was sent as context.",
    recent:
      "One of your last two exchanges — always sent as a recency safety net, whatever the topic.",
    included:
      "Full-history mode: everything except ignored messages is sent.",
    "off-topic":
      "From a different topic chain — left out to keep context relevant and your token bill smaller.",
    dismissed:
      "You ignored this message (ghost) — it is never sent, but stays in your local history.",
    empty: "Empty message — nothing to send.",
  };

/** Message signal chips (pin / ghost). Keys are the INTERNAL values. */
export const SIGNAL_EXPLAIN: Record<"critical" | "dismissed", string> = {
  critical:
    "Pinned message: always included in the context sent with future prompts. (Different from pinning a model, which fixes which model answers.)",
  dismissed:
    "Ignored message (ghost): never sent to any model — it stays in your local history.",
};

/**
 * One-line meaning per signal STATE (including default) — shown in the
 * actionable signal popover next to the Pin/Default/Ignore control, and as
 * button titles on the control itself. Keys are the INTERNAL values.
 */
export const SIGNAL_MEANING: Record<SignalLevel, string> = {
  critical: SIGNAL_EXPLAIN.critical,
  default:
    "Default: sent with your prompts when relevant — same topic, recent, or full-history.",
  dismissed: SIGNAL_EXPLAIN.dismissed,
};

/** Routing indicator states. */
export const ROUTED_VIA_EXPLAIN: Record<RoutedVia, string> = {
  kongen:
    "Kongen scored this prompt and routed it to the model best suited for it.",
  pinned:
    "You pinned a model, so routing was skipped and that model answered. (Different from pinning a message, which keeps it in context.)",
  default:
    "Smart routing was unavailable for this prompt, so Flow used your default model instead.",
};

/** One-off ribbon / header / setup labels. */
export const LABEL_EXPLAIN = {
  tokens:
    "Input + output tokens for this reply. Tokens are how providers meter usage — you pay per token with your own key.",
  // Survives as the small footnote under the paid-vs-frontier comparison
  // (the cost popover shows what you paid vs what the frontier model
  // would have cost, not a definition).
  cost: "What this reply actually cost with your key, at the provider's published token prices.",
  costNoBaseline:
    "The frontier comparison needs a routed reply — this one didn't store enough data to estimate it.",
  savingsBadge:
    "Estimated saving vs sending the same tokens to the latest frontier model of your providers (est.).",
  spent: "The actual cost of the replies in this conversation, paid with your own provider keys.",
  savedEst:
    "Estimated difference vs sending the same tokens to the latest frontier model of your providers. An estimate — hence “est.”",
  modelSwitched:
    "Routing picked a different model than the previous reply — each prompt is scored on its own.",
  // Context chip states (the chip shows the CURRENT
  // context state — "Smart Reference" echoes the About-Flow "only the
  // relevant part of your conversation is referenced" — not an on/off
  // toggle label). Used as the chip's title per state.
  smartReferenceChip:
    "Smart Reference: each prompt is sent with only the relevant part of the conversation — its topic chain, your last two exchanges, and pinned messages. The chain view on any reply shows exactly what Smart Reference selected. Tap to send full history with the next prompt instead.",
  fullHistoryChip:
    "Sends the whole conversation (except ignored messages) with your next prompt only, then reverts to Smart Reference.",
  // Brand split: "Kongen Routing" is the user-facing
  // product surface; "Kongen Logic" is the scoring API brand and appears
  // in the body, not the label.
  kongenRouting:
    "Kongen Routing picks the model for each prompt — powered by Kongen Logic scoring, which reads the prompt's reasoning depth. Savings are estimated vs always using the latest frontier model of your providers.",
  kongenKeyRequired:
    "Flow routes every Auto prompt through Kongen's scorer, so a key is required. Free — you start with 500 routed prompts.",
  providerKeys:
    "Your own API keys for the model vendors. Answers stream directly from them with your key; at least one is needed to send.",
} as const;
