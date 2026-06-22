# Magnet Marbles — Web

A premium, phone-first 3D magnetic marble arena game for the browser, built around
classic tabletop party-game readability with modern mobile arcade feel.

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
- WebAudio SFX-only engine with generated sample polish, player volume control, and synth fallback
- Phone haptics through the browser vibration API where supported
- Optional Colyseus server in `server/`

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

Progression is local-first for the web build: finished offline matches award stars,
the daily challenge uses a deterministic daily seed, and marble skin/trail cosmetics
unlock from the menu. Online rewards are intentionally not granted until the backend has account
identity and anti-abuse rules.

## Quality gates
```bash
npm run validate:no-browser
npm run test
npm run vertical:slice
npm run sim:soak
npm run lint
npm run icons:generate
npm run build-info:smoke
npm run source:fingerprint
npm run aa:readiness
npm run metadata:smoke
npm run ip:safety
npm run assets:smoke
npm run dist:budget
npm run browser:guard
npm run clean-exit:smoke
MM_ALLOW_BROWSER=1 npm run launch:check
MM_ALLOW_BROWSER=1 LAUNCH_CHECK_MOBILE_PERF=1 npm run launch:check
npm run live:version
npm run deploy:monitor
MM_ALLOW_BROWSER=1 npm run release:verify
```

`validate:no-browser` is the safe default while iterating on code or UI without
spawning Chrome: it runs unit tests, the vertical-slice contract, lint,
web/server audits, the production build/typecheck, dist build-info/metadata,
payload-budget, SFX asset, and AA-readiness static smokes, the authoritative server build, local online
Classic/all-modes/disconnect smokes against a temporary localhost server, and
whitespace checks, then writes `outputs/no-browser-check.json`.
`aa:readiness` is a no-browser static audit for the shipped web candidate:
mode lineup, 90-second rounds, powerups, progression, phone controls, HUD/menu
surfaces, Color Assist identity markers, player Motion control, solo pause/resume lifecycle safety,
SFX-only audio with player volume, phone haptics, authoritative online safety, build provenance,
launch metadata, Render blueprint, docs, absence of Chrome/CDP calls in the safe
validation path, and explicit Chrome/CDP opt-in for browser smokes.
`vertical:slice` is a focused no-browser contract check for the requested
Classic/Battle/King Magnet/Team Bank/Survival mode set, 90-second rounds,
4-player/3-bot setup, Easy/Normal/Hard bot difficulty, the three launch powerups,
six marble skin/trail cosmetics, daily challenge, magnet/carry tuning, and the playable core
loop: move, magnetize, carry, bank, bot participation, match end, and rematch setup.
`sim:soak` runs a longer deterministic all-mode endurance test that drives
human input, bots, magnets, dash, powerups, obstacles, scoring, and round flow
without a browser.
GitHub Actions runs `validate:no-browser` on pushes and pull requests after
installing both web and server dependencies, then uploads the generated
`outputs/` reports as CI artifacts.
`icons:generate` rebuilds the procedural mobile install icons and social card in
`public/`. `build-info:smoke` verifies `dist/build.json` and the built JS bundle
carry matching commit/branch/source-fingerprint provenance. `source:fingerprint`
verifies the fingerprint includes code, config, generated launch art, and shipped
SFX binary assets. `metadata:smoke` verifies install/share metadata plus the shipped
privacy and support pages. `ip:safety` verifies the shipped public/dist launch
surface does not publish protected reference-game names. `dist:budget` verifies production payload budgets and
rejects dev-client/source-map leakage. `browser:guard` verifies, without
launching Chrome, that Chrome/CDP smoke tests require explicit
`MM_ALLOW_BROWSER=1` opt-in before launching a browser or creating CDP tabs.
`clean-exit:smoke` verifies live/deploy/online release-monitor scripts use
clean failure exits and defer Colyseus websocket imports until after build
metadata checks, preventing stale public endpoints from producing noisy process
assertions.
With that opt-in, `launch:check` builds the web and server,
runs browser preview/mode/perf/soak smokes, verifies launch metadata, payload
budgets, and generated SFX assets,
starts a local authoritative server, and checks online join, all-mode snapshots,
and disconnect takeover. Browser smokes reuse one shared headless Chrome/CDP
instance by default. The optional mobile perf gate adds a 390x844, 4x
CPU-throttled gameplay sample; standalone stress checks are available through
`npm run perf:mobile:smoke` and `MOBILE_PERF_QUALITY=high npm run perf:mobile:smoke`.

