# Main v1.4.2 corrective checkpoint — NOT ACCEPTED / NOT DEPLOYED

Base main: `68d299e5b0a047134465ac19d9f5982a4a7fa76d`.
Working branch: `play12-main-v142`.
Publication is withheld: mandatory real-DOM/visual acceptance is unavailable, and two specification points require author decisions. Current production is unchanged.

## Changes and per-item status

| Remark | Root cause found in code | Correction | Available verification | Status |
|---|---|---|---|---|
|Common bottom of BPM, Practice, Playback, RoundBoard, zero|Independent flow slots reserved scaled heights inside different zone content|Wide side slots positioned at bottom:0; scaled top-left geometry reserves its actual visual height; stage+Playback stay together|Corridor and scale tests; read-only browser assertions prepared|CODE PASS; DOM NOT TESTED|
|Use free space near Playback|scaleSlot used each third's content width; compact container queries reduced panels even when neighboring space was empty|layoutCorridors reads profile, right zone and Playback DOMRects; uses actual left/right corridors; wide controls escape the third limit, not the page|1920/1440/1280/1024 arithmetic non-overlap tests|CODE PASS; DOM NOT TESTED|
|BPM aligned with profile/library|Centered slot in left third|Slot left calculated from Profile DOMRect relative to Left|Source contract; browser assertions prepared|CODE PASS; DOM NOT TESTED|
|Complete Practice labels / One Skill|Forced 215px width inside a third; clipping/scaling|Wide Practice returns to at least original 320px and may expand using free corridor; no slot clipping; no function removed|Existing Practice tests; labels/runtime unchanged|CODE PASS; text-fit NOT TESTED|
|Title aligned to visible notes|Title occupied entire center column|alignTitle uses minimum left DOMRect of .play12-cell, not the SVG marker rail or technical workspace|Source contract|CODE PASS; DOM NOT TESTED|
|Grid button value stays ×4|Main change listener refreshed SVG but omitted syncGridButton|Main listener now refreshes both render and label from reviewGrid.value|Executed label tests for all five existing grids|PASS for synchronization|
|Initial ×1 and four states ×1–×4|Actual algorithm is nextGridResolution: 1/4→1/8→1/16→1/32→1/64, not four linear states|Algorithm intentionally retained; no false ×1 label|Source and existing nextGridResolution tests|BLOCKED: author decision|
|Round shape of grid button|Moved Playback lost row-specific round styling; default grid-control shape remained|Scoped 30×30 circle, radius50%, appearance reset|CSS regression assertion|CODE PASS; visual NOT TESTED|
|Unwanted shadows|Original shared boards carried inherited box-shadow/filter rules into new placement|Scoped board/button/pseudo shadow removal; explicit non-shadow focus outline; finger popup unchanged|CSS assertions|CODE PASS; visual states NOT TESTED|
|Skill Bank height|Skill Bank was the entire Right zone including lower controls|Separate existing content card inside Right; measured height Profile.top→Library.bottom|Source contract; browser assertions prepared|CODE PASS; DOM NOT TESTED|
|Wider RoundBoard / zero anchored right|Forced 268px compact card within third|Wide RoundBoard at least372px, expands into actual right corridor; zero remains right-anchored; original controller retained|Non-overlap tests; RoundBoard baseline suite|CODE PASS; text-fit NOT TESTED|
|Library hover|No explicit row hover selection/preview contract in available approved text; current code has click actions only|No invented hover loading or active-composition mutation|Inspected five main.js history entries; historical 9239773 has no hover/focus-entry handlers|BLOCKED: clarify intended behavior|
|Header/logotype partly hidden|Screenshot alone cannot distinguish scrollY from layout|Header unchanged; no unsupported cosmetic fix|Browser at scrollY=0 unavailable|NOT TESTED|
|Horizontal document overflow|Possible overflow from expanded controls|Corridors mathematically bound panels to page and Playback; no wide slot clipping used to conceal panels|Arithmetic + prepared real-DOM checker|CODE PASS; DOM NOT TESTED|
|Desktop/mobile and full/adaptive keyboard|Existing v1.4.1 architecture|Mode policy, keyboard implementation and MIDI unchanged|Existing regression suites|AUTOMATED PASS; browser NOT TESTED|

