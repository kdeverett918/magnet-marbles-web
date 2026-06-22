import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Arena } from "../sim/arena";
import { useGame } from "../store";

const dummy = new THREE.Object3D();
const col = new THREE.Color();

export function Marbles({ world }: { world: Arena }) {
  const count = world.marbles.length;
  const quality = useGame((s) => s.settings.quality);
  const lite = quality === "lite";
  const showHalo = !lite;
  const ref = useRef<THREE.InstancedMesh>(null);
  const halo = useRef<THREE.InstancedMesh>(null);

  const geo = useMemo(() => new THREE.SphereGeometry(1, lite ? 16 : 24, lite ? 12 : 18), [lite]);
  const haloGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 12), []);
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        roughness: 0.02,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        iridescence: 0.5,
        iridescenceIOR: 1.3,
        envMapIntensity: 2.6,
      }),
    []
  );
  const haloMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    const h = showHalo ? halo.current : null;
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      col.set(world.marbles[i].colorHex);
      mesh.setColorAt(i, col);
      h?.setColorAt(i, col);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (h?.instanceColor) h.instanceColor.needsUpdate = true;
  }, [count, showHalo, world]);

  useFrame(() => {
    const mesh = ref.current;
    const h = showHalo ? halo.current : null;
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      const m = world.marbles[i];
      if (m.state === "dead") {
        dummy.position.set(0, -80, 0);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        h?.setMatrixAt(i, dummy.matrix);
        continue;
      }
      dummy.position.set(m.pos.x, m.y + m.radius, m.pos.z);
      dummy.rotation.set(m.spin * 0.6, m.spin, 0);
      dummy.scale.setScalar(m.radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.set(m.colorHex);
      mesh.setColorAt(i, col);

      if (h) {
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(m.radius * (m.isJumbo ? 2.0 : 1.7));
        dummy.updateMatrix();
        h.setMatrixAt(i, dummy.matrix);
        h.setColorAt(i, col);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (h) {
      h.instanceMatrix.needsUpdate = true;
      if (h.instanceColor) h.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      {showHalo && <instancedMesh ref={halo} args={[haloGeo, haloMat, count]} frustumCulled={false} renderOrder={-1} />}
      <instancedMesh ref={ref} args={[geo, mat, count]} castShadow={!lite} receiveShadow={!lite} frustumCulled={false} />
    </>
  );
}
