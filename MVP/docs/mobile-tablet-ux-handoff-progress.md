# Mobile and tablet acceptance progress

Application checkpoint: 2f018e99bc2af8c89eef28eb3aa3acd9b1844ee4, recovered from 562ace82e3d52ce779d81eccad65d4cb3913ece6. Main and mobile rollback were verified at 7d6eaf2dd6a57ade7d39b9a7a430192103c7b25b. The earlier rollback was verified at e64afb5c4fa86c8ad8ed991386bb4b5b4eceddca.

| Scope | Status |
| --- | --- |
| Orientation, common layout and navigation | Implemented. Final viewport and gesture acceptance pending. |
| Music, library, Backup and Rounds | Implemented. Historical Chromium evidence exists. Final check pending. |
| Clipboard and existing file import | Implemented. Historical evidence covers both locales, denied clipboard and oversized input. Final check pending. |
| Tutorial Spotlight | Fixed the timer to start after reveal and placement. Visual and complete course acceptance pending. |
| Tutorial dialogs, stage scroll and panel animation | Implemented. Final visual acceptance pending. |
| State and routes | Historical evidence covers selected settings. Final routes and Tutorial persistence pending. |
| Release | Pending acceptance. |

Historical runs are in acceptance-mobile-20261119 and apply to the earlier recorded state. Next run fresh unit and Chromium checks on the recovered implementation. Physical iOS Safari and hardware MIDI require devices.

## Fresh checks and interruption

- `node --test MVP/tests/*.cjs` passed 273 of 273 against application checkpoint 2f018e99.
- `python MVP/tests/test_validate_play12.py` passed 9 of 9.
- Chromium 156.0.8078.79 failed before navigation with `process_singleton_posix.cc:297: socket() failed: Operation not permitted`. The managed preview fallback rejected the checkout because it has no dev script or static hosting manifest.
- No new browser screenshots or acceptance metrics were produced. Full RU/EN Tutorial, Spotlight, navigation, Backup and import browser acceptance remains open. Production was not updated or checked as a release.
- On real iPhone/iPad Safari, verify Spotlight after changing panels, showing or hiding browser chrome, and rotating. Check Confirm 0, all six stages, native swipe, Backup, paste and file import in RU and EN. Verify physical MIDI separately.

## Cloud Browser follow-up on b76b907

The managed static preview works using an untracked scratch directory with `git archive` output under `site/` and a scratch-only `.openai/hosting.json` containing `{"static":{"directory":"site"}}`. Run `sites-preview start <scratch-directory>` and open its exact loopback URL in Cloud Browser. No production configuration is involved.

Initial Chromium results: clipboard 2 cases, file transport 4 cases, security 1 case passed. Concurrent tabs shared same-origin storage, so Workspace, persistence and Spotlight failures from that run must be reproduced serially. The course runner waits for a real Play click in its iframe. Full acceptance remains open.

### Serial browser evidence

- EN Tutorial, 390×844 phone policy: passed all six stages after clearing disposable preview storage. Real Play clicks were used for Listen and Practice. The runner used the original pointer and note-input paths for subsequent musical actions. Completed flag true, two round passes, horizontal overflow 0. The final tutorial screen had one fully visible round; this is not a normal Main score-height measurement.
- Spotlight, EN 375×667, Left Hand: passed targeted serial retest. Target x=128.75, y=380, w=50.5, h=32; spotlight hole x=125.75, y=377, w=56.5, h=38. Card bottom was 292.19. The initial parallel-run failure was not reproduced.
- Independent instructions are in mobile-tablet-browser-acceptance.md.

- RU Tutorial, 390×844 phone policy: passed all six stages, including two round passes. The first Practice click did not start playback in the runner; the subsequent visible Play click started it and showed OK12.
- Workspace serial rerun passed library 0/1/13, Backup via existing handler, delete/cancel, edit Undo/Redo and the full Grab cycle. Phone English UI also exposed Download and Restore Backup. Arrow/tab sequence verified Music → My melodies → Music → Rounds.
- Persistence serial rerun passed across locale, rotation and reload.
- Main passed 20 viewport/locale geometry checks. See acceptance-mobile-20261119/cloud-main-matrix.json. The 375×667 RU case displayed one full round, compared with two in EN. One test score at 390×844 and 430×932 displayed three in both languages.

### Shared page layout follow-up

