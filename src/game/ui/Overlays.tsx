import { useEffect, useRef } from "react";
import { useGame, getWorld } from "../store";
import { rankPlayersForResults } from "../data/results";
import { resetInput } from "../input/controls";
import { BOT_DIFFICULTIES, BOT_PERSONALITIES, type BotDifficulty } from "../data/config";
import { playerMarker } from "../data/identity";
import { MOTION_MODES, type MotionMode } from "../data/accessibility";
import { introBriefFor, masteryBadgeFor, resultRecapFor } from "./hudModel";
import { nextUnlockFor } from "../data/progression";
import { sfx } from "../audio/sfx";
import { haptics } from "../haptics/haptics";

export function Overlays() {
  const hud = useGame((s) => s.hud);
  const quitToMenu = useGame((s) => s.quitToMenu);
  const startGame = useGame((s) => s.startGame);
  const startOnline = useGame((s) => s.startOnline);
  const claimMatchReward = useGame((s) => s.claimMatchReward);
  const lastReward = useGame((s) => s.lastReward);
  const online = useGame((s) => s.online);
  const paused = useGame((s) => s.paused);
  const settings = useGame((s) => s.settings);
  const progression = useGame((s) => s.progression);
  const modeId = useGame((s) => s.modeId);
  const playerCount = useGame((s) => s.playerCount);
  const runId = useGame((s) => s.runId);
  const togglePaused = useGame((s) => s.togglePaused);
  const toggleSound = useGame((s) => s.toggleSound);
  const setSfxVolume = useGame((s) => s.setSfxVolume);
  const toggleHaptics = useGame((s) => s.toggleHaptics);
  const toggleColorAssist = useGame((s) => s.toggleColorAssist);
  const setMotion = useGame((s) => s.setMotion);
  const setQuality = useGame((s) => s.setQuality);
  const setBotDifficulty = useGame((s) => s.setBotDifficulty);
  const unlockTrail = useGame((s) => s.unlockTrail);
  const pauseResumeRef = useRef<HTMLButtonElement | null>(null);
  const prePauseFocusRef = useRef<HTMLElement | null>(null);
  const wasPauseDialogOpen = useRef(false);
  const pauseDialogOpen = paused && !online && (hud.phase === "intro" || hud.phase === "playing");
  const previewSfx = () => {
    sfx.setEnabled(settings.sound);
    sfx.setVolume(settings.sfxVolume);
    haptics.setEnabled(settings.haptics);
    haptics.tap("press");
    if (settings.sound) sfx.preview();
  };
  const previewHaptics = () => {
    haptics.setEnabled(settings.haptics);
    if (settings.haptics) haptics.preview();
  };

  useEffect(() => {
    if (hud.phase === "matchEnd") claimMatchReward(hud);
  }, [claimMatchReward, hud, runId]);

  useEffect(() => {
    if (pauseDialogOpen && !wasPauseDialogOpen.current) {
      prePauseFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.requestAnimationFrame(() => pauseResumeRef.current?.focus({ preventScroll: true }));
    }
    if (!pauseDialogOpen && wasPauseDialogOpen.current) {
      const previous = prePauseFocusRef.current;
      prePauseFocusRef.current = null;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    }
    wasPauseDialogOpen.current = pauseDialogOpen;
  }, [pauseDialogOpen]);

  if (pauseDialogOpen) {
    return (
      <div className="overlay pause-overlay">
        <div className="card results pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <h2 id="pause-title">Paused</h2>
          <div className="sub">Solo match is frozen. Resume when ready.</div>

          <div className="pause-actions">
            <button ref={pauseResumeRef} type="button" className="btn primary" aria-label="Resume game" onClick={() => {
              resetInput();
              togglePaused();
            }}>Resume</button>
            <button type="button" className="btn" aria-label="Restart match" onClick={() => {
              resetInput();
              startGame(modeId, playerCount);
            }}>Restart</button>
            <button type="button" className="btn" aria-label="Return to menu" onClick={() => {
              resetInput();
              quitToMenu();
            }}>Menu</button>
          </div>

          <div className="pause-options" aria-label="Pause options">
            <button
              type="button"
              className={`chip ${settings.sound ? "active" : ""}`}
              aria-pressed={settings.sound}
              onClick={toggleSound}
            >
              {settings.sound ? "Sound on" : "Sound off"}
            </button>
            <label className="volume-control pause-volume" aria-label="Sound effects volume">
              <span>SFX</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={Math.round(settings.sfxVolume * 100)}
                onChange={(e) => setSfxVolume(Number(e.currentTarget.value) / 100)}
                disabled={!settings.sound}
              />
              <b>{Math.round(settings.sfxVolume * 100)}%</b>
            </label>
            <button
              type="button"
              className="chip test-sfx-chip"
              aria-label="Play a short sound effect at the current SFX volume"
              onClick={previewSfx}
              disabled={!settings.sound}
            >
              Test SFX
            </button>
            <button
              type="button"
              className={`chip ${settings.haptics ? "active" : ""}`}
              aria-pressed={settings.haptics}
              onClick={toggleHaptics}
            >
              {settings.haptics ? "Haptics on" : "Haptics off"}
            </button>
            <button
              type="button"
              className="chip test-haptics-chip"
              aria-label="Play a short phone vibration preview"
              onClick={previewHaptics}
              disabled={!settings.haptics}
            >
              Test Haptics
            </button>
            <button
              type="button"
              className={`chip ${settings.colorAssist ? "active" : ""}`}
              aria-pressed={settings.colorAssist}
              aria-label={settings.colorAssist ? "Color Assist on" : "Color Assist off"}
              onClick={toggleColorAssist}
            >
              {settings.colorAssist ? "Color Assist on" : "Color Assist off"}
            </button>
            <div className="segmented motion-control" role="group" aria-label="Motion amount">
              <span>Motion</span>
              {MOTION_MODES.map((motion: MotionMode) => (
                <button
                  key={motion}
                  type="button"
                  className={`chip mini-chip ${settings.motion === motion ? "active" : ""}`}
                  aria-pressed={settings.motion === motion}
                  aria-label={`Motion ${motion}`}
                  onClick={() => setMotion(motion)}
                >
                  {motion === "auto" ? "Auto" : motion === "reduced" ? "Reduce" : "Full"}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`chip ${settings.quality === "high" ? "active" : ""}`}
              aria-pressed={settings.quality === "high"}
              onClick={() => setQuality("high")}
            >
              High
            </button>
            <button
              type="button"
              className={`chip ${settings.quality === "lite" ? "active" : ""}`}
              aria-pressed={settings.quality === "lite"}
              onClick={() => setQuality("lite")}
            >
              Lite
            </button>
            {(Object.entries(BOT_DIFFICULTIES) as Array<[BotDifficulty, (typeof BOT_DIFFICULTIES)[BotDifficulty]]>).map(([id, difficulty]) => (
              <button
                key={id}
                type="button"
                className={`chip ${settings.botDifficulty === id ? "active" : ""}`}
                aria-pressed={settings.botDifficulty === id}
                aria-label={`${difficulty.label} bots next match`}
                onClick={() => setBotDifficulty(id)}
              >
                {difficulty.label} bots
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (hud.phase === "intro") {
    const c = Math.ceil(hud.introCountdown);
    const brief = introBriefFor(hud);
    return (
      <div className="overlay intro-overlay" style={{ background: "transparent", backdropFilter: "none" }}>
        <div className={`countdown ${c <= 0 ? "go" : ""}`}>{c <= 0 ? "GO!" : c}</div>
        <div className="intro-brief" style={{ ["--player-color" as any]: brief.playerColor }}>
          <div className="intro-brief-head">
            <span className="section-label">{brief.eyebrow}</span>
            <strong>{brief.title}</strong>
          </div>
          <p>{brief.detail}</p>
          <div className="intro-steps" aria-label="Round plan">
            {brief.steps.map((step, index) => (
              <span key={step.label}>
                <b>{index + 1}</b>
                <em>{step.label}</em>
                <small>{step.detail}</small>
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (hud.phase === "roundEnd" || hud.phase === "matchEnd") {
    const isMatch = hud.phase === "matchEnd";
    const ranked = rankPlayersForResults(hud.modeKind, hud.players, hud.winnerId);
    const winner = ranked.find((entry) => entry.isWinner)?.player ?? ranked[0]?.player;
    const humanResult = ranked.find((entry) => entry.player.id === hud.humanId);
    const recap = resultRecapFor(hud);
    const earnedReward = isMatch && !online && lastReward?.runId === runId ? lastReward : null;
    const masteryBadge = masteryBadgeFor(hud, earnedReward);
    const nextUnlock = nextUnlockFor(progression);
    const youWon = isMatch && Boolean(humanResult?.isWinner);
    const winnerCopy = hud.modeKind === "team-bank" && humanResult?.isWinner
      ? "Your Team"
      : winner?.id === hud.humanId
      ? "You"
      : hud.modeKind === "team-bank" && winner
      ? `Team ${winner.teamId + 1}`
      : winner?.name;

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
              <>Winner: <span className="winner-name">{winnerCopy}</span></>
            ) : (
              "Standings so far"
            )}
          </div>

          <div className="standings">
            {ranked.map(({ player: p, placement, isWinner, resultScore }) => (
              <div key={p.id} className={`standing ${isWinner || placement === 1 ? "first" : ""}`}>
                <span className="rank">{placement}</span>
                <span className="dot" style={{ background: p.colorHex, color: p.colorHex }} />
                {settings.colorAssist && <span className="standing-marker">{playerMarker(p)}</span>}
                <span className="nm">
                  {p.id === hud.humanId ? "You" : p.name}{p.isBot ? " 🤖" : ""}
                  {p.isBot && p.botPersonality && <span className="standing-role">{BOT_PERSONALITIES[p.botPersonality].short}</span>}
                </span>
                <span className="sc">{hud.modeKind === "survival" ? `${p.lives}L` : resultScore}</span>
              </div>
            ))}
          </div>

          {recap && (
            <div
              className={`result-recap ${recap.tone}`}
              aria-label={`${recap.eyebrow}: ${recap.title}. ${recap.detail}. Tip: ${recap.tip}`}
            >
              <div>
                <span className="section-label">{recap.eyebrow}</span>
                <strong>{recap.title}</strong>
              </div>
              <p>{recap.detail}</p>
              <small>{recap.tip}</small>
            </div>
          )}

          {masteryBadge && (
            <div
              className={`mastery-badge ${masteryBadge.tone}`}
              aria-label={`${masteryBadge.label}: ${masteryBadge.title}. ${masteryBadge.detail}.`}
            >
              <span className="section-label">{masteryBadge.label}</span>
              <strong>{masteryBadge.title}</strong>
              <small>{masteryBadge.detail}</small>
            </div>
          )}

          {earnedReward && (
            <div className="reward-strip" aria-label="Stars earned">
              <div>
                <span className="section-label">Reward</span>
                <strong>+{earnedReward.stars}★</strong>
              </div>
              <p>{earnedReward.reasons.join(" · ")}</p>
              <small className={`record-reward-target ${earnedReward.record.isNewBest ? "new-best" : ""}`}>
                {earnedReward.record.isNewBest
                  ? `New ${hud.modeName} best: ${earnedReward.record.bestScore}`
                  : `${hud.modeName} best: ${earnedReward.record.bestScore} · ${earnedReward.record.wins} wins / ${earnedReward.record.matches} played`}
              </small>
              {earnedReward.dailyStreak && (
                <small className="daily-streak-target">
                  Daily streak: {earnedReward.dailyStreak.current} day{earnedReward.dailyStreak.current === 1 ? "" : "s"} · best {earnedReward.dailyStreak.best}
                </small>
              )}
              <small className="next-reward-target">
                {nextUnlock
                  ? nextUnlock.ready
                    ? "Cosmetic ready now"
                    : `Next unlock: ${nextUnlock.trail.name} · ${nextUnlock.starsNeeded}★ left`
                  : "Cosmetic collection complete"}
              </small>
              {nextUnlock?.ready && (
                <button
                  type="button"
                  className="unlock-reward-button"
                  aria-label={`Unlock and equip ${nextUnlock.trail.name}`}
                  onClick={() => unlockTrail(nextUnlock.trail.id)}
                >
                  Unlock & Equip {nextUnlock.trail.name}
                </button>
              )}
            </div>
          )}

          {isMatch ? (
            <div className="row">
                <button type="button" className="btn primary" onClick={() => (online ? startOnline(modeId) : startGame(modeId, playerCount))}>
                ↻ Play Again
              </button>
              <button type="button" className="btn" onClick={quitToMenu}>Menu</button>
            </div>
          ) : online ? (
            <div className="row"><span className="sub">Next round starting…</span></div>
          ) : (
            <div className="row">
              <button type="button" className="btn primary" onClick={() => getWorld()?.forceAdvance()}>
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
