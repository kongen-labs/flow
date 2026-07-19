/**
 * Send pipeline — client-side re-home of the server orchestration that
 * lived in the Kongen send service:
 *
 *   1. Classify + persist the user message (IndexedDB).
 *   2. Route:  pinned model       → findModelProvider
 *              Auto (Kongen key)  → POST /v1/logic/score → regime → pickModel
 *              score fails        → defaultModel (graceful runtime fallback)
 *              Auto, key missing  → error (Kongen key is required per the
 *                                   Jul 15 2026 directive; first-run collects
 *                                   it, so this is normally unreachable)
 *   3. Stream from the provider browser-direct with the user's own key.
 *   4. Persist the assistant message with routing + cost metadata.
 *
 * Context policy: full non-dismissed history goes to the provider. Signals
 * (critical/default/dismissed) come from lib/classify-message.ts with
 * manual flame/ghost overrides on top; "dismissed" messages are excluded
 * from provider context but NEVER deleted from local history.
 */

import { classifyMessage } from "./classify-message";
import { selectContext, type ContextScope } from "./context";
import { FlowDB, type StoredMessage, type StoredMessageMetadata } from "./db";
import { availableProviders, type KeyStore } from "./keys";
import { KongenApiError, scorePrompt } from "./kongen";
import {
  cheapestFlagship,
  defaultModel,
  estimateSavings,
  findModelProvider,
  pickModel,
  type PickedModel,
  type Regime,
} from "./models";
import { streamChat, type ChatTurn } from "./providers";

export type RoutedVia = "kongen" | "pinned" | "default";

/**
 * Zero-provider-keys send guard message. Exported so the chat-input
 * attention indicator (LABEL_EXPLAIN.providerKeysMissing / "No provider
 * keys") shares one vocabulary with the send-time error — the indicator and
 * the failure must never contradict each other (Jul 17 2026).
 */
export const NO_PROVIDER_KEYS_MESSAGE =
  "No provider keys configured. Add at least one provider key in Settings.";

export interface RoutingDecision {
  provider: string;
  model: string;
  routedVia: RoutedVia;
  regime?: Regime;
  budget?: number;
  /**
   * Genuine [0,1] certainty: how decisively the prompt maps to its detected
   * regime (LogicScoreResponse.confidence). This is what the "Why this model?"
   * popover shows as "Confidence" — NOT confidence_adj, which is a legacy
   * signed nudge that reads ~0.00 for most prompts (the "Confidence: 0.00" bug).
   */
  confidence?: number;
  /** Legacy signed adjustment [-1,1]; retained for data completeness, not shown. */
  confidenceAdj?: number;
  ktRemaining?: number;
  /** Present when Kongen routing was attempted but fell back. */
  fallbackReason?: string;
}

export interface SendCallbacks {
  /** User message persisted — render it. */
  onUserMessage: (message: StoredMessage) => void;
  /** Routing decided — drive the routing indicator. */
  onRouting: (decision: RoutingDecision) => void;
  /** Streaming token — append to the in-flight assistant bubble. */
  onToken: (text: string) => void;
  /** Assistant message persisted — final render. */
  onDone: (message: StoredMessage) => void;
  onError: (error: string) => void;
}

export interface SendOptions {
  db: FlowDB;
  keys: KeyStore;
  streamId: string;
  text: string;
  /** "Auto" or a pinned model id (chat-input mode selector contract). */
  mode: string;
  /** User-chosen default model for the no-Kongen-key path. */
  defaultModelId?: string;
  /** Prior messages in the stream (already loaded by the caller). */
  history: StoredMessage[];
  /** Context scope: "relevant" (topic-chained, default) or "everything". */
  contextScope?: ContextScope;
  makeId: (prefix: string) => string;
  signal?: AbortSignal;
}

