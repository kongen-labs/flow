/**
 * Honesty contract for the "How does Kongen work" copy: assembled only
 * from approved language, best-suited framing, never "cheapest" (banned
 * framing, product directive), and the privacy boundary sentences present.
 */

import { describe, expect, it } from "vitest";
import { KONGEN_HOW, KONGEN_HOW_TITLE } from "./kongen-copy";
import { LABEL_EXPLAIN, REGIME_EXPLAIN } from "./explain-copy";

const ALL = KONGEN_HOW.map((b) => `${b.lead} ${b.rest}`).join(" ");

describe("kongen-copy honesty contract", () => {
  it("never uses the banned 'cheapest' selection framing", () => {
    expect(ALL.toLowerCase()).not.toContain("cheapest");
    // regimes list renders from REGIME_EXPLAIN — hold it to the same rule
    for (const line of Object.values(REGIME_EXPLAIN)) {
      expect(line.toLowerCase()).not.toContain("cheapest");
    }
  });

  it("uses the approved best-suited framing for model choice", () => {
    expect(ALL).toContain("best suited");
  });

  it("carries the approved privacy boundary verbatim", () => {
    expect(ALL).toContain(
      "Kongen records the routing decision it made (regime, confidence, chosen model), not your prompt's text.",
    );
    expect(ALL).toContain("Model answers never go to Kongen.");
    expect(ALL).toContain("it never sees answers or conversations");
  });

  it("reuses the approved key-requirement sentence verbatim (explain-copy)", () => {
    expect(ALL).toContain(LABEL_EXPLAIN.kongenKeyRequired);
  });

  it("states savings as outcome with the approved estimate basis", () => {
    expect(ALL).toContain("You save money as a consequence");
    expect(ALL).toContain(
      "estimated vs always using the latest frontier model of your providers",
    );
  });

  it("carries the canonical approved scoring-cost sentence verbatim", () => {
    expect(ALL).toContain(
      "Each Auto prompt costs 1 Kongen Token (KT) to score — your free routed prompts are those tokens — and prompts on a pinned model cost nothing, because they're never scored.",
    );
  });

  it("terminology guard: bare 'pinned prompts' only inside a 'pin a model' sentence", () => {
    // guard: "prompts on a pinned model" / "pinned-model prompts",
    // never bare "pinned prompts" outside a sentence that says "pin a
    // model" — avoids collision with pinned MESSAGES.
    for (const block of KONGEN_HOW) {
      const text = `${block.lead} ${block.rest}`;
      if (/pinned prompts/i.test(text)) {
        expect(text.toLowerCase()).toContain("pin a model");
      }
    }
  });

  it("covers all five regimes via explain-copy", () => {
    expect(Object.keys(REGIME_EXPLAIN).sort()).toEqual(
      ["deep", "exhaustive", "fast", "moderate", "trivial"].sort(),
    );
  });

  it("has the entry-point title", () => {
    expect(KONGEN_HOW_TITLE).toBe("How does Kongen work");
  });
});
