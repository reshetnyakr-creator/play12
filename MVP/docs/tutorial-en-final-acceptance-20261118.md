# Tutorial EN and unified RU/EN release acceptance — 2026-11-18

This report supersedes the unaccepted recovery status recorded on 2026-11-17 and earlier interrupted-environment acceptance claims. Starting recovery commit: `1c89490e383e8b7bd4853a2359a0f5cb8bf05e09`; original production baseline: `e64afb5c4fa86c8ad8ed991386bb4b5b4eceddca`. Original rollback `rollback-before-main-en-routes-grab-20261116` is retained unchanged.

## Tutorial EN priority acceptance

Two fresh, complete, sequential real-Chromium courses passed on Desktop 1440×900 and Mobile viewport 375×667. Both started without seeded lesson progress, used native Play/P, Pause, zero selection, keyboard and panel controls, then fed original production NoteOn/Off hooks for expected notes. No fabricated success events were used. All six stages, early OK12, five-note metronome task, two complete successful passes of rounds 2–4 and the final full exercise completed. Both state snapshots record `onboardingCompleted: true`, `roundPasses: 2`, no JavaScript errors, and no horizontal overflow.

The previous timeout at a round exercise did not reproduce in these full EN runs. No product defect was established, so no working product component was rewritten. Only browser-test files changed after the requested checkpoint (course timeout diagnostics and first-party request isolation for MIDI). In the course test: on timeout it now saves a state snapshot and screenshot before rethrowing the original failure. The musical engine, CSS, MIDI calibration, Practice and Grab algorithms are unchanged.

## Fresh shared regression checks

- 261 JavaScript tests pass; 9 Python tests pass.
- Actual Main/Tutorial Grab factors are 1, 2, 4, 8; wrap and persisted state verified, with no ×3.
- 40 canonical-route browser cases (RU/EN × Menu/Tutorial/Main/Import × five viewports) pass; four historical aliases preserve query/hash and native Back/Forward works.
- 60 RU/EN Tutorial stage geometry cases pass, with correct text, left/top markers and no duplicate right progress rail.
- Main real XML import → existing worker → save → finger editing → Undo/Redo → pending-edit locale switch → reload passes.
- MXL, pending import/source choice on locale switch, deduplication, invalid-MXL rejection, library selection, backup/delete/restore and stable identity pass.
- Repeat range, Loop and Pre-count survive Main locale switches.
- Negative two-pass protocol in RU/EN passes: wrong second-pass input is not credited, first pass survives Pause/reload, restart and complete second pass succeed. Five-note wrong/pause/restart/autoplay protocols pass too.
- Existing MIDI mock calibration and reconnect path passes, retaining the 61-key range and exact calibration across locale switches and showing a truthful denied-permission state.
- RU baseline DOM geometry passes at 1920,1440,1280,1024,375. Strict matched screenshot comparison passes without raising its original 4/255 tolerance. No outside-note-viewport differences exceed the tolerance. At 1920/1440 only nine compositor pixels differ outside it, all ≤4/255; at the other widths zero do. The earlier three-pixel diagnostic did not recur in the fresh captured comparison; no UI change or weakened threshold was used to make it pass.

Raw course, route, stage, MIDI, library and baseline-geometry receipts are in `MVP/docs/acceptance-20261118/`. All 270 Spotlight cases / 320 target boxes passed the fresh validators; completion receipts are recorded alongside them. Earlier recovery reports remain historical records only.

## Runtime and interpretation

Tests use actual headless Chromium. The shell environment forbids listening sockets, so local acceptance supplies unchanged repository files via Playwright response interception. JavaScript, rendering, IndexedDB, Workers, UI controls and input handling run in the browser; this is not an emulated DOM. Only the explicitly named MIDI tests mock hardware. Production post-deployment checks use actual HTTPS from an isolated browser with third-party requests blocked.

English and Russian use one Main, importer and training runtime. Import is the loading page; fingering editing remains inside Main. No second editor or alternate music engine was introduced. Local storage keys and IndexedDB schema are unchanged; language changes preserve the existing document/identity/settings using the existing save revision guard.

## Canonical routes

| Page | EN | RU |
|---|---|---|
| Menu | `/MVP/menu/` | `/ru/MVP/menu/` |
| Tutorial | `/MVP/tutorial/` | `/ru/MVP/tutorial/` |
| Main | `/MVP/main/` | `/ru/MVP/main/` |
| Import | `/MVP/import/` | `/ru/MVP/import/` |

Legacy `/MVP/`, `/MVP/ru/`, `/MVP/editor/`, `/ru/MVP/editor/` redirect to their corresponding canonical Tutorial/Import. Technical editor resources remain available at their existing locations.

## Limitations

Headless narrow-viewport testing does not certify Safari, Firefox or real touch devices. Physical MIDI hardware/driver timing is untested; mock success is not hardware acceptance. These checks do not certify availability through Russian operators. Playback is not automatically resumed across language navigation. Import still requires an unambiguous piano hand/staff structure; no inference algorithm was changed.

The final release commit and published-HTTPS verification are provided in the delivery report. All current local matrix validators passed; publication is authorized. No DNS or hosting-provider migration is part of this release.
