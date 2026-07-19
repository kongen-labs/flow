/**
 * Provider/model catalog — server-fetched, cache-backed, offline-safe.
 *
 * SOURCE OF TRUTH is the central endpoint GET /v1/models (public, no auth):
 * the router table lives on the server so new models appear in every client
 * WITHOUT an app update. This module fetches that catalog, maps it into the
 * app's model/provider structures, caches it (localStorage, with version +
 * timestamp), and — crucially — keeps working offline:
 *
 *   load  ->  use cached catalog immediately if present, else the BUNDLED
 *             SEED below; then (when online) revalidate in the background.
 *   fetch fails / offline  ->  keep the cached catalog; first-ever run with
 *             no cache falls back to the SEED. The app ALWAYS has a usable
 *             catalog — never a blank picker offline.
 *
 * The picker, the frontier baseline (lib/cost-compare), and the regime->model
 * routing (pickModel / findModelProvider / defaultModel) all read the live
 * catalog via the functions below, so a model added on the server renders
 * everywhere with no code change.
 *
 * NOTE: the SEED_CATALOG is a FALLBACK ONLY — it is NOT required to mirror the
 * backend routing table (that "MUST STAY IN SYNC with routing.py" burden is
 * gone). Update the seed occasionally so first-run-offline users get a sane
 * recent list; the fetched catalog always wins when available.
 */

export type Provider =
  | "anthropic"
  | "openai"
  | "google"
  | "mistral"
  | "deepseek";

/**
 * Providers the app can accept a BYO key for (key-entry UI, placeholders and
 * signup URLs are per-provider — see key-setup.tsx). The endpoint may only
 * surface MODELS within these; a brand-new provider would still need key UI,
 * so unknown provider ids in the fetched catalog are ignored (not crashed).
 */
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
  /** Model identifier as sent to the provider API (endpoint `id`). */
  name: string;
  /** Human-friendly display name (endpoint `label`). */
  label?: string;
  /** Tier hint; "flagship" marks the frontier baseline candidate. */
  tier?: string;
  /** Reasoning regimes this model covers (Auto routing candidates). */
  regimes: Regime[];
  /** Cost per 1M input tokens in USD (endpoint `input_per_mtok`). */
  inputCost: number;
  /** Cost per 1M output tokens in USD (endpoint `output_per_mtok`). */
  outputCost: number;
  /** Whether the model appears in the pin-a-model picker (default true). */
  selectable?: boolean;
}

export interface CatalogProvider {
  id: Provider;
  label: string;
  models: ModelSpec[];
}

export interface Catalog {
  /** Server catalog version string (opaque) or "seed" for the bundled fallback. */
  version: string;
  /** ms epoch when fetched from the server; null for cache-less seed. */
  fetchedAt: number | null;
  providers: CatalogProvider[];
}

/** Where the central catalog lives (public, no auth). */
export const MODELS_ENDPOINT = "https://api.kongenlabs.life/v1/models";

/** localStorage key for the cached catalog. */
export const CATALOG_CACHE_KEY = "flow-local:model-catalog:v1";

