import { describe, expect, it } from "vitest";
import {
  getStoredPref,
  resolveTheme,
  setStoredPref,
  THEME_STORAGE_KEY,
  type StringStorage,
} from "./theme";

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

describe("resolveTheme", () => {
  it("passes explicit prefs through regardless of system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system for 'system'", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("theme persistence", () => {
  it("defaults to system when nothing is stored", () => {
    expect(getStoredPref(fakeStorage())).toBe("system");
  });

  it("defaults to system on invalid stored values", () => {
    expect(getStoredPref(fakeStorage({ [THEME_STORAGE_KEY]: "purple" }))).toBe(
      "system",
    );
  });

  it("round-trips a stored preference", () => {
    const storage = fakeStorage();
    setStoredPref(storage, "dark");
    expect(getStoredPref(storage)).toBe("dark");
    setStoredPref(storage, "light");
    expect(getStoredPref(storage)).toBe("light");
  });

  it("survives a throwing storage", () => {
    const throwing: StringStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(getStoredPref(throwing)).toBe("system");
  });
});
