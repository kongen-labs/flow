import { useState, useCallback, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check, Ghost, Info, Minus, Pin } from "lucide-react";
import { SIGNAL_MEANING } from "@/lib/explain-copy";
import { Explainer } from "../explainer";
import { MetadataRibbon } from "./metadata-ribbon";
import { MessageSignal, type SignalLevel } from "./message-signal";

// Heavy markdown/KaTeX renderer loads in its own chunk on first assistant
// reply; the Suspense fallback shows the raw text so streaming never blocks.
const MarkdownContent = lazy(() => import("./markdown-content"));

export interface MessageMetadata {
  regime?: string;
  model?: string;
  provider?: string;
  tokens?: number;
  tokens_in?: number;
  tokens_out?: number;
  cost?: number;
  savings_pct?: number;
  model_switched?: boolean;
  previous_model?: string;
  complexity?: number;
  constraint?: number;
  balance?: number;
  confidence_adj?: number;
  budget?: number;
  kt_used?: number;
  /** Context scope used when this reply was generated. */
  context_scope?: "relevant" | "everything";
}

interface MessageBubbleProps {
  id?: string;
  role: "user" | "assistant";
  content: string;
  metadata?: MessageMetadata;
  isStreaming?: boolean;
  signal?: SignalLevel;
  onSignalChange?: (messageId: string, signal: SignalLevel) => void;
  contextChainActive?: boolean;
  onToggleContextChain?: (messageId: string) => void;
  inContextChain?: boolean;
}