`release:verify` is the final public-release gate after deployment. It requires
a clean release candidate, a recent passing local launch report with mobile perf,
then verifies the live Render frontend and backend are serving the current commit,
including live online Classic, all modes, and disconnect takeover. It also needs
`MM_ALLOW_BROWSER=1` for the live web browser smoke after static live-version
preflight passes.
`live:version` is the safe no-browser public preflight: it only fetches the live
frontend `build.json` and backend `/health` build metadata, verifies commit plus
source fingerprint, then exits before any Chrome/CDP work.
`deploy:monitor` is the scheduled/manual no-browser live monitor. It checks live
frontend/backend build metadata with source fingerprint, then runs live Classic,
all-mode, and disconnect takeover protocol smokes against the Render backend, writing
`outputs/deploy-monitor.json`.

## Controls
- **Desktop:** `WASD` / arrows move · `Space` hold magnet · `Shift` dash · `E` use powerup · `Esc` pauses solo matches
- **Mobile:** drag on the playfield to move · hold the lower-right thumb zone for magnet · tap/flick that zone or tap **Dash** to dash · tap the powerup button to use a held powerup · **Pause** opens solo resume/restart/options

## Gameplay
- **Magnetize:** hold magnet to pull free marbles into your orbiting cluster (cap 18).
- **Bank:** carry your cluster into your colored goal to score (1 pt each).
- **Steal / knock-off:** ram a carrying rival to steal a chunk of their cluster; hit them
  hard near the edge to knock them off — they drop everything.
- **Modes:** Classic bank race, Battle combat scoring, King Magnet largest-cluster scoring,
  Team Bank 2v2 shared goals, and Survival three-life outlast.
- **Powerups are held, then activated:** Magnet Burst, Shock Pulse, and Heavy Core.
- **Bots:** Easy, Normal, and Hard difficulty tune bot speed, retargeting, and aggression for solo practice.
- **Phone feel:** supported devices vibrate for magnet presses, dashes, pickups,
  banks, steals, falls, and powerups; the menu includes Sound volume and Haptics controls.
- **Color Assist:** a persisted option adds P1-P4 HUD/result markers plus one-to-four
  white pip badges above player marbles and goals so ownership is readable without color alone.
- **Motion control:** Auto follows the OS setting; Reduced calms camera shake, parallax,
  ambient motes, and menu motion; Full keeps the normal arcade juice.
- **Juice:** carried-cluster milestones, big banks, steals, knockoffs, falls, and powerups trigger bounded
  reduced-motion-safe camera impulses, transient HUD callouts, particles, SFX,
  and haptics.
- **Progression:** finish offline matches to earn stars, clear the daily challenge
  for a first-win bonus, and unlock/equip marble skin/trail cosmetics that tint
  your shooter marble and trail in-game.
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
  haptics/     browser vibration patterns for touch and gameplay feedback
  ui/          menu, HUD, touch controls, overlays
```

## Deploy
Static site on Render — see `render.yaml`. Builds with `npm ci && npm run build`, serves `dist/`.
The authoritative multiplayer server is configured as a paid always-on Render
`starter` service; applying that blueprint can incur hosting charges, but avoids
free-tier cold starts during first join.
After deploying both the web and server, run `npm run live:version` for a no-browser
staleness check, run `npm run deploy:monitor` for no-browser live protocol proof,
then run `npm run release:verify`; it writes
`outputs/release-readiness.json` and fails if either public service is stale.
GitHub Actions also includes a scheduled/manual Deploy Monitor workflow that runs
the same browser-free live monitor and uploads `outputs/`.
The production build also ships `build.json`, `privacy.html`, and `support.html`.

## Tuning
All gameplay feel lives in `src/game/data/config.ts`. Change values there, not in the sim.
