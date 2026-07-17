import { describe, expect, it } from "vitest";
import {
  SOURCE_PUBLIC_LINE,
  SOURCE_PUBLIC_PREFIX,
  SOURCE_REPO_LABEL,
  SOURCE_REPO_URL,
} from "./source-link";

describe("source-link approved copy", () => {
  it("pins the approved softened claim verbatim", () => {
    expect(SOURCE_PUBLIC_LINE).toBe(
      "Flow's source is public — read the code behind these promises: github.com/kongen-labs/flow",
    );
  });

  it("never uses the stricter 'open source' claim (gated on build provenance)", () => {
    // IP-review condition: "Flow is open source" only becomes available
    // once the hosted build stamps the repo commit into the About section.
    expect(SOURCE_PUBLIC_LINE.toLowerCase()).not.toContain("open source");
    expect(SOURCE_PUBLIC_PREFIX.toLowerCase()).not.toContain("open source");
  });

  it("link target matches the visible label", () => {
    expect(SOURCE_REPO_URL).toBe(`https://${SOURCE_REPO_LABEL}`);
  });
});
