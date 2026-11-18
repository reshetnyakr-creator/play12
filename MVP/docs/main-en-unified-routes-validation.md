> Historical implementation report. Fresh release acceptance: [2026-11-18 report](tutorial-en-final-acceptance-20261118.md).

# Play12 — Main EN, Unified Routes, Grab, Round Markers & Count Localization v1.0

Date: 2026-11-16. Baseline/main rechecked before publishing: `e64afb5c4fa86c8ad8ed991386bb4b5b4eceddca`.
Rollback branch created before edits and verified: `rollback-before-main-en-routes-grab-20261116`, at that exact SHA. The release commit containing this report is the implementation commit; its full SHA is included in the delivery report/evidence archive.

## Approved clarification

The factual baseline Main cycle was 1/4, 1/8, 1/16, 1/32, displayed as ×1, ×2, ×4, ×8, with no ×3. The author explicitly chose to preserve this four-state Main model and omit ×3 after the discrepancy with the attached spec was raised. This decision supersedes the five-value sequence in the attachment. No triplet grid or new musical factor was introduced.

## Implementation

- One shared loader (`MVP/entry.js`) loads the same production Playback/TrainingShell for both Main locales and both Tutorial locales. Main logic remains in `MVP/main/main.js`; original layout CSS is unchanged.
- `MVP/ui-locale.js` supplies English Main and Import wording, including aria labels, empty states, editing, backup, errors, MIDI/calibration. English Tutorial remains the training-control vocabulary source. User names, titles, score contents and technical diagnostic data are not machine translated.
- `MVP/routes.js` centralizes same-page locale navigation and canonical paths. Explicit route locale takes precedence over a historical `lang` query. Paths with `index.html` are recognized too.
- Menu links are localized; language switching is separate from the existing three action buttons. Existing site CTAs already target the correct localized Menu and were retained. No public Main navigation link was added.
- Main locale switching retains the composition, mode, selected note, current position, Practice hands/mode, music/metronome settings, BPM, grid and stored round selection. Pending fingering changes are saved with the existing revision guard before navigating; a saving/conflict failure prevents navigation. It does not overwrite a newer revision. Playback itself does not auto-start across navigation.
- Import remains a file-loading page; both locales use the exact existing importer, worker, fingering engine, MXL reader and shared store. Existing technical resources at `/MVP/editor/*.js` remain available. No standalone Editor was created; editing stays inside Main. A pending import and source-fingering choice survive locale changes using a temporary session draft. Storage failure stops that navigation with a message.
- Main and Tutorial use the same actual four-state grid controller. `cellHeight / stepQuarters` measured in Chromium gives relative factors **1, 2, 4, 8**, then 1. Default is 1/4 (×1). Only allowed values are persisted, per composition/Tutorial, in the additive display preference `play12.display-grid.v1:*`. Existing timing, tempo, note pitches, durations and musical algorithms were not changed.
- Shared renderer markers now use the original left gutter X and each round's actual upper-boundary Y (`data-round-left-x`, `data-round-top-y`). Tutorial's marker layer uses the same coordinates after rerendering. Success conditions are untouched. The removed Tutorial right progress rail stays absent. The existing two-pass indicator stays intact.
- Visible count labels are RU **РАЗ / ДВА / ТРИ / ЧЕ**, EN **ONE / TWO / THREE / FOUR**; offbeat labels are И / AND. Audio and metronome behavior were not altered.
- No IndexedDB schema or existing storage key migration/deletion. Stable user ID and existing display names remain unchanged. Only a newly created English profile defaults to “Musician”. Existing local records continue to load in either locale.

## Routes — real browser results

All links below use `https://play12.pro`. All eight canonical routes passed local actual-Chromium loading, locale, resource, language-link and geometry checks. The post-publication check is recorded separately in the acceptance archive.

| Page | English | Russian | Result |
|---|---|---|---|
| Menu | `/MVP/menu/` | `/ru/MVP/menu/` | Correct three actions, same-page RU/EN |
| Tutorial | `/MVP/tutorial/` | `/ru/MVP/tutorial/` | Same lesson/engine, six-step courses completed |
| Main | `/MVP/main/` | `/ru/MVP/main/` | Shared library, profile, editor and training |
| Import | `/MVP/import/` | `/ru/MVP/import/` | Actual localized file-loading UI, XML/MXL → Main |

| Historical path | Direct destination | Browser result |
|---|---|---|
| `/MVP/` | `/MVP/tutorial/` | query and fragment retained |
| `/MVP/ru/` | `/ru/MVP/tutorial/` | query and fragment retained |
| `/MVP/editor/` | `/MVP/import/` | query and fragment retained |
| `/ru/MVP/editor/` | `/ru/MVP/import/` | query and fragment retained |