Application checkpoint `90c7990757888a36e5c8b796c6ba76a8dcbe667e` corrects the invalid tablet media query, brings the shared responsive sheet to the remaining public headers, and sizes tablet hero CTAs from their content. Browser remeasurement at 768×1024 and 1024×768 on both locales confirmed common headers on Home, Manual, Manifesto and Import: 81 px total height, 56 px logo link, all seven nav links in one row, zero page overflow. Home CTA widths are 194 px EN and 254 px RU. Import file CTA widths are 292 px EN and 325 px RU. Before, at 768×1024 the respective Home and Import CTAs were 709 px and 650 px, and headers were 165 px tall.

Baseline Cloud Browser navigation check opened Home, Manual, Manifesto, Menu, Main, Tutorial and Import in both locales. Both old Editor URLs redirected to the respective Import. Initial full Spotlight sweep measured nine EN 375×667 targets successfully. It stalled loading the next fixture when other tabs were active; a separate EN 375×667 round-go4 rerun passed. Desktop EN first full course timed out waiting for metronome-on while the application reported metronome-tempo. A foreground rerun was started. Full post-change acceptance and native device checks remain open.

- Desktop EN and RU at 1366×768 passed all six stages on the foreground reruns, each with two complete round passes. Earlier Desktop EN timed out at BPM while interacting with other preview tabs. An initial Desktop RU run lost its iframe runtime while preview files were being updated. Neither failure recurred when the tab stayed in the foreground and the served tree stayed fixed.
- Browser runner checkpoint `f68af6a4c3519ccd8fb8c96e400af5976524dde3` adds 768×1024 and 1024×768 device-policy presets to the complete course runner. It changes only QA fixtures; application checkpoint remains `90c7990`.

- Tablet EN 768×1024 portrait and RU 1024×768 landscape completed all six stages, with two round passes each. There are six completed courses total across phone, tablet and Desktop. The other tablet locale/orientation combinations remain separate checks.
- Captured Cloud Browser screenshots of [Desktop RU completion](acceptance-mobile-20261119/cloud-desktop-ru-complete.jpg), [Tablet EN completion](acceptance-mobile-20261119/cloud-tablet-en-complete.jpg) and [Tablet RU completion](acceptance-mobile-20261119/cloud-tablet-ru-complete.jpg).
- On the fixed preview tree, the foreground Spotlight sweep passed geometry for the first 16 EN 375×667 targets. The final instruction timed out waiting for the rendered spotlight in the long sweep and passed immediately in a filtered standalone rerun. Further device and locale target sweeps are required; these are production component geometry checks driven by fixture states.

### Spotlight timing follow-up

- Before fixing timing, Desktop 1366×768 passed 34 target/locale geometry cases and landscape tablet RU 1024×768 passed all 17. Phone RU 375×667 and portrait tablet EN 768×1024 each passed the first 16 and timed out on the final instruction. Standalone retries reproduced both delays. An instrumented test showed roughly one frame per second during docking/reveal and the existing six-second card timer started before reveal. The browser does not expose the requested visible-tab capability.
- Application checkpoint `8600b8be681fa03ef8df4e2dcc2cea84807ad527` starts the timed Tutorial card's six seconds when the mask is visible and layout has settled. Existing lesson transitions and musical input remain the same. Unit checks passed 274/274, including a regression test for a single reveal callback after stabilization.
- On the fixed application, standalone final-instruction checks for RU phone 375×667 and EN portrait tablet 768×1024 passed bounds, matching holes, and no card overlap. Harness checkpoint `473dd3c` allows 6.5 seconds for cloud geometry settlement. Final-device acceptance remains open.

## Cloud Browser acceptance summary

Application checkpoint `8600b8be681fa03ef8df4e2dcc2cea84807ad527`, served in the managed static preview. Production release status: NOT PUBLISHED.

