# Human AA Launch Review Checklist

This checklist covers the subjective review that automated smokes cannot prove:
fun-in-30-seconds, marble feel, mobile readability, art/audio charm, fair launch
claims, and final release judgment.

Evidence file: `outputs/human-aa-review-evidence.json`

Run:

```bash
npm run evidence:templates
npm run human:review
HUMAN_AA_REVIEW_REQUIRE_EVIDENCE=1 npm run human:review
```

`npm run evidence:templates` creates
`outputs/evidence-templates/human-aa-review-evidence.template.json` for the
current commit/source fingerprint. Copy it to
`outputs/human-aa-review-evidence.json` only after real review sessions are
complete. The validator rejects TODO/TBD/placeholder values, so final evidence
must contain actual reviewer notes and evidence references.
The generator also writes `outputs/evidence-templates/reviewer-handoff.md` with
the current URL, commit, source fingerprint, required capture list, and
validation commands for reviewers.

Do not begin human AA review until `npm run live:version` passes for the
current commit/source fingerprint and `npm run release:status` has no
`live:version-current-and-no-music` blocker. If the deployed URL is stale, the
review would be judging the wrong candidate and must wait for redeploy.

`release:verify` requires this evidence by default. Use
`RELEASE_REQUIRE_HUMAN_REVIEW=0` only for local-only audits.

## Required Review Passes

Each pass must be completed against the current deployed HTTPS candidate and the
current source fingerprint. Capture the main-menu Candidate stamp in at least
one review screenshot/video and verify it matches the deployed `build.json`.

- `executive-producer-fun-30s`: a new player understands the goal in 30 seconds,
  starts a match without confusion, sees round end/results, and wants one rematch.
- `gameplay-designer-core-loop`: movement, magnet pull, carrying, banking,
  stealing, knockoffs, bots, powerups, and 90-second pacing feel like a strong
  modern marble party game rather than a tech demo.
- `mobile-ux-touch-readability`: portrait phone controls are comfortable, HUD
  elements avoid notches/safe areas, text is readable under motion, and the first
  round coach helps without blocking play.
- `art-audio-juice-aa`: marbles, goals, trails, impacts, haptics, and SFX feel
  polished enough for AA web launch, with no loud background music.
- `accessibility-comfort`: Color Assist, Motion settings, keyboard flow,
  screen-reader status, haptics/sound toggles, crash support-code intake, and
  support/privacy pages are understandable and not misleading.
- `release-qa-risk`: no unresolved launch blocker remains across live deploy,
  online recovery, device behavior, performance, IP safety, fair monetization,
  privacy/support copy, Candidate stamp provenance, and known issues.

## Evidence JSON Shape

```json
{
  "candidate": {
    "url": "https://magnet-marbles.onrender.com/",
    "commit": "415bec72ca93",
    "sourceFingerprint": "example1234567890",
    "buildJson": {
      "commit": "415bec72ca93",
      "sourceFingerprint": "example1234567890",
      "verifiedAt": "2026-06-22T12:00:00.000Z"
    },
    "menuStamp": {
      "commit": "415bec72",
      "sourceFingerprint": "example1",
      "evidence": ["outputs/review/menu-candidate-stamp.png"]
    }
  },
  "reviewedAt": "2026-06-22T12:00:00.000Z",
  "reviewers": [
    {
      "name": "Reviewer Name",
      "role": "Producer / gameplay / QA"
    }
  ],
  "sessions": [
    {
      "id": "android-solo-classic",
      "platform": "Android Chrome",
      "mode": "Classic",
      "durationMinutes": 12,
      "notes": "Played three rounds and one rematch."
    },
    {
      "id": "desktop-online-modes",
      "platform": "Desktop Chrome",
      "mode": "All modes",
      "durationMinutes": 15,
      "notes": "Checked online flow and results."
    }
  ],
  "passes": {
    "executive-producer-fun-30s": {
      "pass": true,
      "score": 4,
      "sessionIds": ["android-solo-classic"],
      "notes": "Goal and rematch were clear in the first match.",
      "evidence": ["outputs/review/android-classic.mp4"]
    }
  },
  "unresolvedBlockers": [],
  "topRisks": [
    "Render plan must match the starter blueprint before launch."
  ],
  "shipDecision": "hold"
}
```

Rules:

- `candidate.commit` and `candidate.sourceFingerprint` must match the current
  candidate.
- `candidate.buildJson` must match the deployed `/build.json` and include the
  timestamp when it was checked.
- `candidate.menuStamp` must match the visible main-menu Candidate stamp and
  include at least one screenshot/video/reference.
- If a Table reset needed crash-recovery screen appears, the review notes should
  include the visible `MM-` support code before using Reload or Reset local data.
- At least two sessions are required, including one mobile session.
- Every required pass must have `pass: true`, `score >= 4`, meaningful notes, at
  least one session id, and at least one evidence reference.
- `unresolvedBlockers` must be empty.
- `shipDecision` must be `ship` for final public launch.
