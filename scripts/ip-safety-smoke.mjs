import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

const OUTPUT = process.env.IP_SAFETY_OUTPUT || "outputs/ip-safety-smoke.json";
const ROOTS = (process.env.IP_SAFETY_ROOTS || "index.html,public,dist,package.json")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".svg", ".webmanifest"]);
const FORBIDDEN_REFERENCES = [
  /\bmy\s+street\b/i,
  /\bps2\b/i,
  /\bplaystation\b/i,
  /\bsony\b/i,
  /\bmarble\s+it\s+up\b/i,
  /\bsuper\s+monkey\s+ball\b/i,
  /\bkatamari\b/i,
];

function isTextFile(path) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

async function collect(path, out = []) {
  if (!existsSync(path)) return out;
  const info = await stat(path);
  if (info.isFile()) {
    if (isTextFile(path)) out.push(path);
    return out;
  }
  if (!info.isDirectory()) return out;
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    await collect(join(path, entry.name), out);
  }
  return out;
}

function excerpt(source, index, length) {
  const start = Math.max(0, index - 36);
  const end = Math.min(source.length, index + length + 36);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

async function run() {
  const files = [];
  for (const root of ROOTS) await collect(root, files);

  const violations = [];
  for (const path of [...new Set(files)].sort()) {
    const source = await readFile(path, "utf8");
    for (const pattern of FORBIDDEN_REFERENCES) {
      const match = source.match(pattern);
      if (!match || match.index === undefined) continue;
      violations.push({
        path: relative(process.cwd(), path).replace(/\\/g, "/"),
        pattern: String(pattern),
        excerpt: excerpt(source, match.index, match[0].length),
      });
    }
  }

  if (violations.length > 0) {
    throw new Error(`Shipped/public IP reference scan failed: ${violations.map((item) => `${item.path} -> ${item.excerpt}`).join("; ")}`);
  }

  const report = {
    pass: true,
    capturedAt: new Date().toISOString(),
    roots: ROOTS,
    filesScanned: files.length,
    forbiddenReferenceCount: FORBIDDEN_REFERENCES.length,
    note: "Reference games may appear in internal docs/tests, but not in shipped public/dist metadata or package marketing copy.",
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch(async (error) => {
  const report = {
    pass: false,
    capturedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  try {
    await mkdir(dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  } catch {
    /* ignore report write failures */
  }
  console.error(error.stack || error.message || error);
  process.exit(1);
});
