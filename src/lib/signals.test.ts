import { describe, expect, it } from "vitest";
import { SIGNAL_OPTIONS, applySignal, type SignalLevel } from "./signals";
import { selectContext, type MessageLike } from "./context";
import { SIGNAL_MEANING } from "./explain-copy";

describe("signal vocabulary (SIGNAL_OPTIONS)", () => {
  it("exposes Pin / Default / Ignore over the unchanged internal levels", () => {
    expect(SIGNAL_OPTIONS.map((o) => o.level)).toEqual([
      "critical",
      "default",
      "dismissed",
    ]);
    expect(SIGNAL_OPTIONS.map((o) => o.label)).toEqual([
      "Pin",
      "Default",
      "Ignore",
    ]);
  });

  it("never leaks the retired Flag/Dismiss labels user-facing", () => {
    const labels = SIGNAL_OPTIONS.map((o) => o.label.toLowerCase()).join(" ");
    expect(labels).not.toContain("flag");
    expect(labels).not.toContain("dismiss");
  });

  it("has a one-line meaning for every state, including default", () => {
    for (const { level } of SIGNAL_OPTIONS) {
      expect(SIGNAL_MEANING[level]).toBeTruthy();
    }
  });
});

describe("applySignal", () => {
  const messages = [
    { id: "m1", signal: "default" as SignalLevel, content: "a" },
    { id: "m2", signal: "critical" as SignalLevel, content: "b" },
  ];

  it("updates only the target message, immutably", () => {
    const next = applySignal(messages, "m1", "dismissed");
    expect(next).not.toBe(messages);
    expect(next[0].signal).toBe("dismissed");
    expect(messages[0].signal).toBe("default"); // input untouched
    // untouched message keeps identity (memoized bubbles don't re-render)
    expect(next[1]).toBe(messages[1]);
  });

  it("is a no-op on unknown ids", () => {
    const next = applySignal(messages, "nope", "critical");
    expect(next).toEqual(messages);
    expect(next[0]).toBe(messages[0]);
    expect(next[1]).toBe(messages[1]);
  });

  it("round-trips back to default", () => {
    const pinned = applySignal(messages, "m1", "critical");
    const reverted = applySignal(pinned, "m1", "default");
    expect(reverted[0].signal).toBe("default");
  });
});

describe("signal-change wiring → context selection (popover control path)", () => {
  // Three topics so the oldest turn falls outside the 2-user-turn recency
  // net — its inclusion state is then driven purely by its signal.
  const history: (MessageLike & { signal: SignalLevel })[] = [
    { id: "u1", role: "user", content: "Tell me about sourdough bread starters and flour hydration", signal: "default" },
    { id: "a1", role: "assistant", content: "Sourdough starters ferment flour and water into a bubbly culture.", signal: "default" },
    { id: "u2", role: "user", content: "List some famous lighthouses on the Portuguese coast", signal: "default" },
    { id: "a2", role: "assistant", content: "Cabo da Roca and Cabo de São Vicente host famous lighthouses.", signal: "default" },
    { id: "u3", role: "user", content: "Recommend some jazz albums from the sixties era", signal: "default" },
    { id: "a3", role: "assistant", content: "Try Kind of Blue and A Love Supreme, both landmark jazz albums.", signal: "default" },
  ];
  const prompt = "Which jazz musicians played on those albums";

  const reasonOf = (sel: ReturnType<typeof selectContext>, id: string) =>
    [...sel.forwarded, ...sel.dropped].find((l) => l.id === id)?.reason;

  it("baseline: the old off-topic turn is not forwarded", () => {
    const sel = selectContext(history, prompt);
    expect(reasonOf(sel, "u1")).toBe("off-topic");
    expect(sel.turns.some((t) => t.content === history[0].content)).toBe(false);
  });

  it("Pin from the popover → forwarded as critical (chip, chain view, payload agree)", () => {
    const pinned = applySignal(history, "u1", "critical");
    const sel = selectContext(pinned, prompt);
    // chain view / drawer label
    expect(reasonOf(sel, "u1")).toBe("critical");
    // actual payload
    expect(sel.turns.some((t) => t.content === history[0].content)).toBe(true);
  });

  it("Ignore from the popover → dropped as dismissed, even in full-history scope", () => {
    const ignored = applySignal(history, "a3", "dismissed");
    for (const scope of ["relevant", "everything"] as const) {
      const sel = selectContext(ignored, prompt, { scope });
      expect(reasonOf(sel, "a3")).toBe("dismissed");
      expect(sel.turns.some((t) => t.content === history[5].content)).toBe(false);
    }
  });

  it("Default from the popover → reverts to topic-based selection", () => {
    const pinned = applySignal(history, "u1", "critical");
    const reverted = applySignal(pinned, "u1", "default");
    const sel = selectContext(reverted, prompt);
    expect(reasonOf(sel, "u1")).toBe("off-topic");
  });
});