function UserSignalRow({
  id,
  signal,
  onSignalChange,
  content,
}: {
  id: string;
  signal: SignalLevel;
  onSignalChange: (id: string, s: SignalLevel) => void;
  content: string;
}) {
  const [showPanel, setShowPanel] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
      {/* Signal icon */}
      {signal === "critical" && <Pin className="h-2.5 w-2.5 text-red-500" />}
      {signal === "dismissed" && <Ghost className="h-2.5 w-2.5 text-muted-foreground/40" />}
      {/* Default state: muted always-visible affordance —
          opens the same actionable popover, so re-pinning is one tap. */}
      {signal === "default" && (
        <Explainer
          heading="Relevance: Default"
          body={SIGNAL_MEANING.default}
          learnMore
          trigger={
            <span className="inline-flex items-center rounded px-0.5 text-muted-foreground/30 transition-colors hover:text-muted-foreground/70">
              <Minus className="h-2.5 w-2.5" />
            </span>
          }
        >
          <MessageSignal
            messageId={id}
            currentSignal={signal}
            onSignalChange={onSignalChange}
            alwaysLabels
          />
        </Explainer>
      )}
      {signal !== "default" && (
        <Explainer
          heading={signal === "critical" ? "Pinned message" : "Ignored"}
          body={SIGNAL_MEANING[signal]}
          learnMore
          trigger={
            <span className={signal === "critical" ? "text-red-500" : "text-muted-foreground/40"}>
              {/* internal critical/dismissed → user-facing pinned/ignored */}
              {signal === "critical" ? "pinned" : "ignored"}
            </span>
          }
        >
          {/* Actionable popover — change the signal from the label itself.
              Same update path as the Relevance selector below. */}
          <MessageSignal
            messageId={id}
            currentSignal={signal}
            onSignalChange={onSignalChange}
            alwaysLabels
          />
        </Explainer>
      )}

      <span className="flex-1" />

      {/* Info toggle */}
      <button
        onClick={() => setShowPanel((p) => !p)}
        className={cn("p-0.5 rounded transition-colors", showPanel ? "bg-muted text-foreground" : "hover:bg-muted")}
        title="Relevance"
      >
        <Info className="h-3 w-3" />
      </button>

      {/* Copy */}
      <button
        onClick={() => {
          navigator.clipboard.writeText(content);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="p-0.5 rounded hover:bg-muted transition-colors"
        title="Copy"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      </button>

      {/* Signal selector panel */}
      {showPanel && (
        <div className="absolute right-0 top-full mt-1 z-20">
          <div className="bg-card border border-border rounded-lg shadow-md p-2">
            <p className="text-[10px] text-muted-foreground mb-1.5">Relevance</p>
            <MessageSignal messageId={id} currentSignal={signal} onSignalChange={onSignalChange} />
          </div>
        </div>
      )}
    </div>
  );
}

export function MessageBubble({
  id,
  role,
  content,
  metadata,
  isStreaming,
  signal = "default",
  onSignalChange,
  contextChainActive,
  onToggleContextChain,
  inContextChain,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  return (
    <div
      className={cn(
        "group relative flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {/* Signal indicator — red left border for critical */}
      {signal === "critical" && (
        <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-red-500" />
      )}

      <div
        className={cn(
          "relative max-w-[85%] md:max-w-[70%] rounded-lg px-4 py-3 transition-all duration-300",
          isUser
            ? "bg-card border text-card-foreground"
            : "bg-secondary text-secondary-foreground",
          signal === "critical" && "ml-2",
          signal === "dismissed" && "opacity-40",
          // Context chain highlighting
          inContextChain === true && "ring-2 ring-amber-400/60 bg-amber-50/30 dark:bg-amber-950/20",
          inContextChain === false && "opacity-20",
        )}
      >
        {/* Message content — markdown for assistant, plain for user */}
        <div
          className={cn(
            "text-sm leading-relaxed break-words",
            signal === "dismissed" &&
              "line-through decoration-muted-foreground/30",
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{content}</div>
          ) : (
            <div
              className={cn(
                "max-w-none overflow-hidden",
                "[&_p]:my-1.5 [&_h1]:my-2 [&_h2]:my-2 [&_h3]:my-2",
                // Restore list markers stripped by Tailwind preflight.
                "[&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5",
                "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5",
                "[&_pre]:my-2 [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:bg-[var(--muted)] [&_pre]:border [&_pre]:border-[var(--border)] [&_pre]:text-[0.85em]",
                "[&_code]:text-[0.85em] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-[var(--muted)]",
                "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
                "[&_a]:text-brand-fg [&_a]:underline",
                "[&_strong]:font-semibold",
                "[&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border)] [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-[var(--muted-foreground)]",
                // GFM tables: token borders (global border-color rule),
                // distinguished header, compact text; w-max + min-w-full so
                // wide tables scroll inside markdown-content's wrapper.
                "[&_table]:w-max [&_table]:min-w-full [&_table]:border-collapse [&_table]:text-[0.85em]",
                "[&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
                "[&_td]:border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top",
                // GFM task lists: hide the doubled list marker, align boxes.
                "[&_li:has(>input)]:list-none [&_li>input]:mr-1.5 [&_li>input]:align-middle",
              )}
            >
              <Suspense
                fallback={<div className="whitespace-pre-wrap">{content}</div>}
              >
                <MarkdownContent content={content} />
              </Suspense>
            </div>
          )}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-foreground/70 animate-pulse rounded-sm align-text-bottom" />
          )}
        </div>

        {/* Metadata ribbon for assistant messages */}
        {!isUser && metadata?.model && (
          <MetadataRibbon
            model={metadata.model}
            provider={metadata.provider}
            tokens={metadata.tokens ?? 0}
            tokensIn={metadata.tokens_in}
            tokensOut={metadata.tokens_out}
            costUsd={metadata.cost ?? 0}
            savingsPct={metadata.savings_pct}
            modelSwitched={metadata.model_switched}
            previousModel={metadata.previous_model}
            regime={metadata.regime}
            complexity={metadata.complexity}
            constraint={metadata.constraint}
            balance={metadata.balance}
            confidenceAdj={metadata.confidence_adj}
            budget={metadata.budget}
            ktUsed={metadata.kt_used}
            messageId={id}
            signal={signal}
            onSignalChange={onSignalChange}
            content={content}
            contextChainActive={contextChainActive}
            onToggleContextChain={onToggleContextChain}
          />
        )}

        {/* User message: signal icon + toggle */}
        {isUser && id && onSignalChange && !isStreaming && (
          <UserSignalRow id={id} signal={signal} onSignalChange={onSignalChange} content={content} />
        )}

        {/* Signal indicator removed from here — now in ribbon icon group */}
        {false && (
          <div />
        )}
      </div>
    </div>
  );
}
