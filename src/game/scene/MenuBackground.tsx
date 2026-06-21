import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { makeMarbleMaterial } from "./marbleMaterial";

const LAYOUT = [
  { color: "#F24447", x: -6.2, y: 2.4, z: 0.0, r: 1.7, spd: 0.5 },
  { color: "#338CF2", x: 6.0, y: -1.6, z: 0.5, r: 1.9, spd: 0.4 },
  { color: "#4DCC66", x: -5.0, y: -2.8, z: -1.0, r: 1.3, spd: 0.6 },
  { color: "#FACC33", x: 5.2, y: 2.9, z: -1.5, r: 1.2, spd: 0.55 },
  { color: "#27E0E0", x: -2.0, y: 3.4, z: -2.5, r: 0.9, spd: 0.7 },
  { color: "#FF4DD2", x: 2.4, y: -3.2, z: -2.0, r: 1.0, spd: 0.65 },
  { color: "#B66BFF", x: 0.4, y: 0.2, z: 1.5, r: 1.5, spd: 0.45 },
];

function FloatingMarble({ d, i }: { d: (typeof LAYOUT)[number]; i: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => makeMarbleMaterial(d.color), [d.color]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    mat.uniforms.uTime.value = t;
    if (ref.current) {
      ref.current.position.y = d.y + Math.sin(t * d.spd + i) * 0.4;
      ref.current.position.x = d.x + Math.cos(t * d.spd * 0.6 + i) * 0.25;
      ref.current.rotation.y = t * d.spd * 0.5 + i;
      ref.current.rotation.x = Math.sin(t * 0.2 + i) * 0.3;
    }
  });
  return (
    <mesh ref={ref} position={[d.x, d.y, d.z]} material={mat}>
      <sphereGeometry args={[d.r, 48, 32]} />
    </mesh>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.4} color="#9fb0d0" />
      <directionalLight position={[6, 10, 8]} intensity={1.4} color="#fff2e0" />
      <directionalLight position={[-8, 4, -6]} intensity={0.5} color="#5577ff" />
      <Environment resolution={64} frames={1}>
        <Lightformer intensity={2.4} position={[0, 5, 4]} scale={[10, 10, 1]} color="#fff0d8" />
        <Lightformer intensity={1.4} position={[6, 2, -4]} scale={[6, 6, 1]} color="#88aaff" />
        <Lightformer intensity={1.2} position={[-6, 2, -4]} scale={[6, 6, 1]} color="#ff88aa" />
      </Environment>
      {LAYOUT.map((d, i) => (
        <FloatingMarble key={i} d={d} i={i} />
      ))}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom intensity={1.0} luminanceThreshold={0.5} luminanceSmoothing={0.2} mipmapBlur radius={0.7} />
        <Vignette eskil={false} offset={0.2} darkness={1.0} />
      </EffectComposer>
    </>
  );
}

export function MenuBackground() {
  return (
    <div className="menu-bg">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 42, position: [0, 0, 12], near: 0.5, far: 60 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
          scene.fog = new THREE.Fog("#070810", 14, 30);
        }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
