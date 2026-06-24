import { useRef, useState } from "react";
import { useGame } from "../store";
import { setTouchMagnetHeld, triggerDash, triggerActivate, setTouchMove } from "../input/controls";
import { rightGestureShouldDash, type TouchPoint } from "../input/touchGestures";
import { POWERUP_META } from "../data/config";
import { PU_ICON, PU_LABEL } from "./icons";
import { actionStatusFor } from "./hudModel";
import { sfx } from "../audio/sfx";
import { haptics } from "../haptics/haptics";

/**
 * Minimal on-screen controls. Movement is direct-drag on the play field
 * (handled by the 3D DragPlane) for finger + mouse; these buttons cover
 * magnet (hold), powerup use, and dash. Keyboard also works (WASD/Space/Shift/E).
 */
export function Controls() {
  const hud = useGame((s) => s.hud);
  const paused = useGame((s) => s.paused);
  const [magnetOn, setMagnetOn] = useState(false);
  const rightGesture = useRef<(TouchPoint & { id: number }) | null>(null);

  const inGame = hud.phase === "playing" && !paused;
  if (!inGame) return null;

  const held = hud.heldPowerup;
  const heldMeta = held ? POWERUP_META[held] : null;
  const dashReady = hud.dashCooldown <= 0;
  const dashCooldownLabel = Math.max(1, Math.ceil(hud.dashCooldown));
  const actionStatus = actionStatusFor(hud, magnetOn);
  const showHints = hud.tutorialAssist && !hud.tutorialComplete;
  const setMag = (on: boolean) => {
    setMagnetOn(on);
    setTouchMagnetHeld(on);
  };
  const onRightDown = (e: React.PointerEvent) => {
    if (rightGesture.current !== null) return;
    e.preventDefault();
    rightGesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setMag(true);
    haptics.tap("magnet");
    sfx.ensure();
  };
  const onRightUp = (e: React.PointerEvent, canceled = false) => {
    const gesture = rightGesture.current;
    if (!gesture || gesture.id !== e.pointerId) return;
    e.preventDefault();
    rightGesture.current = null;
    setMag(false);
    if (rightGestureShouldDash(gesture, { x: e.clientX, y: e.clientY, t: performance.now() }, dashReady, canceled)) {
      triggerDash();
      haptics.tap("dash");
    }
  };

  return (
    <div className="controls">
      <JoystickZone showHint={showHints} />
      <div
        className={`right-gesture-zone ${magnetOn ? "on" : ""}`}
        aria-hidden="true"
        onPointerDown={onRightDown}
        onPointerUp={(e) => onRightUp(e)}
        onPointerCancel={(e) => onRightUp(e, true)}
      >
        {showHints && (
          <div className="gesture-hint">
            <span>hold magnet</span>
            <span>tap / flick dash</span>
          </div>
        )}
      </div>

      {showHints && <div className="move-hint">drag to move · lower-right actions</div>}

      <div className="action-cluster">
        <div className="action-status" aria-hidden="true">
          <span className={`action-pill ${actionStatus.powerup.tone}`}>
            <b>{actionStatus.powerup.label}</b>
            <small>{actionStatus.powerup.detail}</small>
          </span>
          <span className={`action-pill ${actionStatus.dash.tone}`}>
            <b>{actionStatus.dash.label}</b>
            <small>{actionStatus.dash.detail}</small>
          </span>
          <span className={`action-pill ${actionStatus.magnet.tone}`}>
            <b>{actionStatus.magnet.label}</b>
            <small>{actionStatus.magnet.detail}</small>
          </span>
        </div>

        <div className="act-col">
          <button
            type="button"
            className={`act power ${held ? "held" : "disabled"}`}
            aria-label={heldMeta ? `Use ${heldMeta.label}: ${heldMeta.desc}` : "No powerup ready"}
            disabled={!held}
            onPointerDown={(e) => {
              e.preventDefault();
              if (held) {
                triggerActivate();
                haptics.tap("press");
                sfx.ensure();
              }
            }}
          >
            <span className="ico">{held ? PU_ICON[held] : "—"}</span>
            <span className="act-label">{held ? PU_LABEL[held] : "PWR"}</span>
          </button>
          <button
            type="button"
            className={`act dash ${dashReady ? "" : "disabled"}`}
            aria-label={dashReady ? "Dash ready" : `Dash cooling down ${dashCooldownLabel} seconds`}
            disabled={!dashReady}
            onPointerDown={(e) => {
              e.preventDefault();
              triggerDash();
              haptics.tap("dash");
              sfx.ensure();
            }}
          >
            <span className="ico">»</span>
            <span className="act-label">{dashReady ? "DASH" : `${dashCooldownLabel}s`}</span>
          </button>
        </div>

        <button
          type="button"
          className={`act magnet big ${magnetOn ? "on" : ""}`}
          aria-label={magnetOn ? "Magnet pulling" : "Hold magnet"}
          aria-pressed={magnetOn}
          onPointerDown={(e) => {
            e.preventDefault();
            setMag(true);
            haptics.tap("magnet");
            sfx.ensure();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            setMag(false);
          }}
          onPointerLeave={() => setMag(false)}
          onPointerCancel={() => setMag(false)}
        >
          <span className="ico">🧲</span>
          <span className="act-label">MAGNET</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Floating analog joystick on the left thumb zone. Anchors wherever the thumb
 * lands; the marble steers toward the stick direction (screen-up = forward).
 * Drives the shared input via setTouchMove; also works with a mouse on desktop.
 */
const JOY_RADIUS = 56;

function JoystickZone({ showHint }: { showHint: boolean }) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const pid = useRef<number | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    if (pid.current !== null) return;
    e.preventDefault();
    pid.current = e.pointerId;
    origin.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setKnob({ ox: e.clientX, oy: e.clientY, kx: 0, ky: 0 });
    sfx.ensure();
  };
  const onMove = (e: React.PointerEvent) => {
    const o = origin.current;
    if (pid.current !== e.pointerId || !o) return;
    let dx = e.clientX - o.x;
    let dy = e.clientY - o.y;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) {
      dx = (dx / d) * JOY_RADIUS;
      dy = (dy / d) * JOY_RADIUS;
    }
    // up (negative screen y) = forward (negative world z); right = +x
    setTouchMove(dx / JOY_RADIUS, dy / JOY_RADIUS, true);
    setKnob({ ox: o.x, oy: o.y, kx: dx, ky: dy });
  };
  const onUp = (e: React.PointerEvent) => {
    if (pid.current !== e.pointerId) return;
    pid.current = null;
    origin.current = null;
    setTouchMove(0, 0, false);
    setKnob(null);
  };

  return (
    <div
      className="joystick-zone"
      aria-hidden="true"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {knob ? (
        <div className="joystick-base" style={{ left: knob.ox, top: knob.oy }}>
          <div className="joystick-knob" style={{ transform: `translate(${knob.kx}px, ${knob.ky}px)` }} />
        </div>
      ) : showHint ? (
        <div className="joystick-hint">
          <span className="joystick-hint-ring" />
          <span>steer</span>
        </div>
      ) : (
        <div className="joystick-idle" />
      )}
    </div>
  );
}
