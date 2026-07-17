/**
 * Kongen public API client — routing is the hero feature, gracefully
 * key-gated.
 *
 * POST /v1/logic/score (public, auth'd with X-API-Key, 1 KT per score;
 * free tier per the Jul 15 2026 model: 500 credits on key mint, +500 per
 * referral, 1,500 cap — see the K1 self-mint plan). Returns the detected
 * reasoning regime, which the app maps to the best-suited model via
 * lib/models.ts.
 *
 * Contract source: the Kongen scoring endpoint +
 * kongen/models/schemas.py (LogicScoreRequest / LogicScoreResponse).
 *
 * KNOWN LIMITATION (verified Jul 15 2026): api.kongenlabs.life currently
 * rejects arbitrary origins at CORS preflight ("Disallowed CORS origin"
 * for http://localhost:5173). Until the app's origin is added to the API's
 * cors_origins allowlist, browser-direct score calls will fail from the
 * PWA shell and the app degrades to default-model routing (by design —
 * routing is key-gated and every score call is wrapped in try/catch).
 * The MV3 extension shell is NOT affected: host_permissions bypass CORS.
 * Open question  — see the scaffold report.
 */

import type { Regime } from "./models";

export const KONGEN_API_BASE = "https://api.kongenlabs.life";

export interface LogicScore {
  regime: Regime;
  confidence: number;
  confidence_adj: number;
  recommended_tokens: number;
  tokens_used: number;
  tokens_remaining: number;
  request_id?: string;
}

export class KongenApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "KongenApiError";
  }
}

/**
 * Score a prompt with the Kongen Logic engine. Throws on any failure —
 * callers (lib/send.ts) catch and fall back to default-model routing so
 * a missing key, exhausted credits, or CORS block never breaks chat.
 */
export async function scorePrompt(
  text: string,
  apiKey: string,
  opts?: { fetchImpl?: typeof fetch; baseUrl?: string },
): Promise<LogicScore> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const base = opts?.baseUrl ?? KONGEN_API_BASE;

  let res: Response;
  try {
    res = await fetchImpl(`${base}/v1/logic/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    throw new KongenApiError(
      0,
      `Kongen score endpoint unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const detail =
      (body as { detail?: string }).detail ||
      (res.status === 401
        ? "Invalid Kongen API key"
        : res.status === 402
          ? "Out of Kongen Tokens"
          : `HTTP ${res.status}`);
    throw new KongenApiError(res.status, detail);
  }

  return (await res.json()) as LogicScore;
}
