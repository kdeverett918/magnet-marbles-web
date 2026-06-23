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
the daily challenge uses a deterministic daily seed with local streak tracking,
and marble skin/trail cosmetics unlock from the menu. Each mode also keeps local
best score, wins, and matches played. Online rewards are intentionally not granted until the backend has account
identity and anti-abuse rules. The main menu Options area includes a two-step
Reset data control for local settings, tutorial state, stars, daily streaks, and
skin/trail unlocks.

## Quality gates
```bash
npm run validate:no-browser
npm run test
npm run vertical:slice
npm run sim:soak
npm run sim:perf
npm run lint
npm run icons:generate
npm run build-info:smoke
npm run source:fingerprint
npm run a11y:static
npm run aa:readiness
npm run metadata:smoke
npm run ip:safety
npm run assets:smoke
npm run nanoid:smoke
npm run dist:budget
npm run browser:guard
npm run clean-exit:smoke
npm run evidence:templates
npm run evidence:negative
npm run device:qa
npm run hosting:smoke
npm run human:review
MM_ALLOW_BROWSER=1 npm run launch:check
MM_ALLOW_BROWSER=1 LAUNCH_CHECK_MOBILE_PERF=1 npm run launch:check
npm run live:version
npm run deploy:monitor
npm run release:status
MM_ALLOW_BROWSER=1 npm run release:verify
```

