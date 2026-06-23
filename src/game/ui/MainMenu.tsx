import { useEffect, useState } from "react";
import { useGame } from "../store";
import { ADVANCED_POWERUPS, BOT_DIFFICULTIES, BOT_PERSONALITIES, CORE_POWERUPS, MODES, POWERUP_META, type BotDifficulty } from "../data/config";
import type { PowerupType } from "../data/types";
import { TRAIL_COSMETICS, dailyStreakFor, modeRecordFor, nextUnlockFor } from "../data/progression";
import { MOTION_MODES, type MotionMode } from "../data/accessibility";
import { sfx } from "../audio/sfx";
import { haptics } from "../haptics/haptics";
import { MenuBackground } from "../scene/MenuBackground";
import { BUILD_INFO } from "../buildInfo";

const MARBLES_COLORS = ["#ff4a4a", "#35a5ff", "#50d56d", "#ffd04a", "#27e0e0", "#ff4dd2", "#9cff3d"];
const MODE_ACCENTS: Record<string, { color: string; mark: string; stat: string }> = {
  classic: { color: "#ff6a3d", mark: "BANK", stat: "3 rounds" },
  battle: { color: "#ff3d5f", mark: "HIT", stat: "combat pts" },
  "king-magnet": { color: "#f2c14e", mark: "KING", stat: "2s bonus" },
  "team-bank": { color: "#4dcc66", mark: "2V2", stat: "shared score" },
  survival: { color: "#56d0ff", mark: "3L", stat: "last up" },
};

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

function PowerupChip({ type, compact = false }: { type: PowerupType; compact?: boolean }) {
  const meta = POWERUP_META[type];
  return (
    <span
      className="power-chip"
      aria-label={`${meta.label}: ${meta.desc}`}
      title={`${meta.label}: ${meta.desc}`}
      style={{ ["--p" as any]: meta.color }}
    >
      <i aria-hidden />
      {compact ? meta.short : meta.label}
    </span>
  );
}

function onlineStatusText(status: string, error: string, elapsed: number, hasRoomCode: boolean) {
  if (status === "connecting") {
    if (elapsed >= 25) return "Still waking the online server. Keep this open or retry if it passes 60 seconds.";
    if (elapsed >= 8) return "Waking online server - first join can take about 30 seconds.";
    return hasRoomCode ? "Joining private room..." : "Finding an online arena...";
  }
  if (status === "error") return error || "Could not connect to online server.";
  return "";
}

