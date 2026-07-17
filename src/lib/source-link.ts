/**
 * App -> public-repo cross-link (Flow is published at
 * github.com/kongen-labs/flow).
 *
 * APPROVED COPY (IP-review conditioned, Jul 16 2026): the SOFTENED claim
 * below is the only approved form while the hosted deploy is not provably
 * built from the public repo tip.
 *
 * TODO(build-provenance): switch to the stricter "Flow is open source"
 * claim line ONLY when the hosted build pipeline stamps the repo commit
 * into the About section (i.e. the deploy is provably built from the
 * public tip). Until then, do not write "Flow is open source" anywhere in
 * the app.
 *
 * Pure strings in lib/ so the approved wording is pinned by unit test.
 */

export const SOURCE_REPO_URL = "https://github.com/kongen-labs/flow";

/** Link text (the visible URL form, without scheme). */
export const SOURCE_REPO_LABEL = "github.com/kongen-labs/flow";

/** The approved softened claim, rendered as `PREFIX + " " + LABEL-as-link`. */
export const SOURCE_PUBLIC_PREFIX =
  "Flow's source is public — read the code behind these promises:";

/** Full sentence (what the user reads) — pinned verbatim by test. */
export const SOURCE_PUBLIC_LINE = `${SOURCE_PUBLIC_PREFIX} ${SOURCE_REPO_LABEL}`;
