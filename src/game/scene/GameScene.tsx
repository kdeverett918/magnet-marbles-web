import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { CONFIG } from "../data/config";
import { getWorld, useGame, type Hud, type TutorialStep } from "../store";
import { feedbackForEvents } from "../data/feedback";
import { input, clearEdges, setTouchMagnet, drag, setDragTarget, endDrag } from "../input/controls";
import { sfx } from "../audio/sfx";
import { haptics } from "../haptics/haptics";
import type { PowerupType } from "../data/types";
import { makeGradientTexture } from "./textures";
import { Table } from "./Table";
import { Marbles } from "./Marbles";
import { Players } from "./Players";
import { Goals } from "./Goals";
import { Pickups } from "./Pickups";
import { Obstacles } from "./Obstacles";
import { MagnetTethers } from "./MagnetTethers";
import { Particles, type ParticlesHandle } from "./Particles";
import { addCameraImpulse, cameraShakeOffset, type CameraShakeState } from "./cameraJuice";
import { AmbientMotes } from "./Ambient";
import { useReducedMotion } from "../ui/useReducedMotion";

const BUFFS: PowerupType[] = ["magnetBurst", "heavyCore", "superMagnet", "doubleScore", "turbo", "disableMagnet"];

function GameLoop({ particles, reducedMotion }: { particles: React.RefObject<ParticlesHandle>; reducedMotion: boolean }) {
  const { camera, size } = useThree();
  const pushHud = useGame((s) => s.pushHud);
  const pushFeedback = useGame((s) => s.pushFeedback);
  const paused = useGame((s) => s.paused);
  const sound = useGame((s) => s.settings.sound);
  const hudTimer = useRef(0);
  const lastCountdown = useRef(99);
  const cameraShake = useRef<CameraShakeState>({ time: 0, duration: 0, amplitude: 0, phase: 0 });

  useEffect(() => {
    sfx.setEnabled(sound);
  }, [sound]);

  useFrame((_, dtRaw) => {
    const world = getWorld();
    if (!world) return;
    const dt = Math.min(dtRaw, 0.05);
    if (paused) {
      clearEdges();
      return;
    }

    // feed the local human's input (slot = humanId; 0 for single-player)
    const hid = world.humanId;
    const me = world.players[hid] ?? world.players[0];

    // direct-drag steering: the marble chases the finger/cursor point on the table
    if (drag.active && me) {
      const dx = drag.x - me.pos.x;
      const dz = drag.z - me.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.5) {
        const m = Math.min(dist / 3.5, 1); // full speed when the finger is far
        input.moveX = (dx / dist) * m;
        input.moveZ = (dz / dist) * m;
      } else {
        input.moveX = 0;
        input.moveZ = 0;
      }
    }

    setTouchMagnet(input.magnet);
    // auto-magnet while moving so one-thumb / casual play just works; the
    // explicit magnet button/Space still lets you magnetize while stationary.
    const moving = Math.hypot(input.moveX, input.moveZ) > 0.15;
    world.setInput(hid, {
      moveX: input.moveX,
      moveZ: input.moveZ,
      magnet: input.magnet || moving,
      dash: input.dash,
      activate: input.activate,
    });
    clearEdges();
    world.flushInput(dt); // no-op locally; sends to server when online

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
      haptics.play(ev);
      if (!reducedMotion) addCameraImpulse(cameraShake.current, ev, world.time);
    }
    pushFeedback(feedbackForEvents(fx));

    const human = world.players[hid] ?? world.players[0];

    // camera: symmetric whole-table view that auto-fits the table for ANY aspect
    // ratio (mobile portrait + desktop landscape), with a gentle parallax.
    const px = reducedMotion ? 0 : CONFIG.camera.parallax;
    const target = new THREE.Vector3(
      (human?.pos.x ?? 0) * px,
      0,
      (human?.pos.z ?? 0) * px
    );
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    const portrait = aspect < 1;
    const vFov = (cam.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    // portrait fills the width (rim near edges); landscape keeps generous margin
    const margin = portrait ? 2.0 : CONFIG.camera.fitMargin;
    const Rfit = CONFIG.tableRadius + margin;
    const distV = Rfit / Math.sin(vFov / 2);
    const distH = Rfit / Math.sin(hFov / 2);
    const fitDist = Math.max(distV, distH) * 1.02;
    // preserve the configured 3/4 viewing tilt direction
    const dir = new THREE.Vector3(0, CONFIG.camera.height, CONFIG.camera.distance).normalize();
    // on portrait, lift the arena above the thumb controls (aim slightly nearer)
    const lift = portrait ? fitDist * 0.14 : 0;
    const desired = new THREE.Vector3(
      target.x + dir.x * fitDist,
      dir.y * fitDist,
      target.z + dir.z * fitDist + lift
    );
    camera.position.lerp(desired, reducedMotion ? 0.18 : CONFIG.camera.tiltLerp);
    if (!reducedMotion) {
      const shake = cameraShakeOffset(cameraShake.current, dt);
      camera.position.x += shake.x;
      camera.position.z += shake.z;
    }
    camera.lookAt(target.x, 0, target.z + lift);

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
  const human = w.players[w.humanId] ?? w.players[0];
  const tutorialAssist = w.tutorialAssist;
  const tutorialComplete = tutorialAssist && w.humanBankedThisMatch;
  const tutorialStep = tutorialStepFor(w.phase, tutorialAssist, tutorialComplete, human?.cluster.length ?? 0);
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
    modeId: w.mode.id,
    modeName: w.mode.name,
    modeKind: w.mode.kind,
    modeObjective: w.mode.objective,
    humanId: w.humanId,
    players: w.players.map((p) => ({
      id: p.id,
      name: p.name,
      colorHex: p.colorHex,
      teamId: p.teamId,
      score: p.score,
      lives: p.lives,
      cluster: p.cluster.length,
      isBot: p.isBot,
      alive: p.alive,
    })),
    heldPowerup: human?.heldPowerup ?? null,
    activePowerups: active,
    dashCooldown: human?.dashCooldown ?? 0,
    magnetActive: human?.magnetActive ?? false,
    clusterCap: CONFIG.magnet.clusterCap,
    tutorialAssist,
    tutorialStep,
    tutorialGoalPulse: tutorialStep === "bank",
    tutorialComplete,
  };
}