| Check | Observed result |
| --- | --- |
| Main RU/EN | 20/20 on the final application across 10 viewports. All have zero page overflow. At 375×667, the sample has 2 full rounds EN and 1 RU. [Matrix](acceptance-mobile-20261119/cloud-main-matrix.json) |
| Spotlight geometry | 136/136 fixture cases on the final application. 34 phone at 375×667, 68 tablet at 768×1024 and 1024×768, 34 Desktop at 1366×768. Both languages. These cover the 17 Practice-through-finale fixtures per device configuration. [Phone](acceptance-mobile-20261119/cloud-phone-spotlights.json), [Tablet](acceptance-mobile-20261119/cloud-tablet-spotlights.json), [Desktop](acceptance-mobile-20261119/cloud-desktop-spotlights.json) |
| Six-stage Tutorial | Six completed runs with two round passes each on the recorded checkpoints: Phone and Desktop both locales, tablet EN portrait and RU landscape. The full portrait tablet EN course passed again after the timer change. [Course results and checkpoints](acceptance-mobile-20261119/cloud-courses.json), [post-fix screenshot](acceptance-mobile-20261119/cloud-tablet-en-after-spotlight-fix.jpg) |
| Shared headers and CTA | Verified Home, Manual, Manifesto and Import in both locales at two tablet viewports after the CSS correction. |
| Navigation | Phone arrows and tab selection passed. Canonical routes and all four legacy redirects passed, including query and fragment preservation. |
| My melodies, Backup, edit, persistence | Serial Chrome runner passed 0/1/13, Backup export and restore via the production handler, named delete/cancel, Undo/Redo, Grab ×1/2/4/8, and RU/EN, orientation and reload persistence for Main. |
| MusicXML | 2 clipboard cases, 4 file transport cases and 1 denial, size and escaped-text case passed. File/Backup restore used File and DataTransfer, so the OS chooser remains a separate check. |
| MIDI | Mock calibrated range, disconnect and reconnect passed on the final application. Requires real hardware for physical MIDI acceptance. |

Remaining before release: hands-on Safari on iPhone/iPad, physical touch and MIDI, real file/backup picker, independent visual review of the early Tutorial spotlights and dialogs, Tutorial session reload and language switching, and full course reruns for the remaining locale/orientation combinations on the final application. Cloud Browser uses fixture viewport and pointer inputs; middle/late Spotlight fixture results verify geometry, not physical touch or Safari rendering. See the [independent acceptance procedure](mobile-tablet-browser-acceptance.md). No production deploy was attempted.

## Follow-up after 440fd8f

- `0c77b9e`: observe control and status row size changes that affect the training height budget. The browser control test failed on the baseline (status did not recalculate the score) and passed with the fix. RU 375×667 recovered to a 293 px score, two complete rounds and 32 px note cells. The test is available at `mobile-acceptance.html?scope=rebound`.
- RU portrait tablet 768×1024 completed all six Tutorial stages with two round passes on the layout checkpoint. [Browser result](acceptance-mobile-20261119/checkpoint-next-course-ru-768.json).
- `ee14999`: isolated visual QA found the Confirm 0 overlay hole measuring its own dialog before it was repositioned. Measure internal targets after final position. In RU 375×667 the confirmed button was at (63, 222.70), 249×54 and the mask at (60, 219.70), 255×60. Both buttons were stacked and contained.
- The isolated 375×667 RU session verified early Play, Pause and Choose 0 spotlights. The switch to Rounds called native smooth scroll with target 702 px and settled to the Rounds panel. The [Choose 0 capture](acceptance-mobile-20261119/checkpoint-next-visual-choose-0.jpg) shows the active tab and the first-swipe hint. Tutorial reload retained step 3 and the Practice enable state before resuming. Full course rerun and Desktop/EN follow-up are in progress.
- JavaScript: 275/275 after the two fixes.

- On application checkpoint `ee14999`, the complete 375×667 RU visual course and 1024×768 EN landscape tablet course passed with two loop passes each. The first verifies early Spotlight and Confirm 0 geometry, smooth panel movement and step 3 reload. [Phone protocol](acceptance-mobile-20261119/checkpoint-next-visual-course.json), [landscape EN protocol](acceptance-mobile-20261119/checkpoint-next-course-en-1024.json).
- The visual fixture is reproducible in the browser test runner with `scope=course&width=375&lang=ru&visual=1`. See the [owner acceptance checklist](mobile-tablet-browser-acceptance.md).

- The 768×1024 RU tablet and 1366×768 EN Desktop full Tutorial runs also passed on `ee14999`. Both reached completion with two loop passes. [RU tablet](acceptance-mobile-20261119/checkpoint-next-course-ru-768-final.json), [Desktop EN](acceptance-mobile-20261119/checkpoint-next-course-en-1366.json).

- Targeted final Main regression passed all four cases. RU/EN at 375×667 both settled to a 293 px field and two full rounds. RU/EN at 1366×768 retained two full rounds and the three-column layout. All four had zero page overflow. [Measurement](acceptance-mobile-20261119/checkpoint-next-main-regression.json), [RU phone capture](acceptance-mobile-20261119/checkpoint-next-main-ru-375.jpg).
- Full 390×844 Phone EN passed after verifying the native Play actions actually started playback. The initial harness timeout is retained with the results. Switching EN → RU after passing preserved `ONBOARDING_COMPLETE`. [Phone EN protocol](acceptance-mobile-20261119/checkpoint-next-course-en-390.json), [locale resume protocol](acceptance-mobile-20261119/checkpoint-next-tutorial-locale.json).
