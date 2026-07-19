/**
 * "Why this model?" popover for the metadata ribbon.
 *
 * Jul 17 2026 fix (note: "the tooltips are showing on the bottom again"):
 * this surface predated the Explainer portal work and still rendered
 * `absolute top-full` INSIDE the message card — i.e. at the bottom of the
 * card, clipped/overlapped. It now portals to document.body and uses the
 * shared above-first anchored positioning (useAnchoredAbove), same as
 * every Explainer popover. The old arrow is gone (placement can flip).
 */

import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnchoredAbove } from "../explainer";

interface ModelTooltipProps {
  regime?: string;
  model: string;
  provider?: string;
  balance?: number;
  /**
   * Genuine [0,1] certainty (LogicScoreResponse.confidence) — how decisively
   * the prompt maps to its detected regime. Shown as "Confidence". This
   * replaced confidence_adj, a legacy signed nudge that read ~0.00 for most
   * prompts and produced the "Confidence: 0.00" bug.
   */
  confidence?: number;
  budget?: number;
  /** The ribbon's model-name button — the popover hugs this anchor. */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

export function ModelTooltip({
  regime,
  model,
  provider,
  balance,
  confidence,
  budget,
  anchorRef,
  onClose,
}: ModelTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useAnchoredAbove(true, anchorRef, ref);

  // Close on outside click (anchor excluded — its own onClick toggles).
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        !anchorRef.current?.contains(target)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const displayModel = model.split("/").pop() || model;

  return createPortal(
    <div
      ref={ref}
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
      className={cn(
        "fixed z-50 w-64",
        // Same viewport clamp + height cap as Explainer popovers — anchored
        // above the icon at all widths, never a bottom dock.
        "max-w-[calc(100vw-16px)] max-h-[60vh] overflow-y-auto overscroll-contain",
        "rounded-lg border bg-card shadow-lg",
        "animate-in fade-in-0 zoom-in-95 duration-150"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h4 className="text-xs font-sans font-semibold">
          Why {displayModel}?
        </h4>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-muted transition-colors"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-sans">
          {regime && (
            <>
              <span className="text-muted-foreground">Regime</span>
              <span className="font-medium">{regime}</span>
            </>
          )}
          {balance != null && (
            <>
              <span className="text-muted-foreground">Balance</span>
              <span className="font-medium">{balance.toFixed(2)}</span>
            </>
          )}
          {confidence != null && (
            <>
              <span className="text-muted-foreground">Confidence</span>
              <span
                className={cn(
                  "font-medium",
                  confidence >= 0.7
                    ? "text-emerald-600 dark:text-emerald-400"
                    : confidence < 0.4
                      ? "text-muted-foreground"
                      : ""
                )}
              >
                {Math.round(confidence * 100)}%
              </span>
            </>
          )}
        </div>

        {/* Explanation text */}
        <p className="text-xs text-muted-foreground leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
          {provider && displayModel}{" "}
          handles {regime || "this"} regime
          {provider && (
            <>
              {" "}via {provider}
            </>
          )}
          . Logic matched this prompt&apos;s complexity to the model best suited
          for it.
        </p>

        {/* Budget */}
        {budget != null && (
          <div className="flex items-center justify-between border-t pt-2 text-xs font-sans">
            <span className="text-muted-foreground">Token budget</span>
            <span className="font-medium">{budget}</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
