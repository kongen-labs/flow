/**
 * Chat header — conversation title (inline rename) + savings chip/popover.
 *
 * Directives (Jul 16 2026):
 * - rename where the conversation is open, not just the sidebar swipe:
 *   tap/click the title (or pencil) → inline edit, Enter/blur commit,
 *   Esc cancel (same db.updateStream wiring as the sidebar).
 * - savings OUT of the chat window: a compact spent-figure chip here,
 *   with the full detail (spent, saved est. $ + %, baseline, zero-state)
 *   in a tap (mobile) / hover (desktop) popover.
 *
 * One header for all breakpoints (hamburger is md:hidden). 375px-first.
 */

import { useEffect, useRef, useState } from "react";
import { Menu, Pencil, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LABEL_EXPLAIN } from "@/lib/explain-copy";
import { formatSavedUsd, type SavingsTotals } from "@/lib/savings";
import { Explainer } from "./explainer";

export function ChatHeader({
  title,
  canRename,
  onRename,
  onOpenSidebar,
  savings,
  baselineName,
}: {
  title: string;
  canRename: boolean;
  onRename: (title: string) => void;
  onOpenSidebar: () => void;
  savings: SavingsTotals;
  /** Display name of the frontier baseline model (e.g. "Fable 5"). */
  baselineName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const hoverable = useRef(false);

  // Track hover capability once (desktop hover vs mobile tap).
  useEffect(() => {
    hoverable.current = window.matchMedia("(hover: hover)").matches;
  }, []);

  function startEdit() {
    if (!canRename) return;
    setValue(title);
    setEditing(true);
  }

  function commit() {
    const next = value.trim();
    if (next && next !== title) onRename(next);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 border-b bg-background px-3 py-1 pt-[max(0.25rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md hover:bg-muted transition-colors md:hidden"
        title="Conversations"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Title — inline rename */}
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label="Rename conversation"
          className={cn(
            "min-w-0 flex-1 rounded-md border bg-card px-2 py-1",
            // 16px below md prevents iOS input auto-zoom.
            "text-[16px] md:text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring",
          )}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          disabled={!canRename}
          title={canRename ? "Rename conversation" : undefined}
          className={cn(
            "group flex min-h-[44px] min-w-0 flex-1 items-center gap-1.5 text-left md:min-h-[40px]",
            canRename && "cursor-text",
          )}
        >
          <span className="truncate text-sm font-medium">{title}</span>
          {canRename && (
            <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/50 transition-opacity md:opacity-0 md:group-hover:opacity-100" />
          )}
        </button>
      )}

      {/* Savings chip → popover with the full detail */}
      <div
        className="relative shrink-0"
        onMouseEnter={() => hoverable.current && setPopoverOpen(true)}
        onMouseLeave={() => hoverable.current && setPopoverOpen(false)}
      >
        <button
          type="button"
          // Hover devices: hover opens, click keeps open (mouseleave/backdrop
          // closes) — a toggle here would close on the click that follows
          // the hover-open. Touch devices: plain toggle.
          onClick={() =>
            setPopoverOpen((o) => (hoverable.current ? true : !o))
          }
          aria-expanded={popoverOpen}
          title="Spend & savings (est.) for this conversation"
          className={cn(
            "flex min-h-[44px] items-center gap-1 rounded-md px-2 text-xs font-sans transition-colors md:min-h-[32px]",
            popoverOpen
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {/* Both figures at a glance (Jul 17): spent + saved est.
              Labels collapse below sm (375px shows just the two figures —
              the popover carries the full explanation). */}
          <TrendingDown className="h-3.5 w-3.5" />
          <span>
            <span className="hidden sm:inline">spent </span>
            {formatSavedUsd(savings.spentUsd)}
          </span>
          {savings.savedUsd > 0 && (
            <>
              <span className="opacity-40">&middot;</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                <span className="hidden sm:inline">saved </span>
                {formatSavedUsd(savings.savedUsd)}
              </span>
            </>
          )}
        </button>

        {popoverOpen && (
          <>
            {/* Tap-away backdrop (mobile) */}
            <div
              className="fixed inset-0 z-20"
              onClick={() => setPopoverOpen(false)}
            />
            <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border bg-popover p-3 font-sans shadow-lg">
              <h4 className="text-xs font-semibold">This conversation</h4>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <Explainer
                    heading="Spent"
                    body={LABEL_EXPLAIN.spent}
                    trigger={<span>Spent</span>}
                  />
                  <span className="font-medium text-foreground">
                    {formatSavedUsd(savings.spentUsd)}
                  </span>
                </div>
                {savings.savedUsd > 0 && (
                  <div className="flex items-center justify-between">
                    <Explainer
                      heading="Saved (est.)"
                      body={LABEL_EXPLAIN.savedEst}
                      trigger={<span>Saved (est.)</span>}
                    />
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {formatSavedUsd(savings.savedUsd)} (
                      {savings.savedPct.toFixed(0)}%)
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-2 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground/70">
                {savings.routedReplies > 0
                  ? `Estimated vs always using ${
                      baselineName ?? "the latest frontier model"
                    } — the latest frontier model of your providers.`
                  : "No smart-routed replies yet — savings appear once Auto routing picks models for your prompts."}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
