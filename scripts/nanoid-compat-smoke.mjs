import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT = process.env.NANOID_COMPAT_OUTPUT || "outputs/nanoid-compat-smoke.json";
const ROOT = process.cwd();
const SERVER_PACKAGE_PATH = "server/package.json";
const COMPAT_ROOT = "server/vendor/nanoid-compat";
const COMPAT_PACKAGE_PATH = `${COMPAT_ROOT}/package.json`;
const CJS_PATH = `${COMPAT_ROOT}/index.cjs`;
const ESM_PATH = `${COMPAT_ROOT}/index.js`;
const URL_SAFE = /^[A-Za-z0-9_-]+$/;
const SAMPLE_COUNT = 512;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function text(path) {
  return readFile(path, "utf8");
}

function assertId(value, size, label) {
  assert(typeof value === "string", `${label} did not return a string`);
  assert(value.length === size, `${label} returned length ${value.length}, expected ${size}`);
  if (size > 0) assert(URL_SAFE.test(value), `${label} returned a non URL-safe id: ${value}`);
}

function assertUnique(generator, label) {
  const ids = new Set();
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const id = generator();
    assertId(id, 21, `${label} sample ${i}`);
    ids.add(id);
  }
  assert(ids.size === SAMPLE_COUNT, `${label} produced duplicate ids across ${SAMPLE_COUNT} samples`);
  return ids.size;
}

function assertCommonJsApi(api) {
  assert(typeof api === "function", "CommonJS require('nanoid') must return a callable function for Colyseus 0.16");
  assert(api.nanoid === api, "CommonJS nanoid named export must match the callable default export");
  assert(typeof api.customAlphabet === "function", "CommonJS customAlphabet export is missing");
  assert(typeof api.customRandom === "function", "CommonJS customRandom export is missing");
  assert(typeof api.random === "function", "CommonJS random export is missing");
  assert(typeof api.urlAlphabet === "string" && api.urlAlphabet.length === 64, "CommonJS urlAlphabet must contain 64 URL-safe symbols");
  assertId(api(), 21, "CommonJS nanoid()");
  assertId(api(10), 10, "CommonJS nanoid(10)");
  assertId(api(0), 0, "CommonJS nanoid(0)");
  assertId(api(Number.NaN), 21, "CommonJS nanoid(NaN)");
  const custom = api.customAlphabet("abc", 12);
  const customId = custom();
  assert(customId.length === 12 && /^[abc]+$/.test(customId), `CommonJS customAlphabet generated invalid id: ${customId}`);
  const bytes = api.random(7);
  assert(bytes && typeof bytes.length === "number" && bytes.length === 7, "CommonJS random(7) must return 7 random bytes");
  return assertUnique(api, "CommonJS nanoid");
}

function assertEsmApi(api) {
  assert(typeof api.default === "function", "ESM default nanoid export is missing");
  assert(typeof api.nanoid === "function", "ESM named nanoid export is missing");
  assert(api.default === api.nanoid, "ESM default and named nanoid exports must match");
  assert(typeof api.customAlphabet === "function", "ESM customAlphabet export is missing");
  assert(typeof api.customRandom === "function", "ESM customRandom export is missing");
  assert(typeof api.random === "function", "ESM random export is missing");
  assert(typeof api.urlAlphabet === "string" && api.urlAlphabet.length === 64, "ESM urlAlphabet must contain 64 URL-safe symbols");
  assertId(api.nanoid(), 21, "ESM nanoid()");
  assertId(api.nanoid(8), 8, "ESM nanoid(8)");
  const custom = api.customAlphabet("xyz", 9);
  const customId = custom();
  assert(customId.length === 9 && /^[xyz]+$/.test(customId), `ESM customAlphabet generated invalid id: ${customId}`);
  return assertUnique(api.nanoid, "ESM nanoid");
}

async function run() {
  const [serverPackage, compatPackage, cjsSource, esmSource] = await Promise.all([
    json(SERVER_PACKAGE_PATH),
    json(COMPAT_PACKAGE_PATH),
    text(CJS_PATH),
    text(ESM_PATH),
  ]);

  assert(serverPackage.dependencies?.nanoid === "file:vendor/nanoid-compat", "server package must depend on the local nanoid compatibility package");
  assert(serverPackage.overrides?.nanoid === "$nanoid", "server package must override transitive nanoid to the local compatibility package");
  assert(compatPackage.name === "nanoid", "compat package name must remain nanoid");
  assert(compatPackage.version === "3.3.8", `compat package version must remain 3.3.8, got ${compatPackage.version || "missing"}`);
  assert(compatPackage.type === "module", "compat package must be type: module for ESM import shape");
  assert(compatPackage.main === "./index.cjs", "compat package main must point at ./index.cjs");
  assert(compatPackage.module === "./index.js", "compat package module must point at ./index.js");
  assert(compatPackage.exports?.["."]?.require === "./index.cjs", "compat package require export must point at ./index.cjs");
  assert(compatPackage.exports?.["."]?.import === "./index.js", "compat package import export must point at ./index.js");

  assert(cjsSource.includes("randomFillSync"), "CommonJS shim must use crypto.randomFillSync");
  assert(esmSource.includes("randomFillSync"), "ESM shim must use crypto.randomFillSync");
  assert(!cjsSource.includes("Math.random"), "CommonJS shim must not use Math.random");
  assert(!esmSource.includes("Math.random"), "ESM shim must not use Math.random");
  assert(cjsSource.includes("module.exports = nanoid"), "CommonJS shim must keep callable module.exports shape");
  assert(cjsSource.includes("module.exports.nanoid = nanoid"), "CommonJS shim must expose nanoid named export");
  assert(esmSource.includes("export default nanoid"), "ESM shim must expose default nanoid");

  const require = createRequire(pathToFileURL(resolve(ROOT, "scripts/nanoid-compat-smoke.mjs")));
  const cjsApi = require(resolve(ROOT, CJS_PATH));
  const esmApi = await import(pathToFileURL(resolve(ROOT, ESM_PATH)));
  const cjsUnique = assertCommonJsApi(cjsApi);
  const esmUnique = assertEsmApi(esmApi);

  const report = {
    pass: true,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    package: {
      serverDependency: serverPackage.dependencies.nanoid,
      override: serverPackage.overrides.nanoid,
      compatVersion: compatPackage.version,
      main: compatPackage.main,
      module: compatPackage.module,
    },
    checks: [
      "server dependency and override point at vendor/nanoid-compat",
      "CommonJS require export stays callable for Colyseus 0.16",
      "ESM import export stays available",
      "generated ids are URL-safe with requested/default sizes",
      "customAlphabet/customRandom/random helpers are available",
      "crypto.randomFillSync is used and Math.random is absent",
      `${SAMPLE_COUNT} CommonJS ids were unique`,
      `${SAMPLE_COUNT} ESM ids were unique`,
    ],
    samples: {
      commonJsUnique: cjsUnique,
      esmUnique,
    },
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch(async (error) => {
  const report = {
    pass: false,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
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
