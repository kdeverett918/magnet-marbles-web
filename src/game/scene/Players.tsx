import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import * as THREE from "three";
import type { Arena } from "../sim/arena";
import { CONFIG } from "../data/config";
import { makeMarbleMaterial } from "./marbleMaterial";

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
  const group = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Group>(null);
  const mat = useMemo(() => makeMarbleMaterial(p.colorHex), [p.colorHex]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.visible = p.alive || p.y < 0;
    g.position.set(p.pos.x, p.y + p.radius, p.pos.z);
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
        const isSuper = (p.activeUntil.superMagnet ?? 0) > world.time;
        const rr = (isSuper ? CONFIG.magnet.superRadius : CONFIG.magnet.radius) * 0.5;
        const pulse = rr + Math.sin(world.time * 6) * 0.3;
        ringRef.current.scale.setScalar(pulse);
        const m = ringRef.current.material as THREE.MeshBasicMaterial;
        m.opacity = 0.25 + Math.sin(world.time * 8) * 0.1;
      }
    }
    if (shadowRef.current) {
      shadowRef.current.position.set(p.pos.x, 0.02, p.pos.z);
      shadowRef.current.visible = p.alive && p.y >= -0.5;
    }
    if (marker.current) {
      const isHuman = id === world.humanId;
      marker.current.visible = isHuman && p.alive;
      if (isHuman) {
        marker.current.position.y = p.radius + 1.5 + Math.sin(world.time * 4) * 0.15;
        marker.current.rotation.y += 0.04;
      }
    }
  });

  return (
    <>
      <group ref={group}>
        <Trail width={p.radius * 4.5} length={4} color={p.colorHex} attenuation={(t) => t * t} decay={1.4}>
          <mesh ref={ball} castShadow material={mat}>
            <sphereGeometry args={[p.radius, 48, 32]} />
          </mesh>
        </Trail>
        {/* persistent colored ground glow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -p.radius + 0.04, 0]}>
          <circleGeometry args={[p.radius * 1.5, 28]} />
          <meshBasicMaterial color={p.colorHex} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        {/* magnet ring (ground-projected) */}
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -p.radius + 0.05, 0]} visible={false}>
          <ringGeometry args={[0.9, 1.0, 48]} />
          <meshBasicMaterial color={p.colorHex} transparent opacity={0.3} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        {/* glow halo */}
        <pointLight color={p.colorHex} intensity={2.2} distance={4} />

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
      </group>
      {/* soft contact shadow */}
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[p.pos.x, 0.02, p.pos.z]}>
        <circleGeometry args={[p.radius * 1.3, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
      </mesh>
    </>
  );
}
