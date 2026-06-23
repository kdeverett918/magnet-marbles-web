import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Arena } from "../sim/arena";
import type { PowerupType } from "../data/types";
import { POWERUP_META } from "../data/config";
import { applyBadgeTexture, getBadgeTexture } from "./sceneBadgeTexture";
import { badgeWidthFor, pickupAffordanceLabel } from "./affordanceLabels";

export function Pickups({ world }: { world: Arena }) {
  return (
    <group>
      {world.pickups.map((pk) => (
        <PickupToken key={pk.id} world={world} idx={pk.id} />
      ))}
    </group>
  );
}

function PickupToken({ world, idx }: { world: Arena; idx: number }) {
  const ref = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Mesh>(null);
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const badge = useRef<THREE.Sprite>(null);
  const badgeMaterial = useRef<THREE.SpriteMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const lastType = useRef<PowerupType | null>(null);

  useFrame(() => {
    const pk = world.pickups.find((p) => p.id === idx);
    const g = ref.current;
    if (!g || !pk) return;
    g.visible = pk.active;
    if (!pk.active) return;
    g.position.set(pk.pos.x, 0.95 + Math.sin(pk.bob * 2) * 0.18, pk.pos.z);
    const meta = POWERUP_META[pk.type];
    const label = pickupAffordanceLabel(pk.type).label;
    if (lastType.current !== pk.type) {
      lastType.current = pk.type;
      if (badgeMaterial.current) applyBadgeTexture(badgeMaterial.current, label, meta.color);
    }
    if (inner.current) {
      inner.current.rotation.y = pk.bob * 1.6;
      inner.current.rotation.x = pk.bob * 0.9;
      const m = inner.current.material as THREE.MeshStandardMaterial;
      m.color.set(meta.color);
      m.emissive.set(meta.color);
    }
    if (ringMaterial.current) ringMaterial.current.color.set(meta.color);
    if (light.current) light.current.color.set(meta.color);
    if (badge.current) {
      badge.current.position.y = 0.92 + Math.sin(pk.bob * 2 + 0.8) * 0.04;
      badge.current.scale.set(badgeWidthFor(label), 0.4, 1);
    }
  });

  const pk0 = world.pickups.find((p) => p.id === idx)!;
  const color = POWERUP_META[pk0.type].color;
  const label = pickupAffordanceLabel(pk0.type).label;

  return (
    <group ref={ref}>
      <mesh ref={inner} castShadow>
        <icosahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} roughness={0.2} metalness={0.4} />
      </mesh>
      <sprite ref={badge} position={[0, 0.92, 0]} scale={[badgeWidthFor(label), 0.4, 1]}>
        <spriteMaterial
          ref={badgeMaterial}
          map={getBadgeTexture(label, color)}
          transparent
          opacity={0.94}
          depthWrite={false}
          depthTest
          toneMapped={false}
        />
      </sprite>
      {/* glow base ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
        <ringGeometry args={[0.5, 0.85, 24]} />
        <meshBasicMaterial ref={ringMaterial} color={color} transparent opacity={0.4} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <pointLight ref={light} color={color} intensity={3} distance={3.5} />
    </group>
  );
}