/** Decide provider+model for this prompt. Exported for tests. */
export async function routePrompt(opts: {
  text: string;
  mode: string;
  keys: KeyStore;
  defaultModelId?: string;
  scoreImpl?: typeof scorePrompt;
}): Promise<RoutingDecision> {
  const providers = availableProviders(opts.keys);
  if (providers.length === 0) {
    throw new Error(NO_PROVIDER_KEYS_MESSAGE);
  }

  // Pinned model wins over everything.
  if (opts.mode !== "Auto") {
    const picked = findModelProvider(opts.mode, providers);
    return { provider: picked.provider, model: picked.model, routedVia: "pinned" };
  }

  // Kongen smart routing — the hero feature. The key is REQUIRED for Auto
  // mode (Jul 15 2026 directive): first-run collects it, so a missing key
  // here is a setup error, not a silent default-model path.
  const kongenKey = opts.keys.get("kongen");
  if (!kongenKey) {
    throw new Error(
      "Smart routing needs a Kongen key. Add one in Settings — free keys at garden.kongenlabs.life/keys.",
    );
  }

  try {
    const score = await (opts.scoreImpl ?? scorePrompt)(opts.text, kongenKey);
    const picked = pickModelWithFallback(score.regime, providers);
    return {
      provider: picked.provider,
      model: picked.model,
      routedVia: "kongen",
      regime: score.regime,
      budget: score.recommended_tokens,
      confidence: score.confidence,
      confidenceAdj: score.confidence_adj,
      ktRemaining: score.tokens_remaining,
    };
  } catch (err) {
    // RUNTIME failure (bad key, out of KT, CORS, offline) must never break
    // chat — degrade gracefully to the default model ("routing paused").
    const reason =
      err instanceof KongenApiError ? err.message : "Routing unavailable";
    const picked = defaultModel(providers, opts.defaultModelId);
    return {
      provider: picked.provider,
      model: picked.model,
      routedVia: "default",
      fallbackReason: reason,
    };
  }
}

/**
 * pickModel for a regime, widening when the user's providers don't cover the
 * detected one. Widening is DIRECTIONAL by design:
 *
 *   1. Direct hit — the cheapest model covering the detected regime. For
 *      "exhaustive" with an Anthropic key this is Opus (the intended flagship
 *      auto-target); Fable stays pinnable-only via its higher price.
 *   2. Step UP — try MORE capable regimes. Never downgrade the user's
 *      requested reasoning depth while a stronger model is still available.
 *   3. Flagship floor — if nothing at OR above the requested regime is
 *      covered, fall back to the provider's flagship (cheapest top-tier)
 *      model. This is the FIX for the exhaustive→Sonnet bug: a top-regime
 *      request that no model covers directly must resolve to a flagship, NEVER
 *      silently drop a tier to a cheaper lower-tier model like Sonnet.
 *   4. Step DOWN — only as a last resort (no flagship at all in the user's
 *      catalog) do we accept a lower regime, so the user still gets a reply
 *      rather than an error.
 *
 * Prior behaviour widened symmetrically outward, so "exhaustive" (the top
 * regime) had nowhere up to go and fell straight to "deep" → Sonnet whenever
 * the available catalog lacked an exhaustive-capable model (e.g. a stale or
 * partial cached catalog). That silent tier-drop is the bug this replaces.
 */
function pickModelWithFallback(
  regime: Regime,
  providers: ReturnType<typeof availableProviders>,
): PickedModel {
  const ladder: Regime[] = ["trivial", "fast", "moderate", "deep", "exhaustive"];
  const start = ladder.indexOf(regime);

  // 1. Direct hit.
  try {
    return pickModel(regime, providers);
  } catch {
    // not directly covered — widen
  }

  // 2. Step UP (toward more capable regimes) before ever stepping down.
  for (let i = start + 1; i < ladder.length; i++) {
    try {
      return pickModel(ladder[i], providers);
    } catch {
      // keep widening upward
    }
  }

  // 3. Flagship floor — never drop below the requested tier for a top-regime
  //    request. Guarantees exhaustive → a flagship (e.g. Opus), never Sonnet.
  const flagship = cheapestFlagship(providers);
  if (flagship) return flagship;

  // 4. Last resort: step down so chat still works when no flagship exists.
  for (let i = start - 1; i >= 0; i--) {
    try {
      return pickModel(ladder[i], providers);
    } catch {
      // keep widening downward
    }
  }
  throw new Error("No model available for any regime with current keys");
}