function tutorialStepFor(phase: string, assist: boolean, complete: boolean, cluster: number): TutorialStep {
  if (!assist) return "off";
  if (complete) return "done";
  if (phase !== "intro" && phase !== "playing") return "off";
  return cluster > 0 ? "bank" : "collect";
}

/** Invisible ground plane that turns finger/mouse drags into a table point. */
function DragPlane() {
  const dragging = useRef(false);
  useEffect(() => {
    const up = () => {
      if (dragging.current) {
        dragging.current = false;
        endDrag();
      }
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.01, 0]}
      onPointerDown={(e) => {
        dragging.current = true;
        setDragTarget(e.point.x, e.point.z);
        sfx.ensure();
      }}
      onPointerMove={(e) => {
        if (dragging.current) setDragTarget(e.point.x, e.point.z);
      }}
    >
      <planeGeometry args={[400, 400]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function GameScene() {
  const world = getWorld();
  const particles = useRef<ParticlesHandle>(null);
  const quality = useGame((s) => s.settings.quality);
  const reducedMotion = useReducedMotion();
  if (!world) return null;
  const mobileViewport = typeof window !== "undefined" &&
    (window.innerWidth <= 760 || (window.matchMedia?.("(pointer: coarse)")?.matches ?? false));
  const lite = quality === "lite";
  const maxDpr = quality === "high" ? (mobileViewport ? 1.5 : 2) : 1;
  const shadowsEnabled = quality === "high" && !mobileViewport;
  const shadowMapSize: [number, number] = mobileViewport ? [768, 768] : [1024, 1024];

  return (
    <Canvas
      shadows={shadowsEnabled}
      dpr={[1, maxDpr]}
      camera={{ fov: CONFIG.camera.fov, position: [0, CONFIG.camera.height, CONFIG.camera.distance], near: 0.5, far: 200 }}
      gl={{ antialias: !lite || !mobileViewport, powerPreference: "high-performance" }}
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
      <GameLoop particles={particles} reducedMotion={reducedMotion} />

      {/* lighting — bright, colorful arcade key/fill/rim */}
      <ambientLight intensity={0.7} color="#aebbff" />
      <hemisphereLight args={["#cfd8ff", "#3a2a4a", 0.6]} />
      <directionalLight
        position={[10, 24, 12]}
        intensity={1.9}
        color="#fff2e0"
        castShadow={shadowsEnabled}
        shadow-mapSize={shadowMapSize}
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
      <DragPlane />
      <Goals world={world} />
      <Obstacles world={world} />
      <Marbles world={world} />
      <MagnetTethers world={world} />
      <Players world={world} />
      <Pickups world={world} />
      <Particles ref={particles} />
      {quality === "high" && !reducedMotion && !mobileViewport && <AmbientMotes />}

      {quality === "high" && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom intensity={1.1} luminanceThreshold={0.55} luminanceSmoothing={0.22} mipmapBlur radius={0.75} />
          <Vignette eskil={false} offset={0.3} darkness={0.55} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
