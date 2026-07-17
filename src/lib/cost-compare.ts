/**
 * Per-message cost comparison — "what you paid vs what the same reply would
 * have cost on the latest frontier model of your keyed providers" (the maintainer
 * directive, Jul 16 2026: the cost explainer is a COMPARISON, not a
 * definition).
 *
 * Baseline preference order:
 *   1. TOKEN RECOMPUTE — stored tokens_in/tokens_out priced at the
 *      flagshipFor(providers) rates (lib/models FLAGSHIP_MODELS). Exact for
 *      the counterfactual and works for ALL replies that stored token
 *      counts, including fallback/pinned sends (savings_pct is only stored
 *      for Kongen-routed replies).
 *   2. STORED-PCT RECOVERY — older messages without token counts: recover
 *      the send-time baseline from cost_usd + savings_pct,
 *      baseline = cost / (1 - pct/100) (same identity as lib/savings).
 *   3. null — not enough data; the UI shows "You paid" plus a short note
 *      that the comparison needs a routed reply.
 *
 * Honesty rules carried over from lib/savings: the frontier figure is
 * always an ESTIMATE ("est."), named after a model the user actually holds
 * a key for (flagshipFor — never a provider they can't use), and never
 * framed as bargain-hunting.
 */

import { flagshipFor, formatModelName, type Provider } from "./models";

export interface CostCompareMetadataLike {
  /** Actual cost of the reply in USD (message metadata `cost`). */
  cost?: number;
  tokens_in?: number;
  tokens_out?: number;
  /** Stored only for Kongen-routed replies. */
  savings_pct?: number;
}

export interface FrontierComparison {
  /** Display name of the frontier baseline model (e.g. "Fable 5"). */
  model: string;
  /** Estimated cost of the same reply on the frontier model, USD. */
  estUsd: number;
  /** estUsd - paid. May be <= 0 (e.g. a pinned pricier model). */
  savedUsd: number;
  /** Saved as % of the frontier figure, clamped to [0, 100]. */
  savedPct: number;
  /** Which computation produced the figure. */
  basis: "tokens" | "stored-pct";
}

/**
 * Frontier comparison for one reply, or null when the stored metadata
 * can't support an honest estimate.
 */
export function compareToFrontier(
  meta: CostCompareMetadataLike,
  providers: Provider[],
): FrontierComparison | null {
  const paid = typeof meta.cost === "number" && meta.cost >= 0 ? meta.cost : 0;
  const flagship = flagshipFor(providers);

  // 1. Token recompute (preferred — exact counterfactual, all send paths).
  const tin = meta.tokens_in;
  const tout = meta.tokens_out;
  if (
    flagship &&
    typeof tin === "number" &&
    typeof tout === "number" &&
    tin >= 0 &&
    tout >= 0 &&
    tin + tout > 0
  ) {
    const estUsd =
      (flagship.spec.inputCost * tin + flagship.spec.outputCost * tout) /
      1_000_000;
    if (estUsd > 0) {
      const savedUsd = estUsd - paid;
      const savedPct = clampPct(Math.round((savedUsd / estUsd) * 100));
      return {
        model: formatModelName(flagship.model),
        estUsd,
        savedUsd,
        savedPct,
        basis: "tokens",
      };
    }
  }

  // 2. Stored-pct recovery (older messages without token counts).
  const pct = meta.savings_pct;
  if (paid > 0 && typeof pct === "number" && pct > 0 && pct < 100) {
    const estUsd = paid / (1 - pct / 100);
    return {
      // Send-time baseline model is not stored; name the user's current
      // frontier when they still hold a key, otherwise stay generic.
      model: flagship ? formatModelName(flagship.model) : "frontier model",
      estUsd,
      savedUsd: estUsd - paid,
      savedPct: clampPct(pct),
      basis: "stored-pct",
    };
  }

  return null;
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** "$0.0020" — matches the ribbon chip's 4-decimal cost format. */
export function formatCostUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}
