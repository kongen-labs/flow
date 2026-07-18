import { beforeEach, describe, expect, it } from "vitest";
import {
  CATALOG_CACHE_KEY,
  SEED_CATALOG,
  PROVIDERS,
  REGIMES,
  defaultModel,
  estimateSavings,
  findModelProvider,
  flagshipFor,
  formatModelName,
  getCatalog,
  loadCachedCatalog,
  mapEndpointCatalog,
  modelsForProvider,
  pickModel,
  refreshCatalog,
  resetCatalogForTests,
} from "./models";

/** In-memory Storage stand-in for the node test env (no localStorage). */
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    _map: m,
  };
}

/** Minimal fetch stub. */
function okFetch(payload: unknown): typeof fetch {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

// A representative /v1/models payload, including a NEW model the client has
// never heard of (claude-neo-9) to prove server-added models flow through.
const ENDPOINT_PAYLOAD = {
  version: "2026-07-17.1",
  providers: [
    {
      id: "anthropic",
      label: "Anthropic",
      models: [
        { id: "claude-fable-5", label: "Fable 5", tier: "flagship", input_per_mtok: 10, output_per_mtok: 50, selectable: true, regimes: ["deep", "exhaustive"] },
        { id: "claude-sonnet-4-6", label: "Sonnet", input_per_mtok: 3, output_per_mtok: 15, selectable: true, regimes: ["moderate", "deep"] },
        { id: "claude-neo-9", label: "Neo 9", tier: "flagship", input_per_mtok: 12, output_per_mtok: 60, selectable: true, regimes: ["exhaustive"] },
      ],
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      models: [
        { id: "deepseek-reasoner", label: "DeepSeek R1", tier: "flagship", input_per_mtok: 0.55, output_per_mtok: 2.19, selectable: true, regimes: ["deep", "exhaustive"] },
      ],
    },
  ],
};

// Every routing test runs against the bundled SEED catalog (mirrors the state
// on load before any /v1/models fetch resolves).
beforeEach(() => {
  resetCatalogForTests();
});

describe("bundled seed catalog", () => {
  it("includes claude-fable-5 as a selectable Anthropic flagship (fixes 'no Fable')", () => {
    const fable = modelsForProvider("anthropic").find(
      (m) => m.name === "claude-fable-5",
    );
    expect(fable).toBeDefined();
    expect(fable!.selectable).toBe(true);
    expect(fable!.tier).toBe("flagship");
    expect(fable!.label).toBe("Fable 5");
    expect(fable!.inputCost).toBe(10.0);
    expect(fable!.outputCost).toBe(50.0);
    // The seed is what ships before the endpoint deploys.
    expect(getCatalog().version).toBe("seed");
    expect(SEED_CATALOG.providers.map((p) => p.id)).toEqual(PROVIDERS);
  });

  it("Fable is pinnable but never the Auto pick (priciest never wins on cost)", () => {
    // Pinnable via the picker path.
    expect(findModelProvider("claude-fable-5", ["anthropic"]).model).toBe(
      "claude-fable-5",
    );
    // Auto exhaustive on Anthropic → Opus (30) beats Fable (60).
    expect(pickModel("exhaustive", ["anthropic"]).model).toBe("claude-opus-4-6");
  });
});

describe("routing over the live catalog", () => {
  it("covers every regime when all providers are available", () => {
    for (const regime of REGIMES) {
      const picked = pickModel(regime, PROVIDERS);
      expect(picked.spec.regimes).toContain(regime);
    }
  });

  it("picks the lowest-cost capable model", () => {
    expect(pickModel("trivial", PROVIDERS).model).toBe("gemini-2.0-flash-lite");
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
    expect(flagshipFor(["anthropic"])?.model).toBe("claude-fable-5");
    expect(flagshipFor(["anthropic"])?.spec.inputCost).toBe(10.0);
    expect(flagshipFor(["anthropic"])?.spec.outputCost).toBe(50.0);
    expect(flagshipFor(PROVIDERS)?.model).toBe("claude-fable-5");
    expect(flagshipFor(["deepseek"])?.model).toBe("deepseek-reasoner");
    expect(flagshipFor([])).toBeNull();
  });

  it("estimates savings vs the latest-frontier baseline (Fable 5 w/ Anthropic)", () => {
    const sonnet = modelsForProvider("anthropic").find(
      (m) => m.name === "claude-sonnet-4-6",
    )!;
    const { costUsd, savingsPct } = estimateSavings(
      sonnet,
      1_000_000,
      1_000_000,
      ["anthropic"],
    );
    // sonnet 18 vs Fable 5 baseline 60 → 70% saved.
    expect(costUsd).toBeCloseTo(18, 6);
    expect(savingsPct).toBe(70);
  });

  it("baseline honours provider availability (deepseek-only)", () => {
    const cheap = modelsForProvider("deepseek")[0]; // deepseek-chat 0.14 + 0.28
    const { savingsPct } = estimateSavings(cheap, 1_000_000, 1_000_000, [
      "deepseek",
    ]);
    expect(savingsPct).toBe(Math.round((1 - 0.42 / 2.74) * 100));
  });

  it("clamps savings to 0 when the flagship itself answered", () => {
    const o3 = modelsForProvider("openai").find((m) => m.name === "o3")!;
    expect(estimateSavings(o3, 1000, 1000, ["openai"]).savingsPct).toBe(0);
    expect(
      estimateSavings(o3, 1_000_000, 1_000_000, PROVIDERS).savingsPct,
    ).toBe(Math.round((1 - 50 / 60) * 100));
  });

  it("defaultModel honours the user default and falls back sanely", () => {
    expect(defaultModel(PROVIDERS, "claude-sonnet-4-6").model).toBe(
      "claude-sonnet-4-6",
    );
    expect(defaultModel(["deepseek"], "claude-sonnet-4-6").model).toBe(
      "deepseek-chat",
    );
    expect(defaultModel(["anthropic"]).model).toBe("claude-sonnet-4-6");
  });

  it("formatModelName reads the catalog label, falling back to the id", () => {
    expect(formatModelName("claude-fable-5")).toBe("Fable 5");
    expect(formatModelName("deepseek-reasoner")).toBe("DeepSeek R1");
    expect(formatModelName("totally-unknown-id")).toBe("totally-unknown-id");
  });
});

describe("mapEndpointCatalog", () => {
  it("maps a well-formed payload into the internal catalog shape", () => {
    const cat = mapEndpointCatalog(ENDPOINT_PAYLOAD)!;
    expect(cat).not.toBeNull();
    expect(cat.version).toBe("2026-07-17.1");
    expect(typeof cat.fetchedAt).toBe("number");
    const anthropic = cat.providers.find((p) => p.id === "anthropic")!;
    const fable = anthropic.models.find((m) => m.name === "claude-fable-5")!;
    expect(fable.inputCost).toBe(10);
    expect(fable.outputCost).toBe(50);
    expect(fable.regimes).toEqual(["deep", "exhaustive"]);
    expect(fable.selectable).toBe(true);
  });

  it("ignores unknown providers and unknown regimes without crashing", () => {
    const cat = mapEndpointCatalog({
      version: "x",
      providers: [
        { id: "quantum-corp", models: [{ id: "q1", input_per_mtok: 1, output_per_mtok: 1, regimes: ["deep"] }] },
        { id: "anthropic", models: [{ id: "claude-x", input_per_mtok: 1, output_per_mtok: 1, regimes: ["deep", "cosmic"] }] },
      ],
    })!;
    expect(cat.providers.map((p) => p.id)).toEqual(["anthropic"]);
    expect(cat.providers[0].models[0].regimes).toEqual(["deep"]); // "cosmic" filtered
  });

  it("returns null for an unusable payload", () => {
    expect(mapEndpointCatalog(null)).toBeNull();
    expect(mapEndpointCatalog({})).toBeNull();
    expect(mapEndpointCatalog({ providers: "nope" })).toBeNull();
    expect(mapEndpointCatalog({ providers: [] })).toBeNull();
  });
});

describe("refreshCatalog + cache + offline fallback", () => {
  it("adopts and caches a fetched catalog on success", async () => {
    const storage = fakeStorage();
    const res = await refreshCatalog({
      fetchImpl: okFetch(ENDPOINT_PAYLOAD),
      storage,
    });
    expect(res.ok).toBe(true);
    expect(getCatalog().version).toBe("2026-07-17.1");
    // Persisted for the next (possibly offline) load.
    expect(storage._map.has(CATALOG_CACHE_KEY)).toBe(true);
  });

  it("server-added model appears with NO code change after a refresh", async () => {
    await refreshCatalog({ fetchImpl: okFetch(ENDPOINT_PAYLOAD) });
    // claude-neo-9 was never in the client seed — it flows straight through.
    const neo = modelsForProvider("anthropic").find(
      (m) => m.name === "claude-neo-9",
    );
    expect(neo).toBeDefined();
    expect(neo!.selectable).toBe(true); // renders in the picker
    expect(formatModelName("claude-neo-9")).toBe("Neo 9");
    expect(findModelProvider("claude-neo-9", ["anthropic"]).model).toBe(
      "claude-neo-9",
    );
    // Its higher flagship price becomes the new Anthropic baseline (12+60=72).
    expect(flagshipFor(["anthropic"])?.model).toBe("claude-neo-9");
  });

  it("leaves the current catalog unchanged when the fetch throws (offline)", async () => {
    const throwing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const res = await refreshCatalog({ fetchImpl: throwing });
    expect(res.ok).toBe(false);
    // Still the seed — the picker is never blank offline.
    expect(getCatalog().version).toBe("seed");
    expect(modelsForProvider("anthropic").some((m) => m.name === "claude-fable-5")).toBe(true);
  });

  it("leaves the catalog unchanged on a non-2xx or malformed response", async () => {
    const notOk = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    expect((await refreshCatalog({ fetchImpl: notOk })).ok).toBe(false);
    expect(getCatalog().version).toBe("seed");

    const malformed = okFetch({ garbage: true });
    expect((await refreshCatalog({ fetchImpl: malformed })).ok).toBe(false);
    expect(getCatalog().version).toBe("seed");
  });

  it("round-trips a cached catalog (cache is used on load before seed)", async () => {
    const storage = fakeStorage();
    // A prior online session persisted a catalog...
    await refreshCatalog({ fetchImpl: okFetch(ENDPOINT_PAYLOAD), storage });
    // ...a later load reads it back from storage (cache beats seed).
    const cached = loadCachedCatalog(storage)!;
    expect(cached).not.toBeNull();
    expect(cached.version).toBe("2026-07-17.1");
    expect(
      cached.providers
        .find((p) => p.id === "anthropic")!
        .models.some((m) => m.name === "claude-neo-9"),
    ).toBe(true);
  });

  it("loadCachedCatalog returns null when nothing is cached (→ seed fallback)", () => {
    expect(loadCachedCatalog(fakeStorage())).toBeNull();
  });
});
