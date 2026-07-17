/**
 * Key validation pings — lowest-cost possible authenticated call per provider.
 *
 * Providers: GET the model-list endpoint (free, no tokens billed).
 * Kongen: POST /v1/logic/score with a one-word prompt — this DOES spend
 * 1 KT, which is surfaced in the UI copy; it is also the only truthful
 * test (verifies both the key and remaining credits).
 *
 * Browser-direct like lib/providers.ts: the key goes straight from the
 * browser to the vendor. CORS caveats mirror providers.ts (Mistral/DeepSeek
 * browser CORS unverified; fine in the MV3 shell).
 */

import type { KeySlot } from "./keys";
import { KONGEN_API_BASE } from "./kongen";

export interface PingResult {
  ok: boolean;
  /** Short human-readable detail (error reason, or credits left for Kongen). */
  detail?: string;
}

interface PingSpec {
  url: string;
  method?: "GET" | "POST";
  headers: (key: string) => Record<string, string>;
  body?: string;
}

const PING_SPECS: Record<KeySlot, PingSpec> = {
  anthropic: {
    url: "https://api.anthropic.com/v1/models?limit=1",
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    }),
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
    headers: (key) => ({ "x-goog-api-key": key }),
  },
  mistral: {
    url: "https://api.mistral.ai/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  deepseek: {
    url: "https://api.deepseek.com/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  kongen: {
    url: `${KONGEN_API_BASE}/v1/logic/score`,
    method: "POST",
    headers: (key) => ({
      "Content-Type": "application/json",
      "X-API-Key": key,
    }),
    body: JSON.stringify({ text: "ping" }),
  },
};

/** Validate a key with a minimal live call. Never throws. */
export async function pingKey(
  slot: KeySlot,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PingResult> {
  const spec = PING_SPECS[slot];
  let res: Response;
  try {
    res = await fetchImpl(spec.url, {
      method: spec.method ?? "GET",
      headers: spec.headers(key),
      body: spec.body,
    });
  } catch (err) {
    return {
      ok: false,
      detail: `unreachable (network or CORS): ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  if (res.ok) {
    if (slot === "kongen") {
      const body = (await res
        .json()
        .catch(() => ({}))) as { tokens_remaining?: number };
      return {
        ok: true,
        detail:
          typeof body.tokens_remaining === "number"
            ? `${body.tokens_remaining} KT left`
            : undefined,
      };
    }
    return { ok: true };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, detail: "invalid key" };
  }
  if (res.status === 402) {
    return { ok: false, detail: "out of credits" };
  }
  if (res.status === 429) {
    // Rate-limited means the key authenticated.
    return { ok: true, detail: "rate-limited but valid" };
  }
  return { ok: false, detail: `HTTP ${res.status}` };
}
