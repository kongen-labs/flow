/**
 * ThemedSelect — styled NATIVE <select> (native selects rendered
 * OS chrome that ignored the Paper+Red tokens, jarring in dark mode).
 *
 * Kept native (appearance-none + token borders/bg/text + custom chevron)
 * rather than a custom listbox: mobile keeps the platform picker UX.
 * color-scheme follows the theme so the option popup itself is dark in
 * dark mode. 44px touch target + 16px font below md (iOS zoom rule),
 * matching the app's other inputs.
 */

import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemedSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cn("relative block", className)}>
      <select
        {...props}
        className={cn(
          "w-full appearance-none rounded-md border bg-card pl-2.5 pr-8 text-foreground",
          "min-h-[44px] py-2.5 text-[16px] md:min-h-0 md:py-1.5 md:text-xs",
          "[color-scheme:light] dark:[color-scheme:dark]",
          "focus:outline-none focus:ring-1 focus:ring-ring",
          "disabled:opacity-50",
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}
