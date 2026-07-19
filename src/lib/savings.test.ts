import { describe, expect, it } from "vitest";
import {
  formatRoiLine,
  formatSavedUsd,
  messageSavedUsd,
  savedByStream,
  spentByStream,
  sumSavings,
} from "./savings";

describe("spentByStream", () => {
  it("sums actual per-reply costs per stream, skipping zero/legacy", () => {
    const map = spentByStream([
      { stream_id: "a", metadata: { cost_usd: 0.01, savings_pct: 50 } },
      { stream_id: "a", metadata: { cost_usd: 0.05 } }, // unrouted still spends
      { stream_id: "b", metadata: { cost_usd: 0.02 } },
      { stream_id: "a" }, // user message, no metadata
      { metadata: { cost_usd: 0.5 } }, // no stream id
      { stream_id: "b", metadata: { cost_usd: 0 } }, // zero-cost
    ]);
    expect(map.a).toBeCloseTo(0.06, 10);
    expect(map.b).toBeCloseTo(0.02, 10);
    expect(Object.keys(map)).toEqual(["a", "b"]);
  });
});

describe("formatRoiLine", () => {
  it("formats saved-on-spent with pct of the frontier baseline, est.-qualified", () => {
    // baseline = 1.70 + 0.42 = 2.12 → 1.70/2.12 ≈ 80%
    expect(formatRoiLine(1.7, 0.42)).toBe(
      "$1.70 saved on $0.42 spent (80% less, est.)",
    );
  });

  it("uses dust formatting for sub-cent figures", () => {
    expect(formatRoiLine(0.005, 0.005)).toBe(
      "<$0.01 saved on <$0.01 spent (50% less, est.)",
    );
  });

  it("returns null when either figure is missing — no hollow claims", () => {
    expect(formatRoiLine(0, 0.42)).toBeNull();
    expect(formatRoiLine(1.7, 0)).toBeNull();
    expect(formatRoiLine(0, 0)).toBeNull();
  });
});

describe("messageSavedUsd", () => {
  it("derives saved $ from cost + savings_pct", () => {
    // cost 0.0069 at 62% saved → baseline 0.0069/0.38, saved = baseline - cost
    const saved = messageSavedUsd({ cost_usd: 0.0069, savings_pct: 62 });
    expect(saved).toBeCloseTo((0.0069 * 62) / 38, 10);
  });

  it("returns 0 for missing/old metadata", () => {
    expect(messageSavedUsd(undefined)).toBe(0);
    expect(messageSavedUsd({})).toBe(0);
    expect(messageSavedUsd({ cost_usd: 0.01 })).toBe(0); // no pct (unrouted)
    expect(messageSavedUsd({ savings_pct: 50 })).toBe(0); // no cost
  });

  it("guards pct bounds (0, 100 exclusive)", () => {
    expect(messageSavedUsd({ cost_usd: 0.01, savings_pct: 0 })).toBe(0);
    expect(messageSavedUsd({ cost_usd: 0, savings_pct: 100 })).toBe(0);
    expect(messageSavedUsd({ cost_usd: 0.01, savings_pct: 110 })).toBe(0);
    expect(messageSavedUsd({ cost_usd: -1, savings_pct: 50 })).toBe(0);
  });
});

describe("sumSavings", () => {
  const messages = [
    { metadata: { cost_usd: 0.01, savings_pct: 50 } }, // saved 0.01
    { metadata: { cost_usd: 0.02, savings_pct: 75 } }, // saved 0.06
    { metadata: { cost_usd: 0.05 } }, // unrouted: spent only
    {}, // user message / legacy, no metadata
  ];

  it("aggregates saved, spent, pct, and routed count", () => {
    const t = sumSavings(messages);
    expect(t.savedUsd).toBeCloseTo(0.07, 10);
    expect(t.spentUsd).toBeCloseTo(0.08, 10);
    expect(t.routedReplies).toBe(2);
    expect(t.savedPct).toBeCloseTo((0.07 / 0.15) * 100, 6);
  });

  it("is all-zero for empty or legacy-only history", () => {
    expect(sumSavings([])).toEqual({
      savedUsd: 0,
      spentUsd: 0,
      savedPct: 0,
      routedReplies: 0,
    });
    expect(sumSavings([{}, {}]).savedUsd).toBe(0);
  });
});

describe("savedByStream", () => {
  it("groups saved totals per stream in one pass", () => {
    const map = savedByStream([
      { stream_id: "a", metadata: { cost_usd: 0.01, savings_pct: 50 } },
      { stream_id: "a", metadata: { cost_usd: 0.02, savings_pct: 50 } },
      { stream_id: "b", metadata: { cost_usd: 0.01, savings_pct: 75 } },
      { stream_id: "b" }, // no metadata
      { metadata: { cost_usd: 0.01, savings_pct: 50 } }, // no stream_id
    ]);
    expect(map.a).toBeCloseTo(0.03, 10);
    expect(map.b).toBeCloseTo(0.03, 10);
    expect(Object.keys(map)).toEqual(["a", "b"]);
  });
});

describe("formatSavedUsd", () => {
  it("formats cents, dust, and zero", () => {
    expect(formatSavedUsd(1.234)).toBe("$1.23");
    expect(formatSavedUsd(0.01)).toBe("$0.01");
    expect(formatSavedUsd(0.004)).toBe("<$0.01");
    expect(formatSavedUsd(0)).toBe("$0.00");
  });
});
