import { describe, expect, it } from "vitest";
import { compareToFrontier, formatCostUsd } from "./cost-compare";

describe("compareToFrontier", () => {
  it("recomputes from token counts at the flagship's prices (preferred)", () => {
    // Anthropic flagship = claude-fable-5 at $10/M in, $50/M out.
    const c = compareToFrontier(
      { cost: 0.002, tokens_in: 200, tokens_out: 90, savings_pct: 55 },
      ["anthropic"],
    );
    expect(c).not.toBeNull();
    expect(c!.basis).toBe("tokens"); // preferred over stored pct
    expect(c!.model).toBe("Fable 5");
    // (10*200 + 50*90) / 1e6 = 0.0065
    expect(c!.estUsd).toBeCloseTo(0.0065, 10);
    expect(c!.savedUsd).toBeCloseTo(0.0045, 10);
    expect(c!.savedPct).toBe(69);
  });

  it("works for non-routed sends (no savings_pct) via token counts", () => {
    const c = compareToFrontier(
      { cost: 0.002, tokens_in: 200, tokens_out: 90 },
      ["anthropic"],
    );
    expect(c?.basis).toBe("tokens");
    expect(c?.estUsd).toBeCloseTo(0.0065, 10);
  });

  it("recovers the baseline from stored pct when token counts are missing", () => {
    const c = compareToFrontier({ cost: 0.002, savings_pct: 55 }, ["anthropic"]);
    expect(c).not.toBeNull();
    expect(c!.basis).toBe("stored-pct");
    // baseline = cost / (1 - pct/100) = 0.002 / 0.45
    expect(c!.estUsd).toBeCloseTo(0.002 / 0.45, 10);
    expect(c!.savedUsd).toBeCloseTo(0.002 / 0.45 - 0.002, 10);
    expect(c!.savedPct).toBe(55);
    expect(c!.model).toBe("Fable 5"); // named from the user's keyed providers
  });

  it("stays generic when pct-recovering with no keyed provider", () => {
    const c = compareToFrontier({ cost: 0.002, savings_pct: 55 }, []);
    expect(c?.model).toBe("frontier model");
  });

  it("returns null when the metadata can't support an estimate", () => {
    // no tokens, no pct
    expect(compareToFrontier({ cost: 0.002 }, ["anthropic"])).toBeNull();
    // tokens present but no provider key → no honest flagship to price at
    expect(
      compareToFrontier({ cost: 0.002, tokens_in: 200, tokens_out: 90 }, []),
    ).toBeNull();
    // zero tokens
    expect(
      compareToFrontier(
        { cost: 0, tokens_in: 0, tokens_out: 0 },
        ["anthropic"],
      ),
    ).toBeNull();
    // pct out of the recoverable range (100 ⇒ baseline unrecoverable)
    expect(
      compareToFrontier({ cost: 0.002, savings_pct: 100 }, ["anthropic"]),
    ).toBeNull();
    expect(
      compareToFrontier({ cost: 0.002, savings_pct: 0 }, ["anthropic"]),
    ).toBeNull();
  });

  it("handles a paid-more-than-frontier reply (pinned pricey model, cheap flagship)", () => {
    // DeepSeek flagship: $0.55/M in, $2.19/M out.
    const c = compareToFrontier(
      { cost: 0.03, tokens_in: 200, tokens_out: 90 },
      ["deepseek"],
    );
    expect(c).not.toBeNull();
    expect(c!.estUsd).toBeCloseTo((0.55 * 200 + 2.19 * 90) / 1_000_000, 12);
    expect(c!.savedUsd).toBeLessThan(0); // UI hides the "saved" row
    expect(c!.savedPct).toBe(0); // clamped — never a negative percent
  });

  it("names the priciest frontier across multiple keyed providers", () => {
    // anthropic (Fable 5, 10+50) beats deepseek (0.55+2.19).
    const c = compareToFrontier(
      { cost: 0.001, tokens_in: 100, tokens_out: 100 },
      ["deepseek", "anthropic"],
    );
    expect(c?.model).toBe("Fable 5");
  });
});

describe("formatCostUsd", () => {
  it("matches the ribbon chip's 4-decimal format", () => {
    expect(formatCostUsd(0.002)).toBe("$0.0020");
    expect(formatCostUsd(0)).toBe("$0.0000");
    expect(formatCostUsd(1.23456)).toBe("$1.2346");
  });
});
