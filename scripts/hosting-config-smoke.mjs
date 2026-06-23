import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const OUTPUT = process.env.HOSTING_OUTPUT || "outputs/hosting-config-smoke.json";
const RENDER_YAML = process.env.HOSTING_RENDER_YAML || "render.yaml";
const REQUIRE_LIVE_CONFIG = process.env.HOSTING_REQUIRE_LIVE_CONFIG === "1";
const CHECK_LIVE_CONFIG = REQUIRE_LIVE_CONFIG || process.env.HOSTING_CHECK_LIVE_CONFIG === "1";
const SERVER_SERVICE_NAME = process.env.HOSTING_SERVER_SERVICE_NAME || "magnet-marbles-server";
const WEB_SERVICE_NAME = process.env.HOSTING_WEB_SERVICE_NAME || "magnet-marbles";
const REQUIRED_SERVER_PLAN = process.env.HOSTING_REQUIRED_SERVER_PLAN || "starter";
const REQUIRED_HEALTH_PATH = process.env.HOSTING_REQUIRED_HEALTH_PATH || "/health";
const REQUIRED_STATIC_PUBLISH_PATH = process.env.HOSTING_REQUIRED_STATIC_PUBLISH_PATH || "./dist";
const REQUIRED_WEB_SOCKET_URL = process.env.HOSTING_REQUIRED_WEB_SOCKET_URL || "wss://magnet-marbles-server.onrender.com";

function addIssue(list, message, severity = "blocker") {
  list.push({ severity, message });
}

function blockForService(source, name) {
  const lines = source.split(/\r?\n/);
  const nameLineIndex = lines.findIndex((line) => new RegExp(`^\\s*name:\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`).test(line));
  if (nameLineIndex < 0) return "";

  let startLine = nameLineIndex;
  while (startLine > 0 && !/^\s*-\s+type:/.test(lines[startLine])) startLine--;

  let endLine = lines.length;
  for (let i = nameLineIndex + 1; i < lines.length; i++) {
    if (/^\s*-\s+type:/.test(lines[i])) {
      endLine = i;
      break;
    }
  }

  return lines.slice(startLine, endLine).join("\n");
}

function valueFor(block, key) {
  const match = block.match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
}

function validateBlueprint(source, issues) {
  const server = blockForService(source, SERVER_SERVICE_NAME);
  const web = blockForService(source, WEB_SERVICE_NAME);
  if (!server) addIssue(issues, `render.yaml is missing ${SERVER_SERVICE_NAME}`);
  if (!web) addIssue(issues, `render.yaml is missing ${WEB_SERVICE_NAME}`);
  if (!server || !web) return null;

  const serverPlan = valueFor(server, "plan");
  const healthCheckPath = valueFor(server, "healthCheckPath");
  const staticPublishPath = valueFor(web, "staticPublishPath");

  if (serverPlan.toLowerCase() === "free" || serverPlan !== REQUIRED_SERVER_PLAN) {
    addIssue(issues, `Render blueprint server plan is ${serverPlan || "missing"}; expected ${REQUIRED_SERVER_PLAN}`);
  }
  if (healthCheckPath !== REQUIRED_HEALTH_PATH) {
    addIssue(issues, `Render blueprint healthCheckPath is ${healthCheckPath || "missing"}; expected ${REQUIRED_HEALTH_PATH}`);
  }
  if (staticPublishPath !== REQUIRED_STATIC_PUBLISH_PATH) {
    addIssue(issues, `Render blueprint staticPublishPath is ${staticPublishPath || "missing"}; expected ${REQUIRED_STATIC_PUBLISH_PATH}`);
  }
  if (!web.includes("VITE_SERVER_URL") || !web.includes(REQUIRED_WEB_SOCKET_URL)) {
    addIssue(issues, `Render blueprint must set VITE_SERVER_URL to ${REQUIRED_WEB_SOCKET_URL}`);
  }

  return {
    server: {
      name: SERVER_SERVICE_NAME,
      plan: serverPlan,
      healthCheckPath,
    },
    web: {
      name: WEB_SERVICE_NAME,
      staticPublishPath,
      viteServerUrl: web.includes(REQUIRED_WEB_SOCKET_URL) ? REQUIRED_WEB_SOCKET_URL : null,
    },
  };
}

function renderToken() {
  for (const key of ["RENDER_API_KEY", "RENDER_TOKEN"]) {
    const value = process.env[key];
    if (value && value.trim()) return { source: key, value: value.trim() };
  }

  const configPath = join(homedir(), ".render", "cli.yaml");
  if (!existsSync(configPath)) return null;
  try {
    const source = readFileSync(configPath, "utf8");
    const match = source.match(/(?:apiKey|api_key|token|accessToken|access_token):\s*["']?([^"'\s]+)["']?/i);
    return match ? { source: configPath, value: match[1] } : null;
  } catch {
    return null;
  }
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 500);
  }
  if (!response.ok) {
    throw new Error(`Render API ${url} returned ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body).slice(0, 500)}`);
  }
  return body;
}

