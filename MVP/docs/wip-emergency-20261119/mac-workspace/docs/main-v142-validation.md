# Main v1.4.2 — author decisions implemented; visual/DOM acceptance pending

Base main: `68d299e5b0a047134465ac19d9f5982a4a7fa76d`.
Working branch: `play12-main-v142`.
Both open specification points are resolved by the author decisions of 14 November 2026 and implemented below. Prepared for visual/DOM acceptance; not deployed. Current production is unchanged.

## Changes and per-item status

| Remark | Root cause found in code | Correction | Available verification | Status |
|---|---|---|---|---|
|Common bottom of BPM, Practice, Playback, RoundBoard, zero|Independent flow slots reserved scaled heights inside different zone content|Wide side slots positioned at bottom:0; scaled top-left geometry reserves its actual visual height; stage+Playback stay together|Corridor and scale tests; read-only browser assertions prepared|CODE PASS; DOM NOT TESTED|
|Use free space near Playback|scaleSlot used each third's content width; compact container queries reduced panels even when neighboring space was empty|layoutCorridors reads profile, right zone and Playback DOMRects; uses actual left/right corridors; wide controls escape the third limit, not the page|1920/1440/1280/1024 arithmetic non-overlap tests|CODE PASS; DOM NOT TESTED|
|BPM aligned with profile/library|Centered slot in left third|Slot left calculated from Profile DOMRect relative to Left|Source contract; browser assertions prepared|CODE PASS; DOM NOT TESTED|
|Complete Practice labels / One Skill|Forced 215px width inside a third; clipping/scaling|Wide Practice returns to at least original 320px and may expand using free corridor; no slot clipping; no function removed|Existing Practice tests; labels/runtime unchanged|CODE PASS; text-fit NOT TESTED|
|Title aligned to visible notes|Title occupied entire center column|alignTitle uses minimum left DOMRect of .play12-cell, not the SVG marker rail or technical workspace|Source contract|CODE PASS; DOM NOT TESTED|
|Grid button value stays ×4|Main change listener refreshed SVG but omitted syncGridButton|Main listener now refreshes both render and label from reviewGrid.value|Executed label tests for all five existing grids|PASS for synchronization|
|Approved four-state Main cycle|Author confirmed 1/4→1/8→1/16→1/32 with ×1→×2→×4→×8|mainGridState provides grid/multiplier/next from one ordered state source; Main initializes 1/4 and removes 1/64 option; legacy Onboarding behavior retained|Executed repeated cycle and label tests|AUTOMATED PASS; browser NOT TESTED|
|Round shape of grid button|Moved Playback lost row-specific round styling; default grid-control shape remained|Scoped 30×30 circle, radius50%, appearance reset|CSS regression assertion|CODE PASS; visual NOT TESTED|
|Unwanted shadows|Original shared boards carried inherited box-shadow/filter rules into new placement|Scoped board/button/pseudo shadow removal; explicit non-shadow focus outline; finger popup unchanged|CSS assertions|CODE PASS; visual states NOT TESTED|
|Skill Bank height|Skill Bank was the entire Right zone including lower controls|Separate existing content card inside Right; measured height Profile.top→Library.bottom|Source contract; browser assertions prepared|CODE PASS; DOM NOT TESTED|
|Wider RoundBoard / zero anchored right|Forced 268px compact card within third|Wide RoundBoard at least372px, expands into actual right corridor; zero remains right-anchored; original controller retained|Non-overlap tests; RoundBoard baseline suite|CODE PASS; text-fit NOT TESTED|
|Library hover/title click|Author confirmed highlight-only hover and activation by title click|CSS hover/focus-within style distinct from persistent active selection; native title button invokes existing guarded open/activate; no hover load handlers|Executed title click and CSS/no-hover-load tests|AUTOMATED PASS; browser NOT TESTED|
|Header/logotype partly hidden|Screenshot alone cannot distinguish scrollY from layout|Header unchanged; no unsupported cosmetic fix|Browser at scrollY=0 unavailable|NOT TESTED|
|Horizontal document overflow|Possible overflow from expanded controls|Corridors mathematically bound panels to page and Playback; no wide slot clipping used to conceal panels|Arithmetic + prepared real-DOM checker|CODE PASS; DOM NOT TESTED|
|Desktop/mobile and full/adaptive keyboard|Existing v1.4.1 architecture|Mode policy, keyboard implementation and MIDI unchanged|Existing regression suites|AUTOMATED PASS; browser NOT TESTED|

## Exact geometry method

`training-zones.js::corridors()` computes Left available = Playback.left−Profile.left−gap and Right available = Right.right−Playback.right−gap. Gap is the existing computed control column-gap (currently10px), not an unexplained screenshot offset. Its visual suitability remains to be measured.

