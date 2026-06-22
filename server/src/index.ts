import { createServer } from "http";
import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ArenaRoom } from "./ArenaRoom";

declare const __MM_SERVER_BUILD_INFO__: {
  name: string;
  version: string;
  commit: string;
  branch: string;
  dirty: boolean;
  builtAt: string;
  sourceFingerprint: string;
};

const port = Number(process.env.PORT) || 2567;
const fallbackBuildInfo = {
  name: "magnet-marbles-server",
  version: "1.0.0",
  commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "unknown",
  branch: process.env.RENDER_GIT_BRANCH || process.env.GIT_BRANCH || "unknown",
  dirty: false,
  builtAt: process.env.BUILD_TIME || process.env.RENDER_DEPLOY_CREATED_AT || "runtime",
  sourceFingerprint: process.env.SOURCE_FINGERPRINT || "unknown",
};
const buildInfo = typeof __MM_SERVER_BUILD_INFO__ === "undefined" ? fallbackBuildInfo : __MM_SERVER_BUILD_INFO__;

const app = express();
app.use(cors());
app.use(express.json());
app.get("/", (_req, res) => res.send("Magnet Marbles server: ok"));
app.get("/health", (_req, res) => res.json({ ok: true, build: buildInfo }));
// Catch-all GET → 200 so any platform health-check path passes. WebSocket
// upgrades and Colyseus matchmaking (POST/WS) are unaffected (GET-only).
app.get("*", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("arena", ArenaRoom).filterBy(["mode"]);

gameServer.listen(port).then(() => {
  // eslint-disable-next-line no-console
  console.log(`🟢 Magnet Marbles server listening on :${port}`);
});
