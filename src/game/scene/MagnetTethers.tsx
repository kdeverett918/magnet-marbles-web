import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CONFIG } from "../data/config";
import type { Arena } from "../sim/arena";

const MAX_SEGMENTS = 72;
const VERTS_PER_SEGMENT = 2;

const color = new THREE.Color();
const white = new THREE.Color("#ffffff");

export function MagnetTethers({ world }: { world: Arena }) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_SEGMENTS * VERTS_PER_SEGMENT * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_SEGMENTS * VERTS_PER_SEGMENT * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);
  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  useFrame(() => {
    const line = lineRef.current;
    if (!line) return;
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = geometry.getAttribute("color") as THREE.BufferAttribute;
    const positions = pos.array as Float32Array;
    const colors = col.array as Float32Array;
    let segments = 0;

    const add = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, hex: string, strength: number) => {
      if (segments >= MAX_SEGMENTS) return;
      const o = segments * 6;
      positions[o] = ax;
      positions[o + 1] = ay;
      positions[o + 2] = az;
      positions[o + 3] = bx;
      positions[o + 4] = by;
      positions[o + 5] = bz;

      color.set(hex).lerp(white, 0.32 + strength * 0.28);
      colors[o] = color.r;
      colors[o + 1] = color.g;
      colors[o + 2] = color.b;
      color.lerp(white, 0.18);
      colors[o + 3] = color.r;
      colors[o + 4] = color.g;
      colors[o + 5] = color.b;
      segments++;
    };

    for (const p of world.players) {
      if (!p.alive || !p.magnetActive) continue;
      const burst = (p.activeUntil.magnetBurst ?? 0) > world.time;
      const superMagnet = (p.activeUntil.superMagnet ?? 0) > world.time;
      const radius = burst ? CONFIG.magnet.burstRadius : superMagnet ? CONFIG.magnet.superRadius : CONFIG.magnet.radius;
      const r2 = radius * radius;
      let playerSegments = 0;
      for (const m of world.marbles) {
        if (m.state !== "free" || m.y < 0) continue;
        const dx = m.pos.x - p.pos.x;
        const dz = m.pos.z - p.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        const strength = 1 - Math.min(Math.sqrt(d2) / radius, 1);
        if (strength < 0.12 && playerSegments > 5) continue;
        add(p.pos.x, p.y + p.radius * 0.8, p.pos.z, m.pos.x, m.y + m.radius * 1.2, m.pos.z, p.colorHex, strength);
        playerSegments++;
        if (playerSegments >= 14) break;
      }
    }

    geometry.setDrawRange(0, segments * VERTS_PER_SEGMENT);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });

  return <lineSegments ref={lineRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}
