import { useState, useCallback, useMemo, useRef } from "react";
import { Bot, RefreshCw, Copy, Check, Info, ChevronUp, Ghost, GitBranch, Minus, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LABEL_EXPLAIN,
  REGIME_EXPLAIN,
  SIGNAL_MEANING,
} from "@/lib/explain-copy";
import { formatModelName, type Regime } from "@/lib/models";
import { useCatalog } from "@/lib/use-catalog";
import { compareToFrontier, formatCostUsd } from "@/lib/cost-compare";
import { availableProviders, createDefaultKeyStore } from "@/lib/keys";
import { Explainer } from "../explainer";
import { ModelTooltip } from "./model-tooltip";
import { MessageSignal, type SignalLevel } from "./message-signal";

interface MetadataRibbonProps {
  model: string;
  provider?: string;
  tokens: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd: number;
  savingsPct?: number;
  modelSwitched?: boolean;
  previousModel?: string;
  regime?: string;
  complexity?: number;
  constraint?: number;
  balance?: number;
  confidenceAdj?: number;
  budget?: number;
  ktUsed?: number;
  messageId?: string;
  signal?: SignalLevel;
  onSignalChange?: (messageId: string, signal: SignalLevel) => void;
  content?: string;
  contextChainActive?: boolean;
  onToggleContextChain?: (messageId: string) => void;
}

const REGIME_COLORS: Record<string, string> = {
  trivial: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  fast: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  moderate: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  deep: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  exhaustive: "bg-red-100 text-[#a3262c] dark:bg-red-900/30 dark:text-red-300",
};

