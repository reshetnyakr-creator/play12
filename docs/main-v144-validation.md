# Main v1.4.4 — published for visual acceptance

Baseline/main verified: `e55feedb25c2994cb90be813f003beaa9bad7895`.
Working branch: `play12-main-v144`. No real-browser or physical MIDI acceptance was performed.

## Zero modal

Confirmed source cause: #zero-chooser was inside the stage/workspace, with ancestor clipping, transforms and onboarding-specific positioning/display rules. Raising its local z-index would not escape this context.

Main now portals the original chooser into one body-level native dialog. Its existing virtual PianoView node is moved into the dialog while open and returned to its original host on close; no new piano, audio/MIDI controller or note listeners are created. MIDI preview still follows the existing note listener. A native MIDI selector provides keyboard-accessible pitch-class preview through the same previewZero callback. Only the original use-zero handler applies a new zero, guarded by choosingZero so a repeated click cannot commit twice.

The dialog has visual-viewport width/height/offset bounds, internal scrolling, native top layer/backdrop, a fallback overlay/inert background, Tab containment, Escape/Cancel, focus restoration and repeat-open protection. Current/proposed MIDI zero is shown. Existing confirmation and choose-another controls remain. Non-modal background shortcuts are stopped at the dialog. Existing chooser coaching animation is disabled only inside this Main dialog.

## Round boundaries

Confirmed source cause: the continuously moving SVG is clipped at a viewport whose height need not be a multiple of round height. The existing engine intentionally clips played notes at the execution line; arbitrary snapping or moving that line would change musical geometry.

This build uses the brief's explicitly permitted continuation alternative: it identifies partially visible top/bottom rounds from actual runtime round starts/ends, displayed playhead position, local field height and existing step/cell geometry. It adds a dashed continuation boundary and an explicit `Продолжение раунда N` / fragment notice outside the note grid. The notice reserves a constant small header height. It does **not** hide notes, remove score data, redraw a partial frame as complete, change time, grid scale or editor coordinates.

Round 23 is not assumed final. A synthetic 40-round fixture verifies that top continuation is 23 at the corresponding position, with a different current/bottom round. Start/middle/end and resize geometry are tested. HAPPY BIRTHDAY itself is not included in the supplied package or repository fixtures; its actual imported document and screenshot/DOMRects were unavailable. **R01 for the author's actual composition remains NOT TESTED**, not a claimed pass.

## Exact personal PNG

Asset: `MVP/main/assets/Play12_Rock_Daisy_Avatar.png` (1,122,670 bytes).
SHA256: `1344799d2275d18725ebd2e38b0af9c1afa5150eeff772214a3ebfb06f1a9ca3`.
Git blob: `9fdba50fe7ff2a1c917ebe8e0a8c5d796a989bbf`.
Bytes match both the supplied PNG and the same PNG inside the work-package ZIP. No generation, resampling or substitute image was used. CSS cover/centered cropping preserves the original file.

Because browser-local author user ID is unavailable to a deployment, no global avatar default or display-name-based identity guess was introduced. Use this one-time personal activation link in the author's browser:

https://play12.pro/ru/MVP/main/?avatar=rock-daisy-v144

It selects the PNG only for the current local profile if that profile has no previously saved avatar. It retains userId/name/activity/library, preserves any existing custom avatar, and removes the activation parameter from the URL after processing. Later ordinary Main visits restore the saved avatarId. Other users opening the ordinary URL retain their own avatar/default. No server accounts, sync or mass migration are added.

The personal image appears in the profile and once in the library heading, not in every row and not instead of train/edit/delete actions. Both use the required alt text. Profile rename and backup continue retaining the extra profile field. Existing greenhouse Soon behavior remains unchanged.

## Available checks

- `node --test MVP/tests/*.cjs`: **223 passed, 0 failed**.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s MVP/tests -p 'test*.py'`: **9 passed**.
- Changed JS, inline entry scripts and local dependency routes: PASS.
- PNG/package byte equality and SHA256/Git-blob verification: PASS.
- Z01 portal/idempotence/reused real keyboard: simulated-DOM PASS.
- Z02 original confirm handler applies once: production-handler execution PASS.
- Z03 Escape, inert restoration, original keyboard host/focus, reopening and Tab wrap: simulated-DOM PASS.
- Accessible MIDI selector previews without committing: PASS.
- Z04 visual viewport/internal scrolling: code contract only; browser NOT RUN.
- R02/R03 runtime-index continuation calculations: PASS; visual/editor hit-testing NOT RUN.
- A01/A02 static image wiring/CSS: code check; actual crop appearance NOT RUN.
- A03 profile persistence/stable identity/custom-avatar protection: executed data tests PASS.
- REG: full prior grid/Repeat/manual override/viewport/keyboard/Onboarding/EditingAdapter/MIDI/data suites remain green. No physical MIDI test is claimed.

The read-only DOM checker now also checks open zero-dialog body portal/viewport/focus and personal-image load status. Real DOMRects, native-dialog behavior on target Safari/Chrome, mouse/MIDI interaction and avatar mobile appearance require author acceptance after publication.

## Changed files

New `MVP/main/visual-adapter.js`, `visual-adapter.css`, PNG asset; `MVP/main/data.js` (explicit per-profile avatar choice), `MVP/main/main.js` (image wiring/continuation subscription), `MVP/renderer/playback.html` (modal adapter and confirm guard), `ru/MVP/main/index.html` (dependencies/cache versions), new `MVP/tests/test_main_v144.cjs`, extended read-only DOM checker and this report.

## Rollback

Keep `rollback-before-main-v144-20261114` at the baseline. Deploy with an expected-head lease and no force push. Revert via a new commit if needed. Deployment rollback does not delete browser-local avatar/profile or composition data. Canonical target: https://play12.pro/ru/MVP/main/ .
