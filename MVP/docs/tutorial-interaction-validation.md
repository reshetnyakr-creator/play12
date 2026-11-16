# Tutorial — Interaction, Spotlight & OK12 Corrections v1.0

Baseline: `b797ad6aa6d3d625bd38d760fd4dbbd4bcadde4f`.
GitHub rollback branch, verified before editing and before publication: `rollback-before-tutorial-interaction-20261116` (same SHA).
Routes: https://play12.pro/MVP/ru/ and https://play12.pro/MVP/ . Main: https://play12.pro/ru/MVP/main/ .

## Causes and fixes

- Fixed-to-relative piano transition retained inline `left:50%`. In the baseline 1440px Chromium case the calibrated 61-key mount occupied x=939.42…1916.59. The Tutorial adapter now clears obsolete fixed positioning, including the pending fixed-layout callback. TrainingZones/PianoView still own the keyboard layout.
- Calibration preview inherited a legacy minimum 1100px piano scale. At 375×667 its mount was x=-192…567 and intercepted the confirmation button. The preview now uses the existing Main uniform piano scaling API. Range detection, verification and stored calibration are unchanged.
- Main's ID-specific zero-chooser layer (1000) beat Tutorial's class layer, placing the dialog below Spotlight (10002). A Tutorial-scoped ID rule now puts that same existing dialog at 10004.
- Shared Tutorial CSS was asynchronously appended. Styles are now parser-loaded before Onboarding initialization; the Tutorial adapter applies a synchronous initial TrainingZones layout after reparenting/visibility changes. Main retains its original scheduled layout.
- Mounting could synchronously create an instruction, then hide it without clearing the live hint key. Removed that redundant hide. Browser acceptance explicitly requires a visible recorded card for every substage.
- Actual-state credit can synchronously emit controller snapshots. Round preparation now sets its stage before updating settings. Skip suppresses reconciliation during its pause snapshot and cancels stale feedback callbacks.

## Pedagogy and state

All six major stages remain. Internal guidance now introduces the whole panel before its controls/actions. Practice has whole-panel introduction, actual enable credit, exact right-hand credit and user Play credit. Metronome introduces the board, explains BPM without requiring a tempo change, then checks actual ON state. RoundBoard introduces the board, checks actual Round 4, Loop, 2–4 range and Pre-count before existing musical practice. Final musical success receives OK12 before completion.

The first native Play/P is credited only after actual musical start. A persistent logical-success ledger prevents replay on repeated events/reload/revisit. Existing explicit legacy credits migrate without resetting preferences. Skip never fabricates musical success.

First zero selection: introduction → zero button only → whole keyboard → original candidate/confirmation → one OK12 → original card checks. Later changes use the original chooser without zero coaching or another zero reward; they preserve the current lesson, hand settings, BPM, Loop range and other saved data.

The musical controller, renderer, PianoView geometry, MIDI calibration/controller, RoundBoard, Grab, fingering editor and Main UI are not replaced.

## Automated results

- 249 JavaScript tests: pass, 0 failures/skip.
- 9 Python tests: pass.
- Syntax: all 16 renderer JS files and 3 inline scripts in affected HTML parse.
- Existing TrainingShell, EditingAdapter, Playback, timing, rounds, MIDI, data, Russian i18n and import contracts included.
- Added/updated coverage: whole-panel order, actual-state rather than event-payload credit, already-correct states, first trusted user Play, persistent/legacy feedback, fast Skip/navigation, ordinary zero changes and final OK12.

Commands from repository root:

```sh
node --test MVP/tests/*.cjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s MVP/tests -p 'test_*.py'
```

## Real browser acceptance

Real headless Chromium (single-process), isolated localhost with third-party requests blocked. This is actual DOM/browser execution, not a simulated DOM. Musical note sequences were entered through the production NoteOn/Off input path; no success events or lesson completion states were fabricated in the sequential course.

- Full sequential course from clean storage to completion, no lesson Skip/seeding: **1440×900 and 375×667**. Native P/Play/Pause, zero selection and cards, Practice, metronome, Round4/Loop/2–4/Pre-count, final uninterrupted whole-song pass.
- Spotlight geometry matrix: **135 restored-state scenarios**, **160 target rectangles**, no errors/overflow/missing visible cards; 1440×900, 1280×800, 1024×768, 390×844, 375×667. These supplemental cases are explicitly separate from the two full sequential courses.
- Actual pointer clicks through Spotlight in the sequential course, including zero and confirmation; overlay does not intercept input. Cards remain above the mask.
- **25 MIDI geometry cases**: 49/61/73/76/88-key calibration on five viewport sizes, centered/unclipped mount, Desktop exact ranges, Mobile existing adaptive composition range. Uniform keyboard aspect ratio retained; dock height not increased.
- Simulated Web MIDI: existing calibration UI; disconnect→88-key fallback; same-input reconnect→61; different input→original recalibration; permission denied; no devices.
- Supplementary late-zero checks in lessons 3–6 preserve stage/settings/Loop bounds, no repeat zero OK12. Already-enabled Practice and exact hand state advance without toggling; reload does not replay feedback.
- Practice geometry measured immediately when the introduction becomes visible and over the next seven frames: stable.
- RU/EN menu/start regression: 20 start cases, 10 menu cases, 2 homepage CTAs; delayed Continue/runtime visibility preserved.
- Actual library import/storage round-trip preserves profile ID, active composition, revision and rendered notes.
- Main baseline/candidate pixel comparison, same imported composition at 1440×900: no differences.

Browser scripts are under `MVP/tests/browser/`; set `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_BROWSERS_PATH`, `PLAY12_TEST_BASE_URL` and `PLAY12_TEST_OUTPUT_DIR` for the installed browser/server. Course script accepts optional `PLAY12_TEST_WIDTH` and `PLAY12_TEST_HEIGHT`.

## Changed files

Runtime (7): `MVP/renderer/play12-onboarding.js`, `tutorial-layout.js`, `tutorial-layout.css`, `training-zones.js`, `play12-i18n.js`, `playback.html`, `MVP/ru/index.html`.
Tests (8): `MVP/tests/test_practice_step3.cjs`, `test_russian_i18n.cjs`; browser `tutorial-functional.cjs`, `tutorial-spotlights.cjs`, `tutorial-spotlights-early.cjs`, `check-tutorial-evidence.py`, `tutorial-interaction-course.cjs`, `tutorial-interaction-midi-geometry.cjs`.
Documentation: this report.

## Limits

No physical MIDI instrument was available: hardware/latency/real-device audio acceptance is **not performed**. Chromium headless is not Safari or a physical mobile touch-device test. External font requests were blocked in local acceptance, using the available font fallback; this limitation is separate from Main's same-environment pixel comparison. Supported physical MIDI range remains 21–108. Production first-party smoke checks are recorded separately after deployment.
