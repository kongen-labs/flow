/**
 * Provider/model routing table — TypeScript port of
 * the Kongen routing service (PROVIDER_MODELS, pick_model,
 * estimate_savings, find_model_provider).
 *
 * MUST STAY IN SYNC with the backend table. If the backend catalogue
 * changes, port the change here.
 */

export type Provider =
  | "anthropic"
  | "openai"
  | "google"
  | "mistral"
  | "deepseek";

export const PROVIDERS: Provider[] = [
  "anthropic",
  "openai",
  "google",
  "mistral",
  "deepseek",
];

/** Human-friendly provider display names (shared by key setup + model picker). */
export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  mistral: "Mistral",
  deepseek: "DeepSeek",
};

export type Regime = "trivial" | "fast" | "moderate" | "deep" | "exhaustive";

export const REGIMES: Regime[] = [
  "trivial",
  "fast",
  "moderate",
  "deep",
  "exhaustive",
];

export interface ModelSpec {
  /** Model identifier as sent to the provider API. */
  name: string;
  /** Reasoning regimes this model covers. */
  regimes: Regime[];
  /** Cost per 1M input tokens in USD. */
  inputCost: number;
  /** Cost per 1M output tokens in USD. */
  outputCost: number;
}

export const PROVIDER_MODELS: Record<Provider, ModelSpec[]> = {
  anthropic: [
    { name: "claude-haiku-4-5-20251001", regimes: ["trivial", "fast"], inputCost: 1.0, outputCost: 5.0 },
    { name: "claude-sonnet-4-6", regimes: ["moderate", "deep"], inputCost: 3.0, outputCost: 15.0 },
    { name: "claude-opus-4-6", regimes: ["exhaustive"], inputCost: 5.0, outputCost: 25.0 },
  ],
  openai: [
    { name: "gpt-4o-mini", regimes: ["trivial", "fast"], inputCost: 0.15, outputCost: 0.6 },
    { name: "gpt-4.1", regimes: ["moderate"], inputCost: 2.0, outputCost: 8.0 },
    { name: "gpt-4o", regimes: ["deep"], inputCost: 2.5, outputCost: 10.0 },
    { name: "o3-mini", regimes: ["deep"], inputCost: 1.1, outputCost: 4.4 },
    { name: "o3", regimes: ["exhaustive"], inputCost: 10.0, outputCost: 40.0 },
  ],
  google: [
    { name: "gemini-2.0-flash-lite", regimes: ["trivial"], inputCost: 0.075, outputCost: 0.3 },
    { name: "gemini-2.0-flash", regimes: ["fast"], inputCost: 0.1, outputCost: 0.4 },
    { name: "gemini-2.5-flash", regimes: ["moderate"], inputCost: 0.15, outputCost: 0.6 },
    { name: "gemini-2.5-pro", regimes: ["deep", "exhaustive"], inputCost: 1.25, outputCost: 10.0 },
  ],
  mistral: [
    { name: "mistral-small-latest", regimes: ["trivial", "fast"], inputCost: 0.1, outputCost: 0.3 },
    { name: "codestral-latest", regimes: ["moderate"], inputCost: 0.3, outputCost: 0.9 },
    { name: "mistral-medium-latest", regimes: ["moderate"], inputCost: 0.4, outputCost: 1.2 },
    { name: "mistral-large-latest", regimes: ["deep", "exhaustive"], inputCost: 2.0, outputCost: 6.0 },
  ],
  deepseek: [
    { name: "deepseek-chat", regimes: ["trivial", "fast", "moderate"], inputCost: 0.14, outputCost: 0.28 },
    { name: "deepseek-reasoner", regimes: ["deep", "exhaustive"], inputCost: 0.55, outputCost: 2.19 },
  ],
};

/** Human-friendly display names (from metadata-ribbon.tsx MODEL_DISPLAY). */
export const MODEL_DISPLAY: Record<string, string> = {
  "claude-fable-5": "Fable 5",
  "claude-haiku-4-5-20251001": "Haiku",
  "claude-sonnet-4-6": "Sonnet",
  "claude-opus-4-6": "Opus",
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4o": "GPT-4o",
  "gpt-4.1": "GPT-4.1",
  "o3-mini": "o3 Mini",
  o3: "o3",
  "gemini-2.0-flash-lite": "Flash Lite",
  "gemini-2.0-flash": "Flash",
  "gemini-2.5-flash": "Gemini Flash",
  "gemini-2.5-pro": "Gemini Pro",
  "mistral-small-latest": "Mistral Small",
  "mistral-medium-latest": "Mistral Medium",
  "mistral-large-latest": "Mistral Large",
  "codestral-latest": "Codestral",
  "deepseek-chat": "DeepSeek",
  "deepseek-reasoner": "DeepSeek R1",
};

export function formatModelName(model: string): string {
  return MODEL_DISPLAY[model] || model;
}

/** Blended cost heuristic (mirror of routing.py _effective_cost). */
function effectiveCost(spec: ModelSpec): number {
  return spec.inputCost + spec.outputCost;
}

export interface PickedModel {
  provider: Provider;
  model: string;
  spec: ModelSpec;
}

