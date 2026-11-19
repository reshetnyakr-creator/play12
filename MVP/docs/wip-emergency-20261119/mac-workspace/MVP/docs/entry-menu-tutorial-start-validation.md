# Three-Button Entry Menu & Tutorial Start Fixes v1.0

Baseline: `b160656c86011ec7a2658b4101e5d823982b4392`.
New GitHub checkpoint: `rollback-before-entry-tutorial-start-20261116`, at the
same baseline SHA. The prior Tutorial alignment checkpoint is unchanged.

## Routes and changes

| Entry / action | Destination |
|---|---|
| Public RU primary CTA «Попробовать Play12» | `/ru/MVP/menu/` (formerly `/MVP/ru/`) |
| Public EN primary CTA «Try Play12» | `/MVP/menu/` (formerly `/MVP/`) |
| RU menu «Играть» / EN menu «Play» | Existing `/ru/MVP/main/` directly |
| RU menu «Обучение» | Existing `/MVP/ru/` |
| EN menu «Tutorial» | Existing `/MVP/` English Tutorial redirect |
| Settings | Native disabled button; accessible Coming soon / Скоро; no route |

Both menu pages contain exactly two button-styled links and one disabled button,
with no visible title, descriptions, extra actions or application JavaScript.
They reuse the existing Play12 button foundation, brand tokens and Inter font.
The menu cannot reset localStorage, IndexedDB, calibration or learning progress.
The two homepage changes are exactly the primary CTA href substitutions; their
analytics goals and existing handlers are retained.

Main currently exists in Russian. Both Play links use the explicitly approved
existing Main URL; no English Main, automatic locale setting or new Main route
was introduced. RU/EN menu and Tutorial localization follow their actual routes.

## Confirmed startup root cause

In the baseline, readSavedState restored e.g. TRY_IT_YOURSELF, while the visible
view intentionally remained WELCOME until the user chose Start or Continue.
The asynchronous connectRuntime() nevertheless mounted TrainingZones based on
state.onboardingStep. It mounted inside the hidden lesson view (0x0), observed
zero dimensions, classified Desktop as narrow, computed a zero field budget,
and detached its keyboard/navigation/warning dock into the visible document.

Actual Chromium baseline at 1440x900 with saved progress:
- visibleStep WELCOME, storedStep TRY_IT_YOURSELF;
- lesson and training-layout rectangles 0x0;
- dock 1440x275, visible false-height warning;
- keyboard about 394x180 rather than the working Desktop keyboard geometry.

This is an initialization/visibility mismatch, not insufficient viewport height
or a failure of the musical renderer. ResizeObserver and field-budget logic
were correctly reacting to the wrong, hidden container.

Fix: mount by visibleStep, not the stored lesson. No TrainingZones or detached
working dock is created on WELCOME. Continue still restores the same state and
Start still invokes the existing reset/start flow. If Continue is clicked before
the score promise resolves, mounting reapplies the lesson's existing control
visibility decisions and instruction, without exposing locked controls.
No CSS suppression of the warning and no change to TrainingZones are used.

The existing RU dictionary already contains both start strings. Baseline real
RU measurements showed «Начать заново» and «Продолжить с сохранёнными настройками»;
EN labels are expected on the English route. The update explicitly initializes
both start labels through the current i18n instance for new and saved sessions,
and the localized public CTAs now lead to their respective localized menus.
No global language setting or translation-table rewrite was made.

## Validation

- `node --test MVP/tests/*.cjs`: 242 passed, 0 failed, 0 skipped.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s MVP/tests -p 'test_*.py'`: 9 passed.
- Real Chromium, isolated local profiles, at 1440x900, 1280x800, 1024x768,
  390x844, 375x667: 10 menu variants and 20 RU/EN new/saved startup variants.
- Menu checks: exact three actions, equal sizes, keyboard focus, disabled
  Settings, direct URL/reload, CTA navigation, no document overflow.
- Startup checks: correct locale, no premature shell/dock/visible keyboard or
  false warning, no internal start-page overflow, unchanged saved state.
- Continue and Start work; Desktop returns to 88 keys without MIDI, Mobile keeps
  the existing composition range. Explicit held-score test clicks Continue
  before readiness and verifies Practice visible, locked BPM/RoundBoard hidden.
- Separate persisted-data scenario verifies stable userId, preserved active
  composition and revision, real note rendering after Play, and unchanged
  IndexedDB document after switching to Tutorial.
- Existing real-browser regression: 115 instruction/viewport states and 150
  live Spotlight target/mask rectangles, zero errors; Play/Pause, both zero
  cards, OK12, card verification, Practice/hands, all-six-step navigation/reload.
- Browser simulated MIDI regression: existing 61-key calibration, disconnect,
  same-input reconnect, different input, denied permission and no device.
  This does not constitute hardware MIDI testing.
- Working Tutorial snapshots: 29/30 pixel-identical after freezing CSS animation;
  the remaining difference is confined to a 230x2px title strip at 1280x800.
- Main snapshots: 4/5 pixel-identical; 1440x900 differs only in the pre-existing
  6x4px progress-marker region. Main, musical and working Tutorial layout,
  Coach, OK12, Grab/grid, MIDI and editor implementations were not changed.

Public CTAs were inspected on play12.pro before release and matched the old
RU/EN routes above. Public post-release route checks and the screenshot/measurement
bundle are reported with the final commit. Third-party requests are blocked in
homepage/menu browser acceptance; analytics delivery itself is not tested.
An initial public-page check was rejected by automatic review because it could
request Yandex analytics; subsequent public checks permit play12.pro only.

## Files / reproduction / limits

Product changes: root and RU index.html (CTA href only), two menu index pages,
MVP/menu/entry-menu.css, play12-onboarding.js (visible-view gate and labels),
playback.html and MVP/ru/index.html (cache versions only).
Regression changes: existing RU-route and Tutorial tests, test_entry_menu.cjs,
plus isolated browser entry/start, early-continue and storage scripts.

With the candidate served locally on port 8767 and Playwright installed:
```
node MVP/tests/browser/entry-start-browser.cjs
node MVP/tests/browser/early-continue.cjs
node MVP/tests/browser/storage.cjs
```
Set PLAYWRIGHT_MODULE if needed. Existing Tutorial browser scripts accept
PLAY12_TEST_BASE_URL and PLAY12_TEST_OUTPUT_DIR; use the candidate origin and a
separate evidence directory, then run check-tutorial-evidence.py there.
All state-seeding scripts reject non-local origins. Production user data was
never cleared for tests.

Physical MIDI, Safari/Firefox and subjective audible-output acceptance were not
performed. The author's exact CSS viewport cannot be inferred from a screenshot;
the five specified control sizes were measured directly.

Rollback: revert this release commit on main (`git revert <release SHA>`) and
publish normally. The named checkpoint preserves the exact pre-release tree.
