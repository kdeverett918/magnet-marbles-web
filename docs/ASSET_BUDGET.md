# Web Asset Budget

Budget authorized by user: `$400`.

## Spend Ledger

| Date | Tool | Asset | Cost | Rationale | Files |
| --- | --- | --- | --- | --- | --- |
| 2026-06-21 | Ludo `createSoundEffect` | Pickup tick | 2 credits | Frequent collect feedback, supports the "satisfying every 2 seconds" target. | `public/audio/sfx/pickup.mp3` |
| 2026-06-21 | Ludo `createSoundEffect` | Bank burst | 2 credits | Makes scoring feel like the main reward moment. | `public/audio/sfx/bank.mp3` |
| 2026-06-21 | Ludo `createSoundEffect` | Marble hit | 2 credits | Gives collisions the glass-and-table impact missing from pure synth. | `public/audio/sfx/hit.mp3` |
| 2026-06-21 | Ludo `createSoundEffect` | Shock/steal pulse | 2 credits | Supports Shock Pulse and steal readability. | `public/audio/sfx/shock-pulse.mp3` |
| 2026-06-21 | Ludo `createSoundEffect` | Magnet Burst | 2 credits | Makes the strongest magnet moment audible. | `public/audio/sfx/magnet-burst.mp3` |
| 2026-06-21 | Ludo `createSoundEffect` | Fall/rim cue | 2 credits | Adds consequence and table-edge tension. | `public/audio/sfx/fall.mp3` |
| 2026-06-21 | Local procedural generator | PWA icons and social preview | `$0` | Replaces favicon-only install art with correctly sized mobile launch assets, maskable icon, and share card. | `public/icons/*.png`, `public/social-card.png`, `scripts/generate-icons.mjs` |
| 2026-06-22 | Local removal | Removed arcade music bed | `$0` | Current loop was too loud and hurt the feel; the web build is SFX-only until a quieter, reviewed loop is added. | Runtime music removed; `public/audio/music.*` no longer ships, app boot blocks stale music playback and purges stale entries, and the service worker purges/blocks old music paths |
| 2026-06-22 | Local tuning | SFX master volume control | `$0` | Keeps generated SFX punchy without being loud by default; gives players a menu/pause volume slider. | `src/game/audio/sfx.ts`, `src/game/store.ts`, `src/game/ui/MainMenu.tsx`, `src/game/ui/Overlays.tsx` |
| 2026-06-22 | Local tuning | Haptic preview control | `$0` | Lets players test phone vibration feel before or during a match without entering gameplay. | `src/game/haptics/haptics.ts`, `src/game/ui/MainMenu.tsx`, `src/game/ui/Overlays.tsx` |

Tracked total this pass: `12` Ludo credits. No Meshy/paid 3D generation used; icon/share art is locally generated. No audible background music currently ships, stale `audio/music.*` variants are blocked and purged at app boot/service-worker activation, SFX defaults to `28%` master volume with an added output trim, old saved loud SFX volumes are capped once by settings migration, haptics can be previewed from Options, and `npm run assets:smoke` plus `npm run dist:budget` fail if `audio/music.*` ships again.

## Policy

- Use generated assets only when they improve first-round feel or launch polish materially.
- Prefer small same-origin web assets over large GLB imports unless the asset adds clear player value.
- Keep procedural/synth fallbacks so asset loading failure does not break play.

## Available Asset Tools

| Tool family | Best use for this web build | Typical cost notes | Current recommendation |
| --- | --- | --- | --- |
| Ludo audio | Punchy arcade SFX, short ambiance loops, simple music stingers. | SFX/ambiance: 2 credits each; music: 3 credits each. | Best immediate value; already used for the six shipped SFX. |
| ElevenLabs audio | Higher-fidelity SFX or composed music saved directly to local files. | External API cost warning. | Use only for a final music/ambience pass if Ludo output is not enough. |
| Local/procedural Three.js assets | Marble shaders, rings, particles, menu background, table/goal geometry. | No external spend. | Preferred for most visuals because it keeps the browser payload small. |
| Blender / Polyhaven / Sketchfab tools | Asset inspection, free environment/material/model sourcing, optional local mesh cleanup. | Varies by source license; no automatic spend from search/preview. | Use for a final tabletop prop/material pass only if assets are license-clean and lightweight. |
| Meshy 3D | Custom GLB/FBX/OBJ hero props or arena dressing. | Credit-cost tools require per-call confirmation by tool policy. | Defer unless procedural art is clearly insufficient; imported models risk payload/perf cost. |
| Image generation | Store art, promo stills, background plates, icon references. | Depends on provider/tool. | Useful for marketing/static art; avoid putting large raster backgrounds into gameplay. |

## Current Asset Gaps Worth Spending On

1. One or two tiny, license-clean tabletop dressing props if visual review says the arena still reads too procedural.
2. Store/promo capsule art after gameplay and deployment are locked.
3. Optional replacement music loop only after a volume/style review; keep it quieter than gameplay SFX, governed by a separate music volume, and easy to disable.

Avoid spending on large 3D models, character rigs, cinematic video, or extra cosmetic sets until the public web/backend deploy is current and live smoke checks pass.
