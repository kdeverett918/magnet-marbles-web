import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { PU_ICON, PU_LABEL } from "./icons";
import { POWERUP_META } from "../data/config";

export function Hud() {
  const hud = useGame((s) => s.hud);
  const quitToMenu = useGame((s) => s.quitToMenu);
  const playing = hud.phase === "playing" || hud.phase === "intro";
  if (!playing) return null;

  const you = hud.players[0];
  const low = hud.roundTime <= 10;
  const mins = Math.floor(hud.roundTime / 60);
  const secs = Math.floor(hud.roundTime % 60);

  return (
    <div className="hud">
      <div className="topbar">
        <div className="scoreboard">
          {hud.players.map((p) => (
            <ScorePill key={p.id} id={p.id} name={p.id === hud.humanId ? "You" : p.name} color={p.colorHex} score={p.score} you={p.id === hud.humanId} />
          ))}
        </div>

        <div className="timer-wrap">
          <div className={`timer ${low ? "low" : ""}`}>
            {mins}:{secs.toString().padStart(2, "0")}
          </div>
          <div className="round-label">
            {hud.suddenDeath ? <span className="sd-badge">SUDDEN DEATH</span> : `Round ${hud.round} / ${hud.totalRounds}`}
          </div>
        </div>

        <div style={{ width: 80 }} />
      </div>

      {/* active buffs */}
      {hud.activePowerups.length > 0 && (
        <div className="buffs">
          {hud.activePowerups.map((b) => {
            const meta = POWERUP_META[b.type];
            return (
              <div key={b.type} className="buff" style={{ color: meta.color }}>
                <span>{PU_ICON[b.type]}</span>
                <span>{PU_LABEL[b.type]}</span>
                <span className="bar"><i style={{ width: `${Math.min((b.remaining / 9) * 100, 100)}%` }} /></span>
              </div>
            );
          })}
        </div>
      )}

      {/* cluster meter */}
      {you && (
        <div className="cluster">
          <div className="meter">
            <i style={{ width: `${(you.cluster / hud.clusterCap) * 100}%`, background: you.colorHex }} />
          </div>
          <div className="lbl">{you.cluster} / {hud.clusterCap} carried</div>
        </div>
      )}

      <button className="btn ghost corner-btn" style={{ pointerEvents: "auto", padding: "8px 14px", fontSize: 13 }} onClick={quitToMenu}>
        ✕ Quit
      </button>
    </div>
  );
}

function ScorePill({ id, name, color, score, you }: { id: number; name: string; color: string; score: number; you: boolean }) {
  const [bump, setBump] = useState(false);
  const prev = useRef(score);
  useEffect(() => {
    if (score !== prev.current) {
      prev.current = score;
      setBump(true);
      const t = setTimeout(() => setBump(false), 180);
      return () => clearTimeout(t);
    }
  }, [score]);
  return (
    <div className={`score-pill ${you ? "you" : ""} ${bump ? "bump" : ""}`} key={id}>
      <span className="dot" style={{ background: color, color }} />
      <div>
        <div className="nm">{name}</div>
        <div className="sc">{score}</div>
      </div>
    </div>
  );
}
