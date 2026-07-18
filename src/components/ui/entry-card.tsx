/**
 * EntryCard — the settings-v3 row pattern, extracted so the onboarding
 * wizard and the Settings home menu render the SAME card (Jul 17
 * 2026: the wizard's "Install Flow as an app" / "How Flow works & what
 * data we save" were underselling as bare one-line text links).
 *
 * Pattern (impeccable.style — restraint + clear hierarchy): leading icon ·
 * bold title · one short muted subtitle · trailing chevron, on a quiet
 * bordered row with a comfortable 56px tap target (>44px). No color, no
 * gradient — the border + hover:bg-muted carry it.
 *
 * Trailing chevron:
 *  - navigational (default / `expanded` undefined) -> ChevronRight.
 *  - disclosure (`expanded` boolean) -> ChevronDown that rotates when open,
 *    for rows that toggle inline content in place (wizard About row).
 */

import type { ComponentType } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function EntryCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
  expanded,
  subtitleLines = 2,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  onClick: () => void;
  /** Undefined -> navigational (ChevronRight). Boolean -> disclosure toggle. */
  expanded?: boolean;
  /** 1 truncates to a single line (compact menu); 2 clamps to two. */
  subtitleLines?: 1 | 2;
  className?: string;
}) {
  const isDisclosure = expanded !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isDisclosure ? expanded : undefined}
      className={cn(
        "flex min-h-[56px] w-full items-center gap-3 rounded-lg border px-3 py-2 text-left",
        "hover:bg-muted transition-colors",
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span
          className={cn(
            "block text-xs text-muted-foreground",
            subtitleLines === 1 ? "truncate" : "line-clamp-2",
          )}
        >
          {subtitle}
        </span>
      </span>
      {isDisclosure ? (
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform",
            expanded && "rotate-180",
          )}
        />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      )}
    </button>
  );
}
