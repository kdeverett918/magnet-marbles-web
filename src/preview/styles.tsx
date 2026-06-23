/* eslint-disable react-refresh/only-export-components -- standalone dev entry, not part of the HMR app graph */
/**
 * Standalone art-direction preview — NOT part of the shipped game.
 * Served by vite dev at http://localhost:5173/styles.html
 *
 * Renders a representative Magnet Marbles board (board + marble field + player
 * marbles + goals) in four switchable art directions so the look can be judged
 * live before committing the real scene to one. Self-contained: it does not
 * import or mutate any game runtime/store state.
 */
import { StrictMode, useMemo, useRef, useState, useLayoutEffect, useEffect, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
  DepthOfField,
  ChromaticAberration,
  Noise,
  SMAA,
} from "@react-three/postprocessing";
import * as THREE from "three";
import { makeGradientTexture, getStoneTextures } from "../game/scene/textures";

const R = 14; // board radius (matches CONFIG.tableRadius)
const PLAYER_COLORS = ["#f24447", "#338cf2", "#4dcc66", "#facc33"];
const CANDY = ["#ff5a7a", "#5ad1ff", "#ffd24d", "#9b6bff", "#5cff9b", "#ff8a3d"];

// ---------------------------------------------------------------- style presets
type StyleKey = "glass" | "neon" | "street" | "minimal";

type Preset = {
  key: StyleKey;
  label: string;
  blurb: string;
  exposure: number;
  background: [number, string][] | string; // gradient stops or solid color
  fog: { color: string; near: number; far: number } | null;
  board: {
    top: string;
    body: string;
    floor: string;
    gold: string;
    topRough: number;
    topMetal: number;
    useStone: boolean;
    ringColor: string; // boundary ring tint
  };
  marble: {
    kind: "glass" | "candy" | "stylized" | "matte";
    roughness: number;
    metalness: number;
    clearcoat: number;
    transmission: number;
    ior: number;
    iridescence: number;
    envIntensity: number;
    emissive: number; // emissive intensity tint of own color
    halo: boolean;
  };
  props: boolean;
  shadows: boolean;
};

const PRESETS: Record<StyleKey, Preset> = {
  glass: {
    key: "glass",
    label: "Premium Glass Tabletop",
    blurb: "Refractive glass marbles · polished walnut + felt board · warm gallery light · soft shadows + gentle depth-of-field. Reads the most 'expensive'.",
    exposure: 1.15,
    background: [
      [0, "#2a2622"],
      [0.5, "#1c1a17"],
      [1, "#100e0c"],
    ],
    fog: { color: "#171511", near: 55, far: 110 },
    board: {
      top: "#1f6b43", // green felt
      body: "#3c2715", // walnut
      floor: "#181310",
      gold: "#caa45a", // brass
      topRough: 0.85,
      topMetal: 0.0,
      useStone: false,
      ringColor: "#caa45a",
    },
    marble: {
      kind: "glass",
      roughness: 0.06,
      metalness: 0,
      clearcoat: 1,
      transmission: 0.92,
      ior: 1.52,
      iridescence: 0.1,
      envIntensity: 1.6,
      emissive: 0,
      halo: false,
    },
    props: false,
    shadows: true,
  },
  neon: {
    key: "neon",
    label: "Neon Arcade",
    blurb: "Glowing candy marbles · dark slate + neon rim strips · heavy bloom · chromatic aberration · particle energy. Electric, ultra-readable on phones.",
    exposure: 1.35,
    background: [
      [0, "#3a2f6b"],
      [0.45, "#27306a"],
      [1, "#0c1233"],
    ],
    fog: { color: "#1a2152", near: 48, far: 92 },
    board: {
      top: "#161a2c",
      body: "#0a0c16",
      floor: "#0a0814",
      gold: "#ff7a3c",
      topRough: 0.55,
      topMetal: 0.35,
      useStone: true,
      ringColor: "#33e0ff",
    },
    marble: {
      kind: "candy",
      roughness: 0.02,
      metalness: 0,
      clearcoat: 1,
      transmission: 0,
      ior: 1.3,
      iridescence: 0.5,
      envIntensity: 2.6,
      emissive: 0.18,
      halo: true,
    },
    props: false,
    shadows: false,
  },
  street: {
    key: "street",
    label: "My Street Diorama",
    blurb: "Stylized miniature street corner · chalk-circle on cobbles · painted curb rim · lamp posts + crates · warm daylight + long shadows. Charming, nostalgic.",
    exposure: 1.2,
    background: [
      [0, "#9fc7ef"],
      [0.55, "#cfe2f4"],
      [1, "#eaddc4"],
    ],
    fog: { color: "#cfe2f4", near: 70, far: 130 },
    board: {
      top: "#8d8f95", // cobble/asphalt
      body: "#4f4a44",
      floor: "#6b6258",
      gold: "#f2efe6", // chalk white lines
      topRough: 0.95,
      topMetal: 0.0,
      useStone: true,
      ringColor: "#f4f1ea",
    },
    marble: {
      kind: "stylized",
      roughness: 0.18,
      metalness: 0,
      clearcoat: 0.6,
      transmission: 0,
      ior: 1.3,
      iridescence: 0,
      envIntensity: 1.0,
      emissive: 0.06,
      halo: false,
    },
    props: true,
    shadows: true,
  },
  minimal: {
    key: "minimal",
    label: "Minimal Premium",
    blurb: "Soft pastel matte board · gentle gradients · restrained palette · almost no post-processing · maximum clarity. Calm, modern, accessible.",
    exposure: 1.05,
    background: [
      [0, "#eef0f6"],
      [0.6, "#e3e6f0"],
      [1, "#d7dbe8"],
    ],
    fog: null,
    board: {
      top: "#c9cfe6",
      body: "#aab0c8",
      floor: "#dfe2ee",
      gold: "#8b93b8",
      topRough: 0.7,
      topMetal: 0.0,
      useStone: false,
      ringColor: "#8b93b8",
    },
    marble: {
      kind: "matte",
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0.2,
      transmission: 0,
      ior: 1.3,
      iridescence: 0,
      envIntensity: 0.6,
      emissive: 0,
      halo: false,
    },
    props: false,
    shadows: true,
  },
};

