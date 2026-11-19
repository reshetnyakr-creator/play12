# MVP Main v1.4 — implementation and validation

Base: `main` at `a98c8b502b0c135cc8edeee71d94d5e42b10152d`.
Working branch: `play12-main-v14`. No storage schemas or MIDI controller changed.

## DOM and ownership

- Three permanent siblings: Left (profile/library, BPM → Practice), Center (tools, MusicWorkspace), Right (Skill Bank, RoundBoard → zero).
- MusicWorkspace owns both the original stage and the complete original playline. Its local width comes from renderer geometry; the stage's local height defines the execution line. Progress uses playline local width, independently of the panel row and CSS scale.
- A persistent footer outside the horizontal strip contains zone navigation, the existing MIDI UI and the original interactive PianoView.
- TrainingShell dispatches Main to the zone layout adapter, retaining shared Practice and success tracking. Onboarding and composition review use the same workspace mount helper. Renderer, musical time, Fingering Engine, stores and MIDI runtime are retained.

## Changes

- `MVP/renderer/training-shell.js`: shared workspace mount, three-zone adapter dispatch, Onboarding viewport reservation.
- New `training-zones.js`, `training-zones.css`: permanently mounted zones, measured wide footprints, equal thirds, snap navigation, horizontal scaled control pairs, dock and resize lifecycle.
- New `music-workspace.css`: common local stage/Playback container.
- `play12-playback.js`: local width, execution height and progress coordinates under workspace scale. Musical scheduling unchanged.
- `piano-view.js`: separate visual window independent of physical calibration, exact composition range, repeated original key geometry for MIDI outside the original 88-key artwork, proportional fit, unchanged physical mapping and source sets.
- `play12-onboarding.js`, `playback.html`: common workspace mounting and dependencies/cache versions.
- `MVP/main/main.js`: pass existing zones, mode-specific touch-action, safe popup close on navigation; approved positioning/painting functions unchanged.
- `ru/MVP/main/index.html`: versioned dependencies.
- Tests: DOM harness supports the shared parent; dependency versions updated; adaptive keyboard and zone lifecycle regressions added.

## Widths and breakpoint

The adapter measures the original desktop control pairs before applying compact mode, then retains those footprints so the breakpoint cannot oscillate. With current styles: Left 510, Right 424, maximum music 336.5, gap 18. Wide threshold: **1566 CSS px available**, normally **1614 viewport px** with 24px outer gutters. A hidden width probe accounts for the actual containing width and safe-area gutters. Threshold is available in `data-wide-threshold`.

The following are arithmetic expectations, **not browser measurements**. Narrow zones use viewport minus 24px at ordinary safe-area zero. Compact pairs: Left 405px, Right 314px. Scaling never increases the components. Music width varies with actual renderer ribbons/indicators; the table uses 336.5px.

| Viewport | Expected mode | Narrow width | Music scale | Left pair scale | Right pair scale |
|---:|---|---:|---:|---:|---:|
|1920|Wide, equal thirds|—|1|1|1|
|1440|Narrow|1416|1|1|1|
|1280|Narrow|1256|1|1|1|
|1024|Narrow|1000|1|1|1|
|768|Narrow|744|1|1|1|
|430|Narrow|406|1|1|1|
|390|Narrow|366|1|0.904|1|
|375|Narrow|351|1|0.867|1|
|360|Narrow|336|0.999|0.830|1|
|320|Narrow|296|0.880|0.731|0.943|

Right-zone content padding is zero in narrow mode; wide panel fits are checked against their actual parent content box. No partial-neighbor hint sacrifices available width.

## Adaptive Keyboard Window examples

Synthetic regression compositions, not claims of browser MusicXML imports:

| Fixture | Complete piece range | Visible keys | Purpose |
|---|---|---:|---|
|Solo pitch|60–60|1|No empty/NaN geometry; height bounded|
|Short phrase|61–66|6|Continuous range below an octave|
|Two distant hands|28–103|76|Low LH/high RH, including late rounds|
|MIDI extremes|0–127|128|No pitch loss or physical calibration restriction|

Window range is derived from the entire runtime music schedule, including both hands and distant rounds. Cached by event-array identity/count and runtime zero, not recomputed from the current round. Finger-only edits do not change the bounds. Held MIDI/virtual/playback notes defer rebuilding until safe. Empty schedule explicitly uses C4–C5 (60–72). Physical range, calibration key and MIDI token routing remain separate.

## Executed checks

- `node --test MVP/tests/*.cjs`: **187 passed, 0 failed**.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s MVP/tests -p 'test*.py'`: **9 passed**.
- `node --check` for changed JavaScript and extracted inline scripts: passed.
- All local script/stylesheet dependencies in the changed entry points resolve.
- Approved `positionFingers()` and `paintFingers()` bodies compared byte-for-byte with the base: unchanged.
- New tests cover all ten requested widths, the threshold, one workspace parent, 100 zone transitions without runtime/subscription growth, stable wide/narrow transitions, full-piece range, null/rest filtering, held-note deferral, exact visual keys and preservation of physical calibration.
- Existing suites cover Onboarding stages, Practice, Playback, RoundBoard, editing adapter/history, DOM contract, MIDI and data/backup paths. These suites use deterministic simulated DOM/audio, not a browser.

## Unverified conditions and limitations

No controlled browser or physical MIDI device is available. Actual DOM alignment, pointer hit areas after scaling, Safari/Chrome touch snap, focus order, safe-area insets, screen keyboard, short landscape, browser zoom and readability remain manual checks. No browser pass is claimed.

At viewport 320px the Left pair scales to about 0.731, making its small labels and targets smaller. Very wide keyboard ranges are inherently dense; a notice is displayed when the keyboard scale is low. The full range remains visible; no note or MIDI input is silently excluded. Actual readability needs author testing; this release must not be described as accessibility-certified.

Initial empty-library state retains the existing empty workspace rather than inventing a musical runtime or loading a tutorial composition.

## Rollback

Keep `rollback-before-main-v14-20261114` at the base SHA. Roll back through a new revert commit/ref-safe deployment; do not force-push or modify user browser data. Publication is an experimental test release subject to the manual checks above.
