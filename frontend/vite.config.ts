import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// In dev, proxy /api to the backend so the SPA stays same-origin (no CORS).
// Override the target with VITE_API_TARGET when the backend runs elsewhere.
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  // Inject the package version so the UI footer can't drift from package.json
  // (#173). Replaced at build/test time as a string literal.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
