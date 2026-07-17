import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { selectContext, type ContextScope } from "@/lib/context";
import { MessageBubble, type MessageMetadata } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { ContextDrawer } from "./context-drawer";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: MessageMetadata;
  streaming?: boolean;
  signal?: "critical" | "default" | "dismissed";
}

interface ChatViewProps {
  streamId: string;
  messages: ChatMessage[];
  onSend: (message: string) => void;
  isStreaming?: boolean;
  mode?: string;
  onModeChange?: (mode: string) => void;
  onSignalChange?: (messageId: string, signal: "critical" | "default" | "dismissed") => void;
  contextChainMessageId?: string | null;
  onToggleContextChain?: (messageId: string) => void;
  /** Context scope in effect — the chain view mirrors the send path. */
  contextScope?: ContextScope;
  /** Per-send full-history override (next send only). */
  fullHistoryOnce?: boolean;
  onToggleFullHistoryOnce?: () => void;
  routingIndicator?: ReactNode;
}

export function ChatView({
  streamId,
  messages,
  onSend,
  isStreaming,
  mode,
  onModeChange,
  onSignalChange,
  contextChainMessageId,
  onToggleContextChain,
  contextScope,
  fullHistoryOnce,
  onToggleFullHistoryOnce,
  routingIndicator,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Real context selection for the active chain (same rule as the send
  // path — lib/context.ts). Relevance is scoped against the TRIGGER user
  // prompt (the message right before the target reply), with current
  // signals: "what would be sent as context for this prompt now".
  const chainIdx = contextChainMessageId
    ? messages.findIndex((m) => m.id === contextChainMessageId)
    : -1;
  const chainSelection = useMemo(() => {
    if (chainIdx < 0) return null;
    const target = messages[chainIdx];
    // Prefer the scope RECORDED when this reply was generated (per-send
    // override included); fall back to the current setting for old data.
    const targetScope =
      target.metadata?.context_scope ?? contextScope;
    const trigger = chainIdx > 0 ? messages[chainIdx - 1] : null;
    if (trigger && trigger.role === "user") {
      return {
        selection: selectContext(messages.slice(0, chainIdx - 1), trigger.content, {
          scope: targetScope,
        }),
        triggerId: trigger.id,
      };
    }
    // No user trigger (edge) — nothing to scope against; v1 rule applies.
    return {
      selection: selectContext(messages.slice(0, chainIdx), undefined, {
        scope: contextScope,
      }),
      triggerId: null,
    };
  }, [messages, chainIdx, contextScope]);
  const forwardedIds = useMemo(
    () =>
      new Set(chainSelection?.selection.forwarded.map((label) => label.id) ?? []),
    [chainSelection],
  );

  // Scroll to bottom on new messages or streaming content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, messages[messages.length - 1]?.content]);

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable message area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full min-h-[40vh] items-center justify-center">
              <div className="max-w-lg text-center space-y-6 px-4">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold">GPTs come and go — your conversations stay with you</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Everything lives on this device: your keys, your history,
                    your exports. No password, no profile, no lock-in. Flow reads
                    each prompt&apos;s complexity and routes to the best available
                    model across Anthropic, OpenAI, Google, Mistral, and
                    DeepSeek — with your own keys. When something better ships,
                    Flow just starts using it. No migration, no starting over.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 text-center text-[11px] text-muted-foreground sm:grid-cols-3">
                  <div className="rounded-lg border border-dashed p-2.5 space-y-1">
                    <p className="font-semibold text-foreground text-xs">Local-first</p>
                    <p>History in your browser, exportable as JSON — keys never leave this device</p>
                  </div>
                  <div className="rounded-lg border border-dashed p-2.5 space-y-1">
                    <p className="font-semibold text-foreground text-xs">Model-fluid</p>
                    <p>GPT, Claude, Gemini — same conversation, best model per message</p>
                  </div>
                  <div className="rounded-lg border border-dashed p-2.5 space-y-1">
                    <p className="font-semibold text-foreground text-xs">Smart-routed</p>
                    <p>Every prompt is scored and gets the model best suited for it — and you see what each answer cost</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground/60">Try one</p>
                  <div className="grid grid-cols-2 gap-2 text-left">
                    {[
                      { q: "Summarize this meeting transcript", tag: "Fast" },
                      { q: "Prove that \u221A2 is irrational", tag: "Deep" },
                      { q: "Write a Python sort function", tag: "Moderate" },
                      { q: "Design a distributed lock", tag: "Exhaustive" },
                    ].map(({ q, tag }) => (
                      <button
                        key={q}
                        onClick={() => onSend(q)}
                        className="rounded-lg border p-3 text-left hover:bg-accent transition-colors group"
                      >
                        <p className="text-xs text-muted-foreground group-hover:text-foreground line-clamp-2">{q}</p>
                        <span className="mt-1.5 inline-block text-[10px] font-medium text-muted-foreground/50">{tag} regime →</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {messages.map((msg, idx) => {
            // Context chain membership = the REAL selection (lib/context.ts
            // selectContext, relevance-scoped) — the highlight shows exactly
            // what is sent as context. The trigger prompt itself is always
            // part of the payload.
            let inChain: boolean | undefined;
            if (chainIdx >= 0) {
              if (msg.id === contextChainMessageId) {
                inChain = true;
              } else if (idx >= chainIdx) {
                inChain = false;
              } else if (msg.id === chainSelection?.triggerId) {
                inChain = true;
              } else {
                inChain = forwardedIds.has(msg.id);
              }
            }

            return (
              <div key={msg.id}>
                <MessageBubble
                  id={msg.id}
                  role={msg.role}
                  content={msg.content}
                  metadata={msg.metadata}
                  isStreaming={msg.streaming}
                  signal={msg.signal}
                  onSignalChange={onSignalChange}
                  contextChainActive={contextChainMessageId === msg.id}
                  onToggleContextChain={onToggleContextChain}
                  inContextChain={inChain}
                />
                {/* Context drawer under the active chain target */}
                {contextChainMessageId === msg.id &&
                  chainSelection &&
                  onToggleContextChain && (
                    <ContextDrawer
                      forwarded={chainSelection.selection.forwarded}
                      dropped={chainSelection.selection.dropped}
                      totalMessages={chainSelection.selection.total}
                      onClose={() => onToggleContextChain(msg.id)}
                      fullHistoryOnce={fullHistoryOnce}
                      onToggleFullHistoryOnce={
                        contextScope !== "everything"
                          ? onToggleFullHistoryOnce
                          : undefined
                      }
                    />
                  )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Routing indicator between messages and input */}
      {routingIndicator}

      {/* Fixed input bar */}
      <ChatInput
        onSend={onSend}
        disabled={isStreaming}
        mode={mode}
        onModeChange={onModeChange}
        fullHistoryOnce={fullHistoryOnce}
        onToggleFullHistoryOnce={
          contextScope !== "everything" ? onToggleFullHistoryOnce : undefined
        }
      />
    </div>
  );
}