// ---------------------------------------------------------------------------
// BUNDLED SEED CATALOG (FALLBACK ONLY)
//
// Shipped in the app so the picker is never blank before the endpoint
// responds and on first-ever-offline runs. INCLUDES claude-fable-5 (Fable 5)
// as a selectable Anthropic flagship — so Fable shows in the picker
// immediately, even before /v1/models deploys. This is the pre-endpoint
// source AND the permanent offline fallback; it does not need to track the
// backend table exactly (update occasionally).
// ---------------------------------------------------------------------------
export const SEED_CATALOG: Catalog = {
  version: "seed",
  fetchedAt: null,
  providers: [
    {
      id: "anthropic",
      label: "Anthropic",
      models: [
        { name: "claude-fable-5", label: "Fable 5", tier: "flagship", regimes: ["deep", "exhaustive"], inputCost: 10.0, outputCost: 50.0, selectable: true },
        { name: "claude-haiku-4-5-20251001", label: "Haiku", regimes: ["trivial", "fast"], inputCost: 1.0, outputCost: 5.0, selectable: true },
        { name: "claude-sonnet-4-6", label: "Sonnet", regimes: ["moderate", "deep"], inputCost: 3.0, outputCost: 15.0, selectable: true },
        { name: "claude-opus-4-6", label: "Opus", regimes: ["exhaustive"], inputCost: 5.0, outputCost: 25.0, selectable: true },
      ],
    },
    {
      id: "openai",
      label: "OpenAI",
      models: [
        { name: "gpt-4o-mini", label: "GPT-4o Mini", regimes: ["trivial", "fast"], inputCost: 0.15, outputCost: 0.6, selectable: true },
        { name: "gpt-4.1", label: "GPT-4.1", regimes: ["moderate"], inputCost: 2.0, outputCost: 8.0, selectable: true },
        { name: "gpt-4o", label: "GPT-4o", regimes: ["deep"], inputCost: 2.5, outputCost: 10.0, selectable: true },
        { name: "o3-mini", label: "o3 Mini", regimes: ["deep"], inputCost: 1.1, outputCost: 4.4, selectable: true },
        { name: "o3", label: "o3", tier: "flagship", regimes: ["exhaustive"], inputCost: 10.0, outputCost: 40.0, selectable: true },
      ],
    },
    {
      id: "google",
      label: "Google",
      models: [
        { name: "gemini-2.0-flash-lite", label: "Flash Lite", regimes: ["trivial"], inputCost: 0.075, outputCost: 0.3, selectable: true },
        { name: "gemini-2.0-flash", label: "Flash", regimes: ["fast"], inputCost: 0.1, outputCost: 0.4, selectable: true },
        { name: "gemini-2.5-flash", label: "Gemini Flash", regimes: ["moderate"], inputCost: 0.15, outputCost: 0.6, selectable: true },
        { name: "gemini-2.5-pro", label: "Gemini Pro", tier: "flagship", regimes: ["deep", "exhaustive"], inputCost: 1.25, outputCost: 10.0, selectable: true },
      ],
    },
    {
      id: "mistral",
      label: "Mistral",
      models: [
        { name: "mistral-small-latest", label: "Mistral Small", regimes: ["trivial", "fast"], inputCost: 0.1, outputCost: 0.3, selectable: true },
        { name: "codestral-latest", label: "Codestral", regimes: ["moderate"], inputCost: 0.3, outputCost: 0.9, selectable: true },
        { name: "mistral-medium-latest", label: "Mistral Medium", regimes: ["moderate"], inputCost: 0.4, outputCost: 1.2, selectable: true },
        { name: "mistral-large-latest", label: "Mistral Large", tier: "flagship", regimes: ["deep", "exhaustive"], inputCost: 2.0, outputCost: 6.0, selectable: true },
      ],
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      models: [
        { name: "deepseek-chat", label: "DeepSeek", regimes: ["trivial", "fast", "moderate"], inputCost: 0.14, outputCost: 0.28, selectable: true },
        { name: "deepseek-reasoner", label: "DeepSeek R1", tier: "flagship", regimes: ["deep", "exhaustive"], inputCost: 0.55, outputCost: 2.19, selectable: true },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Endpoint mapping + cache (pure, node-testable — no React, globals guarded)
// ---------------------------------------------------------------------------

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

const KNOWN_PROVIDERS = new Set<string>(PROVIDERS);
const KNOWN_REGIMES = new Set<string>(REGIMES);

function toNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Map a raw /v1/models payload into an internal Catalog, or null if the shape
 * is unusable. Only known providers are kept (unknown ids ignored, not
 * fatal); a model needs an id and numeric per-Mtok costs. Unknown regime
 * strings are filtered out — such a model stays pinnable but isn't an Auto
 * routing candidate.
 */
export function mapEndpointCatalog(raw: unknown): Catalog | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const rawProviders = obj.providers;
  if (!Array.isArray(rawProviders)) return null;

  const providers: CatalogProvider[] = [];
  for (const p of rawProviders) {
    if (!p || typeof p !== "object") continue;
    const pr = p as Record<string, unknown>;
    const id = pr.id;
    if (typeof id !== "string" || !KNOWN_PROVIDERS.has(id)) continue;
    const provider = id as Provider;
    const models: ModelSpec[] = [];
    const rawModels = Array.isArray(pr.models) ? pr.models : [];
    for (const m of rawModels) {
      if (!m || typeof m !== "object") continue;
      const mr = m as Record<string, unknown>;
      const name = mr.id;
      if (typeof name !== "string" || name.length === 0) continue;
      const inputCost = toNumber(mr.input_per_mtok);
      const outputCost = toNumber(mr.output_per_mtok);
      if (inputCost === null || outputCost === null) continue;
      const regimes = (Array.isArray(mr.regimes) ? mr.regimes : [])
        .filter((r): r is Regime => typeof r === "string" && KNOWN_REGIMES.has(r));
      models.push({
        name,
        label: typeof mr.label === "string" ? mr.label : undefined,
        tier: typeof mr.tier === "string" ? mr.tier : undefined,
        regimes,
        inputCost,
        outputCost,
        selectable: mr.selectable !== false,
      });
    }
    if (models.length === 0) continue;
    providers.push({
      id: provider,
      label: typeof pr.label === "string" ? pr.label : PROVIDER_LABELS[provider],
      models,
    });
  }

  if (providers.length === 0) return null;
  return {
    version: typeof obj.version === "string" ? obj.version : "unknown",
    fetchedAt: Date.now(),
    providers,
  };
}

/** Validate a parsed cache blob back into a Catalog (or null if malformed). */
function normalizeCachedCatalog(parsed: unknown): Catalog | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.version !== "string" || !Array.isArray(o.providers)) return null;
  // Reuse the endpoint validator's model checks by re-shaping into its schema.
  const reshaped = {
    version: o.version,
    providers: (o.providers as unknown[]).map((p) => {
      const pr = (p ?? {}) as Record<string, unknown>;
      return {
        id: pr.id,
        label: pr.label,
        models: (Array.isArray(pr.models) ? pr.models : []).map((m) => {
          const mr = (m ?? {}) as Record<string, unknown>;
          return {
            id: mr.name,
            label: mr.label,
            tier: mr.tier,
            regimes: mr.regimes,
            input_per_mtok: mr.inputCost,
            output_per_mtok: mr.outputCost,
            selectable: mr.selectable,
          };
        }),
      };
    }),
  };
  const mapped = mapEndpointCatalog(reshaped);
  if (!mapped) return null;
  // Preserve the cached fetchedAt rather than "now".
  const fetchedAt = toNumber(o.fetchedAt);
  return { ...mapped, fetchedAt: fetchedAt };
}

/** Read the cached catalog from storage, or null when absent/invalid. */
export function loadCachedCatalog(storage: StorageLike | null = defaultStorage()): Catalog | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    return normalizeCachedCatalog(JSON.parse(raw));
  } catch {
    return null;
  }
}

