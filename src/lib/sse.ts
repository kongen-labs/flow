/**
 * Minimal SSE stream reader.
 *
 * Buffer-splitting shape: accumulate decoded chunks, split on the
 * blank-line event delimiter, keep the trailing partial event in the
 * buffer, and hand each complete event to the caller.
 */

export interface SSEEvent {
  /** `event:` field if present (Anthropic uses it; OpenAI-style APIs don't). */
  event: string;
  /** Raw `data:` payload (joined with \n when multi-line). */
  data: string;
}

export async function readSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Events are delimited by a blank line. Keep the last (possibly
    // incomplete) chunk in the buffer.
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      if (!part.trim()) continue;

      let eventType = "";
      const dataLines: string[] = [];

      for (const line of part.split("\n")) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length === 0) continue;
      onEvent({ event: eventType, data: dataLines.join("\n") });
    }
  }
}
