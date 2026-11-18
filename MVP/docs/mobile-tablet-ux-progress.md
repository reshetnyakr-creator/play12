# Mobile/Tablet UX — implementation checkpoint

Base: 7d6eaf2dd6a57ade7d39b9a7a430192103c7b25b. Both rollback branches are unchanged. Feature branch only; not a production release.

First checkpoint adds a shared touch/screen/orientation policy, phone-landscape notice, common adaptive stylesheet, narrow navigation arrows, library/round controls layout, tablet-portrait keyboard fitting and text MusicXML/optional clipboard via the original file handler. No music/Fingering/MIDI algorithms or storage formats changed.

Fresh validation: 268 JS tests pass; 20 real Chromium Main cases across ten viewport/orientation configurations and RU/EN passed initial page/keyboard bounds and mode assertions. These are viewport emulations, not physical Safari testing.

Still pending: detailed panel interactions/Backup/clipboard negative cases; Spotlight coordinate/reveal/transition corrections; Tutorial stage-list scrolling and swipe demonstration; all-stage RU/EN courses; full visual baseline/round-count metrics and desktop regression; final publication checks. Do not merge this checkpoint into main as accepted.
