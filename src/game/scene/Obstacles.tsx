import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Arena } from "../sim/arena";

export function Obstacles({ world }: { world: Arena }) {
  return (
    <group>
      {world.buttons.map((b) => (
        <GoalButtonViz key={`b${b.id}`} world={world} idx={b.id} />
      ))}
      {world.rings.map((r) => (
        <AutoGoalRingViz key={`r${r.id}`} world={world} idx={r.id} />
      ))}
    </group>
  );
}

function GoalButtonViz({ world, idx }: { world: Arena; idx: number }) {
  const top = useRef<THREE.Mesh>(null);
  const b = world.buttons[idx];
  const color = world.goals[b.targetGoalOwnerId]?.colorHex ?? "#ffffff";

  useFrame(() => {
    const btn = world.buttons[idx];
    if (!top.current || !btn) return;
    const pressed = btn.pressedFlash > 0;
    top.current.position.y = pressed ? 0.05 : 0.16;
    const m = top.current.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = btn.cooldown > 0 ? 0.2 : 0.9 + (pressed ? 1.5 : 0);
  });

  return (
    <group position={[b.pos.x, 0, b.pos.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.7, 0.95, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={top} position={[0, 0.16, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.65, 0.18, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* "block" glyph */}
      <mesh position={[0, 0.27, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.28, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function AutoGoalRingViz({ world, idx }: { world: Arena; idx: number }) {
  const arrows = useRef<THREE.Group>(null);
  const r = world.rings[idx];

  useFrame(() => {
    const ring = world.rings[idx];
    if (!arrows.current || !ring) return;
    arrows.current.rotation.y = ring.spin;
  });

  return (
    <group position={[r.pos.x, 0, r.pos.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[r.radius - 0.25, r.radius, 48]} />
        <meshBasicMaterial color="#3aa0ff" transparent opacity={0.5} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <group ref={arrows}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * (r.radius - 0.5), 0.2, Math.sin(a) * (r.radius - 0.5)]} rotation={[Math.PI / 2, 0, -a + Math.PI / 2]}>
              <coneGeometry args={[0.22, 0.5, 4]} />
              <meshStandardMaterial color="#3aa0ff" emissive="#2a80ff" emissiveIntensity={1.1} />
            </mesh>
          );
        })}
      </group>
      <pointLight color="#3aa0ff" intensity={2.5} distance={5} position={[0, 0.6, 0]} />
    </group>
  );
}
