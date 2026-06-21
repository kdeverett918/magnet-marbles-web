import { useState } from "react";
import { useGame } from "../store";
import { MODES } from "../data/config";
import { sfx } from "../audio/sfx";
import { MenuBackground } from "../scene/MenuBackground";

const MARBLES_COLORS = ["#3aa0ff", "#9a5cff", "#4dcc66", "#ffc233", "#27e0e0", "#ff4dd2", "#9cff3d"];

function Letters({ word, colors }: { word: string; colors: string[] }) {
  return (
    <span className="ttl-row">
      {word.split("").map((ch, i) => (
        <span key={i} className="ltr" style={{ ["--c" as any]: colors[i % colors.length] }}>
          {ch}
        </span>
      ))}
    </span>
  );
}

export function MainMenu() {
  const { modeId, playerCount, settings, net, setMode, setPlayerCount, startGame, startOnline, toggleSound, setQuality } =
    useGame();
  const [showRoom, setShowRoom] = useState(false);
  const [roomCode, setRoomCode] = useState("");

  const prime = () => {
    sfx.ensure();
    sfx.setEnabled(settings.sound);
    // drop focus so Space/Enter drive the game (magnet/use), not the button
    (document.activeElement as HTMLElement | null)?.blur?.();
  };
  const playSolo = () => {
    prime();
    startGame(modeId, playerCount);
  };
  const playOnline = () => {
    prime();
    startOnline(modeId, roomCode.trim() || undefined);
  };
  const connecting = net.status === "connecting";

  return (
    <div className="menu">
      <MenuBackground />
      <div className="menu-scrim" />

      <div className="menu-inner">
        <div className="title">
          <svg className="field-lines" viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden>
            <g fill="none" strokeWidth="1.4">
              <path d="M40 60 Q200 -10 360 60" stroke="#ff5a4a" opacity="0.5" />
              <path d="M70 64 Q200 14 330 64" stroke="#ff7a4a" opacity="0.35" />
              <path d="M40 100 Q200 170 360 100" stroke="#4aa0ff" opacity="0.5" />
              <path d="M70 96 Q200 146 330 96" stroke="#6ab0ff" opacity="0.35" />
            </g>
          </svg>
          <Letters word="MAGNET" colors={["#ff4d4d"]} />
          <Letters word="MARBLES" colors={MARBLES_COLORS} />
        </div>

        <p className="tagline">
          Magnetize the candy marbles, carry your glowing cluster home, and bump rivals off the
          table. Paint your haul to double it — winner takes the table.
        </p>

        <div className="card">
          <div className="section-label">Choose a mode</div>
          <div className="modes">
            {MODES.map((m) => (
              <button key={m.id} className={`mode ${modeId === m.id ? "active" : ""}`} onClick={() => setMode(m.id)}>
                <span className="name">{m.name}</span>
                <span className="desc">{m.tagline}</span>
              </button>
            ))}
          </div>

          <div className="split">
            <div>
              <div className="section-label">Players</div>
              <div className="row" style={{ justifyContent: "flex-start" }}>
                {[2, 3, 4].map((n) => (
                  <button key={n} className={`chip ${playerCount === n ? "active" : ""}`} onClick={() => setPlayerCount(n)}>
                    {n}P
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="section-label">Options</div>
              <div className="row" style={{ justifyContent: "flex-start" }}>
                <button className={`chip ${settings.sound ? "active" : ""}`} onClick={toggleSound}>
                  {settings.sound ? "🔊" : "🔇"}
                </button>
                <button className={`chip ${settings.quality === "high" ? "active" : ""}`} onClick={() => setQuality("high")}>
                  ✨ High
                </button>
                <button className={`chip ${settings.quality === "lite" ? "active" : ""}`} onClick={() => setQuality("lite")}>
                  ⚡ Lite
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="play-row">
          <button className="btn primary play-btn" onClick={playSolo} disabled={connecting}>
            ▶ SINGLE PLAYER
          </button>
          <button className="btn play-btn online" onClick={playOnline} disabled={connecting}>
            {connecting ? "CONNECTING…" : "🌐 PLAY ONLINE"}
          </button>
        </div>

        <div className="online-row">
          <button className="chip" onClick={() => setShowRoom((v) => !v)}>
            {showRoom ? "▾ Private room" : "▸ Join with code"}
          </button>
          {showRoom && (
            <input
              className="room-input"
              placeholder="room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              maxLength={12}
            />
          )}
          {net.status === "error" && <span className="net-err">⚠ {net.error}</span>}
        </div>

        <div className="menu-foot">
          <kbd>WASD</kbd> move · <kbd>Space</kbd> magnet · <kbd>Shift</kbd> dash · <kbd>E</kbd> powerup
          &nbsp;·&nbsp; touch: drag to move, hold magnet
        </div>
      </div>
    </div>
  );
}
