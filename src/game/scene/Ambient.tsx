import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Slowly drifting glowing motes for depth / arcade atmosphere. */
export function AmbientMotes({ count = 90 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const { geo, mat, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const palette = ["#ff7a5a", "#56d0ff", "#ff4dd2", "#ffd34d", "#7CFF6B"].map((h) => new THREE.Color(h));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 26;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = -2 + Math.random() * 22;
      positions[i * 3 + 2] = Math.sin(a) * r;
      const c = palette[(Math.random() * palette.length) | 0];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      speeds[i] = 0.3 + Math.random() * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.5,
      transparent: true,
      opacity: 0.5,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    return { geo, mat, speeds };
  }, [count]);

  useFrame((_, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) + speeds[i] * dt;
      if (y > 22) y = -2;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    pts.rotation.y += dt * 0.02;
  });

  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}