/**
 * Pick the lowest-cost model that covers the given regime.
 * Mirror of routing.py pick_model.
 */
export function pickModel(
  regime: Regime,
  availableProviders: Provider[],
  providerPref?: Provider,
): PickedModel {
  const candidates: Array<[Provider, ModelSpec]> = [];

  for (const provider of PROVIDERS) {
    if (providerPref && provider !== providerPref) continue;
    if (!availableProviders.includes(provider)) continue;
    for (const spec of PROVIDER_MODELS[provider]) {
      if (spec.regimes.includes(regime)) {
        candidates.push([provider, spec]);
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `No model available for regime '${regime}'. ` +
        `Available providers: ${availableProviders.join(", ") || "(none)"}.`,
    );
  }

  candidates.sort((a, b) => effectiveCost(a[1]) - effectiveCost(b[1]));
  const [provider, spec] = candidates[0];
  return { provider, model: spec.name, spec };
}

/**
 * Latest frontier ("flagship") model per provider — the savings BASELINE.
 *
 * Deliberately NOT part of the PROVIDER_MODELS routing mirror (which must
 * stay in sync with the backend table): this table exists only for the
 * counterfactual "what would the same tokens have cost on the latest
 * frontier model" math (Jul 16 2026 — 'the ROI is towards
 * latest model Fable 5 on Anthropic for ex'). claude-fable-5 is
 * baseline-only and never a routing candidate.
 */
export const FLAGSHIP_MODELS: Record<Provider, ModelSpec> = {
  anthropic: { name: "claude-fable-5", regimes: ["exhaustive"], inputCost: 10.0, outputCost: 50.0 },
  openai: { name: "o3", regimes: ["exhaustive"], inputCost: 10.0, outputCost: 40.0 },
  google: { name: "gemini-2.5-pro", regimes: ["deep", "exhaustive"], inputCost: 1.25, outputCost: 10.0 },
  mistral: { name: "mistral-large-latest", regimes: ["deep", "exhaustive"], inputCost: 2.0, outputCost: 6.0 },
  deepseek: { name: "deepseek-reasoner", regimes: ["deep", "exhaustive"], inputCost: 0.55, outputCost: 2.19 },
};

/**
 * The savings-baseline flagship among the user's CONFIGURED providers —
 * the priciest frontier model they could actually have used (honesty rule:
 * never claim savings vs a model the user has no key for). Null when no
 * provider is configured.
 */
export function flagshipFor(
  availableProviders: Provider[],
): PickedModel | null {
  let best: PickedModel | null = null;
  for (const provider of PROVIDERS) {
    if (!availableProviders.includes(provider)) continue;
    const spec = FLAGSHIP_MODELS[provider];
    if (!best || effectiveCost(spec) > effectiveCost(best.spec)) {
      best = { provider, model: spec.name, spec };
    }
  }
  return best;
}

/**
 * Estimate cost and savings pct vs the latest-frontier baseline
 * (flagshipFor). DELIBERATE DIVERGENCE from routing.py estimate_savings
 * (which used the most expensive routable model) per the Jul 16 2026
 * baseline directive — do not "re-sync" this to the backend.
 */
export function estimateSavings(
  spec: ModelSpec,
  tokensIn: number,
  tokensOut: number,
  availableProviders: Provider[],
): { costUsd: number; savingsPct: number } {
  const actualCost =
    (spec.inputCost * tokensIn) / 1_000_000 +
    (spec.outputCost * tokensOut) / 1_000_000;

  const baseline = flagshipFor(availableProviders);

  if (!baseline || effectiveCost(baseline.spec) <= 0) {
    return { costUsd: round6(actualCost), savingsPct: 0 };
  }

  const maxActualCost =
    (baseline.spec.inputCost * tokensIn) / 1_000_000 +
    (baseline.spec.outputCost * tokensOut) / 1_000_000;

  if (maxActualCost <= 0) {
    return { costUsd: round6(actualCost), savingsPct: 0 };
  }

  let savingsPct = Math.round((1 - actualCost / maxActualCost) * 100);
  savingsPct = Math.max(0, Math.min(100, savingsPct));

  return { costUsd: round6(actualCost), savingsPct };
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Find which provider offers a specific model (pinned-model path).
 * Mirror of routing.py find_model_provider.
 */
export function findModelProvider(
  modelName: string,
  availableProviders: Provider[],
): PickedModel {
  for (const provider of PROVIDERS) {
    if (!availableProviders.includes(provider)) continue;
    for (const spec of PROVIDER_MODELS[provider]) {
      if (spec.name === modelName) {
        return { provider, model: spec.name, spec };
      }
    }
  }
  throw new Error(
    `Model '${modelName}' not found among available providers: ` +
      `${availableProviders.join(", ") || "(none)"}`,
  );
}

/**
 * Default model when no Kongen key is present (no routing): the user's
 * chosen default, or the lowest-cost "moderate" model across available
 * providers as a sensible fallback.
 */
export function defaultModel(
  availableProviders: Provider[],
  userDefault?: string,
): PickedModel {
  if (userDefault) {
    try {
      return findModelProvider(userDefault, availableProviders);
    } catch {
      // user default's provider key was removed — fall through
    }
  }
  return pickModel("moderate", availableProviders);
}
