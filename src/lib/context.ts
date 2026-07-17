/**
 * Context selection engine — relevance-scoped (v2).
 *
 * SINGLE SOURCE OF TRUTH for "what gets sent as context": lib/send.ts
 * builds provider turns THROUGH selectContext(), and the chain viewer +
 * context drawer render the SAME selection — what the user sees is exactly
 * what is forwarded.
 *
 * v2 (Jul 16 2026 — "why are all the prompts of the conversation being
 * included"): conversations are segmented into TOPIC CHAINS and a new
 * prompt only carries its own chain, a recency safety net, and flagged
 * messages — unrelated topics (cats, pasta, Peru...) stay home.
 *
 * Chain segmentation (one pass, oldest → newest):
 *   - user message: joins the best word-overlap chain (stop-word-filtered
 *     content words — the kongen-web heuristic); short/anaphoric follow-ups
 *     ("do you bake or boil it?" — pronouns / ≤2 content words) inherit the
 *     PREVIOUS turn's chain by adjacency; no overlap → starts a new chain.
 *   - assistant message: joins the chain of the prompt it answered
 *     (previous message), and its words enrich that chain's topic set.
 *
 * Selection for a new prompt (scope "relevant", the default):
 *   (a) the chain the prompt belongs to (overlap match; anaphoric prompts
 *       join the most recent chain),
 *   (b) ALWAYS the last 2 user+assistant turn pairs (recency safety net),
 *   (c) critical (flame) messages from anywhere,
 *   (d) NEVER dismissed (ghost) or empty — manual overrides always win.
 *   Fresh topic (no chain match) → recency window + criticals only.
 *
 * Scope "everything" is the v1 rule (everything except dismissed/empty) —
 * the escape hatch when the heuristic misses.
 *
 * Design bias is conservative: false EXCLUSION breaks conversations, false
 * inclusion only costs tokens — hence the recency net, adjacency
 * inheritance for pronouns, and ≥1-word overlap (not a similarity score).
 *
 * NOTE (truth boundary): the About-Flow copy revision for relevance
 * selection is being drafted by the content team — do not edit
 * about-flow.tsx from here; the approved wording is applied verbatim as a
 * follow-up.
 */

import type { ChatTurn } from "./providers";

const PREVIEW_LEN = 80;

/** Recency safety net: always include the last N user turns + replies. */
const RECENCY_USER_TURNS = 2;

export type ContextScope = "relevant" | "everything";

/**
 * Minimal message shape — satisfied by both lib/db StoredMessage and the
 * UI's ChatMessage, so the send path and the chain viewer literally share
 * this module's selection.
 */
export interface MessageLike {
  id: string;
  role: "user" | "assistant";
  content: string;
  signal?: string;
}

/** Why a message was forwarded. */
export type InclusionReason = "critical" | "same-topic" | "recent" | "included";
/** Why a message was dropped. */
export type ExclusionReason = "dismissed" | "empty" | "off-topic";

export interface ContextLabel {
  id: string;
  role: "user" | "assistant";
  preview: string;
  reason: InclusionReason | ExclusionReason;
}

export interface ContextSelection {
  /** Provider turns, in order (the actual payload context). */
  turns: ChatTurn[];
  forwarded: ContextLabel[];
  dropped: ContextLabel[];
  /** Total messages considered (excluding any appended new user text). */
  total: number;
}

// ---------------------------------------------------------------------------
// Topic words
// ---------------------------------------------------------------------------

/** kongen-web chain-viewer stop words, extended with common filler. */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "was", "are", "you", "can",
  "should", "what", "how", "why", "when", "where", "which", "who", "whom",
  "your", "their", "there", "its", "also", "just", "does", "did", "has",
  "have", "had", "were", "not", "but", "about", "tell", "more", "please",
  "could", "would", "will", "into", "from", "them", "they", "then", "than",
  "some", "any", "all", "one", "out", "get", "got", "let", "lets", "very",
]);

