import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./globals.css";
import { AppLockGate } from "./components/app-lock-gate";
import { initTheme } from "./lib/theme";

// Apply persisted (or system) theme before first paint to avoid a flash.
initTheme();

// Offline shell: cache app shell + hashed assets, never vendor API calls
// (see public/sw.js). Dev is excluded so Vite HMR stays untouched.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* App Lock wraps the whole tree: while locked, nothing else mounts. */}
    <AppLockGate>
      <App />
    </AppLockGate>
  </React.StrictMode>,
);
