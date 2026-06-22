import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sourceFingerprintSync } = require("./scripts/lib/source-fingerprint.cjs") as {
  sourceFingerprintSync: () => string;
};

function commandOrFallback(command: string, fallback: string) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || fallback;
  } catch {
    return fallback;
  }
}

const commit = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || commandOrFallback("git rev-parse --short=12 HEAD", "unknown");
const branch = process.env.RENDER_GIT_BRANCH || process.env.GIT_BRANCH || commandOrFallback("git branch --show-current", "unknown");
const dirty = process.env.RENDER ? false : commandOrFallback("git status --short", "").length > 0;
const builtAt = process.env.BUILD_TIME || new Date().toISOString();
const buildInfo = {
  name: "magnet-marbles-web",
  version: "1.0.0",
  commit,
  branch,
  dirty,
  builtAt,
  sourceFingerprint: process.env.SOURCE_FINGERPRINT || sourceFingerprintSync(),
};

// Magnet Marbles web build. Static SPA, deployed to Render as a static site.
export default defineConfig({
  plugins: [
    react(),
    {
      name: "magnet-marbles-build-info",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "build.json",
          source: `${JSON.stringify(buildInfo, null, 2)}\n`,
        });
      },
    },
  ],
  base: "./",
  define: {
    __MM_BUILD_INFO__: JSON.stringify(buildInfo),
  },
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.split("\\").join("/");
          if (normalized.includes("node_modules/three")) return "three";
          if (normalized.includes("node_modules/@react-three/fiber") || normalized.includes("node_modules/@react-three/drei")) {
            return "r3f";
          }
          return undefined;
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
