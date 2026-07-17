import { describe, expect, it } from "vitest";
import {
  LABEL_EXPLAIN,
  REASON_EXPLAIN,
  REGIME_EXPLAIN,
  ROUTED_VIA_EXPLAIN,
  SIGNAL_EXPLAIN,
  SIGNAL_MEANING,
} from "./explain-copy";
import { REGIMES } from "./models";

describe("explainer copy completeness", () => {
  it("covers every regime", () => {
    for (const regime of REGIMES) {
      expect(REGIME_EXPLAIN[regime]).toBeTruthy();
    }
  });

  it("covers every context selection reason", () => {
    for (const reason of [
      "critical",
      "same-topic",
      "recent",
      "included",
      "off-topic",
      "dismissed",
      "empty",
    ] as const) {
      expect(REASON_EXPLAIN[reason]).toBeTruthy();
    }
  });

  it("covers both overridable signals and all routing states", () => {
    expect(SIGNAL_EXPLAIN.critical).toBeTruthy();
    expect(SIGNAL_EXPLAIN.dismissed).toBeTruthy();
    // Popover meaning covers every STATE, including default.
    for (const level of ["critical", "default", "dismissed"] as const) {
      expect(SIGNAL_MEANING[level]).toBeTruthy();
    }
    for (const via of ["kongen", "pinned", "default"] as const) {
      expect(ROUTED_VIA_EXPLAIN[via]).toBeTruthy();
    }
  });

  it("uses the Pin/Ignore vocabulary, never 'flagged'/'dismissed', user-facing", () => {
    const all = [
      ...Object.values(REGIME_EXPLAIN),
      ...Object.values(REASON_EXPLAIN),
      ...Object.values(SIGNAL_EXPLAIN),
      ...Object.values(SIGNAL_MEANING),
      ...Object.values(ROUTED_VIA_EXPLAIN),
      ...Object.values(LABEL_EXPLAIN),
    ].join(" ");
    expect(all.toLowerCase()).not.toContain("flagged");
    expect(all.toLowerCase()).not.toContain("dismissed");
    expect(all.toLowerCase()).not.toContain("cheap");
    // Pinned-message vs pinned-model disambiguation present.
    expect(SIGNAL_EXPLAIN.critical).toContain("pinning a model");
    expect(ROUTED_VIA_EXPLAIN.pinned).toContain("pinning a message");
  });

  it("names the context states Smart Reference / Full history (chip copy)", () => {
    // The chip is a state indicator, and its copy ties
    // the chain view to what Smart Reference selected.
    expect(LABEL_EXPLAIN.smartReferenceChip).toContain("Smart Reference");
    expect(LABEL_EXPLAIN.smartReferenceChip).toContain("chain view");
    expect(LABEL_EXPLAIN.fullHistoryChip).toContain("Smart Reference");
    // Cost popover fallback line exists (comparison needs a routed reply).
    expect(LABEL_EXPLAIN.costNoBaseline).toContain("routed reply");
  });

  it("brands the savings surface Kongen Routing, powered by Kongen Logic", () => {
    expect(LABEL_EXPLAIN.kongenRouting).toContain("Kongen Routing");
    expect(LABEL_EXPLAIN.kongenRouting).toContain("Kongen Logic");
    // Retired claim must not resurface in explainer copy.
    const all = Object.values(LABEL_EXPLAIN).join(" ").toLowerCase();
    expect(all).not.toContain("no login");
  });
});
