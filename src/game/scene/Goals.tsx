import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Arena } from "../sim/arena";

export function Goals({ world }: { world: Arena }) {
  return (
    <group>
      {world.goals.map((g) => (
        <GoalBowl key={g.ownerId} world={world} ownerId={g.ownerId} />
      ))}
    </group>
  );
}

function GoalBowl({ world, ownerId }: { world: Arena; ownerId: number }) {
  const goal = world.goals[ownerId];
  const color = goal.colorHex;
  const funnel = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const blockRef = useRef<THREE.Group>(null);

  // concentric whirlpool rings descending into a bright centre
  const rings = useMemo(() => {
    const R = goal.radius * 0.9;
    return Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return {
        r: R * (1 - t * 0.84),
        y: -0.05 - t * 2.0,
        op: 0.3 + t * 0.65,
        intensity: 0.8 + t * 2.2,
      };
    });
  }, [goal.radius]);

  useFrame((_, dt) => {
    const t = world.time;
    const g = world.goals[ownerId] ?? goal; // read fresh (NetView rebuilds goals)
    const blocked = world.time < g.blockedUntil;
    if (funnel.current) funnel.current.rotation.y += dt * (blocked ? 0.3 : 1.6);
    if (core.current) {
      const m = core.current.material as THREE.MeshBasicMaterial;
      m.opacity = (blocked ? 0.2 : 0.9) + Math.sin(t * 5 + ownerId) * 0.08;
      const s = 1 + Math.sin(t * 4 + ownerId) * 0.12;
      core.current.scale.setScalar(s);
    }
    if (beamRef.current) {
      const m = beamRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = (blocked ? 0.03 : 0.12) + Math.sin(t * 3 + ownerId) * 0.03;
    }
    if (blockRef.current) {
      blockRef.current.visible = blocked;
      blockRef.current.rotation.y += dt * 1.5;
    }
  });

  return (
    <group position={[goal.pos.x, 0, goal.pos.z]}>
      {/* glossy bowl rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <torusGeometry args={[goal.radius, 0.26, 20, 56]} />
        <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.7} roughness={0.12} metalness={0.0} clearcoat={1} clearcoatRoughness={0.06} />
      </mesh>

      {/* dark bowl interior so the funnel reads */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[goal.radius * 0.95, 48]} />
        <meshStandardMaterial color="#0a0b12" roughness={0.5} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>

      {/* whirlpool funnel: concentric descending glow rings */}
      <group ref={funnel}>
        {rings.map((rg, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, rg.y, 0]}>
            <ringGeometry args={[rg.r * 0.7, rg.r, 6, 1]} />
            <meshBasicMaterial color={color} transparent opacity={rg.op} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* bright funnel core */}
      <mesh ref={core} position={[0, -2.1, 0]}>
        <sphereGeometry args={[0.5, 20, 16]} />
        <meshBasicMaterial color={"#ffffff"} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh position={[0, -2.05, 0]}>
        <sphereGeometry args={[0.85, 20, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* glossy colored recess ring around the well */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[goal.radius * 0.9, goal.radius, 48]} />
        <meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.15} metalness={0} clearcoat={1} side={THREE.DoubleSide} />
      </mesh>

      {/* subtle vertical beam */}
      <mesh ref={beamRef} position={[0, 2.6, 0]}>
        <cylinderGeometry args={[goal.radius * 0.4, goal.radius * 0.75, 5.2, 20, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* light spill */}
      <pointLight color={color} intensity={7} distance={9} position={[0, 1.0, 0]} />

      {/* blocked cage */}
      <group ref={blockRef} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, (i / 3) * Math.PI, 0]} position={[0, 1.2, 0]}>
            <boxGeometry args={[goal.radius * 2.0, 2.4, 0.1]} />
            <meshStandardMaterial color="#ff3344" emissive="#ff3344" emissiveIntensity={1.2} transparent opacity={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
