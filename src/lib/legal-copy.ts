/**
 * Legal & About copy — the single source for every user-facing string on the
 * new "Legal & About" settings surface and the first-run assent line.
 *
 * Mirrors the source-link.ts pattern: pure strings + URL constants in lib/ so
 * the exact wording is pinned by unit test (legal-copy.test.ts) and reviewed
 * in ONE place. These strings require legal review + the content team verbatim
 * sign-off before this branch merges — do NOT paraphrase or edit copy here
 * without routing the change through that review.
 *
 * URL FORM (Jul 18 2026): the `.html` paths below are the provably-deployed
 * form on kongenlabs.life. infra is confirming whether clean aliases
 * (`/terms`) resolve; if they do, swap the four *_URL constants here — they
 * are single-source so callers never hardcode a legal URL.
 *
 * Existing constants are REUSED, never duplicated:
 *   - KONGEN_SIGNUP_URL          (components/key-setup.tsx)
 *   - SOURCE_REPO_URL / _LABEL / SOURCE_PUBLIC_LINE (lib/source-link.ts)
 */

// ---- Legal + company URLs (single source; trivially swappable) ----
export const TERMS_URL = "https://kongenlabs.life/terms.html";
export const PRIVACY_URL = "https://kongenlabs.life/privacy.html";
export const ACCEPTABLE_USE_URL = "https://kongenlabs.life/acceptable-use.html";
export const KONGEN_COMPANY_URL = "https://kongenlabs.life";

// ---- On-device disclosure (verbatim from the legal spec) ----
export const ON_DEVICE_DISCLOSURE =
  "Your conversations and API keys stay on this device. On Auto, Flow sends each prompt's text to Kongen to score how much reasoning it needs, then sends the prompt to the AI provider whose key you supplied — their reply streams straight back to you under that provider's terms.";

// ---- First-run assent line (verbatim; Terms + Privacy render as inline
// links). Stored as segments so the sentence can be assembled with links
// while ASSENT_LINE pins the full reading verbatim by test. ----
export const ASSENT_PREFIX = "By continuing, you agree to Kongen's ";
export const ASSENT_TERMS_LABEL = "Terms";
export const ASSENT_CONJUNCTION = " and ";
export const ASSENT_PRIVACY_LABEL = "Privacy";
export const ASSENT_LINE = `${ASSENT_PREFIX}${ASSENT_TERMS_LABEL}${ASSENT_CONJUNCTION}${ASSENT_PRIVACY_LABEL}`;

// ---- Link + section labels (Legal & About settings surface) ----
export const LEGAL_MENU_TITLE = "Legal & About";
export const LEGAL_MENU_SUMMARY = "Terms · Privacy · About Kongen";

export const LINK_TERMS_LABEL = "Terms";
export const LINK_PRIVACY_LABEL = "Privacy";
export const LINK_ACCEPTABLE_USE_LABEL = "Acceptable Use";

export const ABOUT_KONGEN_HEADING = "About Kongen";
export const KONGEN_COMPANY_LABEL = "Kongen Labs";
export const KONGEN_KEY_CTA_LABEL = "Get a free Kongen key";
