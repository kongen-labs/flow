import { describe, expect, it } from "vitest";
import {
  isAnaphoricFollowUp,
  isForwarded,
  selectContext,
  type MessageLike,
} from "./context";
import { buildTurns } from "./send";
import type { StoredMessage } from "./db";

function msg(
  id: string,
  role: "user" | "assistant",
  content: string,
  signal: "critical" | "default" | "dismissed" = "default",
): StoredMessage {
  return {
    id,
    stream_id: "s1",
    seq: Number(id.replace(/\D/g, "")) || 0,
    role,
    content,
    signal,
    created_at: new Date().toISOString(),
  };
}

describe("isForwarded", () => {
  it("forwards default and critical, drops dismissed and empty", () => {
    expect(isForwarded({ content: "hello", signal: "default" })).toBe(true);
    expect(isForwarded({ content: "use redis", signal: "critical" })).toBe(true);
    expect(isForwarded({ content: "thanks", signal: "dismissed" })).toBe(false);
    expect(isForwarded({ content: "   ", signal: "default" })).toBe(false);
    expect(isForwarded({ content: "hello" })).toBe(true); // legacy, no signal
  });
});

describe("isAnaphoricFollowUp", () => {
  it("treats short and pronoun-leaning follow-ups as anaphoric", () => {
    expect(isAnaphoricFollowUp("do you bake or boil it?")).toBe(true);
    expect(isAnaphoricFollowUp("how fast do they go?")).toBe(true);
    expect(isAnaphoricFollowUp("thanks")).toBe(true);
    expect(
      isAnaphoricFollowUp("What birds migrate through Kansas in spring?"),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multi-topic scenario: six unrelated topics in one conversation.
// ---------------------------------------------------------------------------

const MULTI_TOPIC_HISTORY: StoredMessage[] = [
  msg("u1", "user", "Summarize this meeting transcript: we agreed to ship the beta in March"),
  msg("a1", "assistant", "The team agreed to ship the beta in March and assign QA ownership to Dana."),
  msg("u2", "user", "Tell me about Turkish Van cats"),
  msg("a2", "assistant", "Turkish Van cats are rare swimmers with chalky white coats and amber eyes."),
  msg("u3", "user", "What's the best pasta shape for carbonara?"),
  msg("a3", "assistant", "Spaghetti or rigatoni carry carbonara sauce well; guanciale is essential."),
  msg("u4", "user", "do you bake or boil it?"), // anaphoric → pasta chain
  msg("a4", "assistant", "Boil it — carbonara finishes in the pan, never baked."),
  msg("u5", "user", "What birds migrate through Kansas in spring?"),
  msg("a5", "assistant", "Sandhill cranes and warblers migrate through Kansas every spring."),
  msg("u6", "user", "Plan a week-long trip to Peru"),
  msg("a6", "assistant", "Lima, Cusco, and Machu Picchu fill a week in Peru nicely."),
  msg("u7", "user", "How do maglev trains work?"),
  msg("a7", "assistant", "Maglev trains levitate on magnetic fields, eliminating rail friction."),
  msg("u8", "user", "how fast do they go?"), // anaphoric → maglev chain
  msg("a8", "assistant", "Shanghai's maglev runs 431 km/h; the L0 prototype hit 603 km/h."),
];

describe("selectContext — relevance scope (multi-topic scenario)", () => {
  it("a maglev follow-up keeps the maglev chain + recency, excludes cats/pasta/Peru", () => {
    const sel = selectContext(
      MULTI_TOPIC_HISTORY,
      "Could maglev trains work between US cities?",
    );
    const forwardedIds = sel.forwarded.map((l) => l.id);
    const droppedIds = sel.dropped.map((l) => l.id);

    // The maglev chain (incl. the anaphoric "how fast do they go?").
    expect(forwardedIds).toEqual(["u7", "a7", "u8", "a8"]);
    // Everything else is out, with the trust-surface reason.
    for (const id of ["u1", "a1", "u2", "a2", "u3", "a3", "u4", "a4", "u5", "a5", "u6", "a6"]) {
      expect(droppedIds).toContain(id);
    }
    expect(sel.dropped.every((l) => l.reason === "off-topic")).toBe(true);
    expect(sel.turns[sel.turns.length - 1].content).toBe(
      "Could maglev trains work between US cities?",
    );
  });

  it("pasta chain reunites incl. the 'bake or boil it?' pronoun follow-up", () => {
    const sel = selectContext(
      MULTI_TOPIC_HISTORY,
      "Which pasta shape holds the most sauce?",
    );
    const reason = (id: string) =>
      [...sel.forwarded, ...sel.dropped].find((l) => l.id === id)?.reason;

    expect(reason("u3")).toBe("same-topic");
    expect(reason("a3")).toBe("same-topic");
    expect(reason("u4")).toBe("same-topic"); // never orphaned
    expect(reason("a4")).toBe("same-topic");
    // Recency safety net rides along regardless of topic.
    expect(reason("u7")).toBe("recent");
    expect(reason("a8")).toBe("recent");
    // Unrelated topics stay home.
    expect(reason("u2")).toBe("off-topic");
    expect(reason("u6")).toBe("off-topic");
  });

  it("an anaphoric new prompt joins the most recent chain", () => {
    const sel = selectContext(MULTI_TOPIC_HISTORY, "should I try riding it someday?");
    const forwardedIds = sel.forwarded.map((l) => l.id);
    expect(forwardedIds).toEqual(["u7", "a7", "u8", "a8"]); // maglev
  });

  it("a fresh topic sends only the recency window", () => {
    const sel = selectContext(MULTI_TOPIC_HISTORY, "What is the capital of Mongolia?");
    expect(sel.forwarded.map((l) => l.id)).toEqual(["u7", "a7", "u8", "a8"]);
    expect(sel.forwarded.every((l) => l.reason === "recent")).toBe(true);
  });

  it("critical (flame) messages are forwarded from anywhere", () => {
    const history = MULTI_TOPIC_HISTORY.map((m) =>
      m.id === "u1" ? { ...m, signal: "critical" as const } : m,
    );
    const sel = selectContext(history, "Could maglev trains work between US cities?");
    const u1 = sel.forwarded.find((l) => l.id === "u1");
    expect(u1?.reason).toBe("critical");
  });

  it("dismissed (ghost) always wins over every inclusion rule", () => {
    const history = MULTI_TOPIC_HISTORY.map((m) =>
      m.id === "a8" ? { ...m, signal: "dismissed" as const } : m,
    );
    // a8 is in the matched chain AND the recency window — still out.
    const sel = selectContext(history, "Could maglev trains work between US cities?");
    expect(sel.forwarded.map((l) => l.id)).toEqual(["u7", "a7", "u8"]);
    expect(sel.dropped.find((l) => l.id === "a8")?.reason).toBe("dismissed");
  });
});

describe("selectContext — everything scope (escape hatch) + mechanics", () => {
  const history: StoredMessage[] = [
    msg("m1", "user", "Design a schema for orders", "critical"),
    msg("m2", "assistant", "Here is a normalized design ..."),
    msg("m3", "user", "thanks", "dismissed"),
    msg("m4", "user", ""),
    msg("m5", "user", "Now add soft deletes"),
  ];

  it("everything scope keeps all except dismissed/empty (v1 rule)", () => {
    const sel = selectContext(history, "next", { scope: "everything" });
    expect(sel.forwarded.map((l) => l.id)).toEqual(["m1", "m2", "m5"]);
    expect(sel.dropped.map((l) => l.id)).toEqual(["m3", "m4"]);
    const reason = (id: string) =>
      [...sel.forwarded, ...sel.dropped].find((l) => l.id === id)?.reason;
    expect(reason("m1")).toBe("critical");
    expect(reason("m2")).toBe("included");
    expect(reason("m3")).toBe("dismissed");
    expect(reason("m4")).toBe("empty");
    expect(sel.total).toBe(5);
    expect(sel.forwarded.length + sel.dropped.length).toBe(5);
  });

  it("no new prompt (chain-viewer edge) falls back to the v1 rule", () => {
    const sel = selectContext(history);
    expect(sel.forwarded.map((l) => l.id)).toEqual(["m1", "m2", "m5"]);
    expect(sel.turns).toHaveLength(3);
  });

  it("IS the send path: buildTurns delegates to the same selection", () => {
    // If these ever diverge, the chain view would lie about the payload.
    expect(buildTurns(MULTI_TOPIC_HISTORY, "Could maglev trains work between US cities?")).toEqual(
      selectContext(MULTI_TOPIC_HISTORY, "Could maglev trains work between US cities?").turns,
    );
    expect(buildTurns(history, "next", "everything")).toEqual(
      selectContext(history, "next", { scope: "everything" }).turns,
    );
  });

  it("per-send override: one full-history send, then back to relevant", () => {
    const prompt = "Could maglev trains work between US cities?";
    // The override send forwards everything except dismissed/empty...
    const overridden = buildTurns(MULTI_TOPIC_HISTORY, prompt, "everything");
    expect(overridden).toHaveLength(MULTI_TOPIC_HISTORY.length + 1); // + new prompt
    expect(overridden).toEqual(
      selectContext(MULTI_TOPIC_HISTORY, prompt, { scope: "everything" }).turns,
    );
    // ...while the next send (no override) is relevance-scoped again.
    const next = buildTurns(MULTI_TOPIC_HISTORY, prompt);
    expect(next).toHaveLength(5); // maglev chain (4) + new prompt
    expect(next).toEqual(selectContext(MULTI_TOPIC_HISTORY, prompt).turns);
  });

  it("truncates long previews to ~80 chars and flattens whitespace", () => {
    const long = msg("m9", "user", `line one\nline two ${"x".repeat(120)}`);
    const sel = selectContext([long], "next", { scope: "everything" });
    expect(sel.forwarded[0].preview.length).toBeLessThanOrEqual(81);
    expect(sel.forwarded[0].preview).not.toContain("\n");
  });

  it("handles old local data with missing signal field", () => {
    const legacy = {
      id: "old1",
      role: "user",
      content: "pre-signal message",
    } as MessageLike;
    const sel = selectContext([legacy], "next", { scope: "everything" });
    expect(sel.forwarded).toHaveLength(1);
    expect(sel.forwarded[0].reason).toBe("included");
  });
});