Wide Practice width starts at320px; RoundBoard starts at372px. They can expand into their measured corridors. If actual space is insufficient, the entire respective pair is proportionally fitted. Panels remain horizontal. Top-left transform origin plus a slot of scaled height preserves the visual bottom; using bottom-left origin with a scaled slot would shift it and is explicitly regression-tested.

Profile/library stay together. Skill Bank content moves into a section inside Right; no new controller or replacement Skill Bank is created. Its height is read from actual library/profile bounds. MusicWorkspace, renderer and Playback scheduling are untouched.

## Grid/Grab investigation

`playback.html::syncGridButton()` derives the label from the denominator of the actual selector. `play12-playback.js::nextGridResolution()` has five powers-of-two grids. This is display subdivision, not playback speed. The author subsequently approved a Main-specific four-state contract: 1/4=×1, 1/8=×2, 1/16=×4, 1/32=×8. mainGridState owns that mapping and next state. Main initialization and both display/selection paths use it. Existing nextGridResolution and renderer support remain unchanged for other pages; no clock, speed, pitch or scheduling algorithm changed.

No distinct button named Grab was found in the inspected controls. Existing `grab` cursors belong to draggable service panels and note editing. Those mechanisms were not renamed, removed or modified.

## Library history

Inspected main.js history entries: 456afe3, a98c8b5, 6dc0fde, c39de80, 9239773. Current Main and fetched 9239773 contain no mouseenter/mouseleave/mouseover/pointerenter/focusin implementation for switching library state. Earlier supplied approved requirements describe explicit train/edit selection, not loading on hover. The author subsequently specified highlight-only hover, click-to-activate on the title, and a separate persistent active highlight. These are implemented; no composition is loaded or activated on hover.

## Executed checks

- `node --test MVP/tests/*.cjs`: **203 passed, 0 failed**.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s MVP/tests -p 'test*.py'`: **9 passed**.
- Syntax checks: training-zones.js, browser diagnostic and inline scripts in both HTML entry points passed.
- Added corridor calculations at1920/1440/1280/1024; common-bottom scale regression; exact Main label synchronization for all existing grids; circle/shadow/focus contracts.
- Existing tests retain Desktop/full keyboard, narrow navigation, adaptive whole-piece range,100 zone switches, held-note safety, Onboarding, Playback, Practice, RoundBoard, MIDI, EditingAdapter/Undo/Redo and local data.

These are deterministic simulated-DOM and source/math tests. They do not establish real browser layout or visual acceptance.

## Real-DOM acceptance prepared, not executed

`MVP/tests/main-v142-dom-check.js` defines read-only `Play12CheckMainGeometry(document)`. It returns numeric rectangles and pass/fail checks for the required left/top/right/bottom equalities (2px), five bottoms, corridor non-overlap, visible-note title anchor, document scrollWidth, desktop Grid/no-snap and button text fit. It does not change playback, storage, MIDI or app state. It is not loaded by the product.

Run against desktop1920/1440/1280 and target1024; inspect mobile430/390/375/360/320 separately. No controlled browser or physical MIDI is available here. No screenshots, DOMRect values or visual PASS are fabricated.

## Release decision

Do not describe this checkpoint as visually accepted. The specification requires real-DOM/visual desktop acceptance. The two product decisions have now been implemented; remaining acceptance concerns geometry, appearance, touch interaction and physical MIDI. All implementation and available tests are saved for review.

Author decisions are implemented and regression-tested. Production remains at the base SHA pending visual/DOM acceptance. No new publication or main update is part of this preparation step.

## Files

`MVP/renderer/training-zones.js`; new `training-corrections.css`; `MVP/renderer/playback.html`; `ru/MVP/main/index.html`; new `MVP/tests/test_main_v142.cjs`, `MVP/tests/main-v142-dom-check.js`; this report.

## Author-decision follow-up files

Additional changes: `MVP/renderer/play12-playback.js` (Main UI state helper only), `MVP/renderer/playback.html` (Main cycle/init/label), `MVP/main/main.js` (native composition-title button using existing guarded activation), `MVP/main/main.css` (hover/focus and distinct persistent active highlight), `ru/MVP/main/index.html` (cache versions), `MVP/tests/test_main_v142.cjs` (cycle/title/hover regressions). All earlier geometry corrections remain.

Manual acceptance focus: ×1→×2→×4→×8→×1 and matching grid; hover/mouse-leave without load or active-ID changes; title activation with notes; keyboard focus/Enter; unsaved-edit protection; active highlight persists independently of hover. No browser pass is claimed.
