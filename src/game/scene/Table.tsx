import { useMemo } from "react";
import { CONFIG } from "../data/config";
import type { Arena } from "../sim/arena";

const R = CONFIG.tableRadius;
const BRASS = "#caa45a";
const FELT = "#1f6b43";
const WALNUT = "#3c2715";

function brassMat(emissive = 0.04) {
  return (
    <meshStandardMaterial color={BRASS} emissive={BRASS} emissiveIntensity={emissive} roughness={0.28} metalness={1.0} />
  );
}

/**
 * Premium Glass Tabletop board: polished walnut body, green-felt playfield, and
 * brass inlay rim / rings. The brass boundary ring sits at the true play edge and
 * the guide rings stay well inside the marble field (no ring coincides with the
 * spawn band, which previously made edge marbles read as "outside the circle").
 */
export function Table({ world }: { world: Arena }) {
  const goals = world.goals;

  const spokes = useMemo(() => {
    const gr = R - 2.1;
    return goals.map((g) => {
      const len = gr - 2.6;
      return { angle: g.angle, len, mid: 2.6 + len / 2, end: 2.6 + len };
    });
  }, [goals]);

  // guide rings stay inside the field (field tops out ~0.7R)
  const guideRings = useMemo(() => [0.4, 0.62].map((f) => f * R), []);

  return (
    <group>
      {/* polished walnut body */}
      <mesh position={[0, -1.0, 0]} receiveShadow>
        <cylinderGeometry args={[R * 1.04, R * 0.9, 1.6, 96]} />
        <meshStandardMaterial color={WALNUT} roughness={0.45} metalness={0.1} />
      </mesh>

      {/* felt under-disc edge */}
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <cylinderGeometry args={[R, R * 1.02, 0.5, 96]} />
        <meshStandardMaterial color={FELT} roughness={0.95} metalness={0.0} />
      </mesh>

      {/* green felt playfield */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
        <circleGeometry args={[R * 0.997, 96]} />
        <meshStandardMaterial color={FELT} roughness={0.96} metalness={0.0} />
      </mesh>

      {/* brass boundary ring at the true play edge (the "circle") */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[R - 0.55, R - 0.3, 140]} />
        {brassMat(0.06)}
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <ringGeometry args={[R - 1.05, R - 0.95, 140]} />
        {brassMat(0.04)}
      </mesh>

      {/* concentric brass guide rings (well inside the field) */}
      {guideRings.map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
          <ringGeometry args={[r - 0.04, r + 0.04, 120]} />
          {brassMat(0.04)}
        </mesh>
      ))}

      {/* brass spokes + teardrop nodes to each goal */}
      {spokes.map((s, i) => (
        <group key={i}>
          <mesh position={[Math.cos(s.angle) * s.mid, 0.016, Math.sin(s.angle) * s.mid]} rotation={[0, -s.angle, 0]}>
            <boxGeometry args={[s.len, 0.03, 0.09]} />
            {brassMat(0.04)}
          </mesh>
          <mesh position={[Math.cos(s.angle) * 2.7, 0.06, Math.sin(s.angle) * 2.7]}>
            <sphereGeometry args={[0.17, 16, 12]} />
            {brassMat(0.05)}
          </mesh>
          <mesh position={[Math.cos(s.angle) * s.end, 0.06, Math.sin(s.angle) * s.end]}>
            <sphereGeometry args={[0.15, 16, 12]} />
            {brassMat(0.05)}
          </mesh>
        </group>
      ))}

      {/* centre hub */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]}>
        <ringGeometry args={[1.5, 1.8, 48]} />
        {brassMat(0.05)}
      </mesh>
      <mesh position={[0, 0.12, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 12]} />
        {brassMat(0.06)}
      </mesh>

      {/* raised beveled brass rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.16, 0]} castShadow receiveShadow>
        <torusGeometry args={[R + 0.18, 0.62, 24, 160]} />
        <meshStandardMaterial color={BRASS} roughness={0.3} metalness={1.0} />
      </mesh>
      {/* thin polished lip just inside the rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.34, 0]}>
        <torusGeometry args={[R - 0.1, 0.04, 8, 140]} />
        {brassMat(0.05)}
      </mesh>

      {/* warm gallery floor to ground the table */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]} receiveShadow>
        <circleGeometry args={[R * 4, 64]} />
        <meshStandardMaterial color="#181310" roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}
