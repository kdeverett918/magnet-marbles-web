import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { CONFIG } from "../data/config";
import { getWorld, useGame, type Hud } from "../store";
import { input, clearEdges, setTouchMagnet } from "../input/controls";
import { sfx } from "../audio/sfx";
import type { PowerupType } from "../data/types";
import { makeGradientTexture } from "./textures";
import { Table } from "./Table";
import { Marbles } from "./Marbles";
import { Players } from "./Players";
import { Goals } from "./Goals";
import { Pickups } from "./Pickups";
import { Obstacles } from "./Obstacles";
import { Particles, type ParticlesHandle } from "./Particles";
import { AmbientMotes } from "./Ambient";

const BUFFS: PowerupType[] = ["superMagnet", "doubleScore", "turbo", "disableMagnet"];

function GameLoop({ particles }: { particles: React.RefObject<ParticlesHandle> }) {
  const { camera, size } = useThree();
  const pushHud = useGame((s) => s.pushHud);
  const sound = useGame((s) => s.settings.sound);
  const hudTimer = useRef(0);
  const lastCountdown = useRef(99);

  useEffect(() => {
    sfx.setEnabled(sound);
  }, [sound]);

  useFrame((_, dtRaw) => {
    const world = getWorld();
    if (!world) return;
    const dt = Math.min(dtRaw, 0.05);

    // feed human input (player 0)
    setTouchMagnet(input.magnet);
    world.setInput(0, {
      moveX: input.moveX,
      moveZ: input.moveZ,
      magnet: input.magnet,
      dash: input.dash,
      activate: input.activate,
    });
    clearEdges();

    // intro countdown beeps
    if (world.phase === "intro") {
      const c = Math.ceil(world.introCountdown);
      if (c !== lastCountdown.current && c <= 3 && c >= 0) {
        lastCountdown.current = c;
        sfx.countdownBeep(c === 0);
      }
    }

    world.tick(dt);

    // drain sim fx -> particles + audio
    const fx = world.drainFx();
    for (const ev of fx) {
      particles.current?.emit(ev);
      sfx.play(ev);
    }

    // ambient music intensity scales with action
    const human = world.players[0];
    const intensity = world.phase === "playing" ? 0.4 + Math.min(human?.cluster.length ?? 0, 18) / 36 : 0.1;
    sfx.music(dt, intensity);

    // camera: symmetric whole-table view that auto-fits the table for ANY aspect
    // ratio (mobile portrait + desktop landscape), with a gentle parallax.
    const px = CONFIG.camera.parallax;
    const target = new THREE.Vector3(
      (human?.pos.x ?? 0) * px,
      0,
      (human?.pos.z ?? 0) * px
    );
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    const vFov = (cam.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const Rfit = CONFIG.tableRadius + 2.5; // table + margin for goals/beams
    const distV = Rfit / Math.sin(vFov / 2);
    const distH = Rfit / Math.sin(hFov / 2);
    const fitDist = Math.max(distV, distH) * 1.02;
    // preserve the configured 3/4 viewing tilt direction
    const dir = new THREE.Vector3(0, CONFIG.camera.height, CONFIG.camera.distance).normalize();
    const desired = new THREE.Vector3(
      target.x + dir.x * fitDist,
      dir.y * fitDist,
      target.z + dir.z * fitDist
    );
    camera.position.lerp(desired, CONFIG.camera.tiltLerp);
    camera.lookAt(target.x, 0, target.z);

    // throttled HUD push
    hudTimer.current -= dt;
    if (hudTimer.current <= 0) {
      hudTimer.current = 1 / 14;
      pushHud(buildHud(world));
    }
  });

  return null;
}

function buildHud(world: ReturnType<typeof getWorld>): Hud {
  const w = world!;
  const human = w.players[0];
  const active = BUFFS.filter((t) => (human?.activeUntil[t] ?? 0) > w.time).map((t) => ({
    type: t,
    remaining: (human!.activeUntil[t] ?? 0) - w.time,
  }));
  return {
    phase: w.phase,
    round: w.round,
    totalRounds: w.mode.rounds,
    roundTime: w.roundTime,
    introCountdown: w.introCountdown,
    suddenDeath: w.suddenDeath,
    winnerId: w.winnerId,
    players: w.players.map((p) => ({
      id: p.id,
      name: p.name,
      colorHex: p.colorHex,
      score: p.score,
      cluster: p.cluster.length,
      isBot: p.isBot,
      alive: p.alive,
    })),
    heldPowerup: human?.heldPowerup ?? null,
    activePowerups: active,
    dashCooldown: human?.dashCooldown ?? 0,
    magnetActive: human?.magnetActive ?? false,
    clusterCap: CONFIG.magnet.clusterCap,
  };
}

export function GameScene() {
  const world = getWorld();
  const particles = useRef<ParticlesHandle>(null);
  const quality = useGame((s) => s.settings.quality);
  if (!world) return null;

  return (
    <Canvas
      shadows
      dpr={[1, quality === "high" ? 2 : 1.25]}
      camera={{ fov: CONFIG.camera.fov, position: [0, CONFIG.camera.height, CONFIG.camera.distance], near: 0.5, far: 200 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.3;
        // vibrant arcade sky — brighter, less dark
        scene.background = makeGradientTexture([
          [0, "#3a2f6b"],
          [0.45, "#27306a"],
          [1, "#121a40"],
        ]);
        scene.fog = new THREE.Fog("#222a5a", 48, 92);
      }}
    >
      <GameLoop particles={particles} />

      {/* lighting — bright, colorful arcade key/fill/rim */}
      <ambientLight intensity={0.7} color="#aebbff" />
      <hemisphereLight args={["#cfd8ff", "#3a2a4a", 0.6]} />
      <directionalLight
        position={[10, 24, 12]}
        intensity={1.9}
        color="#fff2e0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-12, 10, -8]} intensity={0.8} color="#5fa0ff" />
      <directionalLight position={[0, 8, -16]} intensity={0.7} color="#ff7ad0" />

      {/* baked studio reflections for the glossy marbles (no external HDR fetch) */}
      <Environment resolution={64} frames={1}>
        <color attach="background" args={["#05060c"]} />
        <Lightformer intensity={2.2} position={[0, 6, 4]} scale={[10, 10, 1]} color="#fff0d8" />
        <Lightformer intensity={1.2} position={[6, 3, -4]} scale={[6, 6, 1]} color="#88aaff" />
        <Lightformer intensity={1.0} position={[-6, 3, -4]} scale={[6, 6, 1]} color="#ff88aa" />
        <Lightformer intensity={0.8} position={[0, -4, 2]} scale={[10, 4, 1]} color="#334" />
      </Environment>

      <Table world={world} />
      <Goals world={world} />
      <Obstacles world={world} />
      <Marbles world={world} />
      <Players world={world} />
      <Pickups world={world} />
      <Particles ref={particles} />
      {quality === "high" && <AmbientMotes />}

      {quality === "high" && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom intensity={1.1} luminanceThreshold={0.55} luminanceSmoothing={0.22} mipmapBlur radius={0.75} />
          <Vignette eskil={false} offset={0.3} darkness={0.55} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
