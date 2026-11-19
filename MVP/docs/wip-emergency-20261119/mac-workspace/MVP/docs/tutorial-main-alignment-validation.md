# Tutorial — Main UI Alignment v1.0

Baseline and rollback SHA: `1a726ab96c507620123a9591ef2189a61387804e`.
Verified GitHub checkpoint: `rollback-before-tutorial-main-alignment-20261115`.
Tutorial: https://play12.pro/MVP/ru/
Reference Main: https://play12.pro/ru/MVP/main/

## Implementation / component map

| Main contract | Tutorial implementation |
|---|---|
| Header / bounded viewport | Existing header, shared Main CSS and training-viewport.css; Tutorial root is the remaining grid row |
| Left profile/library zone | Existing song identity and six-step progress, using Main outer card geometry |
| Center score + Playback | Same existing stage, SVG and playline, mounted by TrainingZones in one music-workspace |
| Left control corridor | Original BPM and Practice nodes; Tutorial retains their visibility/unlock criteria |
| Right control corridor | Original RoundBoard and zero button, with the same TrainingZones positioning |
| Persistent keyboard dock | Same PianoView and connected physical range resolver; uniform scale and centering; Mobile composition window |
| MIDI status | Read-only status mirror using actual existing controller state; no second MIDI connection or calibration |
| Circular Playback control | Shared training-corrections.css; existing grid control and musical cycle unchanged |
| Tutorial-only overlays | Existing cards moved without cloning into a viewport portal |
| Spotlight | Existing trigger/lifetime; live DOM targets, 3px precision padding/feather, reveal the target's Mobile zone |
| Early OK12 | Existing 950ms feedback at first zero confirmation and metronome success; no delayed lesson transition |

No renderer, playback engine, MIDI calibration procedure, Fingering Engine or
Main implementation files were changed. The Tutorial state machine, progression
criteria, six-step order and hint durations remain intact. Optional persisted
metronomeSuccessFeedback prevents repeat feedback, including recognized legacy
saved successes. No profile/library/calibration data migration or reset is used.
The adapter does not bind a second Practice handler or second round-success
tracker; those remain owned by the existing Tutorial.

## Automated validation

- `node --test MVP/tests/*.cjs`: 239 passed, 0 failed, 0 skipped.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s MVP/tests -p 'test_*.py'`: 9 passed.
- Syntax checks: tutorial-layout.js, play12-onboarding.js, play12-coach.js.
- Added tests: portal precision/lifetime, live target reveal, early zero feedback,
  metronome feedback deduplication and legacy saved-success revisit.

## Real browser validation

Real Chromium headless, single-process mode. Isolated localhost origins and
synthetic progress/score data; production user storage was not reset.

Viewports: 1440x900, 1280x800, 1024x768, 390x844, 375x667.
Before/after screenshots: all six Tutorial steps at all five viewports.
115 instruction/viewport cases; 150 active target bounding boxes verified.
Checks: target visibility and viewport containment; mask hole coordinates against
the current target; card containment; no document horizontal/vertical overflow;
zero JavaScript page errors. Asynchronous measurements ignore canceled hints.

Spotlight inventory:
- Listen: Play, Pause, Continue.
- Zero: existing chooser, zero button, keyboard; card strip and yellow/green
  verification through the real Cards Ready action.
- Practice: enable, left hand, explanation (score + keyboard), Play.
- Metronome: toggle, tempo controls, Play.
- Rounds: navigation, Loop, from/to range and timeline, precount, practice Play.
- Final lesson: score/keyboard explanation and existing final-practice UI.

Actual DOM interactions: new-user start/demo; quantized Play/Pause; both zero
cards and confirmation; transient OK12 without delaying card setup; yellow/green
verification; Practice and hand controls; continue/reload; allowed navigation
back/forward through all six steps; exactly one keyboard/layout/playline.
Stage-specific geometry coverage uses isolated saved progress to reach each
instruction; it is not a claim of a person playing the entire course unaided.
Final musical success conditions remain covered by the existing regression suite.

Simulated Web MIDI in the real browser: existing 36–96 calibration -> 61 keys;
disconnect -> 88; same-input reconnect -> 61 without new calibration; another
input -> existing recalibration screen and clean adapter disposal; denied
permission; no input. This is not hardware MIDI acceptance.

Main screenshot comparison: four sizes pixel-identical; at 1440x900 the only
pixel difference is the existing 6x4px progress marker region (582,582)-(588,586).
No static component difference was found. A previous 1440 run was byte-identical.
Main CSS, Main JS and musical components are unchanged.

## Reproduction

Serve the baseline and candidate snapshots separately for screenshot comparison.
Serve the candidate on localhost:8766. With Playwright available:

```
node MVP/tests/browser/tutorial-functional.cjs
node MVP/tests/browser/tutorial-midi-browser.cjs
node MVP/tests/browser/tutorial-spotlights.cjs
node MVP/tests/browser/tutorial-spotlights-early.cjs
python3 MVP/tests/browser/check-tutorial-evidence.py
```

Set PLAYWRIGHT_MODULE to an installed Playwright module path if necessary;
PLAY12_TEST_BASE_URL selects the isolated local origin and
PLAY12_TEST_OUTPUT_DIR selects the measurements directory. Scripts deliberately
reject non-local origins because they seed synthetic learning progress.

## Remaining limitations / rollback

No physical MIDI instrument was available. Audible output and cross-browser
Safari/Firefox acceptance were not performed. Simulated MIDI is labeled as such.
Real-browser testing covers DOM geometry and the stated interactions, not a
human performance assessment of the complete musical course.

Rollback by reverting this release commit on main (`git revert <release SHA>`)
and publishing the revert normally. The checkpoint branch preserves the exact
baseline and is not moved by this task.
