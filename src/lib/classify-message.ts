/**
 * Client-side message classifier — auto-sets relevance signal.
 *
 * Mirrors the backend context.py classifier logic:
 * - Transient: short filler messages ("ok", "thanks", emoji)
 * - Critical: decisions, code, constraints, error reports
 * - Default: everything else (contextual)
 */

export type SignalLevel = "critical" | "default" | "dismissed";

const TRANSIENT_PATTERN =
  /^(ok|okay|thanks|thank you|got it|sure|yes|no|yep|nope|cool|great|awesome|nice|perfect|sounds good|makes sense|right|ah|oh|hmm|hm|lol|haha|wow|k|ty|thx|hi|hello|hey|looks good|that works|that fixed it)[.!?,]*\s*(thanks|thank you|thx)?\s*$/i;

const LOAD_BEARING_KEYWORDS = [
  "use ", "switch to", "change to", "implement", "create", "build",
  "add ", "remove", "delete", "update", "fix ", "the schema", "the table",
  "the function", "the api", "the endpoint", "let's go with",
  "decided", "prefer", "instead of", "rather than", "must ", "require",
  "constraint", "rule ", "always ", "never ", "important",
  "crash", "error", "bug", "broken", "fail", "issue is",
  "typeerror", "syntaxerror", "undefined", "expired", "timeout",
  "make ", "set ", "go back", "should be", "scratch that",
  "go with", "needs to", "has to", "configure", "install",
  "migrate", "deploy", "replace", "rename",
];

const CODE_PATTERN = /```|`[^`]+`|def |class |function |import |const |let |var /;

export function classifyMessage(content: string, role: "user" | "assistant"): SignalLevel {
  if (!content || !content.trim()) return "dismissed";

  const text = content.trim();

  // Very short non-alphanumeric (emoji) → dismissed
  if (text.length <= 5 && !/[a-zA-Z0-9]/.test(text)) return "dismissed";

  // Short filler → dismissed
  if (text.length <= 40 && TRANSIENT_PATTERN.test(text)) return "dismissed";

  // Code blocks → critical
  if (CODE_PATTERN.test(text)) return "critical";

  // Contains decision/action keywords → critical (user messages only for directives)
  const lower = text.toLowerCase();
  if (role === "user") {
    for (const kw of LOAD_BEARING_KEYWORDS) {
      if (lower.includes(kw)) return "critical";
    }
  }

  // Assistant messages with decision keywords are contextual, not critical
  if (role === "assistant") {
    const hasDecision = LOAD_BEARING_KEYWORDS.some((kw) => lower.includes(kw));
    if (hasDecision && text.length > 100) return "default";
    if (CODE_PATTERN.test(text)) return "critical";
  }

  return "default";
}
