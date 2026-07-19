import { describe, expect, it } from "vitest";
import {
  ABOUT_KONGEN_HEADING,
  ACCEPTABLE_USE_URL,
  ASSENT_CONJUNCTION,
  ASSENT_LINE,
  ASSENT_PREFIX,
  ASSENT_PRIVACY_LABEL,
  ASSENT_TERMS_LABEL,
  KONGEN_COMPANY_LABEL,
  KONGEN_COMPANY_URL,
  KONGEN_KEY_CTA_LABEL,
  LEGAL_MENU_SUMMARY,
  LEGAL_MENU_TITLE,
  LINK_ACCEPTABLE_USE_LABEL,
  LINK_PRIVACY_LABEL,
  LINK_TERMS_LABEL,
  ON_DEVICE_DISCLOSURE,
  PRIVACY_URL,
  TERMS_URL,
} from "./legal-copy";

describe("legal-copy approved strings", () => {
  it("pins the on-device disclosure line verbatim", () => {
    expect(ON_DEVICE_DISCLOSURE).toBe(
      "Your conversations and API keys stay on this device. On Auto, Flow sends each prompt's text to Kongen to score how much reasoning it needs, then sends the prompt to the AI provider whose key you supplied — their reply streams straight back to you under that provider's terms.",
    );
  });

  it("pins the first-run assent line verbatim", () => {
    expect(ASSENT_LINE).toBe(
      "By continuing, you agree to Kongen's Terms and Privacy",
    );
  });

  it("assembles the assent line from its inline-link segments", () => {
    // The rendered form links Terms + Privacy inline; the segments must
    // reconstruct the pinned sentence exactly.
    expect(
      `${ASSENT_PREFIX}${ASSENT_TERMS_LABEL}${ASSENT_CONJUNCTION}${ASSENT_PRIVACY_LABEL}`,
    ).toBe(ASSENT_LINE);
    expect(ASSENT_TERMS_LABEL).toBe("Terms");
    expect(ASSENT_PRIVACY_LABEL).toBe("Privacy");
  });

  it("pins the legal URL constants (provably-deployed .html form)", () => {
    expect(TERMS_URL).toBe("https://kongenlabs.life/terms.html");
    expect(PRIVACY_URL).toBe("https://kongenlabs.life/privacy.html");
    expect(ACCEPTABLE_USE_URL).toBe(
      "https://kongenlabs.life/acceptable-use.html",
    );
    expect(KONGEN_COMPANY_URL).toBe("https://kongenlabs.life");
  });

  it("pins the menu + link labels", () => {
    expect(LEGAL_MENU_TITLE).toBe("Legal & About");
    expect(LEGAL_MENU_SUMMARY).toBe("Terms · Privacy · About Kongen");
    expect(LINK_TERMS_LABEL).toBe("Terms");
    expect(LINK_PRIVACY_LABEL).toBe("Privacy");
    expect(LINK_ACCEPTABLE_USE_LABEL).toBe("Acceptable Use");
    expect(ABOUT_KONGEN_HEADING).toBe("About Kongen");
    expect(KONGEN_COMPANY_LABEL).toBe("Kongen Labs");
    expect(KONGEN_KEY_CTA_LABEL).toBe("Get a free Kongen key");
  });
});
