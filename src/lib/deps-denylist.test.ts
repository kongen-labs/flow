/**
 * Dependency denylist — REQUIRED engineering bind (legal review,
 * Jul 16 2026). The published copy asserts "No analytics or tracking SDK
 * runs in this app" (audited About-Flow + landing copy). This test makes
 * that claim structurally protected: adding any analytics / telemetry /
 * attribution SDK to package.json fails CI before the copy becomes false.
 *
 * If a dependency legitimately collides with a token here, do NOT weaken
 * the pattern silently — take it to legal review (the published claim is
 * binding on engineering).
 */

import { describe, expect, it } from "vitest";
import packageJsonRaw from "../../package.json?raw";

// Add new trackers here as they appear in the wild.
const DENYLIST: RegExp[] = [
  /^branch(-sdk)?$/i,
  /^@branch\//i,
  /posthog/i,
  /^@sentry\//i,
  /^sentry/i,
  /^@segment\//i,
  /^analytics-node$/i,
  /segment/i,
  /amplitude/i,
  /mixpanel/i,
  /google-analytics/i,
  /^gtag/i,
  /react-ga/i,
  /plausible/i,
  /hotjar/i,
  /fullstory/i,
  /^heap/i,
  /matomo/i,
  /^@vercel\/analytics$/i,
];

const pkg = JSON.parse(packageJsonRaw) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const allDeps = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
];

describe("analytics/telemetry dependency denylist", () => {
  it("has dependencies to scan (sanity)", () => {
    expect(allDeps.length).toBeGreaterThan(0);
  });

  it("no analytics / telemetry / attribution SDK in dependencies", () => {
    const hits = allDeps.filter((dep) =>
      DENYLIST.some((pattern) => pattern.test(dep)),
    );
    expect(
      hits,
      hits.length
        ? `denylisted dependency present: ${hits.join(", ")} — the published ` +
            `"no analytics or tracking SDK" claim would become false`
        : undefined,
    ).toEqual([]);
  });
});
