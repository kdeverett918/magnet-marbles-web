import * as THREE from "three";

const PIP_LAYOUTS: Array<Array<[number, number]>> = [
  [[0, 0]],
  [[-0.16, 0], [0.16, 0]],
  [[-0.18, 0.13], [0.18, 0.13], [0, -0.16]],
  [[-0.18, 0.16], [0.18, 0.16], [-0.18, -0.16], [0.18, -0.16]],
];

export function IdentityPipBadge({
  count,
  radius = 0.42,
  pipRadius = 0.055,
  accent = "#ffffff",
}: {
  count: number;
  radius?: number;
  pipRadius?: number;
  accent?: string;
}) {
  const layout = PIP_LAYOUTS[Math.max(0, Math.min(3, count - 1))];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 24]} />
        <meshBasicMaterial color="#080a12" transparent opacity={0.74} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[radius * 0.82, radius, 24]} />
        <meshBasicMaterial color={accent} transparent opacity={0.86} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {layout.map(([x, z], index) => (
        <mesh key={index} position={[x, 0.055, z]}>
          <sphereGeometry args={[pipRadius, 12, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}
