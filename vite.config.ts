/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Build stamp for the quiet version footer on the Legal & About surface.
// Version comes from package.json; the short commit is best-effort (absent in
// a shallow/no-git build, so it's guarded). Injected as compile-time defines
// so package.json itself is never bundled into the client.
const pkgVersion = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
).version as string;
let commit = "";
try {
  commit = execSync("git rev-parse --short HEAD", {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();
} catch {
  commit = "";
}

// NOTE (one core, two shells): `base: "./"` keeps all asset URLs relative so
// the same build output works as a PWA (any origin) AND inside an MV3
// chrome-extension shell (chrome-extension:// origin). Do not add any
// server-side code paths here — the core must stay fully static.
export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    __APP_BUILD__: JSON.stringify(commit),
  },
  plugins: [react()],
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
