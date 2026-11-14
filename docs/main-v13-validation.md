# MVP Main v1.3 — implementation checkpoint (not published)

Base: c39de80f5f0ec1ff206743d271c26299f456fb4b. Date: 2026-11-14.

## Architecture and changes

- `MVP/renderer/training-shell.js`: shared placement of the original stage, **whole playline**, RoundBoard and PianoView; original fixed-piano measurements; Practice binding driven by Playback state; Main mount/dispose and ResizeObserver; conservative user-only round feedback invalidated by wrong input/interruption.
- `play12-onboarding.js`: delegates placement/fixed-piano operations and Practice binding to the shared module. Tutorial steps, final attempt validation and progression remain in Onboarding.
- `play12-onboarding.css`: the existing training rules also apply under the neutral training-shell state. Their inner component values were not rewritten for Main.
- `playback.html`: loads the shared dependency; separates user zero restoration in Main from composition reference zero; missing storage values are no longer interpreted as C/0.
- `play12-playback.js`: removes the Main-only score-centering branch; uses the compact original host and shared anchor conversion for the row coordinate system.
- `piano-view.js`: removes Main's separate keyboard-size branch; uses the original piano host/range sizing.
- `training-shell.css`: external placement/reflow of entire control groups only. Musical component styles remain shared.
- `MVP/main/main.css`: retains external cards/navigation and edit styles; removes Main's competing internal score, playline, round-board, Practice and keyboard geometry.
- `MVP/main/editing-adapter.js`: delegates contact edits to existing core edit/commit; operates directly on the existing manual/history/cursor/revision, with Undo/Redo. No second assignments store.
- `main.js`: TrainingShell mount, icon-only mode selection and orange mode indication, attached five-finger popover with hand label only, transient save toast, preservation of position and drafts, shared MIDI controller with unavailable status support.
- `main/data.js`, `editor/import.js`: same-source/same-fingering-source reimport reuses the existing user's composition instead of overwriting its manual history or creating another record. Different source files remain distinct.
- RU Main/Import wrappers: dependency/version updates. Import's parsing/Engine implementation is unchanged.

No changes to Fingering Engine, musical parsing algorithms, document schema, database version, source scores, hand allocation or musical timing rules.

## Automated evidence

- 169 Node JavaScript tests pass, including the existing 80 Onboarding/Practice scenarios.
- 9 Python validation tests pass.
- Node --check passes on all changed JS and inline scripts.
- New coverage: whole-node placement/restoration; idempotent mount and disposal; no duplicate Practice subscriptions; live engine state and rejection of disabling both hands; no robot/invalid/wrong-attempt round success; rewind/reset and cleanup; shared coordinate conversion; original calibrated crop/aspect path; contact edits/Undo/Redo preserve musical data and identity; same-source reimport preserves manual history/revision; dependency loading and removal of competing Main controls/styles.
- Existing data/profile/backup and MIDI/Function tests remain passing. MIDI tests simulate events; they do not use physical hardware.
- Older tests asserting Main-specific layout implementation were replaced by contracts for the shared shell. The original behavior tests were retained and run with the newly explicit dependency loaded in their harness.

## Browser gate — outstanding, not passed

Only MCP application panels were available in this Work session; there was no ordinary controllable browser. No before/after screenshots or real getBoundingClientRect measurements were obtained. Mock geometry tests are not browser layout verification.

Required before publication:

1. Original RU/EN Onboarding: start/continue, user zero, Practice stages, metronome, rounds, final successful attempt and completion; compare against baseline at matching viewport/zoom/range.
2. Main: empty profile/library, direct URL with saved work, restored active work, file MusicXML/MXL imports and same-file reimport, switching works, reload and position preservation.
3. Layout: field start/middle/end; intact transport under field, original RoundBoard miniature and markers; keyboard range/cards; desktop reference viewport plus narrow and short windows; actual rectangles and no global horizontal overflow. Verify measured control reflow and resizing stability.
4. Editing: icon colors and composition highlight, note-anchored popup and touch placement, five finger states, same-hand drag, tied contacts, Undo/Redo, save/Done, transient toast, denied/failed save without losing draft; grid changes and selected-note refresh.
5. User preferences: BPM, zero/reference distinction, Loop/range/precount and calibrated keyboard across reload and composition switches; existing backup/restore against real IndexedDB.
6. MIDI: unsupported browser, permission denied/granted, no input, disconnect/reconnect, real calibration/device mismatch, virtual keys and Function commands. Automatic reconnection is attempted only for an already-granted permission.
7. Confirm round feedback never marks robot playback, wrong-input or interrupted attempts as successful in actual timing conditions.
8. Verify no duplicated listeners after navigation/back-forward restoration and repeated shell mounting.

## Limits and release state

This is an implementation checkpoint for review, not final acceptance. Changes are committed to the feature branch only; production main is deliberately left on the baseline. No publication is authorized until the remaining browser gate is completed or the author gives a new explicit instruction.

A possible difference in host clipping/controls alignment after the shared refactor must be resolved from actual browser measurements, not asserted fixed by automated tests. External card design is retained, but visual equivalence is unverified. Physical MIDI and actual IndexedDB restore are unverified.
