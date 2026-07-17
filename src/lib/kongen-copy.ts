/**
 * "How does Kongen work" copy — the Kongen-side complement to the audited
 * About-Flow surface.
 *
 * STRICT ASSEMBLY RULE: every sentence here is VERBATIM from an
 * already-approved, claims-audited source (the About-Flow copy, the
 * landing copy, or lib/explain-copy.ts). Do NOT paraphrase, "improve",
 * or add claims here; new claims go through Kongen Labs' claims review.
 *
 * KT PRICING: the "Why a Kongen key." block below carries the canonical
 * approved scoring-cost sentence verbatim (1 KT per Auto score; the
 * pinned path is score-free in send.ts), alongside the free-tier
 * sentence. Terminology guard: "prompts on a pinned model" /
 * "pinned-model prompts", never bare "pinned prompts" outside a sentence
 * that says "pin a model" (pinned-MESSAGE collision; test-pinned).
 *
 * The regimes list renders from REGIME_EXPLAIN (explain-copy.ts) at the
 * component level — single source, no duplication.
 *
 * Pure strings in lib/ so the honesty contract is unit-testable
 * ("best suited" framing, NEVER "cheapest").
 */

export const KONGEN_HOW: { lead: string; rest: string }[] = [
  {
    // about-flow HOW_IT_WORKS step 2 (verbatim) + explain-copy
    // LABEL_EXPLAIN.kongenRouting sentence 1 (verbatim).
    lead: "Kongen scores each prompt.",
    rest: "When you send a prompt on Auto, Flow sends that prompt's text to Kongen, which scores how much reasoning it needs. Kongen Routing picks the model for each prompt — powered by Kongen Logic scoring, which reads the prompt's reasoning depth.",
  },
  {
    // the approved landing copy "How does it work?" (verbatim sentence) +
    // about-flow HOW_IT_WORKS step 3 (verbatim, minus the step-2 cross
    // reference which doesn't resolve in this section).
    lead: "The score picks the model.",
    rest: "The score picks the model best suited to the job: a light, fast model for “reformat this list,” a frontier model for “prove this bound.” Pin a model instead and pinned prompts are never sent to Kongen. If scoring is ever unreachable, Flow falls back to your default model and says so.",
  },
  {
    // about-flow LEAVES_DEVICE bullets 2 + 3 (verbatim).
    lead: "What Kongen records.",
    rest: "On Auto mode, each new prompt's text goes to Kongen, to score its complexity. Just that prompt — not your conversation history. Kongen records the routing decision it made (regime, confidence, chosen model), not your prompt's text. Model answers never go to Kongen. They stream provider → browser. Kongen scores questions; it never sees answers or conversations.",
  },
  {
    // explain-copy LABEL_EXPLAIN.kongenKeyRequired (verbatim) + the
    // canonical approved scoring-cost sentence (verbatim).
    lead: "Why a Kongen key.",
    rest: "Flow routes every Auto prompt through Kongen's scorer, so a key is required. Free — you start with 500 routed prompts. Each Auto prompt costs 1 Kongen Token (KT) to score — your free routed prompts are those tokens — and prompts on a pinned model cost nothing, because they're never scored.",
  },
  {
    // the approved landing copy "How does it work?" (verbatim) + explain-copy
    // LABEL_EXPLAIN.kongenRouting last sentence (verbatim).
    lead: "Where the savings come from.",
    rest: "You save money as a consequence — trivial prompts stop hitting frontier pricing. Savings are estimated vs always using the latest frontier model of your providers.",
  },
];

/** Section heading shown wherever this copy renders. */
export const KONGEN_HOW_TITLE = "How does Kongen work";

/** Sub-heading over the REGIME_EXPLAIN list ("Kongen Logic score tiers"
 * is the explain-copy.ts description of regimes). */
export const KONGEN_REGIMES_TITLE = "The five regimes (Kongen Logic score tiers)";
