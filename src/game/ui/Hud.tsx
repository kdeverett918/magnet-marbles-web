import { useEffect, useRef, useState } from "react";
import { useGame, type Hud as HudState, type PlayerHud } from "../store";
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
  const objective = objectiveFor(hud, you);

  return (
    <div className="hud">
      <div className="topbar">
        <div className="scoreboard">
          {hud.players.map((p) => (
            <ScorePill
              key={p.id}
              id={p.id}
              name={p.id === hud.humanId ? "You" : p.name}
              color={p.colorHex}
              score={p.score}
              teamId={p.teamId}
              lives={p.lives}
              showTeam={hud.modeKind === "team-bank"}
              showLives={hud.modeKind === "survival"}
              you={p.id === hud.humanId}
            />
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

      <div className="objective-chip">{objective}</div>

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

      <button
        type="button"
        className="btn ghost corner-btn"
        style={{ pointerEvents: "auto", padding: "8px 14px", fontSize: 13 }}
        aria-label="Quit to menu"
        onClick={quitToMenu}
      >
        ✕ Quit
      </button>
    </div>
  );
}

function objectiveFor(hud: HudState, you: PlayerHud | undefined) {
  if (hud.tutorialStep === "collect") {
    return "Drag through candy marbles - your magnet pulls them in";
  }
  if (hud.tutorialStep === "bank") {
    return "Follow the red pulse and bank at your goal";
  }
  if (hud.tutorialStep === "done") {
    return "Banked. Now steal, paint, or build a bigger haul";
  }
  if (hud.phase === "intro") {
    return hud.round === 1 ? hud.modeObjective : `${hud.modeName}: round starting`;
  }
  if (hud.suddenDeath) return "Break the tie: bank one marble";
  if (!you) return "Collect marbles and bank at your goal";
  if (hud.modeKind === "survival") {
    if (you.lives <= 1) return "Final life: avoid the rim and use pulses defensively";
    return "Survive the rim, steal safely, and outlast the table";
  }
  if (hud.modeKind === "team-bank") return "Bank at either team goal - your team shares points";
  if (hud.modeKind === "battle") return you.cluster >= 3 ? "Dash into carriers to steal and score" : "Collect a load or ram loaded rivals";
  if (hud.modeKind === "king-magnet") {
    return you.cluster >= 5 ? "Hold the biggest cluster to score every 2 seconds" : "Build the biggest cluster to become King Magnet";
  }
  if (hud.roundTime <= 12 && you.cluster > 0) return "Time is low: bank your haul";
  if (you.cluster >= Math.max(1, hud.clusterCap)) return "Cluster full: bank at your goal";
  if (you.cluster >= 6) return "Bank now or risk a bigger haul";
  return "Collect marbles, then bank at your goal";
}

function ScorePill({
  id,
  name,
  color,
  score,
  teamId,
  lives,
  showTeam,
  showLives,
  you,
}: {
  id: number;
  name: string;
  color: string;
  score: number;
  teamId: number;
  lives: number;
  showTeam: boolean;
  showLives: boolean;
  you: boolean;
}) {
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
        <div className="nm">{name}{showTeam ? ` T${teamId + 1}` : ""}</div>
        <div className="sc">
          {score}
          {showLives && <span className="lives">{Math.max(lives, 0)}L</span>}
        </div>
      </div>
    </div>
  );
}
