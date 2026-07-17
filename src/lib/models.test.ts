import { describe, expect, it } from "vitest";
import {
  FLAGSHIP_MODELS,
  PROVIDER_MODELS,
  PROVIDERS,
  REGIMES,
  defaultModel,
  estimateSavings,
  findModelProvider,
  flagshipFor,
  pickModel,
} from "./models";

describe("routing table port", () => {
  it("covers every regime when all providers are available", () => {
    for (const regime of REGIMES) {
      const picked = pickModel(regime, PROVIDERS);
      expect(picked.spec.regimes).toContain(regime);
    }
  });

  it("picks the cheapest capable model (mirror of routing.py)", () => {
    // trivial with all providers → gemini-2.0-flash-lite (0.075 + 0.30)
    expect(pickModel("trivial", PROVIDERS).model).toBe("gemini-2.0-flash-lite");
    // exhaustive with all providers → deepseek-reasoner (0.55 + 2.19)
    expect(pickModel("exhaustive", PROVIDERS).model).toBe("deepseek-reasoner");
  });

  it("respects provider availability", () => {
    const picked = pickModel("moderate", ["anthropic"]);
    expect(picked.provider).toBe("anthropic");
    expect(picked.model).toBe("claude-sonnet-4-6");
  });

  it("respects provider preference", () => {
    const picked = pickModel("deep", PROVIDERS, "openai");
    expect(picked.provider).toBe("openai");
    // cheapest deep on openai is o3-mini (1.10 + 4.40) vs gpt-4o (2.5 + 10)
    expect(picked.model).toBe("o3-mini");
  });

  it("throws when no provider covers the regime", () => {
    expect(() => pickModel("deep", [])).toThrow(/No model available/);
  });

  it("finds a pinned model's provider", () => {
    const picked = findModelProvider("claude-opus-4-6", PROVIDERS);
    expect(picked.provider).toBe("anthropic");
    expect(() => findModelProvider("claude-opus-4-6", ["openai"])).toThrow(
      /not found/,
    );
  });

  it("flagship baseline = latest frontier of CONFIGURED providers only", () => {
    // Anthropic configured → baseline is Claude Fable 5 (baseline-only,
    // never a routing candidate).
    expect(flagshipFor(["anthropic"])?.model).toBe("claude-fable-5");
    expect(FLAGSHIP_MODELS.anthropic.inputCost).toBe(10.0);
    expect(FLAGSHIP_MODELS.anthropic.outputCost).toBe(50.0);
    expect(
      PROVIDER_MODELS.anthropic.find((m) => m.name === "claude-fable-5"),
    ).toBeUndefined();
    // Priciest flagship wins across providers.
    expect(flagshipFor(PROVIDERS)?.model).toBe("claude-fable-5");
    expect(flagshipFor(["deepseek"])?.model).toBe("deepseek-reasoner");
    // Honesty rule: no keys → no baseline, no claimed savings.
    expect(flagshipFor([])).toBeNull();
  });

  it("estimates savings vs the latest-frontier baseline (Fable 5 w/ Anthropic)", () => {
    const sonnet = PROVIDER_MODELS.anthropic.find(
      (m) => m.name === "claude-sonnet-4-6",
    )!;
    const { costUsd, savingsPct } = estimateSavings(
      sonnet,
      1_000_000,
      1_000_000,
      ["anthropic"],
    );
    // sonnet: 3 + 15 = 18 ; baseline Fable 5: 10 + 50 = 60 → 70% saved
    expect(costUsd).toBeCloseTo(18, 6);
    expect(savingsPct).toBe(70);
  });

  it("baseline honours provider availability (deepseek-only)", () => {
    const cheap = PROVIDER_MODELS.deepseek[0]; // deepseek-chat 0.14 + 0.28
    const { savingsPct } = estimateSavings(cheap, 1_000_000, 1_000_000, [
      "deepseek",
    ]);
    // baseline = deepseek-reasoner (0.55 + 2.19 = 2.74), NOT Fable 5
    expect(savingsPct).toBe(Math.round((1 - 0.42 / 2.74) * 100));
  });

  it("clamps savings to 0 when the flagship itself answered", () => {
    const o3 = PROVIDER_MODELS.openai.find((m) => m.name === "o3")!;
    // openai-only: baseline is o3 itself → no claimed savings.
    expect(estimateSavings(o3, 1000, 1000, ["openai"]).savingsPct).toBe(0);
    // With Anthropic configured too, o3 vs Fable 5 shows a real delta.
    expect(
      estimateSavings(o3, 1_000_000, 1_000_000, PROVIDERS).savingsPct,
    ).toBe(Math.round((1 - 50 / 60) * 100));
  });

  it("defaultModel honours the user default and falls back sanely", () => {
    expect(defaultModel(PROVIDERS, "claude-sonnet-4-6").model).toBe(
      "claude-sonnet-4-6",
    );
    // user default's provider missing → cheapest moderate among available
    expect(defaultModel(["deepseek"], "claude-sonnet-4-6").model).toBe(
      "deepseek-chat",
    );
    // no user default → cheapest moderate
    expect(defaultModel(["anthropic"]).model).toBe("claude-sonnet-4-6");
  });
});
