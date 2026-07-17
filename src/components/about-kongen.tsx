/**
 * "How does Kongen work" — the Kongen-side complement to AboutFlowContent
 * (which is audited and untouched; this section explains the scoring/
 * routing half). ALL copy comes from lib/kongen-copy.ts (verbatim
 * already-approved language — see the strict assembly rule there) and
 * lib/explain-copy.ts REGIME_EXPLAIN (single source for the five regime
 * lines, so this list can never drift from the in-app explainers).
 *
 * Rendered from the settings sheet (expandable, next to About-Flow in the
 * "Your Data" group). Mobile-first: plain stacked text, works at 375px.
 */

import {
  KONGEN_HOW,
  KONGEN_REGIMES_TITLE,
} from "@/lib/kongen-copy";
import { REGIME_EXPLAIN } from "@/lib/explain-copy";
import type { Regime } from "@/lib/models";

const REGIME_ORDER: Regime[] = [
  "trivial",
  "fast",
  "moderate",
  "deep",
  "exhaustive",
];

export function AboutKongenContent() {
  return (
    <div className="space-y-5">
      <ul className="list-disc space-y-1.5 pl-4">
        {KONGEN_HOW.map((item) => (
          <li
            key={item.lead}
            className="text-[11px] leading-relaxed text-muted-foreground"
          >
            <strong className="font-semibold text-foreground">
              {item.lead}
            </strong>{" "}
            {item.rest}
          </li>
        ))}
      </ul>

      <div className="space-y-1.5">
        <h5 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {KONGEN_REGIMES_TITLE}
        </h5>
        <ul className="space-y-1.5">
          {REGIME_ORDER.map((regime) => (
            <li
              key={regime}
              className="text-[11px] leading-relaxed text-muted-foreground"
            >
              <strong className="font-semibold capitalize text-foreground">
                {regime}.
              </strong>{" "}
              {REGIME_EXPLAIN[regime]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
