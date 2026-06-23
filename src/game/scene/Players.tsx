import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import * as THREE from "three";
import type { Arena } from "../sim/arena";
import { CONFIG } from "../data/config";
import { getTrailCosmetic } from "../data/progression";
import { useGame } from "../store";
import { makeMarbleMaterial } from "./marbleMaterial";
import { identityPipCount } from "../data/identity";
import { IdentityPipBadge } from "./IdentityPips";

export function Players({ world }: { world: Arena }) {
  return (
    <group>
      {world.players.map((p) => (
        <PlayerMarble key={p.id} world={world} id={p.id} />
      ))}
    </group>
  );
}

function PlayerMarble({ world, id }: { world: Arena; id: number }) {
  const p = world.players[id];
  const selectedTrail = useGame((s) => s.progression.selectedTrail);
  const quality = useGame((s) => s.settings.quality);
  const colorAssist = useGame((s) => s.settings.colorAssist);
  const cosmetic = id === world.humanId ? getTrailCosmetic(selectedTrail) : null;
  const visualColor = cosmetic?.skinColor ?? p.colorHex;
  const skinAccent = cosmetic?.skinAccent ?? "#ffffff";
  const trailColor = cosmetic?.color ?? p.colorHex;
  const isHuman = id === world.humanId;
  const lite = quality === "lite";
  const showTrail = isHuman || !lite;
  const sphereSegments: [number, number] = lite ? [32, 20] : [48, 32];
  const group = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const heavyRef = useRef<THREE.Mesh>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Group>(null);
  const mat = useMemo(() => makeMarbleMaterial(visualColor, skinAccent), [visualColor, skinAccent]);
  const pipCount = identityPipCount(p);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.visible = p.alive || p.y < 0;
    // render-interpolate between previous fixed-step pos and current (smooth on
    // high-refresh / dropped frames); snap on teleports (respawn/knockoff reset).
    const a = world.renderAlpha ?? 1;
    const ppx = p.px ?? p.pos.x, ppz = p.pz ?? p.pos.z, ppy = p.py ?? p.y;
    const pdx = p.pos.x - ppx, pdz = p.pos.z - ppz;
    const pjumped = pdx * pdx + pdz * pdz > 16;
    const rx = pjumped ? p.pos.x : ppx + pdx * a;
    const rz = pjumped ? p.pos.z : ppz + pdz * a;
    const ry = pjumped ? p.y : ppy + (p.y - ppy) * a;
    g.position.set(rx, ry + p.radius, rz);
    if (ball.current) {
      // visual roll decoupled from velocity
      ball.current.rotation.x += p.vel.z * dt * 0.5;
      ball.current.rotation.z -= p.vel.x * dt * 0.5;
    }
    mat.uniforms.uTime.value = world.time;

    // magnet ring
    if (ringRef.current) {
      const active = p.magnetActive;
      ringRef.current.visible = active;
      if (active) {
        const isBurst = (p.activeUntil.magnetBurst ?? 0) > world.time;
        const isSuper = (p.activeUntil.superMagnet ?? 0) > world.time;
        const rr = (isBurst ? CONFIG.magnet.burstRadius : isSuper ? CONFIG.magnet.superRadius : CONFIG.magnet.radius) * 0.5;
        const pulse = rr + Math.sin(world.time * 6) * 0.3;
        ringRef.current.scale.setScalar(pulse);
        const m = ringRef.current.material as THREE.MeshBasicMaterial;
        m.opacity = (isBurst ? 0.42 : 0.25) + Math.sin(world.time * 8) * 0.1;
      }
    }
    if (heavyRef.current) {
      const heavy = (p.activeUntil.heavyCore ?? 0) > world.time;
      heavyRef.current.visible = heavy;
      if (heavy) {
        const pulse = 1 + Math.sin(world.time * 7) * 0.05;
        heavyRef.current.scale.setScalar(pulse);
      }
    }
    if (shadowRef.current) {
      shadowRef.current.position.set(rx, 0.02, rz);
      shadowRef.current.visible = p.alive && p.y >= -0.5;
    }
    if (marker.current) {
      marker.current.visible = isHuman && p.alive;
      if (isHuman) {
        marker.current.position.y = p.radius + 1.5 + Math.sin(world.time * 4) * 0.15;
        marker.current.rotation.y += 0.04;
      }
    }
  });

  const marble = (
    <mesh ref={ball} castShadow={!lite} material={mat}>
      <sphereGeometry args={[p.radius, sphereSegments[0], sphereSegments[1]]} />
    </mesh>
  );

  return (
    <>
      <group ref={group}>
        {showTrail ? (
          <Trail width={p.radius * 4.5 * (cosmetic?.widthMult ?? 1)} length={cosmetic?.length ?? 4} color={trailColor} attenuation={(t) => t * t} decay={1.4}>
            {marble}
          </Trail>
        ) : marble}
        {/* persistent colored ground glow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -p.radius + 0.04, 0]}>
          <circleGeometry args={[p.radius * 1.5, 28]} />
          <meshBasicMaterial color={trailColor} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        {/* magnet ring (ground-projected) */}
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -p.radius + 0.05, 0]} visible={false}>
          <ringGeometry args={[0.9, 1.0, 48]} />
          <meshBasicMaterial color={p.colorHex} transparent opacity={0.3} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        {/* glow halo */}
        <pointLight color={p.colorHex} intensity={2.2} distance={4} />
        <mesh ref={heavyRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -p.radius + 0.09, 0]} visible={false}>
          <ringGeometry args={[p.radius * 1.55, p.radius * 1.82, 36]} />
          <meshBasicMaterial color="#d7e2ff" transparent opacity={0.34} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>

        {/* "YOU" marker — downward chevron above the human's marble */}
        <group ref={marker} visible={false} position={[0, p.radius + 1.5, 0]}>
          <mesh rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.32, 0.5, 4]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.6} />
          </mesh>
          <mesh position={[0, 0.45, 0]}>
            <sphereGeometry args={[0.12, 12, 10]} />
            <meshStandardMaterial color={p.colorHex} emissive={p.colorHex} emissiveIntensity={2} />
          </mesh>
        </group>
        {colorAssist && (
          <group position={[0, p.radius + 1.92, 0]} scale={isHuman ? 1.16 : 1}>
            <IdentityPipBadge count={pipCount} accent={isHuman ? "#ffffff" : p.colorHex} />
          </group>
        )}
      </group>
      {/* soft contact shadow */}
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[p.pos.x, 0.02, p.pos.z]}>
        <circleGeometry args={[p.radius * 1.3, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
      </mesh>
    </>
  );
}