// ---------------------------------------------------------------- marble field
type MarbleSpec = { x: number; z: number; r: number; color: string };

function buildField(): MarbleSpec[] {
  // deterministic pseudo-random layout in the CORRECTED spawn band (inside the
  // circle): 0.12R..0.66R, accounting for radius — also previews the spawn fix.
  let seed = 1337;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out: MarbleSpec[] = [];
  for (let i = 0; i < 46; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = THREE.MathUtils.lerp(R * 0.12, R * 0.66, Math.sqrt(rng()));
    out.push({ x: Math.cos(ang) * rad, z: Math.sin(ang) * rad, r: 0.42, color: CANDY[(rng() * CANDY.length) | 0] });
  }
  // a couple of jumbo marbles
  for (let i = 0; i < 3; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = R * 0.4 * rng();
    out.push({ x: Math.cos(ang) * rad, z: Math.sin(ang) * rad, r: 0.72, color: "#fff4c2" });
  }
  return out;
}

function makeMarbleMaterial(p: Preset): THREE.Material {
  const m = p.marble;
  if (m.kind === "matte") {
    return new THREE.MeshStandardMaterial({ roughness: m.roughness, metalness: m.metalness, envMapIntensity: m.envIntensity });
  }
  const mat = new THREE.MeshPhysicalMaterial({
    roughness: m.roughness,
    metalness: m.metalness,
    clearcoat: m.clearcoat,
    clearcoatRoughness: 0.05,
    iridescence: m.iridescence,
    iridescenceIOR: m.ior,
    transmission: m.transmission,
    ior: m.ior,
    thickness: m.transmission > 0 ? 0.8 : 0,
    envMapIntensity: m.envIntensity,
    attenuationDistance: m.transmission > 0 ? 2.4 : Infinity,
  });
  return mat;
}

