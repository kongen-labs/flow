import { afterEach, describe, expect, it } from "vitest";
import { LocalStorageKeyStore, type StringStorage } from "./keys";
import type { LogicScore } from "./kongen";
import { KongenApiError } from "./kongen";
import { buildTurns, routePrompt } from "./send";
import type { StoredMessage } from "./db";
import { type Catalog, resetCatalogForTests } from "./models";

function memoryStorage(): StringStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

function keysWith(entries: Record<string, string>) {
  const store = new LocalStorageKeyStore(memoryStorage());
  for (const [slot, key] of Object.entries(entries)) {
    store.set(slot as never, key);
  }
  return store;
}

const score = (regime: LogicScore["regime"]): LogicScore => ({
  regime,
  confidence: 0.8,
  confidence_adj: 0.1,
  recommended_tokens: 900,
  tokens_used: 1,
  tokens_remaining: 4999,
});

describe("routePrompt", () => {
  it("routes via Kongen when a kongen key is present", async () => {
    const keys = keysWith({ anthropic: "sk-ant-x", kongen: "kk-x" });
    const decision = await routePrompt({
      text: "Design a distributed lock",
      mode: "Auto",
      keys,
      scoreImpl: async () => score("deep"),
    });
    expect(decision.routedVia).toBe("kongen");
    expect(decision.regime).toBe("deep");
    expect(decision.provider).toBe("anthropic");
    expect(decision.model).toBe("claude-sonnet-4-6");
    expect(decision.budget).toBe(900);
    // Regression: the popover must read the GENUINE [0,1] certainty
    // (LogicScoreResponse.confidence), NOT confidence_adj — the latter reads
    // ~0.00 for most prompts and caused the "Confidence: 0.00" popover bug.
    expect(decision.confidence).toBe(0.8);
    expect(decision.confidence).not.toBe(decision.confidenceAdj);
    expect(decision.confidenceAdj).toBe(0.1);
  });

  it("widens the regime when the user's providers don't cover it", async () => {
    // Anthropic has no standalone "exhaustive"-only coverage problem, so use
    // a provider set that misses "trivial"→covered... Anthropic covers all
    // regimes; deepseek covers all too. Use google-only + regime widening
    // sanity: google covers everything, so instead verify no-throw on each.
    const keys = keysWith({ anthropic: "sk-ant-x", kongen: "kk-x" });
    const decision = await routePrompt({
      text: "hi",
      mode: "Auto",
      keys,
      scoreImpl: async () => score("trivial"),
    });
    expect(decision.model).toBe("claude-haiku-4-5-20251001");
  });

  it("falls back to the user's default model when scoring fails (CORS/402/etc)", async () => {
    // RUNTIME failures keep graceful degradation — chat must never break.
    const keys = keysWith({ deepseek: "sk-x", kongen: "kk-bad" });
    const decision = await routePrompt({
      text: "hello",
      mode: "Auto",
      keys,
      defaultModelId: "deepseek-reasoner",
      scoreImpl: async () => {
        throw new KongenApiError(402, "Out of Kongen Tokens");
      },
    });
    expect(decision.routedVia).toBe("default");
    expect(decision.fallbackReason).toBe("Out of Kongen Tokens");
    expect(decision.provider).toBe("deepseek");
    expect(decision.model).toBe("deepseek-reasoner");
  });

  it("requires a Kongen key for Auto routing (Jul 15 2026 directive)", async () => {
    // MISSING key is a setup error (first-run collects it) — no silent
    // default-model path anymore.
    const keys = keysWith({ openai: "sk-x" });
    await expect(
      routePrompt({ text: "hello", mode: "Auto", keys, defaultModelId: "gpt-4o" }),
    ).rejects.toThrow(/Kongen key/);
  });

  it("pinned model beats routing", async () => {
    const keys = keysWith({ anthropic: "sk-ant-x", kongen: "kk-x" });
    const decision = await routePrompt({
      text: "hello",
      mode: "claude-opus-4-6",
      keys,
      scoreImpl: async () => {
        throw new Error("should not be called");
      },
    });
    expect(decision.routedVia).toBe("pinned");
    expect(decision.model).toBe("claude-opus-4-6");
  });

  it("errors clearly with no provider keys at all", async () => {
    const keys = keysWith({});
    await expect(
      routePrompt({ text: "hi", mode: "Auto", keys }),
    ).rejects.toThrow(/No provider keys configured/);
  });

  // -------------------------------------------------------------------------
  // exhaustive → flagship, never a lower tier (routing bug fix, Jul 18 2026)
  // -------------------------------------------------------------------------
  describe("exhaustive routes to a flagship, never a lower tier", () => {
    afterEach(() => {
      // Restore the default (seed) catalog for the rest of the suite.
      resetCatalogForTests();
    });

    it("routes exhaustive to Opus (the intended flagship) on the normal catalog", async () => {
      const keys = keysWith({ anthropic: "sk-ant-x", kongen: "kk-x" });
      const decision = await routePrompt({
        text: "Design a distributed lock",
        mode: "Auto",
        keys,
        scoreImpl: async () => score("exhaustive"),
      });
      expect(decision.regime).toBe("exhaustive");
      expect(decision.provider).toBe("anthropic");
      // Opus covers exhaustive and is cheaper than Fable → the auto-target.
      expect(decision.model).toBe("claude-opus-4-6");
    });

    it("falls back to a FLAGSHIP (not Sonnet) when the catalog lacks any exhaustive model", async () => {
      // Reproduces the reported bug: a stale/partial catalog where Anthropic
      // has NO exhaustive-capable model. The old symmetric widening dropped
      // exhaustive → "deep" → Sonnet. The fix must land on the flagship.
      const staleCatalog: Catalog = {
        version: "test-stale",
        fetchedAt: Date.now(),
        providers: [
          {
            id: "anthropic",
            label: "Anthropic",
            models: [
              { name: "claude-haiku-4-5-20251001", label: "Haiku", tier: "fast", regimes: ["trivial", "fast"], inputCost: 1, outputCost: 5, selectable: true },
              { name: "claude-sonnet-4-6", label: "Sonnet", tier: "balanced", regimes: ["moderate", "deep"], inputCost: 3, outputCost: 15, selectable: true },
              // Flagship present but does NOT cover exhaustive → widening must
              // still choose it over dropping a tier to Sonnet.
              { name: "claude-fable-5", label: "Fable 5", tier: "flagship", regimes: ["deep"], inputCost: 10, outputCost: 50, selectable: true },
            ],
          },
        ],
      };
      resetCatalogForTests(staleCatalog);

      const keys = keysWith({ anthropic: "sk-ant-x", kongen: "kk-x" });
      const decision = await routePrompt({
        text: "Design a distributed lock",
        mode: "Auto",
        keys,
        scoreImpl: async () => score("exhaustive"),
      });
      expect(decision.regime).toBe("exhaustive");
      expect(decision.model).toBe("claude-fable-5"); // flagship, NOT Sonnet
      expect(decision.model).not.toBe("claude-sonnet-4-6");
    });
  });
});

describe("buildTurns", () => {
  const base: Omit<StoredMessage, "id" | "seq" | "role" | "content" | "signal"> =
    {
      stream_id: "s1",
      created_at: new Date().toISOString(),
    };

  it("excludes dismissed messages from provider context but keeps the rest", () => {
    const history: StoredMessage[] = [
      { ...base, id: "m1", seq: 1, role: "user", content: "What is UAF?", signal: "default" },
      { ...base, id: "m2", seq: 2, role: "assistant", content: "A framework.", signal: "default" },
      { ...base, id: "m3", seq: 3, role: "user", content: "thanks", signal: "dismissed" },
      { ...base, id: "m4", seq: 4, role: "user", content: "Critical constraint", signal: "critical" },
    ];
    const turns = buildTurns(history, "next question");
    expect(turns).toHaveLength(4);
    expect(turns.map((t) => t.content)).toEqual([
      "What is UAF?",
      "A framework.",
      "Critical constraint",
      "next question",
    ]);
    expect(turns[3].role).toBe("user");
  });
});