function persistCatalog(catalog: Catalog, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
  } catch {
    // storage full / unavailable — the in-memory catalog still works.
  }
}

// ---------------------------------------------------------------------------
// Live catalog store (framework-free; React binding lives in use-catalog.ts)
// ---------------------------------------------------------------------------

// Initialised synchronously at import: cached catalog if present, else seed.
// Guarantees a usable catalog before any fetch and on first-run-offline.
let currentCatalog: Catalog = loadCachedCatalog() ?? SEED_CATALOG;

const listeners = new Set<() => void>();

function setActiveCatalog(catalog: Catalog): void {
  currentCatalog = catalog;
  for (const cb of listeners) cb();
}

/** Current in-memory catalog (cache/seed on load, fetched once revalidated). */
export function getCatalog(): Catalog {
  return currentCatalog;
}

/** Subscribe to catalog changes (used by the React useCatalog hook). */
export function subscribeCatalog(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export interface RefreshResult {
  ok: boolean;
  reason?: string;
  catalog?: Catalog;
}

/**
 * Fetch the central catalog and, on success, adopt + cache it. On any failure
 * (offline, network error, non-2xx, malformed body) the current catalog is
 * LEFT UNCHANGED — the app keeps using the cache/seed it already had. Safe to
 * call on load and again on reconnect.
 */
export async function refreshCatalog(opts: {
  fetchImpl?: typeof fetch;
  storage?: StorageLike | null;
} = {}): Promise<RefreshResult> {
  const f =
    opts.fetchImpl ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  if (!f) return { ok: false, reason: "no-fetch" };
  try {
    const res = await f(MODELS_ENDPOINT, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    const raw = await res.json();
    const catalog = mapEndpointCatalog(raw);
    if (!catalog) return { ok: false, reason: "invalid" };
    persistCatalog(catalog, opts.storage);
    setActiveCatalog(catalog);
    return { ok: true, catalog };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Test helper: reset the in-memory catalog to the seed (no storage touched). */
export function resetCatalogForTests(catalog: Catalog = SEED_CATALOG): void {
  setActiveCatalog(catalog);
}

// ---------------------------------------------------------------------------
// Catalog accessors (read the live catalog)
// ---------------------------------------------------------------------------

/** All models for a provider in the live catalog (empty if absent). */
export function modelsForProvider(provider: Provider): ModelSpec[] {
  const p = currentCatalog.providers.find((cp) => cp.id === provider);
  return p ? p.models : [];
}

/** Provider display label from the live catalog, falling back to the static map. */
export function providerLabel(provider: Provider): string {
  const p = currentCatalog.providers.find((cp) => cp.id === provider);
  return p?.label ?? PROVIDER_LABELS[provider];
}

/** Human-friendly display name for a model id, from the live catalog. */
export function formatModelName(model: string): string {
  for (const p of currentCatalog.providers) {
    for (const m of p.models) {
      if (m.name === model && m.label) return m.label;
    }
  }
  return model;
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
 * Pick the lowest-cost model that covers the given regime, across the live
 * catalog. (Mirror of routing.py pick_model.) A flagship such as Fable 5 can
 * be in the catalog but, being the priciest, is never the Auto pick unless a
 * user explicitly pins it.
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
    for (const spec of modelsForProvider(provider)) {
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
 * A provider's flagship (frontier baseline) model from the live catalog:
 * the `tier: "flagship"` model, or the priciest if none is tagged.
 */
function flagshipModel(provider: Provider): ModelSpec | null {
  const models = modelsForProvider(provider);
  if (models.length === 0) return null;
  const flagged = models.filter((m) => m.tier === "flagship");
  const pool = flagged.length > 0 ? flagged : models;
  return pool.reduce((best, m) =>
    effectiveCost(m) > effectiveCost(best) ? m : best,
  );
}

/**
 * The savings-baseline flagship among the user's CONFIGURED providers — the
 * priciest frontier model they could actually have used (honesty rule: never
 * claim savings vs a model the user has no key for). Null when no provider is
 * configured. Reads the live catalog, so the baseline (e.g. Fable 5 for
 * Anthropic) tracks the server without a code change.
 */
export function flagshipFor(availableProviders: Provider[]): PickedModel | null {
  let best: PickedModel | null = null;
  for (const provider of PROVIDERS) {
    if (!availableProviders.includes(provider)) continue;
    const spec = flagshipModel(provider);
    if (!spec) continue;
    if (!best || effectiveCost(spec) > effectiveCost(best.spec)) {
      best = { provider, model: spec.name, spec };
    }
  }
  return best;
}

/**
 * The LOWEST-cost flagship (top-tier) model across the user's providers.
 *
 * This is the Auto-routing fallback for a TOP-regime request (exhaustive) that
 * no available model covers directly: routing must land on a flagship and MUST
 * NOT silently drop to a lower tier (the exhaustive→Sonnet bug). Cheapest —
 * not priciest — flagship honours the cost-saver default (e.g. Anthropic →
 * Opus $30, never Sonnet, and never the pricier Fable $60 unless Opus is
 * absent from the catalog). Null if the user has no flagship-tier model.
 *
 * NOTE: distinct from flagshipFor(), which returns the PRICIEST frontier model
 * for the savings BASELINE. That divergence is intentional: the savings chip
 * compares against the most-expensive model you could have used; routing picks
 * the cheapest capable one.
 */
export function cheapestFlagship(
  availableProviders: Provider[],
): PickedModel | null {
  let best: PickedModel | null = null;
  for (const provider of PROVIDERS) {
    if (!availableProviders.includes(provider)) continue;
    for (const spec of modelsForProvider(provider)) {
      if (spec.tier !== "flagship") continue;
      if (!best || effectiveCost(spec) < effectiveCost(best.spec)) {
        best = { provider, model: spec.name, spec };
      }
    }
  }
  return best;
}

/**
 * Estimate cost and savings pct vs the latest-frontier baseline
 * (flagshipFor). DELIBERATE DIVERGENCE from routing.py estimate_savings
 * (which used the most expensive routable model) per the Jul 16 2026
 * baseline directive.
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
    for (const spec of modelsForProvider(provider)) {
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
 * Default model when no Kongen key is present (no routing): the user's chosen
 * default, or the lowest-cost "moderate" model across available providers as
 * a sensible fallback.
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
