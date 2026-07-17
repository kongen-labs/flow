import { cn } from "@/lib/utils";
import { Loader2, Zap } from "lucide-react";
import { ROUTED_VIA_EXPLAIN } from "@/lib/explain-copy";
import { formatModelName } from "@/lib/models";
import type { RoutedVia } from "@/lib/send";
import { Explainer } from "../explainer";

/**
 * Routing indicator for the local app's three routing states:
 *  - "kongen"  → routed via Kongen Logic (regime shown)
 *  - "pinned"  → user pinned a model
 *  - "default" → score call failed at runtime — graceful fallback to the
 *                default model (missing-key is no longer a routing state;
 *                first-run requires a Kongen key)
 */
interface RoutingIndicatorProps {
  model: string | null;
  provider: string | null;
  visible: boolean;
  routedVia?: RoutedVia;
  regime?: string;
  fallbackReason?: string;
}

export function RoutingIndicator({
  model,
  provider,
  visible,
  routedVia,
  regime,
  fallbackReason,
}: RoutingIndicatorProps) {
  const label =
    routedVia === "kongen"
      ? `Routed via Kongen${regime ? ` — ${regime} regime` : ""} →`
      : routedVia === "pinned"
        ? "Pinned model →"
        : "Default model →";

  return (
    <div
      className={cn(
        "mx-auto max-w-3xl px-4 transition-all duration-300 overflow-hidden",
        visible ? "opacity-100 max-h-12 py-2" : "opacity-0 max-h-0 py-0",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-sans text-muted-foreground">
        {routedVia === "kongen" ? (
          <Zap className="h-3.5 w-3.5 shrink-0 text-brand-fg" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        )}
        <span>
          <Explainer
            heading="Routing"
            body={
              routedVia === "default" && fallbackReason
                ? `${ROUTED_VIA_EXPLAIN.default} Reason: ${fallbackReason}.`
                : ROUTED_VIA_EXPLAIN[routedVia ?? "default"]
            }
            trigger={<span>{label}</span>}
          />{" "}
          <span className="font-medium text-foreground">
            {provider && model
              ? `${provider}/${formatModelName(model)}`
              : model
                ? formatModelName(model)
                : "..."}
          </span>
          {fallbackReason && (
            <span className="ml-1 text-muted-foreground/60">
              (smart routing unavailable: {fallbackReason})
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
