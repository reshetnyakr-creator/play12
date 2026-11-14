# Main v1.4.1 corrective validation

Base/main: `456afe324e590c5e0669ca287fbcad37f5ad0de1`. Working branch: `play12-main-v141`.
This report supersedes the v1.4 mode/breakpoint conclusions.

## Confirmed root cause

`training-zones.js::metrics()` previously classified the interface as narrow whenever the unscaled Left/Music/Right footprints could not fit equal thirds. With Left=510 it required 1566px available (approximately viewport 1614). `layout()` applied `.is-three-narrow`; that class enabled Flex, 100%-wide slides, `overflow-x:auto` and `scroll-snap-type:x mandatory` in `training-zones.css`. `updateKeyboard()` used the same erroneous mode to select the piece-only range. Thus the screenshot's single zone, navigation scroll and cropped keyboard had one shared classification cause.

The old fit threshold is now diagnostic only. Desktop panels fit their own containers rather than force a mobile layout. Container queries select the existing compact dimensions and RoundBoard typography. The old <=1050px Skill Bank placement (`grid-column:1/-1;order:4`) is explicitly reset in wide mode.

## Corrective behavior

- Wide: three equal Grid columns, no snap navigation, scrollLeft reset to zero, navigation buttons hidden. Side pairs scale inside their own content boxes. Music remains at scale 1 whenever it fits.
- Mobile: existing permanent snap zones, initial Center, same runtime and piece-range keyboard.
- `PianoView.setWorkspaceKeyboard()` distinguishes desktop-full (88 keys, 21..108) from adaptive. Physical `minMidi/maxMidi`, MIDI routing, calibration and zero are not rewritten. Desktop fit uses actual dock width instead of a minimum 1100px strip. Later calibration changes do not crop the desktop display.
- Keyboard does not temporarily initialize as adaptive on desktop before the first geometry pass.
- No changes to renderer, musical scheduling, stores, MIDI controller or finger popup.

## Width policy (code calculations, not measured browser DOM)

Measured music width and compact Left footprint determine the lower three-column boundary. Engineering fit floors: 90% music, 75% compact Left. With current dimensions, available threshold is ceil(max(3×336.5×.9+36,3×405×.75+36)) = **948px**, normally viewport **996px** with 24px gutters. Width >=1232px available explicitly preserves mandatory Desktop. The unscaled 1566px figure is not a mobile breakpoint.

768px is narrow because its third would only be 228px (music scale about .678). 1024px is the target wide/tablet arrangement (music scale about .931). Its physical readability still requires manual validation; it is not claimed as visually accepted. Orientation affects available height; it does not override the width requirement to put a 390px portrait phone into thirds.

| CSS viewport | Mode by code | Three zones together | Zone snap navigation | Keyboard |
|---:|---|---|---|---|
|1920|Desktop|Yes|Disabled|Full 21..108|
|1440|Desktop|Yes|Disabled|Full 21..108|
|1280|Desktop|Yes|Disabled|Full 21..108|
|1024|Wide/tablet target|Yes|Disabled|Full 21..108|
|768|Narrow/tablet|No|Enabled|Whole composition min..max|
|430|Narrow|No|Enabled|Whole composition min..max|
|390|Narrow|No|Enabled|Whole composition min..max|
|375|Narrow|No|Enabled|Whole composition min..max|
|360|Narrow|No|Enabled|Whole composition min..max|
|320|Narrow|No|Enabled|Whole composition min..max|

Ordinary safe-area-zero desktop column widths: 612px at 1920; 452px at 1440; 398.67px at 1280; 313.33px at 1024. The full music block up to 336.5px fits unscaled at all mandatory desktop widths. Right panel content width accounts for its padding. No column is intentionally offscreen in wide mode.

## Executed checks

- `node --test MVP/tests/*.cjs`: **192 passed, 0 failed**.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s MVP/tests -p 'test*.py'`: **9 passed**.
- Syntax checks for changed JS and both HTML entry points' inline scripts.
- New cases: mandatory 1280/1440/1920 wide classification, zero navigation offset, permanent workspace parent; CSS no-snap/legacy placement reset/container-query contracts; actual PianoView rendering 88 keys after a 49-key calibration and after adaptive mode; later physical range changes leave desktop full; returning to adaptive restores exact piece range.
- Existing cases: full-piece range, one pitch, sub-octave, both hands 28..103, extremes 0..127, held-note deferral, 100 zone switches, Onboarding/Playback/Practice, editing/Undo/Redo, MIDI and persistence.

These are production-logic tests with a deterministic simulated DOM plus source/CSS checks. They are **not an automated browser, real DOMRect measurement or visual acceptance**.

## Unverified and release qualification

Controlled browser and physical MIDI unavailable. Mandatory desktop mode/keyboard contracts pass available checks, but actual rendered three-zone visibility, document scrollWidth, exact bottom alignment, safe-area behavior, Safari touch, focus and scale readability require author verification. At 1024 and 320, small control targets remain a specific manual check. No claim of a visually accepted/finished release is made.

Publication is an experimental corrective build for manual acceptance. Rollback ref: `rollback-before-main-v141-20261114` at the base. Revert by a new commit, not force-push. Browser-local data is unaffected.

## Changed files

`MVP/renderer/training-zones.js`, `training-zones.css`, `piano-view.js`, `playback.html`; `ru/MVP/main/index.html`; `MVP/tests/test_training_zones.cjs`, `test_dynamic_piano_view.cjs`; this report.