function Marbles({ preset }: { preset: Preset }) {
  const field = useMemo(buildField, []);
  const count = field.length;
  const ref = useRef<THREE.InstancedMesh>(null);
  const halo = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.SphereGeometry(1, 32, 24), []);
  const haloGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 12), []);
  const mat = useMemo(() => makeMarbleMaterial(preset), [preset]);
  const haloMat = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      const f = field[i];
      dummy.position.set(f.x, f.r, f.z);
      dummy.scale.setScalar(f.r);
      dummy.rotation.set(i, i * 0.7, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.set(f.color);
      mesh.setColorAt(i, col);
      if (halo.current) {
        dummy.scale.setScalar(f.r * 1.7);
        dummy.updateMatrix();
        halo.current.setMatrixAt(i, dummy.matrix);
        halo.current.setColorAt(i, col);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (halo.current) {
      halo.current.instanceMatrix.needsUpdate = true;
      if (halo.current.instanceColor) halo.current.instanceColor.needsUpdate = true;
    }
  }, [count, field, dummy, col, preset]);

  return (
    <>
      {preset.marble.halo && <instancedMesh ref={halo} args={[haloGeo, haloMat, count]} frustumCulled={false} renderOrder={-1} />}
      <instancedMesh ref={ref} args={[geo, mat, count]} castShadow={preset.shadows} receiveShadow={preset.shadows} frustumCulled={false} />
    </>
  );
}

// ---------------------------------------------------------------- board + goals
function Board({ preset }: { preset: Preset }) {
  const b = preset.board;
  const stone = useMemo(() => (b.useStone ? getStoneTextures() : null), [b.useStone]);
  const goldMat = (emissive = 0.4) => (
    <meshStandardMaterial color={b.gold} emissive={b.gold} emissiveIntensity={preset.key === "neon" ? emissive : 0.05} roughness={preset.key === "street" ? 0.9 : 0.25} metalness={preset.key === "street" || preset.key === "minimal" ? 0 : 1} />
  );
  const guideRings = [0.4, 0.62].map((f) => f * R);

  return (
    <group>
      {/* table body */}
      <mesh position={[0, -1.0, 0]} receiveShadow>
        <cylinderGeometry args={[R * 1.04, R * 0.9, 1.6, 96]} />
        <meshStandardMaterial color={b.body} roughness={0.7} metalness={preset.key === "neon" ? 0.3 : 0.05} />
      </mesh>

      {/* main slate disc */}
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <cylinderGeometry args={[R, R * 1.02, 0.5, 96]} />
        <meshStandardMaterial map={stone?.map} roughnessMap={stone?.rough} color={b.top} roughness={b.topRough} metalness={b.topMetal} />
      </mesh>

      {/* playable top */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
        <circleGeometry args={[R * 0.997, 96]} />
        <meshStandardMaterial map={stone?.map} roughnessMap={stone?.rough} color={b.top} roughness={b.topRough} metalness={b.topMetal} />
      </mesh>

      {/* boundary ring (the "circle") — sits at the true play edge, clearly OUTSIDE the field */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[R - 0.55, R - 0.3, 140]} />
        {goldMat(0.6)}
      </mesh>
      {preset.key === "neon" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[R - 0.32, R - 0.18, 140]} />
          <meshBasicMaterial color={b.ringColor} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}

      {/* concentric guide rings (well inside the field) */}
      {guideRings.map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
          <ringGeometry args={[r - 0.04, r + 0.04, 120]} />
          {goldMat(0.4)}
        </mesh>
      ))}

      {/* centre hub */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]}>
        <ringGeometry args={[1.5, 1.8, 48]} />
        {goldMat(0.5)}
      </mesh>

      {/* raised rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.16, 0]} castShadow={preset.shadows}>
        <torusGeometry args={[R + 0.18, 0.62, 20, 140]} />
        <meshStandardMaterial map={preset.key === "street" ? stone?.map : undefined} color={preset.key === "glass" ? b.gold : preset.key === "neon" ? "#1b2030" : preset.key === "street" ? "#b9b3a6" : "#b7bcd2"} roughness={preset.key === "glass" ? 0.3 : 0.8} metalness={preset.key === "glass" ? 0.9 : 0.1} />
      </mesh>

      {/* neon under-rim glow */}
      {preset.key === "neon" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
          <torusGeometry args={[R + 0.5, 0.22, 12, 140]} />
          <meshBasicMaterial color="#ff6a3c" />
        </mesh>
      )}

      <Goals preset={preset} />
      {preset.props && <StreetProps />}

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]} receiveShadow>
        <circleGeometry args={[R * (preset.key === "street" ? 6 : 4), 64]} />
        <meshStandardMaterial color={b.floor} roughness={0.95} metalness={0} />
      </mesh>

      {/* neon reactive grid floor */}
      {preset.key === "neon" && (
        <gridHelper args={[R * 6, 48, "#2a3a7a", "#1a2350"]} position={[0, -2.18, 0]} />
      )}
    </group>
  );
}

