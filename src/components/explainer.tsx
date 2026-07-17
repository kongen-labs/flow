/**
 * Explainer — shared tap/click "what is this?" pattern for informational
 * labels (Jul 16 2026). Copy lives in lib/explain-copy.ts.
 *
 * Behavior: wraps any label/chip in a button; tap toggles a small
 * explanation surface: a popover anchored ABOVE the trigger at ALL widths
 * (Jul 17 2026: "open them on top of where the icons are showing" —
 * the old below-md bottom-docked mini-sheet covered the chat input and read
 * as "tooltips at the bottom"; it is gone). At narrow widths the popover
 * clamps to the viewport width; tall content caps at ~60vh and scrolls
 * internally — it never falls back to a bottom dock. It flips below only
 * when the viewport has no room above (top-bar chips), hugging the anchor.
 * The popover PORTALS to document.body so overflow/transform ancestors can
 * never clip it or stack above it. Position tracks the anchor on
 * scroll/resize (chat pane scrolls under an open popover). Dismiss on
 * tap-outside or Escape.
 *
 * `children` (optional) render actionable controls inside the surface —
 * e.g. the Pin/Default/Ignore signal control — below the one-line body.
 * Clicks inside the surface do not dismiss it. `children` may also be a
 * function `(close) => ReactNode`, so an action (e.g. the "Add a key"
 * deep-link) can close the popover before navigating away — otherwise the
 * body-portaled popover would sit over whatever the action opens.
 *
 * For CONTROLS (mode selector, Full-history chip, chain toggle) the
 * explanation lives in their title/notice instead — wrapping them here
 * would steal their tap action.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Gap between the anchor and the popover, px. */
const GAP = 6;
/** Minimum distance from the viewport edges, px. */
const VIEWPORT_MARGIN = 8;

/**
 * Above-first anchored positioning for a body-portaled popover — the shared
 * mechanic behind Explainer AND ModelTooltip (Jul 17 audit: ModelTooltip
 * still used `absolute top-full` inside the message card and was "showing
 * on the bottom again" once real routing made it a hot path).
 *
 * Returns viewport-fixed {top,left} (null until first measure — render the
 * popover with visibility:hidden until then; the measure happens pre-paint).
 * Flips below only when the viewport has no room above; clamps
 * horizontally; tracks the anchor on scroll (capture) and resize.
 * Re-measures every render while `active` (content may resize); the setter
 * keeps state identity when unchanged, so no render loop.
 */
export function useAnchoredAbove(
  active: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>,
): { top: number; left: number } | null {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;
    const rect = anchor.getBoundingClientRect();
    const height = popover.offsetHeight;
    const width = popover.offsetWidth;
    const fitsAbove = rect.top - GAP - height >= VIEWPORT_MARGIN;
    const top = fitsAbove
      ? rect.top - GAP - height
      : Math.min(rect.bottom + GAP, window.innerHeight - height - VIEWPORT_MARGIN);
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    setPos((prev) =>
      prev && prev.top === top && prev.left === left ? prev : { top, left },
    );
  }, [anchorRef, popoverRef]);

  useEffect(() => {
    if (!active) setPos(null);
  }, [active]);

  useLayoutEffect(() => {
    if (active) place();
  });

  useEffect(() => {
    if (!active) return;
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [active, place]);

  return pos;
}

export function Explainer({
  trigger,
  heading,
  body,
  learnMore = false,
  triggerClassName,
  children,
}: {
  /** The label/chip to render (visuals unchanged). */
  trigger: ReactNode;
  heading: string;
  /** One-line explanation. Optional when `children` carry the content. */
  body?: string;
  /**
   * Append a "More: …" pointer. `true` = the default About-Flow pointer;
   * a string = custom pointer text (e.g. the Kongen explainers point to
   * Settings → "How does Kongen work").
   */
  learnMore?: boolean | string;
  triggerClassName?: string;
  /**
   * Actionable content (controls) rendered below the body. A function form
   * receives a `close` callback so an action can dismiss the popover.
   */
  children?: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Above-first placement + anchor tracking (shared hook — see above).
  const pos = useAnchoredAbove(open, triggerRef, popoverRef);

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        title={heading}
        className={cn(
          // Invisible expanded hit area (~44px) without layout change.
          "relative inline-flex cursor-help items-center after:absolute after:-inset-2.5 after:content-['']",
          triggerClassName,
        )}
      >
        {trigger}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40 block"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            />
            <div
              ref={popoverRef}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "fixed z-50 block rounded-lg border bg-popover p-3 text-left font-sans shadow-lg",
                // Clamp to the viewport at narrow widths; cap tall content
                // (e.g. the actionable signal popover) with internal scroll —
                // never a bottom dock.
                "w-64 max-w-[calc(100vw-16px)] max-h-[60vh] overflow-y-auto overscroll-contain",
              )}
              style={{
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                // Painted only after the first measure (pre-paint via
                // useLayoutEffect) — never flashes at the wrong spot.
                visibility: pos ? "visible" : "hidden",
              }}
              role="note"
            >
              <span className="block text-xs font-semibold text-foreground">
                {heading}
              </span>
              {body && (
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                  {body}
                </span>
              )}
              {children && (
                <div className="mt-2">
                  {typeof children === "function"
                    ? children(() => setOpen(false))
                    : children}
                </div>
              )}
              {learnMore && (
                <span className="mt-1.5 block text-[10px] text-muted-foreground/60">
                  {typeof learnMore === "string" ? (
                    learnMore
                  ) : (
                    <>More: Settings &rarr; &ldquo;How Flow works &amp; your data&rdquo;.</>
                  )}
                </span>
              )}
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}
