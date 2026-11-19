# Main v1.4.3 — published for visual acceptance

Baseline/main verified: `5bbcc347af3439b628479b188c92eacafd08c1c4`.
Working branch: `play12-main-v143`. Visual acceptance is pending; no controlled browser or physical MIDI device is available in this environment.

## 1. Viewport fit

Confirmed code causes: Main previously combined a fixed dock, body bottom-padding reservation, nested card/list minimum heights, and a score formula with a hard minimum260px and a fixed120px deduction. This was not one bounded height budget. Tall score/card content therefore enlarged the page beyond the visible viewport.

`training-viewport.css` now makes the loaded workstation a visual-viewport-height grid: actual header / minmax(0,remaining workspace) / actual dock. Dock stays below all three zones in the same bounded shell rather than requiring document padding. `training-zones.js::layout()` reads visualViewport.height/offsetTop (innerHeight fallback), center height, actual visible tools/margins/gaps and Playback height. `fieldBudget()` allocates the remaining local score height, accounting for common workspace scale. The musical cell height, clock and renderer schedule are unchanged.

Profile and heading/add-song remain fixed within Left; the song-list body is the flexing scroll area. Wide side corridors and their common visual bottom remain. Skill Bank height still comes from Profile.top to Library.bottom. Narrow zones retain horizontal snap and permit bounded internal vertical panel scrolling for short windows. VisualViewport resize/scroll subscriptions are cleaned up with the shell.

Very short windows may leave fewer than two score-cell heights. An explicit height warning is displayed; readability is not silently certified. The supported matrix below still needs real-browser measurement. The whole fixed shell alone is not evidence that no child is clipped: the read-only DOM checker now checks visible rectangles as well as document dimensions.

## 2. Progress marker

Original CSS placed the4.5px marker at `top:calc(100% + 1px)`, outside the42px Playback board. The workspace slot could clip its circle. Main now places it at `bottom:1px`, retains its original horizontal center transform and progress arithmetic, and gives it an overlay z-index with pointer-events:none. The circle stays inside the board, below the30px buttons; start/middle/end arithmetic is regression-tested. No timing, seek or progress semantics changed.

## 3. Repeat provenance and transitions

Main's RoundBoard creates one `playback.repeatSelection` object with kind `neutral`, `auto` or `manual`. Existing controller loopStartInput/loopEndInput remain the bounds source of truth; existing loopInput.checked remains the enabled source. There are no second loop bounds or duplicated enabled flags.

- Actual user pause with no override and Repeat off: N→N+1, without enabling Repeat.
- Manual From/To input changes and existing steppers mark manual intent, even before Repeat is enabled.
- Manual bounds survive subsequent pauses, including when Repeat is enabled.
- An enabled auto loop also keeps its bounds on pause.
- Repeat off, including external checkbox change, clears provenance and resets bounds to neutral1–2 (single-round piece1–1). No duplicate loop-off semantic event is added.
- Next actual pause after resume may suggest a new interval.
- Final round suggests N→N; existing currentLoop() already supports inclusive identical start/end round indices. Only Main's range validator permits this; legacy Onboarding normalization is retained.
- Empty/invalid positions do not invent a round; empty controls show an em dash and disable Repeat.
- Reset clears provenance; a new composition receives its own controller. Existing title-keyed repeat storage is retained, with a backward-compatible optional rangeKind field. Old enabled loops are preserved regardless of provenance; no manual intent is guessed from auto-looking bounds.

`requestPause()` and the actual queued-pause completion call the board's optional `suggestRepeatAtPause()`. General pauseImmediate(), seek, restart, mode changes and edit refreshes do not call this policy. Boundary interpretation reuses Controller.signatureAt(). Practice and Count-in user-pause routes are covered without changing their music behavior.

## 4. Title board

The heading becomes a42px rounded, shadow-free board using the existing control fill/border family. Its left/right and width come from actual .play12-cell DOMRects, excluding round-number/indicator rails and SVG padding. Full title is retained in text, title and aria-label. Overflow alone enables a slow bidirectional marquee with pauses at both ends. Hover/focus pauses it; prefers-reduced-motion uses static accessible truncation. It stays inside the title's own box and does not alter note geometry.

## Executed tests

- `node --test MVP/tests/*.cjs`: **215 passed,0 failed**.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s MVP/tests -p 'test*.py'`: **9 passed**.
- Changed JS and both entry points' inline scripts: node --check passed.
- Local script/stylesheet routes resolve.
- New Repeat tests execute the production RoundBoard with a deterministic simulated DOM: first/middle/final/boundary pause; manual4–8 before/after enabling; repeated pauses/toggles; enabled auto preservation; external off reset; fresh suggestion; zero/one-round pieces; invalid positions; reset and new composition; persisted intent.
- New production Controller tests prove queued Pause uses its actual stopped position and that seek/pauseImmediate do not create suggestions; Practice Pause integration is also checked.
- Height-budget tests use width+height scenarios, explicitly with synthetic header/dock/chrome inputs. These are mathematical checks, not live measured DOM fits.
- Existing Main grid×1/2/4/8, library hover/title activation, Desktop/full keyboard, mobile whole-piece keyboard,100 transitions, editing/Undo/Redo, MIDI, Onboarding and data tests remain green.

## Acceptance matrix: status of evidence

| Scenario | Available checks | Real browser |
|---|---|---|
|1920×1080|Budget/code regression PASS|NOT RUN|
|1440×900|Budget/code regression PASS|NOT RUN|
|1280×800|Budget/code regression PASS|NOT RUN|
|1024×768|Budget/code regression PASS; readability requires author inspection|NOT RUN|
|430×844,390×844,375×812,360×780,320×640|Budget/mobile-regression PASS; narrow panel internal scroll retained|NOT RUN|
|Marker start/middle/end|Circle bounds arithmetic PASS|NOT RUN|
|Repeat auto/manual/reset|Production policy and Controller integration PASS|NOT RUN|
|Short/long title|CSS/source and overflow contract checks PASS|NOT RUN|
|Hardware MIDI/Safari touch/zoom/safe area|Existing simulated regressions only|NOT RUN|

`MVP/tests/main-v142-dom-check.js` is extended read-only: document vertical/horizontal overflow, header/piano/MIDI/workspace within visual viewport, full marker circle inside Playback, both title edges aligned with visible grid, common lower bottoms and control text fit. It is not automatically loaded or represented as already executed. Collect actual DOMRects/screenshots for the listed sizes during author acceptance.

## Changed files

- `MVP/renderer/training-zones.js`: visual viewport budget and title measurements/overflow state.
- New `MVP/renderer/training-viewport.css`: bounded shell/list flow, title board/marquee and marker placement.
- `MVP/renderer/play12-round-board.js`: Main-only repeat provenance, manual/off/suggestion handling and valid single-round bounds.
- `MVP/renderer/play12-playback.js`: explicit user-pause notification hooks and empty-loop guard; musical scheduling retained.
- `MVP/renderer/piano-view.js`: narrow height cap follows visual viewport.
- `MVP/renderer/playback.html`, `ru/MVP/main/index.html`: versioned dependencies and stylesheet.
- New `MVP/tests/test_main_v143.cjs`; added actual Pause integration cases in `test_practice_step3.cjs`; extended read-only DOM checker.
- This report.

## Release and rollback

Deploy only after green available checks and a main ref lease check. No browser acceptance is claimed or used as a publication gate in this brief. Keep `rollback-before-main-v143-20261114` at the baseline. Revert through a new commit without force-pushing and without touching browser-local user data. Live target: https://play12.pro/ru/MVP/main/ .