Old Editor entry files were audited before converting them: they were Import/redirect entry points, not an independent editing application. Only those HTML entries redirect; technical editor modules are not redirected. Static redirects use `location.replace`, without intermediate locale chains. Canonical/noindex metadata is included in the loaded pages. No MVP sitemap was present to migrate.

## Checks actually run

| Check | Result |
|---|---|
| Complete JavaScript unit/regression suite | **261 pass, 0 fail**; includes 8 new route/locale/state contracts |
| Existing Python validation suite | **9 pass, 0 fail** |
| JavaScript syntax | All MVP JS/CJS files checked with Node |
| Canonical route matrix | **40 cases**: 8 routes × 1440×900, 1280×800, 1024×768, 390×844, 375×667; no horizontal overflow, correct language, no JS errors or same-origin 404 |
| Legacy aliases + navigation | Four redirects retain query/hash; native Menu → Main and browser Back/Forward work |
| Tutorial localized six-step geometry | **60 cases**: 6 stages × 5 sizes × RU/EN; no page overflow, correct labels/round coordinates |
| Tutorial complete course | **4 complete courses**, RU/EN desktop and narrow; native controls and production NoteOn/Off acceptance path; five-note task and two full passes 2–4 completed |
| Coach Spotlight | **270 instructional cases / 320 target boxes**, RU/EN; bounding boxes/masks/visible controls validated, 0 failures |
| Grab | Actual Main and Tutorial ratios 1/2/4/8 verified, wrap, locale change and reload persistence verified |
| Main editor workflow | Real XML import → engine → save → EN Main → pencil → finger edit → Undo/Redo → dirty locale change → RU Main → EN reload; saved fingering and identity preserved |
| Import | Real compressed MXL, XML, pending-file locale switch, source choice, deduplication and English invalid-MXL error/no write |
| Main library and data | Hover does not load; title click activates; native backup download, named deletion of only one record, native restore, identity/other document retained |
| Main round settings | Manual range, Repeat and Pre-count retained across RU/EN switching |
| Round negative/continuation protocol | First full pass survives Pause/reload; wrong note on second pass is not credited; restart + second full correct pass succeeds; grid rerender retains left/top markers |
| Metronome negative protocol | Four notes do not suffice; wrong note, Pause and Restart reset streak; autoplay is ignored; five real accepted actions succeed, in RU/EN |
| MIDI browser mock | Existing calibration UI verifies MIDI 36–96 → 61 keys; RU/EN restore retains exact calibration; disconnect→88 fallback, reconnect→61; permission-denied EN state is honest |
| RU baseline geometry | Matched baseline/candidate browser DOM rects at **1920,1440,1280,1024,375**: original field, Playback, BPM, zero, Practice, RoundBoard, profile, library and Skill Bank unchanged within 0.15 px |
| RU baseline pixels | No differences outside intentional note viewport changes above 4/255 channel tolerance. At 1920 only 9 compositor pixels differ outside it, maximum 4/255; other four widths have zero outside differences |

Screenshots and raw measurements are delivered in the acceptance archive, grouped by routes, stages, courses, workspace, geometry, import, MIDI and protocols. The geometry archive contains paired baseline/candidate screenshots. Browser assertions compare actual SVG transforms against upper round boundaries, including after Grab rerender; they do not assume text labels imply correct position.

The ambiguous bundled beginner XML is correctly rejected by the unchanged Import hand-detection rules; positive import tests use a valid two-staff G/F piano fixture. This is an existing importer limitation, not a newly added inference or changed fingering rule.

## Scope/limitations

Actual browser acceptance used **headless Chromium**, not a simulated DOM. Test contexts were isolated and third-party requests blocked; no real user's browser data was accessed. Hardware MIDI, Safari, Firefox and physical touch devices were **not tested**. Browser MIDI mock proves integration/state handling, not hardware latency or device-driver compatibility. No mobile redesign is claimed. Narrow layouts were checked for regressions using Chromium viewport emulation. Rare unmapped Russian technical errors get a safe English user-facing fallback; raw structured technical diagnostics remain untranslated.

## Reproduce

From repository root: `node --test MVP/tests/test_*.cjs`, `python3 -B MVP/tests/test_validate_play12.py`.
Serve the candidate on an isolated local origin. Browser scripts are under `MVP/tests/browser/`; set `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_BROWSERS_PATH`, `PLAY12_TEST_BASE_URL` and `PLAY12_TEST_OUTPUT_DIR`. The baseline comparison additionally serves the baseline snapshot on `PLAY12_BASELINE_URL` (default localhost:8769), then runs `compare-main-pixels.py OUTPUT_DIR` (Pillow).
The course scripts use original production NoteOn/Off hooks as synthetic input; they never dispatch fabricated lesson-success events. Spotlight matrix scripts seed a lesson screen only for geometry inspection; the four sequential courses independently verify the real lesson order.
