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
| 2026-06-21 | Suno-generated existing asset | Arcade music bed | No new spend recorded this pass | Gives the arena a real loop when sound is enabled; synth fallback remains available if loading fails. | `public/audio/music.mp3` |
| 2026-06-21 | Local procedural generator | PWA icons and social preview | `$0` | Replaces favicon-only install art with correctly sized mobile launch assets, maskable icon, and share card. | `public/icons/*.png`, `public/social-card.png`, `scripts/generate-icons.mjs` |

Tracked total this pass: `12` Ludo credits plus one existing generated music asset with no new spend recorded. No Meshy/paid 3D generation used; icon/share art is locally generated.

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
3. Optional replacement/compressed music loop only if physical-device review says the current 2.49 MB MP3 is too heavy or stylistically off.

Avoid spending on large 3D models, character rigs, cinematic video, or extra cosmetic sets until the public web/backend deploy is current and live smoke checks pass.