function normalizeService(item) {
  const service = item?.service || item;
  const details = service?.serviceDetails || service?.service_details || {};
  return {
    id: service?.id || item?.id || "",
    name: service?.name || item?.name || "",
    type: service?.type || item?.type || "",
    plan: details.plan || service?.plan || "",
    healthCheckPath: details.healthCheckPath || details.health_check_path || service?.healthCheckPath || "",
    url: details.url || service?.serviceDetails?.url || service?.url || "",
  };
}

async function listRenderServices(token) {
  const services = [];
  let url = "https://api.render.com/v1/services?limit=100";
  for (let page = 0; page < 5 && url; page++) {
    const body = await fetchJson(url, token);
    const items = Array.isArray(body) ? body : body.services || body.data || [];
    services.push(...items.map(normalizeService).filter((service) => service.name));
    const cursor = body.nextCursor || body.next_cursor || body.cursor || null;
    url = cursor ? `https://api.render.com/v1/services?limit=100&cursor=${encodeURIComponent(cursor)}` : "";
  }
  return services;
}

function validateLiveServices(services, issues) {
  const server = services.find((service) => service.name === SERVER_SERVICE_NAME);
  const web = services.find((service) => service.name === WEB_SERVICE_NAME);
  if (!server) addIssue(issues, `Render API did not return service ${SERVER_SERVICE_NAME}`);
  if (!web) addIssue(issues, `Render API did not return service ${WEB_SERVICE_NAME}`);

  if (server) {
    if (String(server.plan).toLowerCase() === "free" || server.plan !== REQUIRED_SERVER_PLAN) {
      addIssue(issues, `Render live server plan is ${server.plan || "missing"}; expected ${REQUIRED_SERVER_PLAN}`);
    }
    if (server.healthCheckPath && server.healthCheckPath !== REQUIRED_HEALTH_PATH) {
      addIssue(issues, `Render live server healthCheckPath is ${server.healthCheckPath}; expected ${REQUIRED_HEALTH_PATH}`);
    }
  }

  return {
    server: server ? {
      id: server.id,
      name: server.name,
      type: server.type,
      plan: server.plan,
      healthCheckPath: server.healthCheckPath || null,
      url: server.url || null,
    } : null,
    web: web ? {
      id: web.id,
      name: web.name,
      type: web.type,
      plan: web.plan || null,
      url: web.url || null,
    } : null,
  };
}

async function run() {
  const issues = [];
  const warnings = [];
  const source = await readFile(RENDER_YAML, "utf8");
  const blueprint = validateBlueprint(source, issues);

  let live = { checked: false };
  if (CHECK_LIVE_CONFIG) {
    const token = renderToken();
    if (!token) {
      addIssue(REQUIRE_LIVE_CONFIG ? issues : warnings, "Render API token not available; set RENDER_API_KEY or log in with Render CLI", REQUIRE_LIVE_CONFIG ? "blocker" : "warning");
      live = { checked: false, tokenSource: null };
    } else {
      try {
        const services = await listRenderServices(token.value);
        live = {
          checked: true,
          tokenSource: token.source === join(homedir(), ".render", "cli.yaml") ? "render-cli-config" : token.source,
          serviceCount: services.length,
          ...validateLiveServices(services, issues),
        };
      } catch (error) {
        addIssue(issues, `Render live config check failed: ${error.message}`);
        live = { checked: false, error: error.message };
      }
    }
  }

  const blockers = issues.filter((issue) => issue.severity !== "warning");
  const report = {
    pass: blockers.length === 0,
    capturedAt: new Date().toISOString(),
    browserAutomation: false,
    renderYaml: RENDER_YAML,
    requireLiveConfig: REQUIRE_LIVE_CONFIG,
    checkLiveConfig: CHECK_LIVE_CONFIG,
    required: {
      serverPlan: REQUIRED_SERVER_PLAN,
      healthCheckPath: REQUIRED_HEALTH_PATH,
      staticPublishPath: REQUIRED_STATIC_PUBLISH_PATH,
      viteServerUrl: REQUIRED_WEB_SOCKET_URL,
    },
    blueprint,
    live,
    blockers,
    warnings,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    pass: report.pass,
    capturedAt: report.capturedAt,
    output: OUTPUT,
    browserAutomation: report.browserAutomation,
    requireLiveConfig: report.requireLiveConfig,
    blueprint: report.blueprint,
    live: report.live,
    blockers: blockers.map((issue) => issue.message),
    warnings: warnings.map((issue) => issue.message),
  }, null, 2));

  if (!report.pass) process.exitCode = 1;
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
  process.exitCode = 1;
});
