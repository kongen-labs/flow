/**
 * Local stream list — replaces the server-backed
 * apps/kongen-web/components/flow/stream-list.tsx with an IndexedDB-backed
 * equivalent, styled with the same sidebar tokens.
 *
 * Mobile-first: swipe a row left to reveal rename/delete actions (hand-rolled
 * touch handlers, no library), inline rename, safe-area insets. Desktop keeps
 * hover-revealed actions.
 */

import { useRef, useState } from "react";
import {
  Lock,
  LockOpen,
  MessageSquare,
  Pencil,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatModelName } from "@/lib/models";
import { formatRoiLine, formatSavedUsd } from "@/lib/savings";
import { LABEL_EXPLAIN } from "@/lib/explain-copy";
import { useAppLock } from "./app-lock-gate";
import { Explainer } from "./explainer";
import type { SettingsView } from "./settings-drawer";
import type { StoredStream } from "@/lib/db";

/** Width of the swipe-revealed action area (two 44px buttons). */
const ACTIONS_WIDTH = 88;

export function StreamSidebar({
  streams,
  savedByStream = {},
  lifetimeSavedUsd = 0,
  lifetimeSpentUsd = 0,
  activeStreamId,
  open,
  onClose,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onOpenSettings,
}: {
  streams: StoredStream[];
  /** Est. saved $ per stream id (savings are outcomes, labeled "est."). */
  savedByStream?: Record<string, number>;
  lifetimeSavedUsd?: number;
  /** Est. lifetime spend (actual per-reply costs) — the ROI denominator. */
  lifetimeSpentUsd?: number;
  activeStreamId: string | null;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  /** Optional target view — the lock icon deep-links to Security. */
  onOpenSettings: (view?: SettingsView) => void;
}) {
  // Swipe state: which row is being dragged / left open.
  const touchStart = useRef<{ id: string; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  // Lock/Unlock in easy reach (Jul 17 2026: "get the Lock/Unlock icon
  // next to settings"). Enabled -> one tap locks now; disabled -> shown as
  // a shortcut into the App Lock settings section (aids discovery).
  const appLock = useAppLock();
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  // Inline rename state.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function rowOffset(id: string): number {
    if (drag?.id === id) return drag.dx;
    if (swipedId === id) return -ACTIONS_WIDTH;
    return 0;
  }

  function startRename(stream: StoredStream) {
    setRenamingId(stream.id);
    setRenameValue(stream.title || "");
    setSwipedId(null);
  }

  function commitRename() {
    if (renamingId === null) return;
    const title = renameValue.trim();
    if (title) onRename(renamingId, title);
    setRenamingId(null);
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-sidebar text-sidebar-foreground",
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]",
          "transition-transform duration-200 md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-2 md:py-3">
          <span className="text-sm font-semibold text-sidebar-primary">Flow</span>
          <div className="flex items-center gap-1">
            {appLock && appLock.supported && (
              <button
                type="button"
                onClick={
                  appLock.enabled
                    ? () => appLock.lockNow()
                    : () => onOpenSettings("security")
                }
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md hover:bg-sidebar-accent transition-colors md:min-h-0 md:min-w-0 md:p-1.5"
                title={
                  appLock.enabled
                    ? "Lock Flow now — unlock again with Face ID / fingerprint"
                    : "App Lock is off — set up Face ID / fingerprint lock in Settings → Security"
                }
              >
                {appLock.enabled ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <LockOpen className="h-4 w-4 opacity-50" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenSettings()}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md hover:bg-sidebar-accent transition-colors md:min-h-0 md:min-w-0 md:p-1.5"
              title="Settings — keys, export, import"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md hover:bg-sidebar-accent transition-colors md:hidden"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* New chat */}
        <div className="p-3">
          <button
            type="button"
            onClick={onNew}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-sidebar-border",
              "px-3 py-2.5 md:py-2 text-xs font-medium hover:bg-sidebar-accent transition-colors",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </button>
        </div>

        {/* Stream list */}
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5 overscroll-contain">
          {streams.length === 0 && (
            <p className="px-2 pt-2 text-[11px] text-sidebar-foreground/50">
              No conversations yet. They live in this browser and are yours to
              export any time.
            </p>
          )}
          {streams.map((stream) => (
            <div
              key={stream.id}
              className="relative overflow-hidden rounded-md"
            >
              {/* Swipe-revealed actions (behind the row) */}
              <div
                className="absolute inset-y-0 right-0 flex items-stretch"
                style={{ width: ACTIONS_WIDTH }}
              >
                <button
                  type="button"
                  onClick={() => startRename(stream)}
                  className="flex w-11 items-center justify-center bg-sidebar-accent text-sidebar-accent-foreground"
                  title="Rename conversation"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSwipedId(null);
                    onDelete(stream.id);
                  }}
                  className="flex w-11 items-center justify-center bg-destructive text-destructive-foreground"
                  title="Delete conversation (local only — export first if you want a copy)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Foreground row */}
              <div
                className={cn(
                  "group relative flex items-center gap-2 rounded-md bg-sidebar px-2 py-2.5 md:py-2 cursor-pointer",
                  drag?.id === stream.id
                    ? "transition-none"
                    : "transition-transform duration-150",
                  stream.id === activeStreamId
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/60",
                )}
                style={{ transform: `translateX(${rowOffset(stream.id)}px)` }}
                onTouchStart={(e) => {
                  touchStart.current = {
                    id: stream.id,
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY,
                  };
                }}
                onTouchMove={(e) => {
                  const start = touchStart.current;
                  if (!start || start.id !== stream.id) return;
                  const dx = e.touches[0].clientX - start.x;
                  const dy = e.touches[0].clientY - start.y;
                  if (Math.abs(dx) < Math.abs(dy)) return; // vertical scroll
                  const base = swipedId === stream.id ? -ACTIONS_WIDTH : 0;
                  const offset = Math.min(0, Math.max(-ACTIONS_WIDTH, base + dx));
                  setDrag({ id: stream.id, dx: offset });
                }}
                onTouchEnd={() => {
                  const current = drag;
                  touchStart.current = null;
                  setDrag(null);
                  if (!current || current.id !== stream.id) return;
                  suppressClick.current = true;
                  setSwipedId(current.dx < -ACTIONS_WIDTH / 2 ? stream.id : null);
                }}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  if (swipedId === stream.id) {
                    setSwipedId(null);
                    return;
                  }
                  if (renamingId === stream.id) return;
                  onSelect(stream.id);
                  onClose();
                }}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <div className="min-w-0 flex-1">
                  {renamingId === stream.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className={cn(
                        "w-full rounded border border-sidebar-border bg-transparent px-1 py-0.5",
                        "text-[16px] md:text-xs text-sidebar-accent-foreground focus:outline-none",
                      )}
                      aria-label="Rename conversation"
                    />
                  ) : (
                    <p className="truncate text-xs">{stream.title || "Untitled"}</p>
                  )}
                  <p className="truncate text-[10px] opacity-50">
                    {stream.message_count} msg
                    {stream.last_model ? ` · ${formatModelName(stream.last_model)}` : ""}
                    {(savedByStream[stream.id] ?? 0) >= 0.005
                      ? ` · est. ${formatSavedUsd(savedByStream[stream.id])} saved`
                      : ""}
                  </p>
                </div>
                {/* Desktop hover actions */}
                <div className="hidden md:flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(stream);
                    }}
                    className="p-1 rounded opacity-60 hover:opacity-100"
                    title="Rename conversation"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(stream.id);
                    }}
                    className="p-1 rounded opacity-60 hover:opacity-100"
                    title="Delete conversation (local only — export first if you want a copy)"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer: branded lifetime savings counter (the retention artifact)
            + ROI line + wedge. "Kongen Routing" is the product surface;
            "Kongen Logic" (the scoring API brand) lives in the explainer
            body. The login-negation claim is RETIRED (email-verified Kongen
            key required) — approved phrasing is "No password, no profile." */}
        <div className="border-t border-sidebar-border px-4 py-3 space-y-1">
          {lifetimeSavedUsd > 0 && (
            <Explainer
              heading="Kongen Routing"
              body={LABEL_EXPLAIN.kongenRouting}
              learnMore={'More: Settings → "How does Kongen work".'}
              trigger={
                <span className="block text-[11px] font-medium text-sidebar-primary">
                  Kongen Routing has saved you est.{" "}
                  <span className="text-emerald-400">
                    {formatSavedUsd(lifetimeSavedUsd)}
                  </span>{" "}
                  so far
                </span>
              }
              triggerClassName="text-left"
            />
          )}
          {formatRoiLine(lifetimeSavedUsd, lifetimeSpentUsd) && (
            <p className="text-[10px] leading-relaxed text-sidebar-foreground/60">
              {formatRoiLine(lifetimeSavedUsd, lifetimeSpentUsd)}
            </p>
          )}
          <p className="text-[10px] leading-relaxed text-sidebar-foreground/40">
            Local-first. No password, no profile. Your conversations stay with
            you.
          </p>
        </div>
      </aside>
    </>
  );
}
