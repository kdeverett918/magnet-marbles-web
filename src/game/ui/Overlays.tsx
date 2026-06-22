import { useEffect } from "react";
import { useGame, getWorld } from "../store";

export function Overlays() {
  const hud = useGame((s) => s.hud);
  const quitToMenu = useGame((s) => s.quitToMenu);
  const startGame = useGame((s) => s.startGame);
  const startOnline = useGame((s) => s.startOnline);
  const claimMatchReward = useGame((s) => s.claimMatchReward);
  const lastReward = useGame((s) => s.lastReward);
  const online = useGame((s) => s.online);
  const modeId = useGame((s) => s.modeId);
  const playerCount = useGame((s) => s.playerCount);
  const runId = useGame((s) => s.runId);

  useEffect(() => {
    if (hud.phase === "matchEnd") claimMatchReward(hud);
  }, [claimMatchReward, hud, runId]);

  if (hud.phase === "intro") {
    const c = Math.ceil(hud.introCountdown);
    return (
      <div className="overlay" style={{ background: "transparent", backdropFilter: "none" }}>
        <div className={`countdown ${c <= 0 ? "go" : ""}`}>{c <= 0 ? "GO!" : c}</div>
        <div className="round-label">
          {hud.totalRounds > 1 ? `Round ${hud.round} of ${hud.totalRounds}` : "Get ready"}
        </div>
      </div>
    );
  }

  if (hud.phase === "roundEnd" || hud.phase === "matchEnd") {
    const sorted = [...hud.players].sort((a, b) => b.score - a.score);
    const isMatch = hud.phase === "matchEnd";
    const winner = sorted[0];
    const youWon = isMatch && winner?.id === hud.humanId;

    return (
      <div className="overlay">
        <div className="card results">
          <h2>
            {isMatch ? (
              youWon ? "🏆 Victory!" : "Match Over"
            ) : (
              `Round ${hud.round} Complete`
            )}
          </h2>
          <div className="sub">
            {isMatch ? (
              <>Winner: <span className="winner-name">{winner?.id === 0 ? "You" : winner?.name}</span></>
            ) : (
              "Standings so far"
            )}
          </div>

          <div className="standings">
            {sorted.map((p, i) => (
              <div key={p.id} className={`standing ${i === 0 ? "first" : ""}`}>
                <span className="rank">{i + 1}</span>
                <span className="dot" style={{ background: p.colorHex, color: p.colorHex }} />
                <span className="nm">{p.id === hud.humanId ? "You" : p.name}{p.isBot ? " 🤖" : ""}</span>
                <span className="sc">{p.score}</span>
              </div>
            ))}
          </div>

          {isMatch && !online && lastReward?.runId === runId && (
            <div className="reward-strip" aria-label="Stars earned">
              <div>
                <span className="section-label">Reward</span>
                <strong>+{lastReward.stars}★</strong>
              </div>
              <p>{lastReward.reasons.join(" · ")}</p>
            </div>
          )}

          {isMatch ? (
            <div className="row">
              <button className="btn primary" onClick={() => (online ? startOnline(modeId) : startGame(modeId, playerCount))}>
                ↻ Play Again
              </button>
              <button className="btn" onClick={quitToMenu}>Menu</button>
            </div>
          ) : online ? (
            <div className="row"><span className="sub">Next round starting…</span></div>
          ) : (
            <div className="row">
              <button className="btn primary" onClick={() => getWorld()?.forceAdvance()}>
                Next Round →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
