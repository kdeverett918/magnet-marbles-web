process.env.PREVIEW_URL ??= "https://magnet-marbles.onrender.com/";
process.env.PREVIEW_OUTPUT ??= "outputs/live-web-smoke.json";
process.env.PREVIEW_SCREENSHOT ??= "outputs/live-web-smoke.png";

await import("./preview-smoke.mjs");
