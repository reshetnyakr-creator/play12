> Superseded by [fresh final acceptance on 2026-11-18](tutorial-en-final-acceptance-20261118.md). The content below is the historical interrupted recovery status, not the current acceptance result.

# Recovery checkpoint — 2026-11-17

**Release status: NOT ACCEPTED / NOT PUBLISHED.** This status supersedes any acceptance wording in `main-en-unified-routes-validation.md`, which was recovered from the earlier interrupted working copy. That document describes the implementation and earlier measurements; it is not evidence that this recovery has completed release acceptance.

## Durable source and lineage

- Original/current production main: `e64afb5c4fa86c8ad8ed991386bb4b5b4eceddca`.
- Existing rollback: `rollback-before-main-en-routes-grab-20261116`, unchanged at the original SHA.
- Preserved implementation commit: `d080aa37be1a4f7ff4c105f7e57d06d27f554bb9`.
- Recovery branch: `recovery-main-en-routes-grab-20261117`.
- Working copy survived; implementation was recovered, not rebuilt. All locally present baseline snapshot blobs were compared with the GitHub baseline Git blob hashes: no mismatches. Unmaterialized unrelated baseline assets were retained through the original base tree, not deleted.
- The checkpoint contains 55 changed/new files. It preserves the shared EN Main/Import implementation, canonical RU/EN routes, state-preserving locale switches, left/top round marker placement, RU count РАЗ/ДВА/ТРИ/ЧЕ, and the author's actual four-state Grab cycle ×1 → ×2 → ×4 → ×8. No ×3 was introduced. Main editing remains in Main; Import is a file-loading page.

## Fresh checks completed after restoring the executor

The earlier lost-environment test results were NOT reused as recovery acceptance.

- JavaScript suite rerun: **261 pass, 0 fail**.
- Python validation rerun: **9 pass, 0 fail**.
- All canonical routes: **40 fresh Chromium cases**, correct locale, no horizontal overflow or same-origin 404 / page errors.
- Tutorial stage geometry: **60 fresh Chromium cases** (RU/EN, six stages, five widths).
- Main workspace: fresh real XML import, original worker, save, finger edit, Undo/Redo, dirty EN→RU save and EN reload passed.
- Compressed MXL/invalid MXL, pending import/source-choice locale switch and deduplication passed.
- Main library hover/title selection, native backup/delete confirmation/restore, identity preservation and manual Repeat/Pre-count cross-locale state passed.
- Main/Tutorial actual Grab ratios 1/2/4/8, wrapping, locale switch and reload passed.
- Wrong-second-pass rejection, persisted first pass after reload, second full pass and marker position after rerender passed.
- Five-note metronome negative protocol (wrong note, pause, restart, autoplay rejection) passed.
- MIDI mock: 61-key calibration, cross-locale restore, disconnect/reconnect and permission-denied status passed. No hardware MIDI test.
- Spotlight geometry validators: **270 fresh cases / 320 target boxes**, 0 failures.
- Two complete fresh sequential Tutorial courses confirmed: **RU desktop and RU narrow**, both completed through original input acceptance and two passes 2–4.
- Fresh EN desktop course reached the later round exercises before loss of access; its final completion and the EN narrow course are **not confirmed**.
- Fresh RU baseline layout comparison at 1920/1440/1280/1024/375 passed DOM-rectangle assertions for field, Playback, controls, library/profile/Skill Bank.
- RU and EN Main field/Playback/keyboard rectangles matched at 1440/1280/1024/390/375 in the fresh route matrix.

### Browser transport distinction

The shell sandbox initially forbade listening sockets. The first fresh matrix/protocol/course runs used real Chromium with unchanged repository files supplied by Playwright route.fulfill (no mocked application APIs; MIDI alone explicitly mocked). The existing real production input hooks were used for synthetic notes, not fabricated lesson-success events.

A separate available Node execution channel then successfully started ordinary local HTTP servers on 8769/8770 and connected real Chromium to the public existing RU Main (HTTP 200). The HTTP matrix/protocol rerun passed routes, stages, import, MIDI, library, Grab, negative round and metronome protocols, baseline geometry, and both later Spotlight matrices before the executor disconnected again. Its last early-Spotlight jobs were not confirmed after disconnection. Earlier fresh route.fulfill Spotlight validators did confirm all 270 cases.

### Unresolved pixel diagnostic

The strict HTTP screenshot comparison returned nonzero because **three pixels** outside the intentionally changed note viewport differed by 5–7/255 at 1024px, at coordinates (354,503), (436,503), (472,503), on control-text edges. DOM rectangle checks passed. At 1440px only nine pixels differed outside the viewport, all ≤4/255; other widths had zero outside differences.

This may be compositor/font antialiasing, but it is not signed off. Do not silently describe this strict pixel test as passing. Confirm with deterministic capture/inspection and document the result. No production UI geometry should be changed just to satisfy an unexplained screenshot difference. The committed comparison threshold remains 4/255.

## Technical interruption and remaining work

The executor and Node tool transport closed during final verification; platform status became unavailable. Sources are now durable in GitHub, unlike the previous interruption. No main/rollback update and no deployment occurred.

1. Check out the recovery branch/commit, not the baseline alone; retain the original rollback.
2. Inspect any surviving local additions: optional `MVP/tests/browser/local-file-transport.cjs` was created after the implementation checkpoint and is not part of that commit. Ordinary HTTP testing does not need it.
3. Rerun/confirm the full EN desktop and EN narrow sequential courses; confirm outstanding HTTP Spotlight work and resolve the strict pixel diagnostic.
4. Rerun appropriate final suites if code changes.
5. Update the validation report to reflect only confirmed fresh acceptance, create a final release commit, fast-forward main with an expected-head lease, and wait for Pages deployment.
6. Run `published-routes-smoke.cjs` against play12.pro (block third parties), verify all eight canonical and four historical routes/query/hash, and run the public workspace smoke where available.
7. Persist the new screenshots/measurements/report. Local evidence directories were `/tmp/play12-main-en/recovery` and `/tmp/play12-main-en/recovery-http`; their survival is currently unconfirmed. Do not claim their screenshots are delivered.

Hardware MIDI, Safari, Firefox and physical touch devices remain untested. Publication authorization is already granted; do not request it again.

