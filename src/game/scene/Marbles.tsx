import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { World } from "../sim/world";

const dummy = new THREE.Object3D();
const col = new THREE.Color();

export function Marbles({ world }: { world: World }) {
  const count = world.marbles.length;
  const ref = useRef<THREE.InstancedMesh>(null);

  const geo = useMemo(() => new THREE.SphereGeometry(1, 24, 18), []);
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        roughness: 0.02,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        iridescence: 0.5,
        iridescenceIOR: 1.3,
        envMapIntensity: 2.4,
        emissiveIntensity: 0.18,
      }),
    []
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      const m = world.marbles[i];
      col.set(m.colorHex);
      mesh.setColorAt(i, col);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, world]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      const m = world.marbles[i];
      if (m.state === "dead") {
        dummy.position.set(0, -50, 0);
        dummy.scale.setScalar(0.0001);
      } else {
        dummy.position.set(m.pos.x, m.y + m.radius, m.pos.z);
        dummy.rotation.set(m.spin * 0.6, m.spin, 0);
        dummy.scale.setScalar(m.radius);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.set(m.colorHex);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[geo, mat, count]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}
