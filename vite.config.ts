/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import type { Plugin } from "vite";

// Build stamp for the quiet version footer on the Legal & About surface.
// Version comes from package.json; the short commit is best-effort (absent in
// a shallow/no-git build, so it's guarded). Injected as compile-time defines
// so package.json itself is never bundled into the client.
const pkgVersion = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
).version as string;

// Single source of truth for the build id. Consumed both as the client-visible
// __APP_BUILD__ define AND as the service-worker cache VERSION (see the
// flow-sw-version plugin below), so the two can never drift.
let buildId = "";
try {
  buildId = execSync("git rev-parse --short HEAD", {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();
} catch {
  buildId = "";
}

// public/ files are copied verbatim into dist, so define/replace can't reach
// them at bundle time. This post-build hook rewrites the emitted dist/sw.js,
// swapping the __FLOW_BUILD__ placeholder for the same build id used above.
// Result: every deploy with a new commit → new cache VERSION → the SW's
// activate handler purges all stale runtime caches.
function flowSwVersion(): Plugin {
  return {
    name: "flow-sw-version",
    apply: "build",
    writeBundle(options) {
      const outDir = options.dir ?? path.resolve(__dirname, "dist");
      const swPath = path.join(outDir, "sw.js");
      let src: string;
      try {
        src = readFileSync(swPath, "utf8");
      } catch {
        return; // no sw.js emitted (e.g. non-default build) — nothing to stamp
      }
      // `buildId || "dev"` keeps VERSION a real string in a no-git build.
      const stamped = src.replace(/__FLOW_BUILD__/g, buildId || "dev");
      writeFileSync(swPath, stamped);
    },
  };
}

// NOTE (one core, two shells): `base: "./"` keeps all asset URLs relative so
// the same build output works as a PWA (any origin) AND inside an MV3
// chrome-extension shell (chrome-extension:// origin). Do not add any
// server-side code paths here — the core must stay fully static.
export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    __APP_BUILD__: JSON.stringify(buildId),
  },
  plugins: [react(), flowSwVersion()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