export function MetadataRibbon({
  model,
  provider,
  tokens,
  tokensIn,
  tokensOut,
  costUsd,
  savingsPct,
  modelSwitched,
  previousModel,
  regime,
  complexity,
  constraint,
  balance,
  confidenceAdj,
  budget,
  ktUsed,
  messageId,
  signal,
  onSignalChange,
  content,
  contextChainActive,
  onToggleContextChain,
}: MetadataRibbonProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [copied, setCopied] = useState(false);
  // Subscribe so model display names track the live catalog (a server-added
  // model's label renders here without a code change).
  useCatalog();

  // Paid-vs-frontier comparison for the cost popover (Jul 16 2026 —
  // comparison, not definition). Providers read once per ribbon mount; a
  // key change mid-session refreshes on the next re-render/remount, which
  // is fine for an "est." label.
  const providers = useMemo(
    () => availableProviders(createDefaultKeyStore()),
    [],
  );
  const frontier = compareToFrontier(
    { cost: costUsd, tokens_in: tokensIn, tokens_out: tokensOut, savings_pct: savingsPct },
    providers,
  );

  const handleCopy = useCallback(() => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  const toggleTooltip = useCallback(() => {
    setShowTooltip((prev) => !prev);
  }, []);

  // Anchor for the portaled "Why this model?" popover (above-first).
  const modelBtnRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="mt-1 space-y-0.5">
      {modelSwitched && previousModel && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          <Explainer
            heading="Model switched"
            body={LABEL_EXPLAIN.modelSwitched}
            trigger={
              <span>
                Switched: {previousModel} &rarr; {model}
              </span>
            }
          />
        </div>
      )}
      <div className="relative flex items-center gap-1.5 text-xs text-muted-foreground">
        <Bot className="h-3 w-3 shrink-0" />
        <button
          ref={modelBtnRef}
          onClick={toggleTooltip}
          title="Why this model? Click for details"
          className="hover:text-foreground transition-colors underline decoration-dotted underline-offset-2"
        >
          {formatModelName(model)}
        </button>
        <span className="opacity-40">&middot;</span>
        <Explainer
          heading="Tokens"
          body={LABEL_EXPLAIN.tokens}
          triggerClassName="hover:text-foreground transition-colors"
          trigger={<span>{tokens} tok</span>}
        />
        <span className="opacity-40">&middot;</span>
        <Explainer
          heading="Cost"
          triggerClassName="hover:text-foreground transition-colors"
          trigger={<span>${costUsd.toFixed(4)}</span>}
        >
          {/* Paid vs frontier (Jul 16): two figures + highlighted
              delta; horizontal dividers between the charge rows (the maintainer,
              Jul 17 — reads as a mini-statement); the old definition
              survives as the footnote. */}
          <div className="divide-y divide-border/60 text-[11px]">
            <div className="flex items-baseline justify-between gap-3 pb-1.5">
              <span className="text-muted-foreground">You paid</span>
              <span className="font-medium text-foreground">
                {formatCostUsd(costUsd)}{" "}
                <span className="font-normal text-muted-foreground">
                  ({formatModelName(model)})
                </span>
              </span>
            </div>
            {frontier ? (
              <>
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-muted-foreground">
                    Frontier ({frontier.model})
                  </span>
                  <span className="text-foreground">
                    est. {formatCostUsd(frontier.estUsd)}
                  </span>
                </div>
                {frontier.savedUsd > 0 && (
                  <div className="flex items-baseline justify-between gap-3 py-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                    <span>You saved</span>
                    <span>
                      est. {formatCostUsd(frontier.savedUsd)} ({frontier.savedPct}%)
                    </span>
                  </div>
                )}
              </>
            ) : (
              <span className="block py-1.5 text-[10px] leading-relaxed text-muted-foreground/70">
                {LABEL_EXPLAIN.costNoBaseline}
              </span>
            )}
            <span className="block pt-1.5 text-[10px] leading-relaxed text-muted-foreground/60">
              {LABEL_EXPLAIN.cost}
            </span>
          </div>
        </Explainer>
        {savingsPct != null && savingsPct > 0 && (
          <>
            <span className="opacity-40">&middot;</span>
            <Explainer
              heading="Savings (est.)"
              body={LABEL_EXPLAIN.savingsBadge}
              trigger={
                <span
                  className={cn(
                    "inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium",
                    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  )}
                >
                  &darr;{savingsPct.toFixed(0)}%
                </span>
              }
            />
          </>
        )}

        {/* Right-aligned icon group: relevance · info · copy */}
        <span className="flex-1" />
        <div className="flex items-center gap-0.5">
          {/* Relevance indicator — default state gets a muted, always-visible
              affordance (Jul 16: "make the default icon visible on the
              chat") so every message can reach the signal popover, including
              re-pinning after choosing Default. */}
          {(!signal || signal === "default") && messageId && onSignalChange && (
            <Explainer
              heading="Relevance: Default"
              body={SIGNAL_MEANING.default}
              learnMore
              trigger={
                <span className="inline-flex items-center rounded px-1 py-0.5 text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground/70">
                  <Minus className="h-2.5 w-2.5" />
                </span>
              }
            >
              <MessageSignal
                messageId={messageId}
                currentSignal="default"
                onSignalChange={onSignalChange}
                alwaysLabels
              />
            </Explainer>
          )}
          {signal && signal !== "default" && (
            <Explainer
              heading={signal === "critical" ? "Pinned message" : "Ignored"}
              body={SIGNAL_MEANING[signal]}
              learnMore
              trigger={
                <span className={cn(
                  "inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px]",
                  signal === "critical" && "text-red-500 bg-red-500/10",
                  signal === "dismissed" && "text-muted-foreground/50 bg-muted/50",
                )}>
                  {/* user-facing: internal critical → "pinned" (message),
                      internal dismissed → "ignored" (rename Jul 16) */}
                  {signal === "critical" && <Pin className="h-2.5 w-2.5" />}
                  {signal === "dismissed" && <Ghost className="h-2.5 w-2.5" />}
                  {signal === "critical" ? "pinned" : "ignored"}
                </span>
              }
            >
              {/* Actionable popover (live testing Jul 16): change the
                  signal right here. Same update path as the Relevance
                  selector; picking Default unmounts this chip, closing the
                  popover with it. */}
              {messageId && onSignalChange && (
                <MessageSignal
                  messageId={messageId}
                  currentSignal={signal}
                  onSignalChange={onSignalChange}
                  alwaysLabels
                />
              )}
            </Explainer>
          )}
          {/* Context chain toggle */}
          {messageId && onToggleContextChain && (
            <button
              onClick={() => onToggleContextChain(messageId)}
              className={cn(
                "p-1 rounded transition-colors",
                contextChainActive
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
              title={contextChainActive ? "Hide chain view" : "Chain view — see exactly what Smart Reference sent as context for this reply"}
            >
              <GitBranch className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => setShowAnalysis((p) => !p)}
            className={cn(
              "p-1 rounded transition-colors",
              showAnalysis ? "bg-muted text-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"
            )}
            title={showAnalysis ? "Hide info" : "Show info"}
          >
            {showAnalysis ? <ChevronUp className="h-3 w-3" /> : <Info className="h-3 w-3" />}
          </button>
          {content && (
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Copy message"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              )}
            </button>
          )}
        </div>

        {/* Model tooltip popover */}
        {showTooltip && (
          <ModelTooltip
            regime={regime}
            model={model}
            provider={provider}
            balance={balance}
            confidenceAdj={confidenceAdj}
            budget={budget}
            anchorRef={modelBtnRef}
            onClose={() => setShowTooltip(false)}
          />
        )}
      </div>

      {/* Expanded analysis panel */}
      {showAnalysis && (
        <div className="mt-1.5 p-2 rounded-md bg-muted/40 border border-border/50 text-xs space-y-2">
          {/* Regime + Model row */}
          <div className="flex items-center gap-2 flex-wrap">
            {regime && (
              <Explainer
                heading={`Regime: ${regime}`}
                body={
                  REGIME_EXPLAIN[regime as Regime] ??
                  "Kongen's reasoning-depth score for this prompt — deeper regimes route to stronger models."
                }
                trigger={
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", REGIME_COLORS[regime] || REGIME_COLORS.moderate)}>
                    {regime}
                  </span>
                }
              />
            )}
            {regime && <span className="text-muted-foreground">→</span>}
            <span className="font-medium">{formatModelName(model)}</span>
            {ktUsed != null && (
              <span className="text-muted-foreground ml-auto">{ktUsed} KT</span>
            )}
          </div>

          {/* Token prediction vs actual (beta — learning mode) */}
          <div className="space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Predicted budget</span>
              <span>{budget ?? "—"} tokens</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Actual used</span>
              <span>
                {tokensIn ?? "—"} in + {tokensOut ?? "—"} out = <strong>{tokens}</strong>
              </span>
            </div>
            {budget != null && tokens > 0 && (
              <>
                <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  {/* Predicted budget marker */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (tokens / Math.max(budget, tokens)) * 100)}%`,
                      backgroundColor: tokens > budget ? "#a3262c" : "#10b981",
                    }}
                  />
                  {/* Budget line marker */}
                  <div
                    className="absolute inset-y-0 w-0.5 bg-foreground/40"
                    style={{ left: `${Math.min(100, (budget / Math.max(budget, tokens)) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground/60">
                  <span>
                    {tokens > budget
                      ? `${Math.round(((tokens - budget) / budget) * 100)}% over prediction`
                      : `${Math.round((tokens / budget) * 100)}% of prediction`}
                  </span>
                  <span className="italic">beta — learning mode</span>
                </div>
              </>
            )}
          </div>

          {/* Balance + Confidence row */}
          {balance != null && (
            <div className="flex justify-between text-muted-foreground">
              <span>Balance: <strong className="text-foreground">{balance.toFixed(2)}</strong></span>
              <span>Confidence: <strong className={cn("text-foreground", confidenceAdj != null && confidenceAdj > 0 ? "text-emerald-600 dark:text-emerald-400" : confidenceAdj != null && confidenceAdj < 0 ? "text-red-500" : "")}>{confidenceAdj != null ? (confidenceAdj > 0 ? "+" : "") + confidenceAdj.toFixed(2) : "—"}</strong></span>
            </div>
          )}

          {/* Message signal control */}
          {messageId && onSignalChange && (
            <div className="pt-1.5 border-t border-border/50">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Relevance</span>
                <MessageSignal
                  messageId={messageId}
                  currentSignal={signal || "default"}
                  onSignalChange={onSignalChange}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
