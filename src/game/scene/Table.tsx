import { useMemo } from "react";
import * as THREE from "three";
import { CONFIG } from "../data/config";
import type { World } from "../sim/world";
import { getStoneTextures } from "./textures";

const R = CONFIG.tableRadius;
const GOLD = "#d4af52";

function goldMat(emissive = 0.25) {
  return (
    <meshStandardMaterial color={GOLD} emissive={"#6e521c"} emissiveIntensity={emissive} roughness={0.22} metalness={1.0} />
  );
}

export function Table({ world }: { world: World }) {
  const goals = world.goals;
  const { map, rough } = useMemo(() => getStoneTextures(), []);

  const spokes = useMemo(() => {
    const gr = R - 2.1;
    return goals.map((g) => {
      const len = gr - 2.6;
      return { angle: g.angle, len, mid: 2.6 + len / 2, end: 2.6 + len };
    });
  }, [goals]);

  const guideRings = useMemo(() => [0.4, 0.62, 0.82].map((f) => f * R), []);
  // diagonal corner flourishes (between goals)
  const flourishes = useMemo(() => {
    const arr: number[] = [];
    const n = goals.length;
    for (let i = 0; i < n; i++) arr.push(goals[i].angle + Math.PI / n);
    return arr;
  }, [goals]);

  return (
    <group>
      {/* outer body of the table (rounded base) */}
      <mesh position={[0, -1.0, 0]}>
        <cylinderGeometry args={[R * 1.04, R * 0.9, 1.6, 96]} />
        <meshStandardMaterial color="#101219" roughness={0.7} metalness={0.2} />
      </mesh>

      {/* main slate disc */}
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <cylinderGeometry args={[R, R * 1.02, 0.5, 96]} />
        <meshStandardMaterial map={map} roughnessMap={rough} color="#aeb4c2" roughness={1} metalness={0.15} />
      </mesh>

      {/* textured playable top */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
        <circleGeometry args={[R * 0.997, 96]} />
        <meshStandardMaterial map={map} roughnessMap={rough} color="#9aa0ae" roughness={1} metalness={0.2} />
      </mesh>

      {/* faint concentric gold guide rings */}
      {guideRings.map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
          <ringGeometry args={[r - 0.035, r + 0.035, 120]} />
          {goldMat(0.3)}
        </mesh>
      ))}

      {/* gold spokes + teardrop nodes to each goal */}
      {spokes.map((s, i) => (
        <group key={i}>
          <mesh position={[Math.cos(s.angle) * s.mid, 0.016, Math.sin(s.angle) * s.mid]} rotation={[0, -s.angle, 0]}>
            <boxGeometry args={[s.len, 0.03, 0.1]} />
            {goldMat(0.35)}
          </mesh>
          {/* teardrop node near the hub */}
          <mesh position={[Math.cos(s.angle) * 2.7, 0.06, Math.sin(s.angle) * 2.7]}>
            <sphereGeometry args={[0.18, 16, 12]} />
            {goldMat(0.5)}
          </mesh>
          {/* node near the goal */}
          <mesh position={[Math.cos(s.angle) * s.end, 0.06, Math.sin(s.angle) * s.end]}>
            <sphereGeometry args={[0.16, 16, 12]} />
            {goldMat(0.5)}
          </mesh>
        </group>
      ))}

      {/* diagonal corner flourishes */}
      {flourishes.map((a, i) => (
        <group key={i} position={[Math.cos(a) * (R - 2.4), 0.05, Math.sin(a) * (R - 2.4)]}>
          <mesh>
            <torusGeometry args={[0.34, 0.05, 10, 24]} />
            {goldMat(0.5)}
          </mesh>
          <mesh position={[0, 0.01, 0]}>
            <sphereGeometry args={[0.12, 12, 10]} />
            {goldMat(0.6)}
          </mesh>
        </group>
      ))}

      {/* centre hub */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]}>
        <ringGeometry args={[1.5, 1.85, 48]} />
        {goldMat(0.5)}
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
        <ringGeometry args={[0.0, 1.5, 36]} />
        <meshStandardMaterial map={map} color="#8c92a0" roughness={0.9} metalness={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <sphereGeometry args={[0.22, 16, 12]} />
        {goldMat(0.7)}
      </mesh>

      {/* raised beveled STONE rim (the references show stone, not coral) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.16, 0]}>
        <torusGeometry args={[R + 0.18, 0.62, 20, 140]} />
        <meshStandardMaterial map={map} color="#6a7080" roughness={0.85} metalness={0.25} />
      </mesh>
      {/* thin gold pinstripe on the inner rim lip */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.34, 0]}>
        <torusGeometry args={[R - 0.1, 0.04, 8, 140]} />
        {goldMat(0.4)}
      </mesh>

      {/* warm ORANGE glow leaking from beneath the rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]}>
        <torusGeometry args={[R + 0.5, 0.22, 12, 140]} />
        <meshBasicMaterial color="#ff6a3c" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]}>
        <ringGeometry args={[R * 0.85, R * 1.4, 96]} />
        <meshBasicMaterial color="#ff5a3c" transparent opacity={0.16} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <pointLight key={i} position={[Math.cos(a) * (R + 0.6), 0.0, Math.sin(a) * (R + 0.6)]} color="#ff6a3c" intensity={3} distance={6} />
        );
      })}

      <Props />

      {/* warm wooden / cobble floor to ground the scene */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]} receiveShadow>
        <circleGeometry args={[R * 4, 64]} />
        <meshStandardMaterial color="#1a140f" roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}

