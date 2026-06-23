import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, DepthOfField, Noise } from "@react-three/postprocessing";
import * as THREE from "three";
import { CONFIG } from "../data/config";
import { getWorld, useGame, type Hud, type TutorialStep } from "../store";
import { feedbackForEvents } from "../data/feedback";
import { input, clearEdges, setTouchMagnet } from "../input/controls";
import { humanFrameIntent } from "../input/frameIntent";
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

    // feed the local human's input (slot = humanId; 0 for single-player).
    // Movement comes from the floating joystick (touch) or keyboard (WASD) — both
    // write input.moveX/Z directly via the controls module.
    const hid = world.humanId;

    setTouchMagnet(input.magnet);
    const intent = humanFrameIntent(input);
    world.setInput(hid, {
      moveX: intent.moveX,
      moveZ: intent.moveZ,
      magnet: intent.magnet,
      dash: intent.dash,
      activate: intent.activate,
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
    // frame-rate-independent camera damping (was a fixed per-frame lerp, which
    // snapped harder on slow frames and jittered under variable frame timing).
    const camK = 1 - Math.exp(-(reducedMotion ? 16 : CONFIG.camera.smooth) * dt);
    camera.position.lerp(desired, camK);
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
      edgeDistance: Math.round((CONFIG.tableRadius - p.radius - Math.hypot(p.pos.x, p.pos.z)) * 100) / 100,
      speed: Math.round(Math.hypot(p.vel.x, p.vel.z) * 100) / 100,
      height: Math.round(p.y * 100) / 100,
      score: p.score,
      lives: p.lives,
      cluster: p.cluster.length,
      bankStreak: p.bankStreak,
      bankStreakBonus: Math.max(0, Math.min(CONFIG.bank.streakMax, p.bankStreak) - 1),
      bankStreakTimeLeft: Math.max(0, p.bankStreakUntil - w.time),
      isBot: p.isBot,
      botPersonality: p.isBot ? p.botPersonality : null,
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
        gl.toneMappingExposure = 1.15;
        // premium glass tabletop — warm neutral gallery backdrop
        scene.background = makeGradientTexture([
          [0, "#2a2622"],
          [0.5, "#1c1a17"],
          [1, "#100e0c"],
        ]);
        scene.fog = new THREE.Fog("#171511", 55, 110);
      }}
    >
      <GameLoop particles={particles} reducedMotion={reducedMotion} />

      {/* lighting — warm gallery key + cool fill (premium glass tabletop) */}
      <ambientLight intensity={0.35} color="#fff4e6" />
      <hemisphereLight args={["#fff0dc", "#2a2018", 0.4]} />
      <directionalLight
        position={[12, 26, 10]}
        intensity={2.4}
        color="#fff2e0"
        castShadow={shadowsEnabled}
        shadow-mapSize={shadowMapSize}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-14, 12, -8]} intensity={0.7} color="#9fb6ff" />

      {/* warm studio reflections for the refractive glass marbles (no external HDR fetch) */}
      <Environment resolution={128} frames={1}>
        <color attach="background" args={["#0b0a08"]} />
        <Lightformer intensity={2.6} position={[0, 6, 4]} scale={[10, 10, 1]} color="#fff0d8" />
        <Lightformer intensity={1.4} position={[6, 3, -4]} scale={[6, 6, 1]} color="#ffd9a8" />
        <Lightformer intensity={1.2} position={[-6, 3, -4]} scale={[6, 6, 1]} color="#bcd0ff" />
        <Lightformer intensity={1.0} position={[0, -3, 2]} scale={[10, 4, 1]} color="#3a2e22" />
      </Environment>

      <Table world={world} />
      <Goals world={world} />
      <Obstacles world={world} />
      <Marbles world={world} />
      <MagnetTethers world={world} />
      <Players world={world} />
      <Pickups world={world} />
      <Particles ref={particles} />
      {quality === "high" && !reducedMotion && !mobileViewport && <AmbientMotes />}

      {quality === "high" && (
        <EffectComposer multisampling={mobileViewport ? 0 : 4} enableNormalPass={false}>
          {/* gentle gallery depth-of-field: play disc stays sharp, surrounds soften */}
          <DepthOfField target={[0, 0, 0]} focalLength={0.01} bokehScale={1.8} height={480} />
          <Bloom intensity={0.5} luminanceThreshold={0.7} luminanceSmoothing={0.3} mipmapBlur radius={0.6} />
          <Vignette eskil={false} offset={0.32} darkness={0.5} />
          <Noise opacity={0.03} premultiply />
        </EffectComposer>
      )}
    </Canvas>
  );
}
