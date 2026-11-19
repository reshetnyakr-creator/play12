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
