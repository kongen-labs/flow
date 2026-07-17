import { describe, expect, it } from "vitest";
import { classifyMessage } from "./classify-message";

/**
 * Smoke tests for the classifier (mirrors the hosted app's classifier;
 * keep in sync).
 */
describe("classifyMessage", () => {
  it("dismisses short filler", () => {
    expect(classifyMessage("thanks!", "user")).toBe("dismissed");
    expect(classifyMessage("ok", "user")).toBe("dismissed");
  });

  it("dismisses empty/emoji-only", () => {
    expect(classifyMessage("", "user")).toBe("dismissed");
    expect(classifyMessage("👍", "user")).toBe("dismissed");
  });

  it("marks code as critical", () => {
    expect(classifyMessage("```py\nprint(1)\n```", "user")).toBe("critical");
  });

  it("marks user directives as critical", () => {
    expect(
      classifyMessage("switch to postgres for the session store", "user"),
    ).toBe("critical");
  });

  it("keeps ordinary prose as default", () => {
    expect(
      classifyMessage("What are the tradeoffs between the two options?", "user"),
    ).toBe("default");
  });
});