`validate:no-browser` is the safe default while iterating on code or UI without
spawning Chrome: it runs unit tests, the vertical-slice contract, the long deterministic simulation soak,
the simulation performance budget, lint,
web/server audits, the production build/typecheck, dist build-info/metadata,
payload-budget, SFX asset, nanoid compatibility smoke, no-browser accessibility static smoke,
no-browser mobile layout/touch static smoke,
AA-readiness static smoke, evidence-template generation,
negative evidence-template guard,
the authoritative server build, local online
Classic/all-modes/disconnect smokes against a temporary localhost server, and
whitespace checks, then writes `outputs/no-browser-check.json`.
`aa:readiness` is a no-browser static audit for the shipped web candidate:
mode lineup, 90-second rounds, powerups, progression, phone controls, HUD/menu
surfaces, carry-risk advice, Color Assist identity markers, player Motion control, solo pause/resume lifecycle safety,
root crash recovery with support-code intake, local data reset, SFX-only audio with player volume, phone haptics, authoritative online safety, build provenance,
launch metadata, Render blueprint, docs, absence of Chrome/CDP calls in the safe
validation path, and explicit Chrome/CDP opt-in for browser smokes.
`a11y:static` is a no-browser accessibility contract check for screen-reader
guidance, focus-visible CSS, ARIA status/meter semantics, accessible touch
actions, reduced-motion handling, comfort settings, and required manual
screen-reader/focus evidence.
`mobile:layout` is a no-browser phone-layout contract check for the viewport,
safe-area CSS, first-screen menu actions, HUD non-overlap, right-thumb
magnet/dash controls, thumb-sized primary actions, and the requirement that
real Android/iOS device evidence still gates launch.
`vertical:slice` is a focused no-browser contract check for the requested
Classic/Battle/King Magnet/Team Bank/Survival mode set, 90-second rounds,
4-player/3-bot setup, Easy/Normal/Hard bot difficulty, the first-round launch powerups plus later-round advanced pickups,
six marble skin/trail cosmetics, daily challenge, magnet/carry tuning, and the playable core
loop: move, magnetize, carry, bank, bot participation, match end, and rematch setup.
`sim:soak` runs a longer deterministic all-mode endurance test that drives
human input, bots, magnets, dash, powerups, obstacles, scoring, and round flow
without a browser. When run through `validate:no-browser`, it writes
`outputs/sim-soak-no-browser.json`.
`sim:perf` records a no-browser all-mode CPU budget into
`outputs/sim-performance-smoke.json`, checking that the authoritative simulation
stays comfortably faster than real time before browser or device profiling.
GitHub Actions runs `validate:no-browser` on pushes and pull requests after
installing both web and server dependencies, then uploads the generated
`outputs/` reports as CI artifacts.
`icons:generate` rebuilds the procedural mobile install icons and social card in
`public/`. `build-info:smoke` verifies `dist/build.json` and the built JS bundle
carry matching commit/branch/source-fingerprint provenance. `source:fingerprint`
verifies the fingerprint includes code, config, generated launch art, the app-shell
service worker, and shipped SFX binary assets. `metadata:smoke` verifies install/share
metadata, the service worker, plus the shipped privacy and support pages. `ip:safety` verifies the shipped public/dist launch
surface does not publish protected reference-game names. `dist:budget` verifies production payload budgets and
rejects dev-client/source-map leakage. `browser:guard` verifies, without
launching Chrome, that Chrome/CDP smoke tests require explicit
`MM_ALLOW_BROWSER=1` opt-in before launching a browser or creating CDP tabs.
It also scans browser-capable scripts against an allowlist and fails if
`validate:no-browser` starts calling browser smoke scripts.
`nanoid:smoke` verifies the server's local Colyseus 0.16 nanoid compatibility
shim keeps its callable CommonJS export, ESM export, crypto-backed URL-safe id
generation, and package override wiring.
`clean-exit:smoke` verifies live/deploy/online release-monitor scripts use
clean failure exits and defer Colyseus websocket imports until after build
metadata checks, preventing stale public endpoints from producing noisy process
assertions.
`evidence:templates` writes current-candidate device QA and human AA review
templates plus `outputs/evidence-templates/reviewer-handoff.md`.
Copy those templates to
`outputs/device-qa-evidence.json` and `outputs/human-aa-review-evidence.json`
only after real review; the validators reject TODO/TBD placeholders and require
matching source fingerprint evidence. The menu also shows a compact Candidate
stamp with the runtime commit and source fingerprint; capture it in device/human
review screenshots or videos and compare it with the deployed `build.json`.
`evidence:negative` proves those generated templates fail when passed to the
strict evidence validators with evidence required, including deployed
`build.json` and visible Candidate stamp proof.
`device:qa` validates the physical-phone release checklist and, when
`DEVICE_QA_REQUIRE_EVIDENCE=1` is set, requires fresh structured evidence in
`outputs/device-qa-evidence.json` for Android Chrome install/offline, iOS Safari
install/offline, touch controls, safe-area/readability, midrange Android
performance, screen-reader/focus, haptics/audio, and online recovery.
`hosting:smoke` validates the Render blueprint without a browser. During
`release:verify`, live Render service config is required by default so the
authoritative backend cannot silently stay on free-tier hosting; set
`RELEASE_REQUIRE_HOSTING_CONFIG=0` only for local-only audits.
`human:review` validates the subjective AA signoff checklist and, when
`HUMAN_AA_REVIEW_REQUIRE_EVIDENCE=1` is set, requires fresh structured evidence
for fun-in-30-seconds, gameplay feel, mobile UX, art/audio juice,
accessibility/comfort, and final release-risk review.
With that opt-in, `launch:check` builds the web and server,
runs browser preview/mode/perf/soak smokes, verifies launch metadata, payload
budgets, and generated SFX assets,
starts a local authoritative server, and checks online join, all-mode snapshots,
and disconnect takeover. Browser smokes reuse one shared headless Chrome/CDP
instance by default, and `browser:guard` statically enforces wrapper detection,
CDP page cleanup, and shared-browser reuse before those opt-in smokes can be
trusted. The optional mobile perf gate adds a 390x844, 4x
CPU-throttled gameplay sample; standalone stress checks are available through
`npm run perf:mobile:smoke` and `MOBILE_PERF_QUALITY=high npm run perf:mobile:smoke`.

`release:verify` is the final public-release gate after deployment. It requires
a clean release candidate, a recent passing local launch report with mobile perf,
fresh physical-device evidence validated by `npm run device:qa`,
live Render service config validated by `npm run hosting:smoke`,
fresh human AA review evidence validated by `npm run human:review`,
then verifies the live Render frontend and backend are serving the current commit,
including live online Classic, all modes, and disconnect takeover. It also needs
`MM_ALLOW_BROWSER=1` for the live web browser smoke after static live-version
preflight passes.
`live:version` is the safe no-browser public preflight: it fetches the live
frontend `build.json`, verifies all removed `audio/music.*` paths are gone or
tiny legacy tombstones, checks backend `/health` build metadata, verifies commit
plus source fingerprint, then exits before any Chrome/CDP work.
`deploy:monitor` is the scheduled/manual no-browser live monitor. It checks live
frontend/backend build metadata with source fingerprint, then runs live Classic,
all-mode, and disconnect takeover protocol smokes against the Render backend, writing
`outputs/deploy-monitor.json`.
`release:status` is the browser-free launch dashboard. It writes
`outputs/release-status.json`, reuses `live:version` to confirm public build
metadata and removed `audio/music.*` files, checks current no-browser proof,
device QA evidence, human AA evidence, reviewer-template freshness, hosting
config, and tells you the next actions without starting Chrome/CDP. Those next
actions are generated from failed checks, so current safe-gate/template evidence
does not produce stale rerun instructions. Live Render
service-config evidence is visible as a warning unless
`RELEASE_STATUS_REQUIRE_HOSTING_LIVE=1` is set.

