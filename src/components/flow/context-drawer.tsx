/**
 * Context drawer — shows what Smart Reference selected for the next
 * prompt, adapted for the local app:
 *
 * - Data comes from lib/context.ts selectContext — the SAME selection the
 *   send path uses, so the drawer shows the real forwarded/dropped split.
 * - Labels are the local signal vocabulary (critical / default / dismissed)
 *   instead of the server sketch's load-bearing/contextual/transient.
 * - No session digest (server Phase-1 sketch, never wired; see context.ts).
 * - Header says "Context for this reply" (computed with CURRENT signals —
 *   signals are editable after the fact, so this is what would be sent now,
 *   not a historical record).
 *
 * Inline card under the target message; scrolls internally, fits 375px.
 */

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GitBranch,
  History,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContextLabel } from "@/lib/context";
import { REASON_EXPLAIN } from "@/lib/explain-copy";
import { Explainer } from "../explainer";

/**
 * Reason taxonomy — the drawer is the trust surface for exclusions, so
 * every message explains itself (tap a reason for the full explainer):
 *   included: pinned (internal signal "critical") · same topic · recent ·
 *             included (full-history scope)
 *   left out: different topic · ignored (internal "dismissed", ghost) ·
 *             empty
 */
const REASON_DISPLAY: Record<string, { text: string; color: string }> = {
  critical: { text: "pinned", color: "text-red-500" },
  "same-topic": { text: "same topic", color: "text-emerald-600 dark:text-emerald-400" },
  recent: { text: "recent", color: "text-muted-foreground" },
  included: { text: "included", color: "text-muted-foreground" },
  "off-topic": { text: "different topic", color: "text-muted-foreground/60" },
  dismissed: { text: "ignored", color: "text-muted-foreground/60" },
  empty: { text: "empty", color: "text-muted-foreground/60" },
};

export function ContextDrawer({
  forwarded,
  dropped,
  totalMessages,
  onClose,
  fullHistoryOnce,
  onToggleFullHistoryOnce,
}: {
  forwarded: ContextLabel[];
  dropped: ContextLabel[];
  totalMessages: number;
  onClose: () => void;
  /** Per-send override affordance (hidden when default is full history). */
  fullHistoryOnce?: boolean;
  onToggleFullHistoryOnce?: () => void;
}) {
  const [showDropped, setShowDropped] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const lines: string[] = [];
    lines.push(`## Context (${forwarded.length} of ${totalMessages} earlier messages included)`);
    forwarded.forEach((m) => {
      lines.push(`- [x] (${m.role}) ${m.preview} — ${REASON_DISPLAY[m.reason]?.text || m.reason}`);
    });
    lines.push(`\n## Left out (${dropped.length})`);
    dropped.forEach((m) => {
      lines.push(`- [ ] (${m.role}) ${m.preview} — ${REASON_DISPLAY[m.reason]?.text || m.reason}`);
    });
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mt-2 w-full overflow-hidden rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* GitBranch: same icon as the reply chain toggle + the Smart
              Reference chip — one icon family for the context system. */}
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-sans font-medium">
            Context for this reply — {forwarded.length} of {totalMessages}{" "}
            earlier messages included
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Close
        </button>
      </div>

      <div className="max-h-64 space-y-3 overflow-y-auto p-3 overscroll-contain">
        {/* Forwarded */}
        <div className="space-y-1">
          <h4 className="text-[10px] font-sans font-semibold uppercase tracking-wide text-muted-foreground">
            Included ({forwarded.length})
          </h4>
          {forwarded.length === 0 && (
            <p className="text-xs text-muted-foreground/60">
              Nothing earlier — this was the first message.
            </p>
          )}
          {forwarded.map((m) => (
            <div key={m.id} className="flex items-start gap-1.5 text-xs">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
              <span className="min-w-0 truncate">{m.preview}</span>
              <Explainer
                heading={REASON_DISPLAY[m.reason]?.text ?? m.reason}
                body={REASON_EXPLAIN[m.reason]}
                triggerClassName="ml-auto shrink-0"
                trigger={
                  <span className={REASON_DISPLAY[m.reason]?.color}>
                    {REASON_DISPLAY[m.reason]?.text}
                  </span>
                }
              />
            </div>
          ))}
        </div>

        {/* Dropped (collapsible) */}
        {dropped.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setShowDropped(!showDropped)}
              className="flex items-center gap-1 text-[10px] font-sans font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              Left out ({dropped.length})
              {showDropped ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {showDropped &&
              dropped.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-1.5 text-xs text-muted-foreground"
                >
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
                  <span className="min-w-0 truncate line-through decoration-muted-foreground/40">
                    {m.preview}
                  </span>
                  <Explainer
                    heading={REASON_DISPLAY[m.reason]?.text ?? m.reason}
                    body={REASON_EXPLAIN[m.reason]}
                    triggerClassName="ml-auto shrink-0"
                    trigger={<span>{REASON_DISPLAY[m.reason]?.text}</span>}
                  />
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Footer: per-send override + copy */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2">
        {onToggleFullHistoryOnce && (
          <button
            type="button"
            onClick={onToggleFullHistoryOnce}
            aria-pressed={fullHistoryOnce}
            className={cn(
              "flex min-h-[32px] items-center gap-1.5 text-xs font-sans transition-colors",
              fullHistoryOnce
                ? "font-medium text-amber-600 dark:text-amber-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <History className="h-3 w-3" />
            {fullHistoryOnce
              ? "Full history will be sent with your next prompt"
              : "Include full history with the next prompt"}
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="flex min-h-[32px] items-center gap-1.5 text-xs font-sans text-muted-foreground hover:text-foreground transition-colors"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copied!" : "Copy context as markdown"}
        </button>
      </div>
    </div>
  );
}
