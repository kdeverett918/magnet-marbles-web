import { useRef, useState } from "react";
import { useGame } from "../store";
import {
  setTouchMove,
  setTouchMagnetHeld,
  triggerDash,
  triggerActivate,
} from "../input/controls";
import { PU_ICON } from "./icons";
import { sfx } from "../audio/sfx";

const STICK_RADIUS = 60;

export function Controls() {
  const hud = useGame((s) => s.hud);
  const [stick, setStick] = useState<{ x: number; y: number; nx: number; ny: number } | null>(null);
  const pid = useRef<number | null>(null);
  const [magnetOn, setMagnetOn] = useState(false);

  // Render the control layer for the whole live game (intro + playing) so the
  // pointer handlers are always mounted. (Returning null during intro was why
  // touch input never attached.)
  const inGame = hud.phase === "intro" || hud.phase === "playing";
  if (!inGame) return null;

  const onDown = (e: React.PointerEvent) => {
    if (pid.current !== null) return;
    pid.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setStick({ x: e.clientX, y: e.clientY, nx: 0, ny: 0 });
    sfx.ensure();
  };
  const onMove = (e: React.PointerEvent) => {
    if (pid.current !== e.pointerId) return;
    setStick((s) => {
      if (!s) return s;
      let dx = e.clientX - s.x;
      let dy = e.clientY - s.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_RADIUS) {
        dx = (dx / d) * STICK_RADIUS;
        dy = (dy / d) * STICK_RADIUS;
      }
      setTouchMove(dx / STICK_RADIUS, dy / STICK_RADIUS, true);
      return { ...s, nx: dx, ny: dy };
    });
  };
  const onUp = (e: React.PointerEvent) => {
    if (pid.current !== e.pointerId) return;
    pid.current = null;
    setStick(null);
    setTouchMove(0, 0, false);
  };

  const held = hud.heldPowerup;
  const dashReady = hud.dashCooldown <= 0;

  return (
    <div className="controls">
      <div
        className="stick-zone"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {stick ? (
          <div className="stick" style={{ left: stick.x, top: stick.y }}>
            <div
              className="nub"
              style={{ transform: `translate(calc(-50% + ${stick.nx}px), calc(-50% + ${stick.ny}px))` }}
            />
          </div>
        ) : (
          <div className="stick-hint">
            <div className="stick-hint-ring" />
            <span>drag to move</span>
          </div>
        )}
      </div>

      <div className="action-cluster">
        <div className="act-col">
          <button
            className={`act ${held ? "held" : "disabled"}`}
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
            className={`act ${dashReady ? "" : "disabled"}`}
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
          className={`act big ${magnetOn ? "on" : ""}`}
          onPointerDown={(e) => {
            e.preventDefault();
            setMagnetOn(true);
            setTouchMagnetHeld(true);
            sfx.ensure();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            setMagnetOn(false);
            setTouchMagnetHeld(false);
          }}
          onPointerLeave={() => {
            setMagnetOn(false);
            setTouchMagnetHeld(false);
          }}
        >
          <span className="ico">🧲</span>
          <span style={{ fontSize: 10 }}>MAGNET</span>
        </button>
      </div>
    </div>
  );
}