/**
 * Build provider context from history — relevance-scoped by default.
 * Delegates to lib/context.ts selectContext — the SAME selection the chain
 * viewer and context drawer render, so what the user sees is what is sent.
 */
export function buildTurns(
  history: StoredMessage[],
  newUserText: string,
  scope?: ContextScope,
): ChatTurn[] {
  return selectContext(history, newUserText, { scope }).turns;
}

/** Full send flow. Returns after the assistant message is persisted. */
export async function sendMessageWith(
  opts: SendOptions,
  cb: SendCallbacks,
): Promise<void> {
  const { db, keys, streamId, text } = opts;

  // 1. Persist the user message.
  const seq = await db.nextSeq(streamId);
  const userMessage: StoredMessage = {
    id: opts.makeId("msg"),
    stream_id: streamId,
    seq,
    role: "user",
    content: text,
    signal: classifyMessage(text, "user"),
    created_at: new Date().toISOString(),
  };
  await db.addMessage(userMessage);
  cb.onUserMessage(userMessage);

  // 2. Route.
  let decision: RoutingDecision;
  try {
    decision = await routePrompt({
      text,
      mode: opts.mode,
      keys,
      defaultModelId: opts.defaultModelId,
    });
  } catch (err) {
    cb.onError(err instanceof Error ? err.message : String(err));
    return;
  }
  cb.onRouting(decision);

  const providerKey = keys.get(decision.provider as never);
  if (!providerKey) {
    cb.onError(`No key stored for provider '${decision.provider}'`);
    return;
  }

  // 3. Stream browser-direct.
  const turns = buildTurns(opts.history, text, opts.contextScope);
  let assistantText = "";

  await new Promise<void>((resolve) => {
    void streamChat({
      provider: decision.provider as never,
      model: decision.model,
      apiKey: providerKey,
      turns,
      maxTokens: decision.budget && decision.budget > 256 ? decision.budget : undefined,
      signal: opts.signal,
      onToken: (t) => {
        assistantText += t;
        cb.onToken(t);
      },
      onError: (e) => {
        cb.onError(e);
        resolve();
      },
      onDone: async ({ tokensIn, tokensOut }) => {
        // 4. Persist the assistant message with metadata.
        try {
          const picked = findModelProvider(decision.model, [
            decision.provider as never,
          ]);
          const { costUsd, savingsPct } = estimateSavings(
            picked.spec,
            tokensIn,
            tokensOut,
            availableProviders(keys),
          );
          const metadata: StoredMessageMetadata = {
            regime: decision.regime,
            model: decision.model,
            provider: decision.provider,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            cost_usd: costUsd,
            savings_pct: decision.routedVia === "kongen" ? savingsPct : undefined,
            budget: decision.budget,
            confidence: decision.confidence,
            confidence_adj: decision.confidenceAdj,
            routed_via: decision.routedVia,
            // Record the scope actually used so the chain view can show
            // this reply's REAL context even after settings change.
            context_scope: opts.contextScope ?? "relevant",
          };
          const assistantMessage: StoredMessage = {
            id: opts.makeId("msg"),
            stream_id: streamId,
            seq: seq + 1,
            role: "assistant",
            content: assistantText,
            signal: classifyMessage(assistantText, "assistant"),
            metadata,
            created_at: new Date().toISOString(),
          };
          await db.addMessage(assistantMessage);
          cb.onDone(assistantMessage);
        } catch (err) {
          cb.onError(err instanceof Error ? err.message : String(err));
        }
        resolve();
      },
    });
  });
}