/** Anaphors that mark a follow-up as leaning on the previous turn. */
const ANAPHORS = new Set([
  "it", "its", "that", "this", "these", "those", "they", "them", "their",
  "one", "ones", "same", "he", "she", "him", "her",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

/** Stop-word-filtered content words (len > 2) — the topic fingerprint. */
export function topicWords(text: string): string[] {
  return tokenize(text).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Short/anaphoric follow-up: too few content words to stand alone (≤1), or
 * a shortish message leaning on a pronoun ("do you bake or boil it?").
 * Deliberately NOT triggered by short complete questions ("What is the
 * capital of Mongolia?" — 2 content words, no anaphor → fresh topic).
 */
export function isAnaphoricFollowUp(text: string): boolean {
  const content = topicWords(text);
  if (content.length <= 1) return true;
  return content.length <= 6 && tokenize(text).some((t) => ANAPHORS.has(t));
}

// ---------------------------------------------------------------------------
// Chain segmentation
// ---------------------------------------------------------------------------

interface Chain {
  id: number;
  words: Set<string>;
  lastIndex: number;
}

function overlapCount(words: string[], chain: Chain): number {
  let n = 0;
  for (const w of words) if (chain.words.has(w)) n += 1;
  return n;
}

/** Best-overlapping chain (≥1 shared word); most recent wins ties. */
function bestChain(words: string[], chains: Chain[]): Chain | null {
  let best: Chain | null = null;
  let bestScore = 0;
  for (const chain of chains) {
    const score = overlapCount(words, chain);
    if (
      score > bestScore ||
      (score === bestScore && score > 0 && best !== null && chain.lastIndex > best.lastIndex)
    ) {
      best = chain;
      bestScore = score;
    }
  }
  return bestScore >= 1 ? best : null;
}

/** Assign every message a chain id (parallel array to history). */
export function segmentChains(history: MessageLike[]): {
  chainIds: number[];
  chains: Chain[];
} {
  const chains: Chain[] = [];
  const chainIds: number[] = [];
  let prevChainId = -1;

  const startChain = (index: number): Chain => {
    const chain: Chain = {
      id: chains.length,
      words: new Set<string>(),
      lastIndex: index,
    };
    chains.push(chain);
    return chain;
  };

  history.forEach((message, index) => {
    const content = message.content.trim();
    if (!content) {
      // Empty: ride along with the previous chain (excluded at selection).
      chainIds.push(prevChainId);
      return;
    }
    const words = topicWords(content);
    let chain: Chain;

    if (message.role === "assistant" && prevChainId >= 0) {
      // A reply belongs to the chain of the prompt it answered.
      chain = chains[prevChainId];
    } else if (
      message.role === "user" &&
      isAnaphoricFollowUp(content) &&
      prevChainId >= 0
    ) {
      // Adjacency inheritance — pronoun follow-ups are never orphaned.
      chain = chains[prevChainId];
    } else {
      chain = bestChain(words, chains) ?? startChain(index);
    }

    for (const w of words) chain.words.add(w);
    chain.lastIndex = index;
    chainIds.push(chain.id);
    prevChainId = chain.id;
  });

  return { chainIds, chains };
}

/** Chain id a NEW prompt belongs to, or -1 for a fresh topic. */
function matchPromptChain(
  newUserText: string,
  chains: Chain[],
  lastChainId: number,
): number {
  if (chains.length === 0) return -1;
  // A short follow-up joins the most recent chain.
  if (isAnaphoricFollowUp(newUserText)) return lastChainId;
  return bestChain(topicWords(newUserText), chains)?.id ?? -1;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** Base predicate: hard drops that no inclusion rule can override. */
export function isForwarded(message: {
  content: string;
  signal?: string;
}): boolean {
  return message.signal !== "dismissed" && message.content.trim().length > 0;
}

function preview(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LEN ? `${flat.slice(0, PREVIEW_LEN)}…` : flat;
}

/** Indices in the recency net: last N user turns + their replies. */
function recencyIndices(history: MessageLike[]): Set<number> {
  const included = new Set<number>();
  let userTurns = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (!isForwarded(history[i])) continue;
    included.add(i);
    if (history[i].role === "user") {
      userTurns += 1;
      if (userTurns >= RECENCY_USER_TURNS) break;
    }
  }
  return included;
}

/**
 * Select context from history for a new user prompt.
 *
 * With scope "relevant" (default) the selection is topic-scoped as
 * documented in the module header. With scope "everything" — or when no
 * new prompt is given (nothing to scope relevance against) — the v1 rule
 * applies: everything except dismissed/empty.
 */
export function selectContext(
  history: MessageLike[],
  newUserText?: string,
  opts?: { scope?: ContextScope },
): ContextSelection {
  const scope = opts?.scope ?? "relevant";
  const relevant = scope === "relevant" && newUserText !== undefined;

  let promptChainId = -1;
  let chainIds: number[] = [];
  let recent = new Set<number>();

  if (relevant) {
    const segmented = segmentChains(history);
    chainIds = segmented.chainIds;
    let lastChainId = -1;
    for (let i = chainIds.length - 1; i >= 0; i--) {
      if (chainIds[i] >= 0) {
        lastChainId = chainIds[i];
        break;
      }
    }
    promptChainId = matchPromptChain(
      newUserText as string,
      segmented.chains,
      lastChainId,
    );
    recent = recencyIndices(history);
  }

  const forwarded: ContextLabel[] = [];
  const dropped: ContextLabel[] = [];
  const turns: ChatTurn[] = [];

  history.forEach((message, index) => {
    const base = {
      id: message.id,
      role: message.role,
      preview: preview(message.content),
    };

    // Hard drops first — manual ghost always wins.
    if (message.content.trim().length === 0) {
      dropped.push({ ...base, reason: "empty" });
      return;
    }
    if (message.signal === "dismissed") {
      dropped.push({ ...base, reason: "dismissed" });
      return;
    }

    // Inclusion rules, most meaningful reason first.
    let reason: InclusionReason | null = null;
    if (message.signal === "critical") reason = "critical";
    else if (!relevant) reason = "included";
    else if (promptChainId >= 0 && chainIds[index] === promptChainId)
      reason = "same-topic";
    else if (recent.has(index)) reason = "recent";

    if (reason) {
      forwarded.push({ ...base, reason });
      turns.push({ role: message.role, content: message.content });
    } else {
      dropped.push({ ...base, reason: "off-topic" });
    }
  });

  if (newUserText !== undefined) {
    turns.push({ role: "user", content: newUserText });
  }

  return { turns, forwarded, dropped, total: history.length };
}
