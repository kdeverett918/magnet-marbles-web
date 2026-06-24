import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FxEvent } from "../data/types";

const MAX = 420;
const dummy = new THREE.Object3D();
const col = new THREE.Color();

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
  grav: number;
}

export interface ParticlesHandle {
  emit: (ev: FxEvent) => void;
}

export const Particles = forwardRef<ParticlesHandle>(function Particles(_props, ref) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const pool = useMemo<P[]>(
    () =>
      Array.from({ length: MAX }, () => ({
        x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 0.1, r: 1, g: 1, b: 1, grav: 0,
      })),
    []
  );
  const head = useRef(0);

  const geo = useMemo(() => new THREE.SphereGeometry(1, 6, 5), []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  function spawn(
    n: number,
    x: number,
    y: number,
    z: number,
    color: string,
    speed: number,
    up: number,
    life: number,
    size: number,
    grav: number,
    spreadColor = false
  ) {
    col.set(color);
    for (let i = 0; i < n; i++) {
      const p = pool[head.current];
      head.current = (head.current + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = up * (0.5 + Math.random());
      p.life = p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.size = size * (0.7 + Math.random() * 0.6);
      p.grav = grav;
      if (spreadColor) {
        col.setHSL(Math.random(), 0.8, 0.6);
      } else {
        col.set(color);
      }
      p.r = col.r;
      p.g = col.g;
      p.b = col.b;
    }
  }

  useImperativeHandle(ref, () => ({
    emit(ev: FxEvent) {
      switch (ev.kind) {
        case "pickup":
          spawn(6, ev.x, 0.5, ev.z, ev.color, 2.5, 3, 0.5, 0.12, -6);
          break;
        case "cluster":
          spawn(ev.count >= 10 ? 18 : 10, ev.x, 1.1, ev.z, ev.color, ev.count >= 10 ? 4.6 : 3.4, 5, 0.65, 0.13, -7, ev.count >= 18);
          break;
        case "bank":
          spawn(ev.big ? 54 : 28, ev.x, 0.65, ev.z, ev.color, ev.big ? 6.4 : 5.6, 9, 1.05, ev.big ? 0.2 : 0.17, -9, true);
          break;
        case "bankStreak":
          spawn(28 + ev.bonus * 10, ev.x, 0.75, ev.z, ev.color, 6.5 + ev.bonus, 8.5, 0.95, 0.18, -8, true);
          break;
        case "hit":
          spawn(18, ev.x, 0.45, ev.z, "#fff0c0", 7, 4.5, 0.45, 0.13, -10);
          break;
        case "steal":
          spawn(28, ev.x, 0.55, ev.z, ev.color, 7, 6, 0.7, 0.16, -8, true);
          break;
        case "knockoff":
          spawn(34, ev.x, 0.45, ev.z, "#aab0c0", 8.5, 7, 0.82, 0.16, -12);
          break;
        case "paint":
          spawn(40, ev.x, 0.6, ev.z, ev.color, 6, 7, 1.0, 0.18, -7);
          break;
        case "powerup":
          spawn(18, ev.x, 0.6, ev.z, "#ffffff", 4, 5, 0.6, 0.12, -6);
          break;
        case "fall":
          spawn(10, ev.x, 0.0, ev.z, "#8890a0", 2, -2, 0.6, 0.12, 6);
          break;
      }
    },
  }));

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const t = Math.max(p.life / p.maxLife, 0);
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(p.size * t);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        col.setRGB(p.r * t, p.g * t, p.b * t);
        m.setColorAt(i, col);
      } else {
        dummy.position.set(0, -100, 0);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geo, mat, MAX]} frustumCulled={false} />;
});
