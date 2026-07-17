/**
 * Browser-direct provider streaming layer — client-side streaming calls
 * to each vendor's API.
 *
 * All calls use plain fetch (no vendor SDKs) with the user's own key from
 * the local KeyStore. Keys never leave the machine except to the vendor
 * itself.
 *
 * Browser-direct notes (LOCKED decisions):
 * - Anthropic requires the `anthropic-dangerous-direct-browser-access: true`
 *   header for browser calls.
 * - OpenAI is called via plain fetch (equivalent of the SDK's
 *   `dangerouslyAllowBrowser`).
 * - Mistral and DeepSeek are OpenAI-compatible chat/completions APIs and
 *   share the OpenAI code path with a different base URL.
 *
 * STUB STATUS (be honest about what is untested):
 * - Anthropic + OpenAI request/stream shapes follow current public API docs
 *   and mirror the backend's usage, but have NOT been exercised with a real
 *   key from this app yet.
 * - Google / Mistral / DeepSeek paths are best-effort ports and are the most
 *   likely to need a header/shape tweak on first live run. Browser CORS
 *   behaviour for Mistral/DeepSeek is UNVERIFIED (works regardless in the
 *   MV3 shell via host_permissions).
 */

import type { Provider } from "./models";
import { readSSE } from "./sse";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onDone: (usage: { tokensIn: number; tokensOut: number }) => void;
  onError: (error: string) => void;
}

export interface StreamParams extends StreamCallbacks {
  provider: Provider;
  model: string;
  apiKey: string;
  turns: ChatTurn[];
  maxTokens?: number;
  signal?: AbortSignal;
}

const DEFAULT_MAX_TOKENS = 4096;

/** Entry point: stream a chat completion from the given provider. */
export async function streamChat(params: StreamParams): Promise<void> {
  try {
    switch (params.provider) {
      case "anthropic":
        return await streamAnthropic(params);
      case "google":
        return await streamGoogle(params);
      case "openai":
        return await streamOpenAICompatible(params, "https://api.openai.com/v1");
      case "mistral":
        return await streamOpenAICompatible(params, "https://api.mistral.ai/v1");
      case "deepseek":
        return await streamOpenAICompatible(params, "https://api.deepseek.com");
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    params.onError(err instanceof Error ? err.message : String(err));
  }
}

async function raiseForStatus(res: Response, provider: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail =
      parsed?.error?.message || parsed?.message || parsed?.detail || body;
  } catch {
    // keep raw body
  }
  throw new Error(`${provider} error (HTTP ${res.status}): ${detail || res.statusText}`);
}

// ---------------------------------------------------------------------------
// Anthropic — Messages API
// ---------------------------------------------------------------------------

async function streamAnthropic(params: StreamParams): Promise<void> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      // Required for browser-direct calls (LOCKED decision — BYO keys,
      // no proxy server).
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: params.turns,
      stream: true,
    }),
    signal: params.signal,
  });
  await raiseForStatus(res, "Anthropic");
  if (!res.body) throw new Error("Anthropic: empty response body");

  let tokensIn = 0;
  let tokensOut = 0;

  await readSSE(res.body, ({ event, data }) => {
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    switch (event || parsed?.type) {
      case "message_start":
        tokensIn = parsed?.message?.usage?.input_tokens ?? 0;
        break;
      case "content_block_delta":
        if (parsed?.delta?.type === "text_delta" && parsed.delta.text) {
          params.onToken(parsed.delta.text);
        }
        break;
      case "message_delta":
        if (parsed?.usage?.output_tokens != null) {
          tokensOut = parsed.usage.output_tokens;
        }
        break;
      case "error":
        params.onError(parsed?.error?.message || "Anthropic stream error");
        break;
    }
  });

  params.onDone({ tokensIn, tokensOut });
}

// ---------------------------------------------------------------------------
// OpenAI-compatible — OpenAI, Mistral, DeepSeek
// ---------------------------------------------------------------------------

async function streamOpenAICompatible(
  params: StreamParams,
  baseUrl: string,
): Promise<void> {
  const providerLabel = params.provider;

  // o3 / o3-mini reject max_tokens (want max_completion_tokens) — omit
  // token caps entirely for maximal compatibility across compatible APIs.
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.turns,
    stream: true,
    // include_usage puts a usage object on the final chunk (supported by
    // OpenAI and DeepSeek; Mistral reports usage on the last chunk anyway).
    stream_options: { include_usage: true },
  };

  let res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  });

  // Some compatible APIs reject stream_options — retry once without it.
  if (res.status === 400) {
    delete body.stream_options;
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });
  }

  await raiseForStatus(res, providerLabel);
  if (!res.body) throw new Error(`${providerLabel}: empty response body`);

  let tokensIn = 0;
  let tokensOut = 0;

  await readSSE(res.body, ({ data }) => {
    if (data === "[DONE]") return;
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const delta = parsed?.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      params.onToken(delta);
    }
    if (parsed?.usage) {
      tokensIn = parsed.usage.prompt_tokens ?? tokensIn;
      tokensOut = parsed.usage.completion_tokens ?? tokensOut;
    }
  });

  params.onDone({ tokensIn, tokensOut });
}

// ---------------------------------------------------------------------------
// Google — Gemini generateContent API
// ---------------------------------------------------------------------------

async function streamGoogle(params: StreamParams): Promise<void> {
  const contents = params.turns.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      params.model,
    )}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify({ contents }),
      signal: params.signal,
    },
  );
  await raiseForStatus(res, "Google");
  if (!res.body) throw new Error("Google: empty response body");

  let tokensIn = 0;
  let tokensOut = 0;

  await readSSE(res.body, ({ data }) => {
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const parts = parsed?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (typeof part?.text === "string" && part.text.length > 0) {
          params.onToken(part.text);
        }
      }
    }
    if (parsed?.usageMetadata) {
      tokensIn = parsed.usageMetadata.promptTokenCount ?? tokensIn;
      tokensOut = parsed.usageMetadata.candidatesTokenCount ?? tokensOut;
    }
  });

  params.onDone({ tokensIn, tokensOut });
}
