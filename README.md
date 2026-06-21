# Magnet Marbles — Web

A premium, phone-first 3D marble arena game. A faithful, modernized homage to the
*My Street* (PS2) marbles minigame, built for the browser.

Drive your magnetic shooter marble around a circular tabletop, pull candy marbles into
your orbiting cluster, carry them home to your colored goal to score, and bump rivals to
steal their haul or knock them clean off the table. Grab the **rainbow paint bucket** to
convert your whole cluster to your color for double points. Three 90-second rounds, 2–4
players (you + bots).

> This is the **web build** — an independent implementation parallel to the Unity project,
> built to compare the two approaches. Pure client-side: Three.js + a custom deterministic
> marble physics sim. No backend.

## Stack
- **Vite + React + TypeScript**
- **three.js** via **@react-three/fiber** + **@react-three/drei** for rendering
- **@react-three/postprocessing** for bloom / vignette
- **zustand** for UI state
- Custom fixed-timestep 2D-on-XZ physics simulation (`src/game/sim/world.ts`)
- WebAudio synthesized SFX + ambient music (no audio assets)

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

## Controls
- **Desktop:** `WASD` / arrows move · `Space` hold magnet · `Shift` dash · `E` use powerup
- **Mobile:** drag the left half of the screen to move · hold the **Magnet** button · tap **Dash** · tap the powerup button to use a held powerup

## Gameplay
- **Magnetize:** hold magnet to pull free marbles into your orbiting cluster (cap 18).
- **Bank:** carry your cluster into your colored goal to score (1 pt each).
- **Steal / knock-off:** ram a carrying rival to steal a chunk of their cluster; hit them
  hard near the edge to knock them off — they drop everything.
- **Paint bucket (headline):** converts your entire cluster to your color → banks at **2×**.
- **Powerups are held, then activated** (My Street R2 model): Super Magnet, Double Score,
  +5, Turbo, Jam (disable rivals' magnets), Paint.
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

## Tuning
All gameplay feel lives in `src/game/data/config.ts`. Change values there, not in the sim.