## Exact geometry method

`training-zones.js::corridors()` computes Left available = Playback.left−Profile.left−gap and Right available = Right.right−Playback.right−gap. Gap is the existing computed control column-gap (currently10px), not an unexplained screenshot offset. Its visual suitability remains to be measured.

Wide Practice width starts at320px; RoundBoard starts at372px. They can expand into their measured corridors. If actual space is insufficient, the entire respective pair is proportionally fitted. Panels remain horizontal. Top-left transform origin plus a slot of scaled height preserves the visual bottom; using bottom-left origin with a scaled slot would shift it and is explicitly regression-tested.

Profile/library stay together. Skill Bank content moves into a section inside Right; no new controller or replacement Skill Bank is created. Its height is read from actual library/profile bounds. MusicWorkspace, renderer and Playback scheduling are untouched.

## Grid/Grab investigation

`playback.html::syncGridButton()` derives the label from the denominator of the actual selector. `play12-playback.js::nextGridResolution()` has five powers-of-two grids. This is display subdivision, not playback speed. Changing to four states or relabeling 1/4 as ×1 without an agreed mapping would invent semantics. Author must choose the intended contract.

No distinct button named Grab was found in the inspected controls. Existing `grab` cursors belong to draggable service panels and note editing. Those mechanisms were not renamed, removed or modified.

## Library history

Inspected main.js history entries: 456afe3, a98c8b5, 6dc0fde, c39de80, 9239773. Current Main and fetched 9239773 contain no mouseenter/mouseleave/mouseover/pointerenter/focusin implementation for switching library state. Earlier supplied approved requirements describe explicit train/edit selection, not loading on hover. This does not prove no earlier verbal agreement existed; it means the intended behavior cannot be reconstructed reliably from the available evidence.

## Executed checks

- `node --test MVP/tests/*.cjs`: **200 passed, 0 failed**.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s MVP/tests -p 'test*.py'`: **9 passed**.
- Syntax checks: training-zones.js, browser diagnostic and inline scripts in both HTML entry points passed.
- Added corridor calculations at1920/1440/1280/1024; common-bottom scale regression; exact Main label synchronization for all existing grids; circle/shadow/focus contracts.
- Existing tests retain Desktop/full keyboard, narrow navigation, adaptive whole-piece range,100 zone switches, held-note safety, Onboarding, Playback, Practice, RoundBoard, MIDI, EditingAdapter/Undo/Redo and local data.

These are deterministic simulated-DOM and source/math tests. They do not establish real browser layout or visual acceptance.

## Real-DOM acceptance prepared, not executed

`MVP/tests/main-v142-dom-check.js` defines read-only `Play12CheckMainGeometry(document)`. It returns numeric rectangles and pass/fail checks for the required left/top/right/bottom equalities (2px), five bottoms, corridor non-overlap, visible-note title anchor, document scrollWidth, desktop Grid/no-snap and button text fit. It does not change playback, storage, MIDI or app state. It is not loaded by the product.

Run against desktop1920/1440/1280 and target1024; inspect mobile430/390/375/360/320 separately. No controlled browser or physical MIDI is available here. No screenshots, DOMRect values or visual PASS are fabricated.

## Release decision

Do not deploy this checkpoint as a completed release. The specification explicitly requires real-DOM/visual desktop acceptance and an author decision when the actual multiplier states differ. Hover is also explicitly BLOCKED rather than guessed. All safe implementation and available tests are saved for review.

Required decisions: keep existing five grid subdivisions or authorize a different four-state multiplier contract; specify precisely the expected library hover behavior. Production remains at the base SHA until these issues and acceptance are resolved.

## Files

`MVP/renderer/training-zones.js`; new `training-corrections.css`; `MVP/renderer/playback.html`; `ru/MVP/main/index.html`; new `MVP/tests/test_main_v142.cjs`, `MVP/tests/main-v142-dom-check.js`; this report.
