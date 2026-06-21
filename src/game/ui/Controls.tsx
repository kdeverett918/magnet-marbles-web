import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import {
  setTouchMove,
  setTouchMagnetHeld,
  triggerDash,
  triggerActivate,
} from "../input/controls";
import { PU_ICON } from "./icons";
import { sfx } from "../audio/sfx";

const STICK_RADIUS = 58;

export function Controls() {
  const hud = useGame((s) => s.hud);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState<{ x: number; y: number; nx: number; ny: number } | null>(null);
  const pid = useRef<number | null>(null);
  const [magnetOn, setMagnetOn] = useState(false);

  const active = hud.phase === "playing";

  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;

    const down = (e: PointerEvent) => {
      if (pid.current !== null) return;
      pid.current = e.pointerId;
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        /* some browsers reject capture on synthetic/edge pointers */
      }
      setStick({ x: e.clientX, y: e.clientY, nx: 0, ny: 0 });
      sfx.ensure();
    };
    const move = (e: PointerEvent) => {
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
    const up = (e: PointerEvent) => {
      if (pid.current !== e.pointerId) return;
      pid.current = null;
      setStick(null);
      setTouchMove(0, 0, false);
    };
    zone.addEventListener("pointerdown", down);
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerup", up);
    zone.addEventListener("pointercancel", up);
    return () => {
      zone.removeEventListener("pointerdown", down);
      zone.removeEventListener("pointermove", move);
      zone.removeEventListener("pointerup", up);
      zone.removeEventListener("pointercancel", up);
    };
  }, []);

  if (!active) return null;

  const held = hud.heldPowerup;
  const dashReady = hud.dashCooldown <= 0;

  return (
    <div className="controls">
      <div className="stick-zone" ref={zoneRef}>
        {stick && (
          <div className="stick" style={{ left: stick.x, top: stick.y }}>
            <div className="nub" style={{ transform: `translate(calc(-50% + ${stick.nx}px), calc(-50% + ${stick.ny}px))` }} />
          </div>
        )}
      </div>

      <div className="action-cluster">
        <div className="act-col">
          {/* activate held powerup */}
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
          </button>
          {/* dash */}
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

        {/* magnet (hold) */}
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
