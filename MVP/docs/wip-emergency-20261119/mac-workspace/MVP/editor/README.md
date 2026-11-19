# Play12 browser editor 0.1

Direct route: /MVP/editor/. No navigation links added. All source MusicXML and documents remain in IndexedDB on the current origin. No accounts or external music uploads.

Import confirms part/staff hands; source fingering and auto assignments remain separate. Engine uses joint chord injections, retained contacts, exact rational time, per-hand beam path search, explicit approximate key geometry and experimental beginner costs in beginner.json. This is a new v1.1-inspired implementation, not recovered legacy v0.2. Full v1.1 pose/trajectory certificates, calibrated physiology, personal learning and all 72 research contracts are not implemented. Result feasibility remains unknown; cost is not confidence.

Partial results and special-technique limitations are visible. Repeat traversal, variable tempo realization, pedal releases, arpeggiated/grace/trill performance and measured motion are not fully implemented. The written traversal and source bytes are retained. Assumed score-duration overlaps warn; known-contact conflicts reject. Ties use one contact. Export creates a local JSON backup, independent copies start from the same base run for teacher/author comparison.

Existing renderer supports opt-in editor timing and unknown labels; existing playback accepts an optional independent note schedule, retaining legacy defaults. Saved composition loads through playback.html?composition=ID, on the same origin/browser. Loop/tempo/MIDI/Practice remain existing engine functions. Editor preview uses this page in an iframe.

Validation: node --test MVP/tests/*.cjs; python3 -B MVP/tests/test_validate_play12.py; browser: /MVP/tests/editor-browser.html. No claim that all T01–T72 passed. Existing regression tests and the new editor tests are reported separately.

Rollback: revert editor release commit to parent 3442ae3a2c45661d5779c34702145439a9b7b1a6 (or revert individual later fixes). Do not delete users' IndexedDB. Browser data is not cloud storage: export backups before clearing browser storage or moving devices.
