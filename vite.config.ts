import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Cloudflare Pages and custom domains deploy at root. GitHub Pages keeps
  // passing /diceify/ explicitly from its workflow while it remains online.
  base: process.env.VITE_BASE_PATH?.trim() || "/",
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