export function MainMenu() {
  const {
    modeId,
    playerCount,
    settings,
    net,
    progression,
    dailyChallenge,
    setMode,
    setPlayerCount,
    startGame,
    startDailyChallenge,
    startOnline,
    toggleSound,
    setSfxVolume,
    toggleHaptics,
    toggleColorAssist,
    setMotion,
    setQuality,
    setBotDifficulty,
    clearLocalData,
    unlockTrail,
    selectTrail,
  } =
    useGame();
  const [showRoom, setShowRoom] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  const prime = () => {
    sfx.setEnabled(settings.sound);
    sfx.setVolume(settings.sfxVolume);
    haptics.setEnabled(settings.haptics);
    if (settings.sound) sfx.ensure();
    haptics.tap("press");
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
  const playDaily = () => {
    prime();
    startDailyChallenge();
  };
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
  const resetLocalData = () => {
    haptics.setEnabled(settings.haptics);
    haptics.tap("press");
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    clearLocalData();
    setConfirmReset(false);
  };
  const connecting = net.status === "connecting";
  const elapsed = connecting && net.startedAt > 0 ? Math.max(0, Math.floor((clock - net.startedAt) / 1000)) : 0;
  const hasRoomCode = roomCode.trim().length > 0;
  const onlineStatus = onlineStatusText(net.status, net.error, elapsed, hasRoomCode);
  const selectedMode = MODES.find((m) => m.id === modeId) ?? MODES[0];
  const selectedAccent = MODE_ACCENTS[selectedMode.id] ?? MODE_ACCENTS.classic;
  const selectedRecord = modeRecordFor(progression, selectedMode.id);
  const dailyDone = progression.dailyCompleted.includes(dailyChallenge.id);
  const dailyStreak = dailyStreakFor(progression, dailyChallenge);
  const nextUnlock = nextUnlockFor(progression);
  const candidateCommit = BUILD_INFO.commit.slice(0, 8);
  const candidateFingerprint = BUILD_INFO.sourceFingerprint.slice(0, 8);

  useEffect(() => {
    if (!connecting) return;
    setClock(Date.now());
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [connecting, net.startedAt]);

  useEffect(() => {
    if (!confirmReset) return;
    const id = window.setTimeout(() => setConfirmReset(false), 5000);
    return () => window.clearTimeout(id);
  }, [confirmReset]);

  return (
    <div className="menu">
      <MenuBackground />
      <div className="menu-scrim" />

      <main
        className="menu-inner"
        aria-describedby="input-help"
        style={{ ["--mode-color" as any]: selectedAccent.color }}
      >
        <p id="input-help" className="sr-only">
          Keyboard controls: W A S D or arrow keys move, Space holds magnet, Shift dashes, and E uses powerup.
          Touch controls: drag on the playfield to move, hold the lower-right thumb zone for magnet, and tap or flick that zone to dash.
        </p>

        <section className="brand-lockup">
          <div className="menu-kicker">
            <span>4-player magnetic marble chaos</span>
            <i />
            <span>90-second rounds</span>
          </div>
          <div className="title">
            <svg className="field-lines" viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden>
              <g fill="none" strokeWidth="1.4">
                <path d="M40 60 Q200 -10 360 60" stroke="#ff5a4a" opacity="0.55" />
                <path d="M70 64 Q200 14 330 64" stroke="#f2c14e" opacity="0.42" />
                <path d="M40 100 Q200 170 360 100" stroke="#56d0ff" opacity="0.55" />
                <path d="M70 96 Q200 146 330 96" stroke="#4dcc66" opacity="0.36" />
              </g>
            </svg>
            <Letters word="MAGNET" colors={["#ff4d4d", "#ff7a3d", "#f2c14e"]} />
            <Letters word="MARBLES" colors={MARBLES_COLORS} />
          </div>
          <p className="tagline">Magnetize candy marbles, haul a risky cluster home, then dash into rivals to steal their score.</p>
        </section>

        <section className="menu-stage" aria-label="Main menu">
          <div className="mode-showcase">
            <div className="showcase-topline">
              <span className="mode-mark">{selectedAccent.mark}</span>
              <span>{selectedAccent.stat}</span>
            </div>
            <div className="mode-orbit" aria-hidden>
              <span className="orb core" />
              <span className="orb o1" />
              <span className="orb o2" />
              <span className="orb o3" />
              <span className="mag-ring r1" />
              <span className="mag-ring r2" />
            </div>
            <div className="showcase-copy">
              <span className="section-label">Selected mode</span>
              <h1>{selectedMode.name}</h1>
              <p>{selectedMode.objective}</p>
            </div>
            <div className="rule-strip" aria-label="Round details">
              <span><b>{playerCount}P</b> players</span>
              <span><b>{selectedMode.duration}s</b> timer</span>
              <span><b>{selectedMode.rounds}</b> {selectedMode.rounds === 1 ? "round" : "rounds"}</span>
            </div>
            <div className="record-strip" aria-label={`${selectedMode.name} local record`}>
              <span><b>{selectedRecord.bestScore}</b><small>best</small></span>
              <span><b>{selectedRecord.wins}</b><small>wins</small></span>
              <span><b>{selectedRecord.matches}</b><small>played</small></span>
            </div>
            <div className="power-strip" aria-label="Powerup ramp">
              <div className="power-strip-stage core" aria-label="Round 1 powerups">
                <small>Round 1</small>
                <div className="power-chip-row">
                  {CORE_POWERUPS.map((type) => (
                    <PowerupChip key={type} type={type} />
                  ))}
                </div>
              </div>
              <div className="power-strip-stage advanced" aria-label="Later round powerups">
                <small>Later rounds</small>
                <div className="power-chip-row">
                  {ADVANCED_POWERUPS.map((type) => (
                    <PowerupChip key={type} type={type} compact />
                  ))}
                </div>
              </div>
            </div>
            <div className="progression-strip" aria-label="Progression">
              <div className="stars-box">
                <span className="section-label">Stars</span>
                <strong>{progression.stars}★</strong>
                <small>{progression.totalStarsEarned} earned</small>
              </div>
              <button type="button" className="daily-button" onClick={playDaily} disabled={connecting}>
                <span>{dailyDone ? "Daily cleared" : "Daily challenge"}</span>
                <strong>{dailyChallenge.modeName}</strong>
                <small>
                  {dailyDone
                    ? `${dailyStreak.current} day streak · best ${dailyStreak.best}`
                    : `${dailyChallenge.target} · +${dailyChallenge.rewardStars}★ · ${dailyStreak.next}d streak`}
                </small>
              </button>
              {nextUnlock ? (
                <button
                  type="button"
                  className={`next-unlock ${nextUnlock.ready ? "ready" : ""}`}
                  onClick={() => unlockTrail(nextUnlock.trail.id)}
                  disabled={connecting || !nextUnlock.ready}
                  aria-label={`Next unlock: ${nextUnlock.trail.name}. ${nextUnlock.ready ? "Unlock ready" : `${nextUnlock.starsNeeded} stars to unlock`}. ${nextUnlock.trail.finish}.`}
                  style={{ ["--trail" as any]: nextUnlock.trail.color, ["--skin" as any]: nextUnlock.trail.skinColor, ["--accent-skin" as any]: nextUnlock.trail.skinAccent }}
                >
                  <i className="skin-swatch" aria-hidden><b /><em /></i>
                  <span>
                    <small>Next unlock</small>
                    <strong>{nextUnlock.trail.name}</strong>
                  </span>
                  <em>{nextUnlock.ready ? "Ready" : `${nextUnlock.starsNeeded}★ left`}</em>
                </button>
              ) : (
                <div className="next-unlock complete" aria-label="All marble skins unlocked">
                  <span>
                    <small>Collection</small>
                    <strong>All skins unlocked</strong>
                  </span>
                  <em>Complete</em>
                </div>
              )}
            </div>
            <div className="cosmetic-strip" aria-label="Marble skin and trail cosmetics">
              {TRAIL_COSMETICS.map((trail) => {
                const unlocked = progression.unlockedTrails.includes(trail.id);
                const selected = progression.selectedTrail === trail.id;
                const canBuy = progression.stars >= trail.cost;
                return (
                  <button
                    key={trail.id}
                    type="button"
                    className={`trail-chip ${selected ? "active" : ""} ${unlocked ? "unlocked" : "locked"}`}
                    aria-pressed={selected}
                    aria-label={`${trail.name} marble skin and trail. ${unlocked ? "Unlocked" : `Costs ${trail.cost} stars`}. ${trail.tagline}. ${trail.finish}.`}
                    onClick={() => unlocked ? selectTrail(trail.id) : unlockTrail(trail.id)}
                    disabled={connecting || (!unlocked && !canBuy)}
                    style={{ ["--trail" as any]: trail.color, ["--skin" as any]: trail.skinColor, ["--accent-skin" as any]: trail.skinAccent }}
                  >
                    <i className="skin-swatch" aria-hidden><b /><em /></i>
                    <span>{trail.name}</span>
                    <small>{unlocked ? (selected ? "Equipped" : "Select") : `${trail.cost}★`}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="menu-panel">
            <div className="panel-head">
              <div>
                <span className="section-label">Choose a mode</span>
                <span className="panel-note">Easy to read. Hard to master.</span>
              </div>
              <div className="launch-cluster">
                <nav className="launch-links" aria-label="Launch information">
                  <a href="./privacy.html" target="_blank" rel="noreferrer">Privacy</a>
                  <span aria-hidden>·</span>
                  <a href="./support.html" target="_blank" rel="noreferrer">Support</a>
                </nav>
                <div
                  className="candidate-stamp"
                  aria-label={`Candidate build ${candidateCommit}, source fingerprint ${candidateFingerprint}${BUILD_INFO.dirty ? ", dirty working tree" : ""}`}
                  title={`Commit ${BUILD_INFO.commit} · source ${BUILD_INFO.sourceFingerprint}${BUILD_INFO.dirty ? " · dirty working tree" : ""}`}
                >
                  <span>Candidate</span>
                  <b>{candidateCommit}</b>
                  <em>{candidateFingerprint}</em>
                </div>
              </div>
            </div>
            <div className="play-row">
              <button type="button" className="btn primary play-btn" onClick={playSolo} disabled={connecting}>
                <span className="play-symbol" aria-hidden>▶</span>
                SINGLE PLAYER
              </button>
              <button type="button" className="btn play-btn online" onClick={playOnline} disabled={connecting}>
                {connecting ? "CONNECTING..." : net.status === "error" ? "RETRY ONLINE" : "PLAY ONLINE"}
              </button>
            </div>

            <div className="online-row">
              <button
                type="button"
                className="chip room-toggle"
                aria-expanded={showRoom}
                onClick={() => setShowRoom((v) => !v)}
                disabled={connecting}
              >
                {showRoom ? "Private room" : "Join with code"}
              </button>
              {showRoom && (
                <input
                  className="room-input"
                  placeholder="room code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  maxLength={12}
                  disabled={connecting}
                  aria-label="Private room code"
                />
              )}
            </div>

            <div className="modes">
              {MODES.map((m) => {
                const accent = MODE_ACCENTS[m.id] ?? MODE_ACCENTS.classic;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`mode ${modeId === m.id ? "active" : ""}`}
                    aria-pressed={modeId === m.id}
                    aria-label={`${m.name}: ${m.tagline}`}
                    onClick={() => setMode(m.id)}
                    style={{ ["--accent" as any]: accent.color }}
                  >
                    <span className="mode-tag">{accent.mark}</span>
                    <span className="name">{m.name}</span>
                    <span className="desc">{m.tagline}</span>
                  </button>
                );
              })}
            </div>

            <div className="quick-controls">
              <div>
                <div className="section-label">Players</div>
                <div className="row">
                  {[2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`chip ${playerCount === n ? "active" : ""}`}
                      aria-pressed={playerCount === n}
                      aria-label={`${n} players`}
                      onClick={() => setPlayerCount(n)}
                    >
                      {n}P
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="section-label">Bots</div>
                <div className="row" aria-label="Bot difficulty">
                  {(Object.entries(BOT_DIFFICULTIES) as Array<[BotDifficulty, (typeof BOT_DIFFICULTIES)[BotDifficulty]]>).map(([id, difficulty]) => (
                    <button
                      key={id}
                      type="button"
                      className={`chip ${settings.botDifficulty === id ? "active" : ""}`}
                      aria-pressed={settings.botDifficulty === id}
                      aria-label={`${difficulty.label} bots`}
                      onClick={() => setBotDifficulty(id)}
                    >
                      {difficulty.label}
                    </button>
                  ))}
                </div>
                <div className="bot-roster" aria-label="Bot roles">
                  {Object.values(BOT_PERSONALITIES).map((bot) => (
                    <span key={bot.label} title={bot.desc}>{bot.short}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="section-label">Options</div>
                <div className="row">
                  <button
                    type="button"
                    className={`chip icon-chip ${settings.sound ? "active" : ""}`}
                    aria-pressed={settings.sound}
                    aria-label={settings.sound ? "Sound on" : "Sound off"}
                    onClick={toggleSound}
                  >
                    {settings.sound ? "Sound" : "Muted"}
                  </button>
                  <label className="volume-control" aria-label="Sound effects volume">
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
                    disabled={!settings.sound || connecting}
                  >
                    Test SFX
                  </button>
                  <button
                    type="button"
                    className={`chip icon-chip ${settings.haptics ? "active" : ""}`}
                    aria-pressed={settings.haptics}
                    aria-label={settings.haptics ? "Haptics on" : "Haptics off"}
                    onClick={toggleHaptics}
                  >
                    {settings.haptics ? "Haptics" : "Haptics off"}
                  </button>
                  <button
                    type="button"
                    className="chip test-haptics-chip"
                    aria-label="Play a short phone vibration preview"
                    onClick={previewHaptics}
                    disabled={!settings.haptics || connecting}
                  >
                    Test Haptics
                  </button>
                  <button
                    type="button"
                    className={`chip icon-chip ${settings.colorAssist ? "active" : ""}`}
                    aria-pressed={settings.colorAssist}
                    aria-label={settings.colorAssist ? "Color Assist on" : "Color Assist off"}
                    onClick={toggleColorAssist}
                  >
                    {settings.colorAssist ? "Color Assist" : "Color Assist off"}
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
                    className={`chip icon-chip ${settings.quality === "high" ? "active" : ""}`}
                    aria-pressed={settings.quality === "high"}
                    onClick={() => setQuality("high")}
                  >
                    High
                  </button>
                  <button
                    type="button"
                    className={`chip icon-chip ${settings.quality === "lite" ? "active" : ""}`}
                    aria-pressed={settings.quality === "lite"}
                    onClick={() => setQuality("lite")}
                  >
                    Lite
                  </button>
                  <button
                    type="button"
                    className={`chip reset-data-chip ${confirmReset ? "confirm" : ""}`}
                    aria-label="Reset local progress, settings, tutorial, daily streak, and marble skin data"
                    onClick={resetLocalData}
                    disabled={connecting}
                  >
                    {confirmReset ? "Confirm reset" : "Reset data"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {onlineStatus && (
          <div className={`net-status ${net.status === "error" ? "error" : "connecting"}`} role="status" aria-live="polite">
            <span>{onlineStatus}</span>
            {connecting && <span className="net-time">{elapsed}s</span>}
          </div>
        )}

      </main>
    </div>
  );
}
