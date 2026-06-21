import { createServer } from "http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ArenaRoom } from "./ArenaRoom";

const port = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());
app.get("/", (_req, res) => res.send("Magnet Marbles server: ok"));
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("arena", ArenaRoom);

gameServer.listen(port).then(() => {
  // eslint-disable-next-line no-console
  console.log(`🟢 Magnet Marbles server listening on :${port}`);
});
