# Magnet Marbles — Web

A premium, phone-first 3D marble arena game. A faithful, modernized homage to the
*My Street* (PS2) marbles minigame, built for the browser.

Drive your magnetic shooter marble around a circular tabletop, pull candy marbles into
your orbiting cluster, carry them home to your colored goal to score, and bump rivals to
steal their haul or knock them clean off the table. Play Classic, Battle, King Magnet,
Team Bank, or Survival in short 90-second rounds against three bots or online rivals.

> This is the **web build** — an independent implementation parallel to the Unity project,
> built to compare the two approaches. Three.js + a custom deterministic marble physics
> sim, with a Colyseus authoritative server path for online play.

## Stack
- **Vite + React + TypeScript**
- **three.js** via **@react-three/fiber** + **@react-three/drei** for rendering
- **@react-three/postprocessing** for bloom / vignette
- **zustand** for UI state
- Custom fixed-timestep 2D-on-XZ physics simulation (`src/game/sim/world.ts`)
- WebAudio SFX engine with generated sample polish and synth fallback
- Optional Colyseus server in `server/`

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

Progression is local-first for the web build: finished offline matches award stars,
the daily challenge uses a deterministic daily seed, and trail skins unlock from the
menu. Online rewards are intentionally not granted until the backend has account
identity and anti-abuse rules.

## Quality gates
```bash
npm run validate:no-browser
npm run test
npm run lint
npm run icons:generate
npm run metadata:smoke
npm run assets:smoke
npm run launch:check
LAUNCH_CHECK_MOBILE_PERF=1 npm run launch:check
npm run release:verify
```

`validate:no-browser` is the safe default while iterating on code or UI without
spawning Chrome: it runs unit tests, lint, and the production build/typecheck.
`icons:generate` rebuilds the procedural mobile install icons and social card in
`public/`. `metadata:smoke` verifies install/share metadata plus the shipped
privacy and support pages. `launch:check` builds the web and server, runs browser
preview/mode/perf/soak smokes, verifies launch metadata and generated audio assets,
starts a local authoritative server, and checks online join, all-mode snapshots,
and disconnect takeover. Browser smokes reuse one shared headless Chrome/CDP
instance by default. The optional mobile perf gate adds a 390x844, 4x
CPU-throttled gameplay sample; standalone stress checks are available through
`npm run perf:mobile:smoke` and `MOBILE_PERF_QUALITY=high npm run perf:mobile:smoke`.

`release:verify` is the final public-release gate after deployment. It requires
a clean release candidate, a recent passing local launch report with mobile perf,
then verifies the live Render frontend and backend are serving the current commit,
including live online Classic, all modes, and disconnect takeover.

## Controls
- **Desktop:** `WASD` / arrows move · `Space` hold magnet · `Shift` dash · `E` use powerup
- **Mobile:** drag on the playfield to move · hold the lower-right thumb zone for magnet · tap/flick that zone or tap **Dash** to dash · tap the powerup button to use a held powerup

## Gameplay
- **Magnetize:** hold magnet to pull free marbles into your orbiting cluster (cap 18).
- **Bank:** carry your cluster into your colored goal to score (1 pt each).
- **Steal / knock-off:** ram a carrying rival to steal a chunk of their cluster; hit them
  hard near the edge to knock them off — they drop everything.
- **Modes:** Classic bank race, Battle combat scoring, King Magnet largest-cluster scoring,
  Team Bank 2v2 shared goals, and Survival three-life outlast.
- **Powerups are held, then activated:** Magnet Burst, Shock Pulse, and Heavy Core.
- **Progression:** finish offline matches to earn stars, clear the daily challenge
  for a first-win bonus, and unlock/equip marble trail skins.
- **Obstacles ramp in by round:** goal-block buttons (temporarily block a rival's goal) and
  blue-arrow auto-goal rings (sweep loose marbles toward a goal).
- **Sudden death:** a tie at the buzzer goes to overtime — first to break the tie wins.

## Project layout
```
src/game/
  data/        config (all tunables) + types
  sim/         the authoritative World simulation (physics, magnet, carry, scoring,
               combat, powerups, bots, rounds, obstacles)
  scene/       react-three-fiber rendering (table, marbles, players, goals, pickups,
               obstacles, particles, camera, lighting, post)
  input/       keyboard + shared touch input state
  audio/       WebAudio synth engine
  ui/          menu, HUD, touch controls, overlays
```

## Deploy
Static site on Render — see `render.yaml`. Builds with `npm ci && npm run build`, serves `dist/`.
After deploying both the web and server, run `npm run release:verify`; it writes
`outputs/release-readiness.json` and fails if either public service is stale.
The production build also ships `privacy.html` and `support.html` from `public/`.

## Tuning
All gameplay feel lives in `src/game/data/config.ts`. Change values there, not in the sim.
