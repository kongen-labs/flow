/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// NOTE (one core, two shells): `base: "./"` keeps all asset URLs relative so
// the same build output works as a PWA (any origin) AND inside an MV3
// chrome-extension shell (chrome-extension:// origin). Do not add any
// server-side code paths here — the core must stay fully static.
export default defineConfig({
  base: "./",
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
