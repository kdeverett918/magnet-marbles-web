# Device QA Checklist

This is the required physical-device evidence path for public web release. It is intentionally separate from automated browser smokes because headless Chrome cannot prove phone install UX, mobile browser cache behavior, thermal stability, glare/notch readability, haptics, or real assistive-tech behavior.

Run the final manual pass against the deployed candidate and save evidence as `outputs/device-qa-evidence.json`. The file is ignored by git, but `npm run device:qa` and `npm run release:verify` validate it. Capture the menu Candidate stamp in at least one phone screenshot/video and verify its commit/source fingerprint against the deployed `build.json`.

Use `npm run evidence:templates` to generate a current-candidate starter file in
`outputs/evidence-templates/device-qa-evidence.template.json`. Copy it to
`outputs/device-qa-evidence.json` only after the real device pass is complete.
The same command also writes `outputs/evidence-templates/reviewer-handoff.md`
with the current URL, commit, source fingerprint, required capture list, and
validation commands for reviewers.

Do not begin phone QA until `npm run live:version` passes for the current
commit/source fingerprint and `npm run release:status` has no
`live:version-current-and-no-music` blocker. A stale deployed URL invalidates
screenshots, videos, install/offline notes, and menu Candidate stamp evidence
for this candidate.

The validator rejects TODO/TBD/placeholder values, so do not leave generated
placeholder text in final release evidence.

## Evidence File

Use this shape:

```json
{
  "candidate": {
    "commit": "415bec72ca93",
    "sourceFingerprint": "e2c5454ca1348f60",
    "url": "https://magnet-marbles.onrender.com/",
    "buildJson": {
      "commit": "415bec72ca93",
      "sourceFingerprint": "e2c5454ca1348f60",
      "verifiedAt": "2026-06-22T07:00:00.000Z"
    },
    "menuStamp": {
      "commit": "415bec72",
      "sourceFingerprint": "e2c5454c",
      "evidence": ["outputs/device-review/menu-candidate-stamp.jpg"]
    }
  },
  "reviewedAt": "2026-06-22T07:00:00.000Z",
  "reviewer": "Name or initials",
  "devices": [
    {
      "id": "android-midrange",
      "platform": "Android",
      "model": "Pixel 6a or comparable",
      "os": "Android 15",
      "browser": "Chrome current"
    },
    {
      "id": "ios-safari",
      "platform": "iOS",
      "model": "iPhone 13 or comparable",
      "os": "iOS current",
      "browser": "Safari current"
    }
  ],
  "checks": {
    "android-chrome-install-offline": {
      "pass": true,
      "deviceId": "android-midrange",
      "notes": "Installed from Chrome, relaunched from home screen, completed one offline solo Classic round after first online load.",
      "evidence": ["photo-or-video-reference"]
    }
  },
  "blockers": []
}
```

The `candidate.buildJson` fields must come from the deployed `/build.json`, and `candidate.menuStamp` must match the visible main-menu Candidate stamp captured in screenshot/video evidence. Every required check below must appear in `checks`, pass, include a known `deviceId`, include notes, and include at least one evidence reference. Evidence references can be local output paths, photo/video filenames, or issue links.

## Required Checks

- `android-chrome-install-offline`: Android Chrome install/add-to-home, standalone launch if available, offline reload after first online load, solo round starts and restarts.
- `ios-safari-install-offline`: iOS Safari add-to-home, standalone launch, offline reload after first online load, solo round starts and restarts.
- `touch-controls-core-loop`: phone touch controls prove drag move, right-thumb hold magnet, right-thumb tap/flick dash, powerup activation, pause/resume, and rematch.
- `menu-readability-safe-area`: menu and HUD remain readable with browser chrome, notch/safe-area variance, indoor glare, low brightness, OLED/dark-mode conditions, and a captured menu Candidate stamp tying evidence to the exact tested build.
- `midrange-android-performance`: at least 10 minutes on midrange Android-class hardware with no thermal warnings, no obvious frame collapse, no memory reload, and no browser console-blocking symptoms.
- `screen-reader-focus`: human assistive-tech pass for menu, gameplay controls, results, online retry, focus visibility, objective announcement, and carried-marble meter semantics.
- `haptics-audio-feel`: haptics fire only when enabled, SFX volume is adjustable, no background music plays, and pickup/bank/hit feedback is not painfully loud.
- `online-cold-warm-recovery`: live online flow covers cold backend warm-up, Classic join, mode selection, disconnect takeover, replacement join, and visible retry/recovery copy.

If a Table reset needed crash-recovery screen appears during any device pass, capture
the visible `MM-` crash support code with the menu Candidate stamp or deployed
`build.json` details before using Reload or Reset local data.

## Commands

```bash
npm run evidence:templates
npm run device:qa
DEVICE_QA_REQUIRE_EVIDENCE=1 npm run device:qa
npm run release:verify
```

`release:verify` requires this evidence by default. For a local-only audit that deliberately skips physical-device evidence, set `RELEASE_REQUIRE_DEVICE_QA=0`; do not use that override for public release signoff.
