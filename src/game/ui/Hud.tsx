import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { PU_ICON, PU_LABEL } from "./icons";
import { POWERUP_META } from "../data/config";
import { humanHudPlayer, objectiveAnnouncementFor, objectiveFor } from "./hudModel";
import { resetInput } from "../input/controls";
import { playerMarker } from "../data/identity";

export function Hud() {
  const hud = useGame((s) => s.hud);
  const feedback = useGame((s) => s.feedback);
  const quitToMenu = useGame((s) => s.quitToMenu);
  const clearFeedback = useGame((s) => s.clearFeedback);
  const online = useGame((s) => s.online);
  const togglePaused = useGame((s) => s.togglePaused);
  const colorAssist = useGame((s) => s.settings.colorAssist);
  const playing = hud.phase === "playing" || hud.phase === "intro";

  const you = humanHudPlayer(hud);
  const low = hud.roundTime <= 10;
  const mins = Math.floor(hud.roundTime / 60);
  const secs = Math.floor(hud.roundTime % 60);
  const objective = objectiveFor(hud, you);
  const objectiveAnnouncement = objectiveAnnouncementFor(hud, objective);

  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => clearFeedback(feedback.id), 1350);
    return () => window.clearTimeout(t);
  }, [clearFeedback, feedback]);

  if (!playing) return null;

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
              colorAssist={colorAssist}
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

      <div className="objective-chip" aria-describedby="hud-objective-status">{objective}</div>
      <div id="hud-objective-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {objectiveAnnouncement}
      </div>

      {feedback && (
        <div key={feedback.id} className={`toast feedback-toast ${feedback.tone}`} role="status" aria-live="polite">
          <strong>{feedback.title}</strong>
          <span>{feedback.detail}</span>
        </div>
      )}

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
          <div
            className="meter"
            role="meter"
            aria-label="Carried marbles"
            aria-valuemin={0}
            aria-valuemax={hud.clusterCap}
            aria-valuenow={you.cluster}
            aria-valuetext={`${you.cluster} of ${hud.clusterCap} marbles carried`}
          >
            <i style={{ width: `${(you.cluster / hud.clusterCap) * 100}%`, background: you.colorHex }} />
          </div>
          <div className="lbl">{you.cluster} / {hud.clusterCap} carried</div>
        </div>
      )}

      <button
        type="button"
        className="btn ghost corner-btn"
        style={{ pointerEvents: "auto", padding: "8px 14px", fontSize: 13 }}
        aria-label={online ? "Quit to menu" : "Pause game"}
        onClick={online ? quitToMenu : () => {
          resetInput();
          togglePaused();
        }}
      >
        {online ? "Quit" : "Pause"}
      </button>
    </div>
  );
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
  colorAssist,
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
  colorAssist: boolean;
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
  const marker = playerMarker(id);
  return (
    <div
      className={`score-pill ${you ? "you" : ""} ${bump ? "bump" : ""} ${colorAssist ? "assist" : ""}`}
      key={id}
      aria-label={`${marker} ${name}${showTeam ? ` team ${teamId + 1}` : ""}: ${score} points${showLives ? `, ${Math.max(lives, 0)} lives` : ""}`}
    >
      <span className="dot" style={{ background: color, color }}>{colorAssist ? marker : ""}</span>
      <div>
        <div className="nm">{colorAssist ? `${marker} ` : ""}{name}{showTeam ? ` T${teamId + 1}` : ""}</div>
        <div className="sc">
          {score}
          {showLives && <span className="lives">{Math.max(lives, 0)}L</span>}
        </div>
      </div>
    </div>
  );
}
