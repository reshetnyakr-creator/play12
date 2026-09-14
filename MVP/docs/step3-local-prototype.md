# Step 3 — local Practice prototype

Local only; no push or deployment. Based on `ae9c35328126ba63f9d5156ad1a6c3a3bc3eef87`, which adds the separate JSON contract work after the approved Product commit `74758a91483f91e58c191161e750ba82d9c7af26`. Local checkpoint: `codex/step3-local-checkpoint-ae9c353`. Branch: `codex/step3-practice-local`.

Local review URL: http://127.0.0.1:8786/MVP/renderer/playback.html?midi=1

## Behavior

After zero confirmation, Step 2 completes and `TRY_IT_YOURSELF` becomes active. Playback returns to the beginning without starting. The existing zero annotation finishes its seven seconds before the guide appears. Practice defaults OFF, both hands ON. The guide advances only after the control changes: Practice ON → Left OFF / Right ON → explanation of waiting → existing Play button. Step 4 never starts. A neutral completion message appears after a Practice pass and clears on replay.

Practice Board contains four controls: Practice Mode, independent Left Hand and Right Hand, and disabled One Skill. Turning off the last active hand is rejected with a small movement, without a modal. Changing zero remains available in Step 3 and pauses Practice while choosing.

Settings live in the existing `play12.onboarding.state.v1` object: `practiceModeEnabled`, `practiceLeftHandEnabled`, `practiceRightHandEnabled`, `oneSkillMode: false`, `activeSkillId: null`. `practiceGuideStage` separately tracks enable / hand / ready / playing / complete. Continue restores settings; Start resets them so old settings cannot skip the tutorial. No new storage keys or skill IDs.

## Gate and robot hand

The existing playback controller and AudioContext clock are reused. Renderer events already contain hand metadata; user-selected hands form expected onset groups. The clock ceiling stops progression at the next expected onset. Input pitches must cover the complete expected pitch set. Wrong notes do not release the ceiling. There are no simultaneous RH notes in the approved manual Saints, but the existing full-set semantics remain for both hands.

Mouse and MIDI Note On share `handleNoteOn` / `acceptPracticeInput`. Effective pitches are `sourceMidi + runtimeZero - referenceZero`; changing zero clears stale partial pitch matches. Existing 150 ms early acceptance remains; there is no duration gate or scoring UI. Earlier inputs outside this window need another Note On.

System scheduling excludes active user hands. Inactive hands play automatically, including at a shared user boundary. At a gate the shared timeline pauses; robot notes at that boundary may finish sounding while waiting. Future robot onsets wait for progression. Robot notes already sustaining into a gate can be re-articulated when the gate is entered or resumed, because the existing audio engine stops scheduled voices at the boundary. This prototype does not evaluate duration.

Pause retains the expected group and partial matches, and ignores gate input while paused. Resume restores the same target. Restart clears event completion but retains Practice and hand settings. Practice OFF clears the ceiling and resumes if it had been waiting, but preserves a deliberate Pause.

## Geometry: implementation versus verification

Practice Board uses the same `--mvp-playback-board-height` (42px), surface gradient, border, highlight, shadow, and rounded shape as the existing boards. Its width is intrinsic to the four controls. Fixed bottom positioning matches the existing boards and does not change Piano View or Note Field size. The right inset comes from the measured Piano View right edge on the existing resize path.

Rendered dimensions, edge equality, board overlap, desktop appearance, and reduced-width appearance have NOT been verified. Browser access to the local URL was blocked twice because its administrative policy check was unavailable. No screenshots were captured. No alternate browser or security bypass was used.

The existing approximately 1100px minimum piano width is retained. At narrow widths, the new board follows the same off-screen right piano edge and may become partially clipped or compete with Playback. A possible minimal follow-up, if confirmed visually, is to clamp only the board to the viewport and move it to a separate row at the collision breakpoint. That would relax exact edge/row alignment on narrow windows and has not been applied without visual evidence.

## Validation

`node --test MVP/tests/test_practice_step3.cjs`: 15 passing tests using the production controllers in a deterministic VM with fake DOM/audio objects. Covers transition and guide sequence, default settings, persistence, RH/LH/both filtering, robot scheduling, wrong/correct mouse-source input, MIDI Note On/Off message parsing, transposed zero, full-set matching, last-hand guard, Pause/Resume, Restart, Practice OFF, and replay after natural end.

`python3 -m unittest discover -s MVP/tests -p 'test_*.py'`: 9 existing tests pass. JavaScript syntax and `git diff --check` pass.

Demo: controller-level mouse input passed; actual pointer interaction with the rendered piano and audible playback were not tested. MIDI: message-level simulation passed; no physical controller tested. Actual browser storage persistence was not tested; serialization/restoration passed with an in-memory storage adapter. Visual screenshots and responsive checks remain blocked.

The approved composition JSON, converter/tools/contract, Piano View implementation, SVG assets, Note Field renderer, repetition ribbons, and Web MIDI implementation are unchanged.
