import { describe, expect, it } from "vitest";
import {
  LocalStorageKeyStore,
  availableProviders,
  hasProviderKey,
  type StringStorage,
} from "./keys";

/** In-memory StringStorage (node has no localStorage). */
function memStorage(seed: Record<string, string> = {}): StringStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
  };
}

const KEYS_KEY = "flow-local:keys:v1";

describe("hasProviderKey — drives the chat mode/model attention state", () => {
  it("is false with no keys at all", () => {
    const store = new LocalStorageKeyStore(memStorage());
    expect(availableProviders(store)).toEqual([]);
    expect(hasProviderKey(store)).toBe(false);
  });

  it("is false with ONLY a Kongen key (routing without an answerer)", () => {
    const store = new LocalStorageKeyStore(
      memStorage({ [KEYS_KEY]: JSON.stringify({ kongen: "kk-demo" }) }),
    );
    expect(availableProviders(store)).toEqual([]);
    expect(hasProviderKey(store)).toBe(false);
  });

  it("is false when the only provider slot is blank/whitespace", () => {
    const store = new LocalStorageKeyStore(
      memStorage({
        [KEYS_KEY]: JSON.stringify({ kongen: "kk-demo", anthropic: "   " }),
      }),
    );
    expect(hasProviderKey(store)).toBe(false);
  });

  it("is true once at least one provider key is present", () => {
    const store = new LocalStorageKeyStore(
      memStorage({
        [KEYS_KEY]: JSON.stringify({ kongen: "kk-demo", anthropic: "sk-ant" }),
      }),
    );
    expect(availableProviders(store)).toEqual(["anthropic"]);
    expect(hasProviderKey(store)).toBe(true);
  });

  it("flips false → true live when a provider key is written", () => {
    const store = new LocalStorageKeyStore(memStorage());
    expect(hasProviderKey(store)).toBe(false);
    store.set("openai", "sk-openai");
    expect(hasProviderKey(store)).toBe(true);
    store.remove("openai");
    expect(hasProviderKey(store)).toBe(false);
  });
});
