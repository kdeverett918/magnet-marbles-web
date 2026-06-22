process.env.ONLINE_MODES_SERVER_URL ??= "wss://magnet-marbles-server.onrender.com";
process.env.ONLINE_MODES_OUTPUT ??= "outputs/online-modes-smoke-live.json";
process.env.ONLINE_MODES_HEALTH_TIMEOUT_MS ??= "60000";
process.env.ONLINE_MODES_HEALTH_POLL_MS ??= "1000";
process.env.ONLINE_MODES_JOIN_TIMEOUT_MS ??= "60000";

await import("./online-modes-smoke.mjs");
