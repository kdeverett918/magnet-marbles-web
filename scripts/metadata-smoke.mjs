import { stat, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const OUTPUT = process.env.METADATA_OUTPUT || "outputs/metadata-smoke.json";
const INDEX = process.env.METADATA_INDEX || "index.html";
const PUBLIC_ROOT = process.env.METADATA_PUBLIC_ROOT || "public";

function requireMatch(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) throw new Error(`${label} is missing`);
  return match;
}

function requireIncludes(value, expected, label) {
  if (!value.includes(expected)) throw new Error(`${label} must include '${expected}', got '${value}'`);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attrFromTag(tag, attrName, label) {
  const value = tag.match(new RegExp(`${attrName}=["']([^"']+)["']`, "i"))?.[1];
  if (!value) throw new Error(`${label} is missing ${attrName}`);
  return value;
}

function attr(source, tagPattern, attrName, label) {
  const tag = requireMatch(source, tagPattern, label)[0];
  return attrFromTag(tag, attrName, label);
}

function tagWithAttr(source, tagName, attrName, attrValue, label) {
  const escaped = escapeRegExp(attrValue);
  return requireMatch(source, new RegExp(`<${tagName}\\b(?=[^>]*\\b${attrName}=["']${escaped}["'])[^>]*>`, "i"), label)[0];
}

function metaContent(source, keyName, keyValue, label) {
  return attrFromTag(tagWithAttr(source, "meta", keyName, keyValue, label), "content", label);
}

function linkHref(source, rel, label) {
  return attrFromTag(tagWithAttr(source, "link", "rel", rel, label), "href", label);
}

function publicPath(href) {
  return join(PUBLIC_ROOT, href.replace(/^\.\//, "").replace(/^\//, ""));
}

async function pngDimensions(path, label) {
  const bytes = await readFile(path);
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error(`${label} is not a PNG: ${path}`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

async function existingAsset(href, label, expected = {}) {
  const path = publicPath(href);
  const info = await stat(path);
  if (info.size <= 0) throw new Error(`${label} is empty: ${path}`);
  if (expected.minBytes && info.size < expected.minBytes) {
    throw new Error(`${label} is suspiciously small: ${info.size} bytes`);
  }
  const asset = { label, href, path, bytes: info.size };
  if (expected.type === "image/png") {
    asset.dimensions = await pngDimensions(path, label);
    if (expected.width && asset.dimensions.width !== expected.width) {
      throw new Error(`${label} width must be ${expected.width}, got ${asset.dimensions.width}`);
    }
    if (expected.height && asset.dimensions.height !== expected.height) {
      throw new Error(`${label} height must be ${expected.height}, got ${asset.dimensions.height}`);
    }
  }
  return asset;
}

async function existingTextAsset(href, label, requiredText = [], expected = {}) {
  const asset = await existingAsset(href, label, expected);
  const source = await readFile(asset.path, "utf8");
  for (const text of requiredText) {
    if (!source.includes(text)) throw new Error(`${label} must include '${text}'`);
  }
  return asset;
}

async function existingLaunchPage(href, label, requiredText = []) {
  const path = publicPath(href);
  const html = await readFile(path, "utf8");
  const info = await stat(path);
  if (info.size < 2000) throw new Error(`${label} is suspiciously small: ${path}`);
  for (const text of requiredText) {
    if (!html.includes(text)) throw new Error(`${label} must include '${text}'`);
  }
  if (!html.includes("Back to game")) throw new Error(`${label} must link back to the game`);
  return { label, href, path, bytes: info.size };
}

function parseSize(size) {
  const match = String(size).match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

async function run() {
  const index = await readFile(INDEX, "utf8");
  const title = requireMatch(index, /<title>([^<]+)<\/title>/i, "title")[1].trim();
  if (title !== "Magnet Marbles") throw new Error(`Unexpected title '${title}'`);

  const viewport = metaContent(index, "name", "viewport", "viewport meta");
  requireIncludes(viewport, "width=device-width", "viewport");
  requireIncludes(viewport, "viewport-fit=cover", "viewport");

  const description = metaContent(index, "name", "description", "description meta");
  if (description.length < 80 || !description.toLowerCase().includes("marble")) {
    throw new Error("description meta is too weak for public sharing/search");
  }

  const themeColor = metaContent(index, "name", "theme-color", "theme-color meta");
  if (!/^#[0-9a-f]{6}$/i.test(themeColor)) throw new Error(`Invalid theme color '${themeColor}'`);

  const applicationName = metaContent(index, "name", "application-name", "application-name meta");
  if (applicationName !== "Magnet Marbles") throw new Error("application-name must be Magnet Marbles");

  const appleTitle = metaContent(index, "name", "apple-mobile-web-app-title", "apple mobile web app title meta");
  if (appleTitle !== "Magnet Marbles") throw new Error("apple-mobile-web-app-title must be Magnet Marbles");

  const appleCapable = metaContent(index, "name", "apple-mobile-web-app-capable", "apple mobile web app capable meta");
  if (appleCapable !== "yes") throw new Error("apple-mobile-web-app-capable must be yes");

  const mobileCapable = metaContent(index, "name", "mobile-web-app-capable", "mobile web app capable meta");
  if (mobileCapable !== "yes") throw new Error("mobile-web-app-capable must be yes");

  const ogTitle = metaContent(index, "property", "og:title", "og:title meta");
  if (ogTitle !== "Magnet Marbles") throw new Error("og:title must be Magnet Marbles");
  const ogImage = metaContent(index, "property", "og:image", "og:image meta");
  const twitterCard = metaContent(index, "name", "twitter:card", "twitter:card meta");
  if (twitterCard !== "summary_large_image") throw new Error("twitter:card must be summary_large_image");
  const twitterImage = metaContent(index, "name", "twitter:image", "twitter:image meta");
  if (twitterImage !== ogImage) throw new Error("twitter:image must match og:image");

  const manifestHref = linkHref(index, "manifest", "manifest link");
  const faviconHref = linkHref(index, "icon", "favicon link");
  const appleIconTag = tagWithAttr(index, "link", "rel", "apple-touch-icon", "apple touch icon link");
  const appleIconHref = attrFromTag(appleIconTag, "href", "apple touch icon link");
  const appleIconSizes = attrFromTag(appleIconTag, "sizes", "apple touch icon link");
  if (appleIconSizes !== "180x180") throw new Error("apple touch icon must declare 180x180");

  const manifestPath = publicPath(manifestHref);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.name !== "Magnet Marbles") throw new Error("manifest name must be Magnet Marbles");
  if (!manifest.short_name || manifest.short_name.length > 12) throw new Error("manifest short_name must be present and compact");
  if (!String(manifest.description || "").toLowerCase().includes("magnetize")) throw new Error("manifest description must describe gameplay");
  if (manifest.start_url !== "./") throw new Error("manifest start_url must be ./");
  if (manifest.scope !== "./") throw new Error("manifest scope must be ./");
  if (!["fullscreen", "standalone"].includes(manifest.display)) throw new Error("manifest display must be fullscreen or standalone");
  if (manifest.orientation !== "portrait") throw new Error("manifest orientation must be portrait");
  if (manifest.theme_color !== themeColor) throw new Error("manifest theme_color must match index theme-color");
  if (manifest.background_color !== themeColor) throw new Error("manifest background_color must match index theme-color");
  if (!Array.isArray(manifest.categories) || !manifest.categories.includes("games")) throw new Error("manifest categories must include games");
  if (!Array.isArray(manifest.icons) || manifest.icons.length < 3) throw new Error("manifest icons are missing production PNG sizes");

  const assets = [
    await existingAsset(faviconHref, "favicon"),
    await existingAsset(appleIconHref, "apple touch icon", { type: "image/png", width: 180, height: 180, minBytes: 2000 }),
    await existingAsset(manifestHref, "manifest"),
    await existingTextAsset("./service-worker.js", "service worker", [
      "CACHE_PREFIX",
      "APP_SHELL",
      "REMOVED_AUDIO_PATHS",
      "purgeRemovedAssets",
      "removedAudioResponse",
      "networkFirst",
      "cacheFirst",
      "sameOrigin(request)",
      "./build.json",
      "./audio/sfx/pickup.mp3",
    ], { minBytes: 1500 }),
    await existingAsset(ogImage, "social preview image", { type: "image/png", width: 1200, height: 630, minBytes: 20000 }),
    await existingLaunchPage("./privacy.html", "privacy page", [
      "local storage",
      "Online Play",
      "Third Parties",
      "in-app purchases",
      "loot boxes",
      "Fair Play And Purchases",
      "online matches do not award account progression",
    ]),
    await existingLaunchPage("./support.html", "support page", [
      "Fast Fixes",
      "Controls",
      "Bug Report",
      "SFX volume",
      "lower-right thumb zone",
      "no purchases",
    ]),
  ];

  let has192 = false;
  let has512 = false;
  let hasMaskable512 = false;
  for (const [i, icon] of manifest.icons.entries()) {
    if (!icon.src || !icon.type || !icon.sizes) throw new Error(`manifest icon ${i} is incomplete`);
    if (icon.type === "image/png") {
      const size = parseSize(icon.sizes);
      if (!size) throw new Error(`manifest PNG icon ${i} must declare concrete WxH sizes`);
      assets.push(await existingAsset(icon.src, `manifest icon ${i}`, { type: "image/png", ...size, minBytes: 2000 }));
      has192 = has192 || (size.width === 192 && size.height === 192);
      has512 = has512 || (size.width === 512 && size.height === 512 && String(icon.purpose || "").includes("any"));
      hasMaskable512 = hasMaskable512 || (size.width === 512 && size.height === 512 && String(icon.purpose || "").includes("maskable"));
    } else {
      assets.push(await existingAsset(icon.src, `manifest icon ${i}`));
    }
  }
  if (!has192) throw new Error("manifest must include a 192x192 PNG icon");
  if (!has512) throw new Error("manifest must include a 512x512 PNG icon with purpose any");
  if (!hasMaskable512) throw new Error("manifest must include a 512x512 PNG icon with purpose maskable");

  const report = {
    pass: true,
    capturedAt: new Date().toISOString(),
    index: INDEX,
    manifest: manifestPath,
    title,
    viewport,
    description,
    themeColor,
    applicationName,
    appleTitle,
    socialImage: ogImage,
    display: manifest.display,
    orientation: manifest.orientation,
    icons: manifest.icons,
    assets,
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
