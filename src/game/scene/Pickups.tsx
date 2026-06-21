import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { World } from "../sim/world";
import { POWERUP_META } from "../data/config";

export function Pickups({ world }: { world: World }) {
  return (
    <group>
      {world.pickups.map((pk) => (
        <PickupToken key={pk.id} world={world} idx={pk.id} />
      ))}
    </group>
  );
}

function PickupToken({ world, idx }: { world: World; idx: number }) {
  const ref = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const pk = world.pickups.find((p) => p.id === idx);
    const g = ref.current;
    if (!g || !pk) return;
    g.visible = pk.active;
    if (!pk.active) return;
    g.position.set(pk.pos.x, 0.95 + Math.sin(pk.bob * 2) * 0.18, pk.pos.z);
    if (inner.current) {
      inner.current.rotation.y = pk.bob * 1.6;
      inner.current.rotation.x = pk.bob * 0.9;
      const m = inner.current.material as THREE.MeshStandardMaterial;
      m.color.set(POWERUP_META[pk.type].color);
      m.emissive.set(POWERUP_META[pk.type].color);
    }
  });

  const pk0 = world.pickups.find((p) => p.id === idx)!;
  const color = POWERUP_META[pk0.type].color;

  return (
    <group ref={ref}>
      <mesh ref={inner} castShadow>
        <icosahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} roughness={0.2} metalness={0.4} />
      </mesh>
      {/* glow base ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
        <ringGeometry args={[0.5, 0.85, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <pointLight color={color} intensity={3} distance={3.5} />
    </group>
  );
}
