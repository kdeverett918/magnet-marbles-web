import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import fingerprintModule from "../../scripts/lib/source-fingerprint.cjs";

const { sourceFingerprintSync } = fingerprintModule;
const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, "..");
const repoRoot = resolve(serverRoot, "..");

function commandOutput(command, args, fallback) {
  try {
    const result = spawnSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return result.status === 0 ? result.stdout.trim() || fallback : fallback;
  } catch {
    return fallback;
  }
}

const buildInfo = {
  name: "magnet-marbles-server",
  version: "1.0.0",
  commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || commandOutput("git", ["rev-parse", "--short=12", "HEAD"], "unknown"),
  branch: process.env.RENDER_GIT_BRANCH || process.env.GIT_BRANCH || commandOutput("git", ["branch", "--show-current"], "unknown"),
  dirty: process.env.RENDER ? false : commandOutput("git", ["status", "--short"], "").length > 0,
  builtAt: process.env.BUILD_TIME || process.env.RENDER_DEPLOY_CREATED_AT || new Date().toISOString(),
  sourceFingerprint: process.env.SOURCE_FINGERPRINT || sourceFingerprintSync(repoRoot),
};

await build({
  entryPoints: [resolve(serverRoot, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node18",
  outfile: resolve(serverRoot, "dist/index.js"),
  format: "cjs",
  define: {
    __MM_SERVER_BUILD_INFO__: JSON.stringify(buildInfo),
  },
  logLevel: "info",
});
