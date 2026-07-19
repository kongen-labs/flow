import { describe, expect, it } from "vitest";
import {
  getStoredScale,
  isTextScale,
  scaleFontSizePx,
  setStoredScale,
  TEXT_SCALE_PX,
  TEXT_SCALE_STORAGE_KEY,
  type StringStorage,
  type TextScale,
} from "./text-scale";

function fakeStorage(initial: Record<string, string> = {}): StringStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("isTextScale", () => {
  it("accepts the three valid scales, rejects anything else", () => {
    for (const s of ["small", "default", "large"] as const) {
      expect(isTextScale(s)).toBe(true);
    }
    expect(isTextScale("huge")).toBe(false);
    expect(isTextScale("")).toBe(false);
    expect(isTextScale(null)).toBe(false);
    expect(isTextScale(16)).toBe(false);
  });
});

describe("scaleFontSizePx", () => {
  it("maps scale → root font-size, default is the 16px browser baseline", () => {
    expect(scaleFontSizePx("default")).toBe(16);
    expect(scaleFontSizePx("small")).toBe(TEXT_SCALE_PX.small);
    expect(scaleFontSizePx("large")).toBe(TEXT_SCALE_PX.large);
    // Monotonic: small < default < large.
    expect(scaleFontSizePx("small")).toBeLessThan(scaleFontSizePx("default"));
    expect(scaleFontSizePx("default")).toBeLessThan(scaleFontSizePx("large"));
  });
});

describe("text-scale persistence", () => {
  it("defaults to 'default' when nothing is stored", () => {
    expect(getStoredScale(fakeStorage())).toBe("default");
  });

  it("defaults to 'default' on invalid stored values", () => {
    expect(
      getStoredScale(fakeStorage({ [TEXT_SCALE_STORAGE_KEY]: "gigantic" })),
    ).toBe("default");
  });

  it("round-trips a stored scale", () => {
    const storage = fakeStorage();
    for (const s of ["small", "large", "default"] as TextScale[]) {
      setStoredScale(storage, s);
      expect(getStoredScale(storage)).toBe(s);
    }
  });

  it("survives a throwing storage", () => {
    const throwing: StringStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(getStoredScale(throwing)).toBe("default");
  });
});
