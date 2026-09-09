import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Keep project Pages working now; switch the repository variable to `/` after a custom domain is attached.
  base: process.env.VITE_BASE_PATH?.trim() || "/diceify/",
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
