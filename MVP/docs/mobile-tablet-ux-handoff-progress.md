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