/** Cozy street-corner props around the table (out of play). */
function Props() {
  const items = useMemo(() => {
    const list: { a: number; r: number; kind: "lamp" | "crate" | "barrel" }[] = [];
    const kinds: ("lamp" | "crate" | "barrel")[] = ["lamp", "crate", "barrel", "lamp", "barrel", "crate"];
    for (let i = 0; i < 6; i++) {
      list.push({ a: (i / 6) * Math.PI * 2 + 0.35, r: R + 4.2, kind: kinds[i] });
    }
    return list;
  }, []);

  return (
    <group>
      {items.map((it, i) => {
        const x = Math.cos(it.a) * it.r;
        const z = Math.sin(it.a) * it.r;
        if (it.kind === "lamp") {
          return (
            <group key={i} position={[x, 0, z]}>
              <mesh position={[0, 1.8, 0]}>
                <cylinderGeometry args={[0.08, 0.13, 3.6, 8]} />
                <meshStandardMaterial color="#26262e" roughness={0.6} metalness={0.6} />
              </mesh>
              <mesh position={[0, 3.7, 0]}>
                <icosahedronGeometry args={[0.34, 0]} />
                <meshStandardMaterial color="#ffd9a0" emissive="#ffb14d" emissiveIntensity={2.6} />
              </mesh>
              <pointLight position={[0, 3.7, 0]} color="#ffb14d" intensity={9} distance={13} />
            </group>
          );
        }
        if (it.kind === "barrel") {
          return (
            <group key={i} position={[x, 0, z]}>
              <mesh position={[0, 0.7, 0]} castShadow>
                <cylinderGeometry args={[0.55, 0.55, 1.4, 16]} />
                <meshStandardMaterial color="#5a3a22" roughness={0.8} metalness={0.1} />
              </mesh>
              <mesh position={[0, 0.7, 0]}>
                <cylinderGeometry args={[0.58, 0.58, 0.12, 16]} />
                <meshStandardMaterial color="#8a6a3a" roughness={0.5} metalness={0.5} />
              </mesh>
            </group>
          );
        }
        // crate with a few marbles
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, i, 0]}>
            <mesh position={[0, 0.5, 0]} castShadow>
              <boxGeometry args={[1.2, 1.0, 1.2]} />
              <meshStandardMaterial color="#5b3f26" roughness={0.85} metalness={0.05} />
            </mesh>
            {[-0.3, 0.0, 0.3].map((dx, k) => (
              <mesh key={k} position={[dx, 1.12, (k - 1) * 0.25]}>
                <sphereGeometry args={[0.16, 12, 10]} />
                <meshStandardMaterial color={["#27e0e0", "#ff4dd2", "#9cff3d"][k]} roughness={0.05} metalness={0} emissive={["#27e0e0", "#ff4dd2", "#9cff3d"][k]} emissiveIntensity={0.3} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}
