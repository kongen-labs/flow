/**
 * Copy contract — retired-claims scan over the RAW published artifacts
 * (legal review audit, Jul 16 2026: the "no login" claim escaped into
 * public/manifest.webmanifest because the previous scan only covered
 * explain-copy.ts; this closes the escape class at the file level).
 *
 * Retired / banned classes:
 *  - "no login" / "no account" / "no signup" — RETIRED since the
 *    mandatory-Kongen-key funnel (approved form: "no password, no
 *    profile").
 *  - "cheapest" positioning — banned framing (savings are an outcome;
 *    selection is "best suited").
 *  - Savings percentages — no % claims without measured data.
 *
 * Scope: OS/store/repo surfaces that render outside the app UI. In-app
 * strings are covered by explain-copy.test.ts / kongen-copy.test.ts.
 */

import { describe, expect, it } from "vitest";
// Raw file contents via Vite `?raw` (this app has no node types — it is a
// browser bundle; vitest still resolves these through the vite transform).
import manifestRaw from "../../public/manifest.webmanifest?raw";
import readmeRaw from "../../README.md?raw";
import indexHtmlRaw from "../../index.html?raw";
import packageJsonRaw from "../../package.json?raw";

/** Surfaces scanned raw, in full. */
const RAW_SURFACES: Record<string, string> = {
  "public/manifest.webmanifest": manifestRaw,
  "README.md": readmeRaw,
  "index.html": indexHtmlRaw,
};

/** package.json: the description field is the published claim surface
 * (dependency names etc. would false-positive a raw scan). */
const PKG_DESCRIPTION: string =
  (JSON.parse(packageJsonRaw) as { description?: string }).description ?? "";

const RETIRED_CLAIMS: { name: string; pattern: RegExp }[] = [
  { name: '"no login"', pattern: /no[\s-]?login/i },
  { name: '"no account"', pattern: /no[\s-]?account/i },
  { name: '"no signup"', pattern: /no[\s-]?sign[\s-]?up/i },
  { name: '"cheapest" positioning', pattern: /cheapest/i },
  {
    name: "savings percentage claim",
    // a % figure within reach of savings language, either direction
    pattern: /(sav\w*|cheaper)[^.\n]{0,40}\d+\s?%|\d+\s?%[^.\n]{0,40}(sav\w*|cheaper)/i,
  },
];

describe("retired-claims scan (raw published artifacts)", () => {
  for (const [surface, content] of Object.entries(RAW_SURFACES)) {
    for (const { name, pattern } of RETIRED_CLAIMS) {
      it(`${surface} contains no ${name}`, () => {
        const match = content.match(pattern);
        expect(
          match,
          match ? `found: "${match[0]}" in ${surface}` : undefined,
        ).toBeNull();
      });
    }
  }

  for (const { name, pattern } of RETIRED_CLAIMS) {
    it(`package.json description contains no ${name}`, () => {
      expect(PKG_DESCRIPTION).not.toMatch(pattern);
    });
  }

  it("manifest carries the approved description", () => {
    const manifest = JSON.parse(RAW_SURFACES["public/manifest.webmanifest"]);
    expect(manifest.description).toBe(
      "GPTs come and go. You stay in control — your conversations stay on your device, and each prompt is routed to the model best suited to it. BYO keys, no password, no profile.",
    );
  });
});
