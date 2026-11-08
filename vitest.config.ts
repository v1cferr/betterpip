import { defineConfig } from "vitest/config";

// Core modules are plain TypeScript; their unit tests need no browser (ADR 0003 §4).
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], environment: "node" } });
