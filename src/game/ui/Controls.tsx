import { useRef, useState } from "react";
import { useGame } from "../store";
import { setTouchMagnetHeld, triggerDash, triggerActivate } from "../input/controls";
import { rightGestureShouldDash, type TouchPoint } from "../input/touchGestures";
import { PU_ICON, PU_LABEL } from "./icons";
import { sfx } from "../audio/sfx";

/**
 * Minimal on-screen controls. Movement is direct-drag on the play field
 * (handled by the 3D DragPlane) for finger + mouse; these buttons cover
 * magnet (hold), powerup use, and dash. Keyboard also works (WASD/Space/Shift/E).
 */
export function Controls() {
  const hud = useGame((s) => s.hud);
  const [magnetOn, setMagnetOn] = useState(false);
  const rightGesture = useRef<(TouchPoint & { id: number }) | null>(null);

  const inGame = hud.phase === "intro" || hud.phase === "playing";
  if (!inGame) return null;

  const held = hud.heldPowerup;
  const dashReady = hud.dashCooldown <= 0;
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
    }
  };

  return (
    <div className="controls">
      <div
        className={`right-gesture-zone ${magnetOn ? "on" : ""}`}
        aria-hidden="true"
        onPointerDown={onRightDown}
        onPointerUp={(e) => onRightUp(e)}
        onPointerCancel={(e) => onRightUp(e, true)}
      >
        <div className="gesture-hint">
          <span>hold magnet</span>
          <span>tap / flick dash</span>
        </div>
      </div>

      <div className="move-hint">drag to move · lower-right hold / tap dash</div>

      <div className="action-cluster">
        <div className="act-col">
          <button
            type="button"
            className={`act ${held ? "held" : "disabled"}`}
            aria-label={held ? `Use ${PU_LABEL[held]}` : "No powerup ready"}
            disabled={!held}
            onPointerDown={(e) => {
              e.preventDefault();
              if (held) {
                triggerActivate();
                sfx.ensure();
              }
            }}
          >
            <span className="ico">{held ? PU_ICON[held] : "—"}</span>
            <span style={{ fontSize: 9 }}>{held ? "USE" : "PWR"}</span>
          </button>
          <button
            type="button"
            className={`act ${dashReady ? "" : "disabled"}`}
            aria-label={dashReady ? "Dash" : "Dash cooling down"}
            disabled={!dashReady}
            onPointerDown={(e) => {
              e.preventDefault();
              triggerDash();
              sfx.ensure();
            }}
          >
            <span className="ico">»</span>
            <span style={{ fontSize: 10 }}>DASH</span>
          </button>
        </div>

        <button
          type="button"
          className={`act big ${magnetOn ? "on" : ""}`}
          aria-label="Hold magnet"
          aria-pressed={magnetOn}
          onPointerDown={(e) => {
            e.preventDefault();
            setMag(true);
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
          <span style={{ fontSize: 10 }}>MAGNET</span>
        </button>
      </div>
    </div>
  );
}
