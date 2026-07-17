/**
 * Blocked-characters list for Flow + playground prompt inputs.
 *
 * --------------------------------------------------------------------------
 * MUST STAY IN SYNC WITH BACKEND:
 *   the Kongen scoring endpoint — `_SYMBOL_NORMALIZATION_MAP`
 * --------------------------------------------------------------------------
 *
 * Why this exists (UX rationale, May 9 2026):
 *
 * The backend logic-scorer (PR #6 / `[P1-SCORE-002]`) normalizes a fixed set
 * of Unicode math/logic operators and Greek letters to ASCII keywords before
 * tokenization, so that prompts like "Prove √2 is irrational" do not silently
 * fall through to the trivial regime.
 *
 * Even with backend normalization in place, three NL paraphrases of the same
 * question still land in different regimes because the regex+wordlist scorer
 * is not paraphrase-invariant:
 *
 *   • "Prove √2 is irrational"               → after normalization, scored
 *   • "Prove sqrt(2) is irrational"          → scored cleanly
 *   • "Prove square root of 2 is irrational" → NL phrase, scorer is blind
 *
 * As a tactical UX patch we hard-block the offending characters at the input
 * surface (Flow + playground), forcing the user to type the ASCII spelling
 * the scorer was designed for. The proper fix is `[P1-SCORE-003]` (Chiryu
 * meaning-extraction router with paraphrase invariance by construction).
 *
 * Scope of this list:
 *
 *   • IN-SCOPE: every character in `_SYMBOL_NORMALIZATION_MAP` on the backend.
 *     Math operators, comparators, Greek letters, logic operators (~35 chars).
 *   • OUT-OF-SCOPE: ASCII alphanumerics, ASCII punctuation, whitespace, CJK,
 *     emoji, accented Latin letters. These pass through to the backend
 *     untouched (the backend handles unknown unicode as a no-op — see
 *     `test_unknown_unicode_doesnt_crash`).
 */

/**
 * The exact set of characters the backend normalizes. Adding a character to
 * the backend `_SYMBOL_NORMALIZATION_MAP` MUST also add it here.
 */
export const BLOCKED_CHARS: readonly string[] = [
  // Math operators
  "√",
  "∫",
  "∑",
  "∏",
  "∂",
  "∇",
  "∞",
  "±",
  "°",
  "×",
  "÷",
  // Comparators
  "≤",
  "≥",
  "≠",
  "≈",
  "≡",
  // Greek letters
  "π",
  "θ",
  "α",
  "β",
  "γ",
  "δ",
  "λ",
  "μ",
  "σ",
  "ε",
  "φ",
  "Δ",
  "Ω",
  // Logic operators
  "∀",
  "∃",
  "∈",
  "∉",
  "⊂",
  "⊃",
  "⊆",
  "⊇",
  "∪",
  "∩",
  "¬",
  "∧",
  "∨",
  "→",
  "↔",
  "⊢",
  "⊨",
];

/**
 * Regex matching every blocked character (global flag — used to strip all
 * occurrences in a single pass).
 *
 * Each character is escaped via `\u{...}` to keep the regex source robust
 * against editor encoding changes.
 */
export const BLOCKED_CHARS_REGEX: RegExp = new RegExp(
  `[${BLOCKED_CHARS.map((c) => `\\u{${c.codePointAt(0)!.toString(16)}}`).join("")}]`,
  "gu",
);

/**
 * Persistent helper text rendered below the input. Always visible, subtle
 * styling. Intent: tell the user up-front to use ASCII spellings, before they
 * type the special character and trigger the strip.
 */
export const HELPER_TEXT =
  "Use ASCII keywords (sqrt, integral, theta, forall) for math.";

/**
 * Transient notice rendered when a strip happens. Specific enough that the
 * user understands which class of character was removed and what to type
 * instead.
 */
export const STRIP_NOTICE =
  "Special character removed — use sqrt / theta / forall instead.";

/**
 * Strip every blocked character from `input`. Returns the cleaned string and
 * a flag indicating whether anything was stripped.
 *
 * Used by both the `onChange` and `onPaste` handlers in chat-input.tsx and
 * playground/page.tsx. Keep it pure — no React state, no side effects — so
 * it is trivially unit-testable.
 *
 * TODO(test-infra): kongen-dashboard does not currently have a test
 * framework configured (no jest, vitest, or @testing-library). When test
 * infrastructure is added, write:
 *   1. A unit test asserting every char in BLOCKED_CHARS is stripped, and
 *      that ASCII alphanumerics, ASCII punctuation, CJK, and emoji pass
 *      through unchanged.
 *   2. Component tests for chat-input.tsx and playground/page.tsx covering
 *      both the onChange and onPaste paths.
 */
export function stripBlockedChars(input: string): {
  cleaned: string;
  stripped: boolean;
} {
  // Reset lastIndex defensively — `g` flag regexes keep state across calls.
  BLOCKED_CHARS_REGEX.lastIndex = 0;
  const cleaned = input.replace(BLOCKED_CHARS_REGEX, "");
  return { cleaned, stripped: cleaned !== input };
}
