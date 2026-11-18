# Mobile/Tablet UX — interrupted implementation, 2026-11-18

Status: NOT ACCEPTED / NOT PUBLISHED. Production main must stay at 7d6eaf2dd6a57ade7d39b9a7a430192103c7b25b until full acceptance. Both rollback branches must remain unchanged.

## Durable implementation

First application checkpoint: 85ac58dab6148255b67112fc10dd646260324548 on feature/mobile-tablet-ux-tutorial-20261118. It contains the responsive policy/module/stylesheet, basic portrait navigation arrows, library/round sizing, tablet keyboard fitting and MusicXML text/Clipboard through the original file handler. This is partial work, not a completed release. The branch has not been merged into main.

## Fresh observed results

- At the first checkpoint, 268 JS tests passed.
- A fresh real headless Chromium matrix passed 20 Main cases: RU/EN at 375x667,390x844,430x932,844x390,768x1024,820x1180,1024x768,1180x820,1366x768,1920x1080, using touch/mobile emulation for phones/tablets. Verified initial mode/rotation/three-column decisions and page/keyboard bounds. This was not physical Safari acceptance and did not certify all interactions.
- Subsequent local fixes corrected stylesheet specificity (later TrainingShell styles had overridden the new navigation), preserved the logo's square transparent asset without stretching, and compacted the narrow title/header. The repeated 20-case Main matrix passed. Screenshots showed the intended dark navigation and orange underline.
- Subsequent local Spotlight work converted target bounds to the overlay's actual bounding rectangle; added transition-aware reveal, smooth instructional navigation/hint and active-step list scrolling. Updated mock DOM fixtures and a shifted-overlay regression. 269 JS tests passed after these edits.
- A fresh real Chromium Clipboard test passed both locales: denied Clipboard API leaves manual input usable, invalid XML is rejected, pending textarea survives a language switch, valid MusicXML uses the original handler/engine and saves to Main. No alternate parser or musical algorithm was introduced.
- The latest attempted shell command (phone keyboard height/extra score-view scrolling experiment and another unit run) failed before process creation with exec-server transport disconnected. Do NOT assume that command's proposed changes were applied or tested.

## Unsaved local work and recovery

The executor and Node transport closed; platform marked the environment unavailable. Latest local changes AFTER 85ac58d were NOT exported to GitHub before interruption. Their survival is unconfirmed. Do not confuse the first checkpoint code with the subsequent tested local code described above. On recovery inspect work/mobile-tablet-ux and compare to the branch before doing anything else.

Local files involved after the first checkpoint: MVP/mobile-tablet.css (specificity/header/title corrections), MVP/renderer/training-zones.js (transition/hint state), MVP/renderer/tutorial-layout.js (step observer and transition-aware reveal), MVP/renderer/play12-coach.js (overlay-relative coordinates and deferred visibility), MVP/tests/test_coach_spotlight.cjs (correct viewport fixture + shifted-overlay test), MVP/editor/import.js (pending clipboard text in existing locale draft), MVP/tests/browser/clipboard-import.cjs (new browser regression). These are described by exact patch operations in the conversation history. Do not overwrite surviving files with the first checkpoint.

Local evidence: /tmp/play12-mobile-matrix/matrix.json and PNGs; /tmp/play12-clipboard-import/clipboard.json; /tmp/play12-mobile-unit.log. Availability now unconfirmed. No screenshots have been delivered as persistent artifacts yet.

## Remaining mandatory work

1. Recover/preserve the post-checkpoint changes and rerun appropriate tests.
2. Verify arrows, swipe synchronization, Backup, library 0/1/many, Rounds controls, tablet rotation and clipboard limits/security/locale preservation in detail.
3. Finish and validate Spotlight/transition/step-scroll behavior on every Tutorial target, both full RU/EN courses and desktop geometry regression.
4. Count actual fully visible rounds, not only page-error absence. The observed short-phone screenshot still showed fewer than two complete rounds; no claim of achieving this target has been made. A safe view-only scrolling fallback or further layout correction must be designed/tested without altering transport semantics.
5. Validate landing/Import headers and tablet CTA sizes, all nine specified viewports plus phone landscape, before/after screenshots, device/viewport distinction and real Safari manual checklist.
6. Run all available tests and only then merge/deploy, verify real production routes and preserve both rollback branches.

No physical iPhone/iPad Safari or hardware MIDI tests were performed. User publication authorization is already granted and does not need to be requested again; the blocker is unavailable execution plus incomplete acceptance, not permission.
