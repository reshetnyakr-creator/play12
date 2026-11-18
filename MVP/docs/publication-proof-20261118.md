# Published acceptance — 2026-11-18

Published main SHA: `7d6eaf2dd6a57ade7d39b9a7a430192103c7b25b`.
Starting recovery: `1c89490e383e8b7bd4853a2359a0f5cb8bf05e09`.
Original rollback `rollback-before-main-en-routes-grab-20261116` remains at `e64afb5c4fa86c8ad8ed991386bb4b5b4eceddca`.

All build/deploy checks completed successfully. After deploy, actual HTTPS in isolated real Chromium passed all 8 canonical routes, all 4 historical redirects preserving query/hash, correct RU/EN, zero page errors and zero missing same-origin resources. The real public XML→EN Main→edit→Undo/Redo→RU switch→EN reload workflow passed, retaining identity/fingering/Practice/BPM/Grab. A delayed-configuration regression passed on both public Import locales; no file can be selected through the native UI before its existing handler is ready.

Receipts: `acceptance-20261118/published-*.json`. Fresh prepublication EN desktop/mobile six-stage courses and all shared regressions are documented in `tutorial-en-final-acceptance-20261118.md` and its evidence directory. The musical engine and Grab factors 1/2/4/8 were not changed. The only product correction in final acceptance was disabling Import selection until asynchronous initialization completed, plus cache version updates.

The initial smoke before the first deployment finished saw old menu content and timed out; it was rerun after deploy. All final public receipts listed above passed. Hardware MIDI, Safari/Firefox, physical touch and Russian ISP availability remain untested.

This receipt-only commit is kept on the recovery branch to preserve evidence without starting another production deployment. The published production SHA remains the one above; receipt-only changes do not alter application code.
