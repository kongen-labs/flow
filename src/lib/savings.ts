/**
 * Savings aggregation — per-conversation and lifetime totals.
 *
 * Savings are an OUTCOME, always labeled "est." (the counterfactual
 * baseline — what the same tokens would have cost on the LATEST FRONTIER
 * model of the user's configured providers, lib/models.ts flagshipFor,
 * e.g. Claude Fable 5 with an Anthropic key — is an estimate; see the
 * legal note in docs/marketing/flow-local/free-to-try-model.md §4). Never
 * framed as bargain-hunting.
 *
 * MIXED-HISTORY NOTE (baseline change, Jul 16 2026): messages stored
 * before this change carry a savings_pct computed vs the OLD baseline
 * (priciest routable model among providers). We deliberately do NOT
 * recompute old messages (providers-at-send-time are unknown, so a
 * recompute would be no more truthful) — totals over mixed history are
 * mixed-basis estimates, which "est." already covers. New sends use the
 * frontier baseline.
 *
 * Math: each routed reply stores cost_usd and savings_pct (lib/models.ts
 * estimateSavings — actual cost vs the priciest available model at send
 * time; savings_pct only set when routed_via === "kongen"). The saved
 * amount is derived from those stored per-message fields:
 *
 *   pct = (1 - cost/baseline) * 100  →  saved = baseline - cost
 *                                              = cost * pct / (100 - pct)
 *
 * Guards: pct outside (0, 100) → 0 (pct=100 means cost≈0 and the baseline
 * is unrecoverable from stored fields; pct is int-rounded so this is a
 * sub-cent rounding case). Old local messages without metadata count as 0.
 */

export interface SavingsMetadataLike {
  cost_usd?: number;
  savings_pct?: number;
}

export interface MessageWithSavings {
  stream_id?: string;
  metadata?: SavingsMetadataLike;
}

export interface SavingsTotals {
  /** Estimated $ saved vs the always-priciest-model baseline. */
  savedUsd: number;
  /** Actual $ spent (sum of stored per-reply costs). */
  spentUsd: number;
  /** saved / (saved + spent) as a percentage; 0 when no baseline. */
  savedPct: number;
  /** Number of replies that carried a savings estimate. */
  routedReplies: number;
}

/** Estimated $ saved by one message, from its stored metadata. */
export function messageSavedUsd(metadata?: SavingsMetadataLike): number {
  if (!metadata) return 0;
  const cost = metadata.cost_usd;
  const pct = metadata.savings_pct;
  if (typeof cost !== "number" || typeof pct !== "number") return 0;
  if (!(cost >= 0) || pct <= 0 || pct >= 100) return 0;
  return (cost * pct) / (100 - pct);
}

/** Aggregate savings over a set of messages (one conversation, or all). */
export function sumSavings(messages: MessageWithSavings[]): SavingsTotals {
  let savedUsd = 0;
  let spentUsd = 0;
  let routedReplies = 0;
  for (const m of messages) {
    const saved = messageSavedUsd(m.metadata);
    if (saved > 0) {
      savedUsd += saved;
      routedReplies += 1;
    }
    if (typeof m.metadata?.cost_usd === "number" && m.metadata.cost_usd > 0) {
      spentUsd += m.metadata.cost_usd;
    }
  }
  const baseline = savedUsd + spentUsd;
  const savedPct = baseline > 0 ? (savedUsd / baseline) * 100 : 0;
  return { savedUsd, spentUsd, savedPct, routedReplies };
}

/** Per-stream saved totals (for the sidebar), one pass over all messages. */
export function savedByStream(
  messages: MessageWithSavings[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const m of messages) {
    if (!m.stream_id) continue;
    const saved = messageSavedUsd(m.metadata);
    if (saved > 0) map[m.stream_id] = (map[m.stream_id] ?? 0) + saved;
  }
  return map;
}

/** Per-stream spent totals (actual per-reply costs), one pass. */
export function spentByStream(
  messages: MessageWithSavings[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const m of messages) {
    if (!m.stream_id) continue;
    const cost = m.metadata?.cost_usd;
    if (typeof cost === "number" && cost > 0) {
      map[m.stream_id] = (map[m.stream_id] ?? 0) + cost;
    }
  }
  return map;
}

/** "$1.23", "<$0.01" for positive dust, "$0.00" otherwise. */
export function formatSavedUsd(n: number): string {
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  if (n > 0) return "<$0.01";
  return "$0.00";
}

/**
 * Compact ROI line for the sidebar footer:
 * "$1.70 saved on $0.42 spent (80% less)". The percentage is
 * saved / (saved + spent) — i.e. how much less was paid than the frontier
 * baseline (baseline = spent + saved), same identity as sumSavings.
 * Null when either figure is missing — never renders a hollow claim.
 */
export function formatRoiLine(
  savedUsd: number,
  spentUsd: number,
): string | null {
  if (!(savedUsd > 0) || !(spentUsd > 0)) return null;
  const pct = Math.round((savedUsd / (savedUsd + spentUsd)) * 100);
  return `${formatSavedUsd(savedUsd)} saved on ${formatSavedUsd(spentUsd)} spent (${pct}% less)`;
}