function Goals({ preset }: { preset: Preset }) {
  const goals = useMemo(
    () => PLAYER_COLORS.map((c, i) => ({ a: (i / 4) * Math.PI * 2 + Math.PI / 4, color: c })),
    []
  );
  return (
    <group>
      {goals.map((g, i) => {
        const x = Math.cos(g.a) * (R - 2.1);
        const z = Math.sin(g.a) * (R - 2.1);
        return (
          <group key={i} position={[x, 0, z]}>
            {/* bowl rim */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
              <ringGeometry args={[1.2, 1.5, 48]} />
              <meshPhysicalMaterial color={g.color} emissive={g.color} emissiveIntensity={preset.key === "neon" ? 0.8 : 0.25} roughness={0.15} clearcoat={1} />
            </mesh>
            {/* bowl interior */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <circleGeometry args={[1.2, 36]} />
              <meshStandardMaterial color="#0a0b12" roughness={0.5} metalness={0.2} />
            </mesh>
            {/* glow funnel */}
            <mesh position={[0, 0.06, 0]}>
              <sphereGeometry args={[0.45, 20, 16]} />
              <meshBasicMaterial color={g.color} transparent opacity={preset.key === "minimal" ? 0.3 : 0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
            {preset.key !== "minimal" && <pointLight color={g.color} intensity={preset.key === "neon" ? 7 : 3} distance={9} position={[0, 1, 0]} />}
            {/* player shooter marble parked at the goal */}
            <mesh position={[Math.cos(g.a + Math.PI) * 1.6, 0.85, Math.sin(g.a + Math.PI) * 1.6]} castShadow={preset.shadows}>
              <sphereGeometry args={[0.85, 40, 28]} />
              <meshPhysicalMaterial color={g.color} emissive={g.color} emissiveIntensity={preset.key === "neon" ? 0.25 : 0.08} roughness={preset.marble.roughness} metalness={0} clearcoat={1} clearcoatRoughness={0.06} envMapIntensity={preset.marble.envIntensity} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function StreetProps() {
  const items = useMemo(() => {
    const kinds: ("lamp" | "crate" | "barrel")[] = ["lamp", "crate", "barrel", "lamp", "barrel", "crate"];
    return kinds.map((kind, i) => ({ a: (i / 6) * Math.PI * 2 + 0.35, r: R + 4.2, kind }));
  }, []);
  return (
    <group>
      {items.map((it, i) => {
        const x = Math.cos(it.a) * it.r;
        const z = Math.sin(it.a) * it.r;
        if (it.kind === "lamp") {
          return (
            <group key={i} position={[x, 0, z]}>
              <mesh position={[0, 1.8, 0]} castShadow>
                <cylinderGeometry args={[0.08, 0.13, 3.6, 8]} />
                <meshStandardMaterial color="#26262e" roughness={0.6} metalness={0.6} />
              </mesh>
              <mesh position={[0, 3.7, 0]}>
                <icosahedronGeometry args={[0.34, 0]} />
                <meshStandardMaterial color="#ffd9a0" emissive="#ffb14d" emissiveIntensity={1.6} />
              </mesh>
              <pointLight position={[0, 3.7, 0]} color="#ffd9a0" intensity={5} distance={13} />
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
            </group>
          );
        }
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, i, 0]}>
            <mesh position={[0, 0.5, 0]} castShadow>
              <boxGeometry args={[1.2, 1.0, 1.2]} />
              <meshStandardMaterial color="#5b3f26" roughness={0.85} metalness={0.05} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------- lights / env
function Lights({ preset }: { preset: Preset }) {
  switch (preset.key) {
    case "glass":
      return (
        <>
          <ambientLight intensity={0.35} color="#fff4e6" />
          <hemisphereLight args={["#fff0dc", "#2a2018", 0.4]} />
          <directionalLight position={[12, 26, 10]} intensity={2.4} color="#fff2e0" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-bias={-0.0004} />
          <directionalLight position={[-14, 12, -8]} intensity={0.7} color="#9fb6ff" />
        </>
      );
    case "neon":
      return (
        <>
          <ambientLight intensity={0.7} color="#aebbff" />
          <hemisphereLight args={["#cfd8ff", "#3a2a4a", 0.6]} />
          <directionalLight position={[10, 24, 12]} intensity={1.6} color="#fff2e0" />
          <directionalLight position={[-12, 10, -8]} intensity={0.9} color="#5fa0ff" />
          <directionalLight position={[0, 8, -16]} intensity={0.9} color="#ff5ad0" />
        </>
      );
    case "street":
      return (
        <>
          <ambientLight intensity={0.5} color="#dfeeff" />
          <hemisphereLight args={["#bcdcff", "#6b5a44", 0.85]} />
          <directionalLight position={[18, 30, 14]} intensity={2.6} color="#fff4dc" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24} shadow-bias={-0.0004} />
        </>
      );
    case "minimal":
      return (
        <>
          <ambientLight intensity={1.0} color="#ffffff" />
          <hemisphereLight args={["#ffffff", "#c7cce0", 0.9]} />
          <directionalLight position={[8, 22, 10]} intensity={1.1} color="#ffffff" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-bias={-0.0005} />
        </>
      );
  }
}

function EnvRig({ preset }: { preset: Preset }) {
  if (preset.key === "minimal") {
    return (
      <Environment resolution={64} frames={1}>
        <color attach="background" args={["#e9ecf5"]} />
        <Lightformer intensity={1.4} position={[0, 6, 4]} scale={[14, 14, 1]} color="#ffffff" />
      </Environment>
    );
  }
  if (preset.key === "glass") {
    return (
      <Environment resolution={128} frames={1}>
        <color attach="background" args={["#0b0a08"]} />
        <Lightformer intensity={2.6} position={[0, 6, 4]} scale={[10, 10, 1]} color="#fff0d8" />
        <Lightformer intensity={1.4} position={[6, 3, -4]} scale={[6, 6, 1]} color="#ffd9a8" />
        <Lightformer intensity={1.2} position={[-6, 3, -4]} scale={[6, 6, 1]} color="#bcd0ff" />
        <Lightformer intensity={1.0} position={[0, -3, 2]} scale={[10, 4, 1]} color="#3a2e22" />
      </Environment>
    );
  }
  if (preset.key === "street") {
    return (
      <Environment resolution={64} frames={1}>
        <color attach="background" args={["#a9cdf0"]} />
        <Lightformer intensity={2.0} position={[0, 8, 2]} scale={[16, 16, 1]} color="#ffffff" />
        <Lightformer intensity={1.0} position={[0, -4, 0]} scale={[16, 8, 1]} color="#caa" />
      </Environment>
    );
  }
  // neon
  return (
    <Environment resolution={64} frames={1}>
      <color attach="background" args={["#05060c"]} />
      <Lightformer intensity={2.2} position={[0, 6, 4]} scale={[10, 10, 1]} color="#fff0d8" />
      <Lightformer intensity={1.4} position={[6, 3, -4]} scale={[6, 6, 1]} color="#66aaff" />
      <Lightformer intensity={1.4} position={[-6, 3, -4]} scale={[6, 6, 1]} color="#ff66cc" />
    </Environment>
  );
}

function PostFX({ preset }: { preset: Preset }) {
  switch (preset.key) {
    case "glass":
      return (
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <DepthOfField target={[0, 0, 0]} focalLength={0.015} bokehScale={2.4} height={480} />
          <Bloom intensity={0.5} luminanceThreshold={0.7} luminanceSmoothing={0.3} mipmapBlur radius={0.6} />
          <Vignette eskil={false} offset={0.32} darkness={0.55} />
          <Noise opacity={0.035} premultiply />
        </EffectComposer>
      );
    case "neon":
      return (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom intensity={1.3} luminanceThreshold={0.5} luminanceSmoothing={0.2} mipmapBlur radius={0.8} />
          <ChromaticAberration offset={new THREE.Vector2(0.0009, 0.0012)} radialModulation modulationOffset={0.3} />
          <Vignette eskil={false} offset={0.28} darkness={0.6} />
        </EffectComposer>
      );
    case "street":
      return (
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <Bloom intensity={0.45} luminanceThreshold={0.75} luminanceSmoothing={0.3} mipmapBlur radius={0.5} />
          <Vignette eskil={false} offset={0.4} darkness={0.4} />
        </EffectComposer>
      );
    case "minimal":
      return (
        <EffectComposer multisampling={8} enableNormalPass={false}>
          <SMAA />
          <Vignette eskil={false} offset={0.5} darkness={0.18} />
        </EffectComposer>
      );
  }
}

// ---------------------------------------------------------------- stage / camera
function Stage({ preset }: { preset: Preset }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = preset.exposure;
    if (typeof preset.background === "string") {
      scene.background = new THREE.Color(preset.background);
    } else {
      scene.background = makeGradientTexture(preset.background);
    }
    scene.fog = preset.fog ? new THREE.Fog(preset.fog.color, preset.fog.near, preset.fog.far) : null;
  }, [gl, scene, preset]);
  return null;
}

function CameraRig({ orbit }: { orbit: boolean }) {
  const { camera } = useThree();
  const angle = useRef(0);
  useFrame((_, dt) => {
    if (orbit) angle.current += dt * 0.12;
    const a = angle.current;
    const tilt = new THREE.Vector3(0, 33, 21).normalize();
    const dist = 47;
    const baseY = tilt.y * dist;
    const baseZ = tilt.z * dist;
    camera.position.set(Math.sin(a) * baseZ, baseY, Math.cos(a) * baseZ);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ---------------------------------------------------------------- app shell
function Preview() {
  const [styleKey, setStyleKey] = useState<StyleKey>("glass");
  const [frame, setFrame] = useState<"full" | "phone">("full");
  const [orbit, setOrbit] = useState(true);
  const preset = PRESETS[styleKey];

  const wrapStyle: CSSProperties =
    frame === "phone"
      ? { width: "min(430px, 92vw)", height: "min(86vh, 920px)", margin: "0 auto", borderRadius: 28, overflow: "hidden", boxShadow: "0 30px 90px rgba(0,0,0,0.6)", border: "2px solid #222" }
      : { width: "100%", height: "100%" };

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#05060c", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* top control bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 12px", alignItems: "center", background: "rgba(10,12,22,0.9)", borderBottom: "1px solid rgba(255,255,255,0.08)", zIndex: 10 }}>
        <strong style={{ color: "#f3f5ff", marginRight: 8, fontSize: 14 }}>Magnet Marbles · Art Direction Preview</strong>
        {(Object.keys(PRESETS) as StyleKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setStyleKey(k)}
            style={{
              cursor: "pointer",
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              color: styleKey === k ? "#0a0c12" : "#dfe3f5",
              background: styleKey === k ? "linear-gradient(180deg,#ffd98a,#f2b24a)" : "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.16)",
            }}
          >
            {PRESETS[k].label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={() => setFrame((f) => (f === "full" ? "phone" : "full"))} style={ctlBtn}>
          {frame === "full" ? "📱 Phone frame" : "🖥 Full frame"}
        </button>
        <button onClick={() => setOrbit((o) => !o)} style={ctlBtn}>
          {orbit ? "⏸ Stop orbit" : "▶ Orbit"}
        </button>
      </div>

      {/* blurb */}
      <div style={{ padding: "8px 14px", color: "#aeb6dc", fontSize: 13, lineHeight: 1.4, background: "rgba(10,12,22,0.65)", zIndex: 10 }}>
        <strong style={{ color: "#f3f5ff" }}>{preset.label}.</strong> {preset.blurb}
      </div>

      {/* stage */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: frame === "phone" ? 16 : 0 }}>
        <div style={wrapStyle}>
          <Canvas
            shadows
            dpr={[1, 2]}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            camera={{ fov: 42, position: [0, 38, 28], near: 0.5, far: 220 }}
          >
            <Stage preset={preset} />
            <CameraRig orbit={orbit} />
            <Lights preset={preset} />
            <EnvRig preset={preset} />
            <Board preset={preset} />
            <Marbles preset={preset} />
            <PostFX preset={preset} />
          </Canvas>
        </div>
      </div>
    </div>
  );
}

const ctlBtn: CSSProperties = {
  cursor: "pointer",
  padding: "8px 12px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  color: "#dfe3f5",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.16)",
};

createRoot(document.getElementById("preview-root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);
