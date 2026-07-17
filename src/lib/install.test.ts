import { describe, expect, it } from "vitest";
import {
  detectInstallPlatform,
  isStandaloneEnv,
} from "./install";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0",
  ipadOs:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
};

describe("detectInstallPlatform", () => {
  it("iPhone Safari -> ios-safari (Share > Add to Home Screen)", () => {
    expect(detectInstallPlatform(UA.iphoneSafari)).toBe("ios-safari");
  });

  it("iOS third-party / in-app browsers -> ios-other (must open Safari)", () => {
    expect(detectInstallPlatform(UA.iphoneChrome)).toBe("ios-other");
    expect(detectInstallPlatform(UA.iphoneInstagram)).toBe("ios-other");
  });

  it("iPadOS masquerading as Macintosh (touch points) -> ios-safari", () => {
    expect(detectInstallPlatform(UA.ipadOs, 5)).toBe("ios-safari");
  });

  it("macOS Safari (no touch) -> mac-safari (File > Add to Dock)", () => {
    expect(detectInstallPlatform(UA.macSafari, 0)).toBe("mac-safari");
  });

  it("Mac/Windows Chrome + Edge -> chromium-desktop (prompt/omnibox)", () => {
    expect(detectInstallPlatform(UA.macChrome)).toBe("chromium-desktop");
    expect(detectInstallPlatform(UA.windowsChrome)).toBe("chromium-desktop");
    expect(detectInstallPlatform(UA.windowsEdge)).toBe("chromium-desktop");
  });

  it("Android Chrome -> android-chromium; non-Chromium -> other", () => {
    expect(detectInstallPlatform(UA.androidChrome)).toBe("android-chromium");
    expect(detectInstallPlatform(UA.androidFirefox)).toBe("other");
  });

  it("desktop Firefox -> other (point at a capable browser)", () => {
    expect(detectInstallPlatform(UA.windowsFirefox)).toBe("other");
  });
});

describe("isStandaloneEnv", () => {
  it("display-mode standalone -> true", () => {
    expect(
      isStandaloneEnv({
        matchMedia: (q) => ({ matches: q === "(display-mode: standalone)" }),
      }),
    ).toBe(true);
  });

  it("legacy iOS navigator.standalone -> true", () => {
    expect(isStandaloneEnv({ navigatorStandalone: true })).toBe(true);
  });

  it("plain browser tab -> false (matchMedia false / absent / throwing)", () => {
    expect(isStandaloneEnv({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(isStandaloneEnv({})).toBe(false);
    expect(
      isStandaloneEnv({
        matchMedia: () => {
          throw new Error("nope");
        },
      }),
    ).toBe(false);
  });
});
