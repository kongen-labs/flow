import { describe, expect, it } from "vitest";
import { pingKey } from "./ping";

function fetchReturning(status: number, body: unknown = {}): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("pingKey", () => {
  it("reports ok on 200", async () => {
    const result = await pingKey("openai", "sk-test", fetchReturning(200));
    expect(result.ok).toBe(true);
  });

  it("maps 401 to invalid key", async () => {
    const result = await pingKey("anthropic", "bad", fetchReturning(401));
    expect(result).toEqual({ ok: false, detail: "invalid key" });
  });

  it("maps 402 to out of credits", async () => {
    const result = await pingKey("kongen", "kk-x", fetchReturning(402));
    expect(result).toEqual({ ok: false, detail: "out of credits" });
  });

  it("treats 429 as authenticated", async () => {
    const result = await pingKey("google", "AIza", fetchReturning(429));
    expect(result.ok).toBe(true);
  });

  it("surfaces kongen credits on success", async () => {
    const result = await pingKey(
      "kongen",
      "kk-x",
      fetchReturning(200, { regime: "trivial", tokens_remaining: 4999 }),
    );
    expect(result.ok).toBe(true);
    expect(result.detail).toBe("4999 KT left");
  });

  it("never throws on network failure", async () => {
    const failing = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const result = await pingKey("mistral", "m-x", failing);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("unreachable");
  });
});