## Controls
- **Desktop:** `WASD` / arrows move · `Space` hold magnet · `Shift` dash · `E` use powerup · `Esc` pauses solo matches
- **Mobile:** drag on the playfield to move · hold the lower-right thumb zone for magnet · tap/flick that zone or tap **Dash** to dash · tap the powerup button to use a held powerup · **Pause** opens solo resume/restart/options

## Gameplay
- **Pre-round briefing:** the countdown shows your player marker, current mode,
  and a three-step plan before the table goes live.
- **First round coach:** new players get a compact Pull / Carry / Bank HUD strip until their first successful bank.
- **Race status:** a compact live chip shows whether you are leading, tied, or chasing a rival/team/lives lead.
- **Carry advice:** the carried-meter labels empty, build, sweet-spot, risky, urgent, and streak hauls so banking choices stay readable.
- **Results recap:** each round/match ends with a mode-aware takeaway and next-run tip.
- **Magnetize:** hold magnet to pull free marbles into your orbiting cluster (cap 18).
- **Bank:** carry your cluster into your colored goal to score (1 pt each);
  quick repeat banks chain a short streak bonus.
- **Steal / knock-off:** ram a carrying rival to steal a chunk of their cluster; hit them
  hard near the edge to knock them off — they drop everything.
- **Modes:** Classic bank race, Battle combat scoring, King Magnet largest-cluster scoring,
  Team Bank 2v2 shared goals, and Survival three-life outlast.
- **Powerups are held, then activated:** round 1 stays readable with Magnet Burst, Shock Pulse, and Heavy Core; later rounds add Super Magnet, Double Score, Plus Five, Turbo, Jam, and Paint. The menu mirrors this with separate Round 1 and Later rounds powerup chips.
- **Bots:** Easy, Normal, and Hard difficulty tune solo pressure; Collector, Bruiser, and Banker roles make rivals behave differently.
- **Phone feel:** supported devices vibrate for magnet presses, dashes, pickups,
  banks, steals, falls, and powerups; the menu includes Sound volume, Test SFX,
  Haptics, and Test Haptics controls.
- **Color Assist:** a persisted option adds P1-P4 HUD/result markers plus one-to-four
  white pip badges above player marbles and goals so ownership is readable without color alone.
- **Motion control:** Auto follows the OS setting; Reduced calms camera shake, parallax,
  ambient motes, and menu motion; Full keeps the normal arcade juice.
- **Crash recovery:** a root fallback shows a support code, Reload, and a local-only Reset data option instead of leaving players on a blank canvas if rendering fails; the support page tells players to include that `MM-` code in bug reports.
- **Juice:** carried-cluster milestones, quick-bank streaks, big banks,
  steals, knockoffs, falls, and powerups trigger bounded
  reduced-motion-safe camera impulses, transient HUD callouts, particles, SFX,
  and haptics.
- **Progression:** finish offline matches to earn stars, clear the daily challenge
  for a first-win bonus and local streak, chase local mode records, follow the
  next-unlock target, and unlock/equip marble skin/trail cosmetics that tint
  your shooter marble and trail in-game. Options includes a two-step Reset data
  control for clearing local settings and progression without touching unrelated
  site storage.
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
The production build also ships `build.json`, `service-worker.js`, `privacy.html`,
and `support.html`. The service worker is a progressive-enhancement app shell:
documents and `build.json` stay network-first, while hashed assets/icons/SFX are
cache-first for mobile resilience after first load.

## Tuning
All gameplay feel lives in `src/game/data/config.ts`. Change values there, not in the sim.
