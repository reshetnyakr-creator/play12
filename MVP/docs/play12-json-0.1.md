# Play12 JSON 0.1: observed contract and validation baseline

Frozen against `74758a91483f91e58c191161e750ba82d9c7af26` on 2026-09-14.
Local checkpoint: `converter-json-0.1-baseline-20260914`.
This describes existing data, not a new schema or a format migration.
No `.schema.json` is introduced. `format: "play12-json"`, `version: "0.1"` remain unchanged.

## Evidence and interpretation

The three source documents are in `../examples/`:

- `when_the_saints_manual.play12.json`: production musical truth, 1 part, 9 measures, 60 notes.
- `when_the_saints_play12_beginner.play12.json`: technical fixture, 2 parts with 19 measures each, 60 notes and 3 rests.
- `fur_elise_first_24_measures.candidates.v0.2.play12.json`: historical reference, 1 part, **106 measures**, 904 notes and 202 rests. The filename is misleading; it must not be renamed as part of this freeze. Candidate version 0.2 is not document format version 0.2.

Consumers reviewed:

- **R**: `../renderer/play12-renderer.js` (`renderPlay12`, `selectMeasureRange`, `resolveDisplayFingering`, `dynamicAtStart`).
- **P**: `../renderer/play12-playback.js`; consumes derived runtime notes/rounds, not the complete JSON document.
- **W**: `../renderer/playback.html`; loads compositions and builds data for P, including reference-zero fallback.
- **E**: `../renderer/when-the-saints-review.js` (`findEvent`, `applyOverlay`, inspector and local storage).
- **A**: artifact/provenance only in these consumers; no active runtime requirement proven.

Presence labels below distinguish evidence from validation policy:

- **C**: required along an existing consumer path (possibly only for the named mode). This does not imply every field is a hard error in the minimal validator.
- **O**: observed in all applicable reference objects; mandatory status is **not proven**. Optional for the baseline unless a rule below explicitly says otherwise.
- **Opt**: optional, nullable, conditional or extension metadata. Unknown fields must be preserved; validator reports them without mutation.

All types and known values are observations unless explicitly identified as baseline rules. `null` is a real observed value, not an omitted field. Empty arrays do not establish an element schema. Listed known values are not automatically closed enums.

## Field inventory

Rows grouping fields give the same type/presence/consumer to each listed field. A slash in a type means a union.

### Root and source

| Field | Observed type; presence | Meaning / observed values | Consumer |
| --- | --- | --- | --- |
| `format` | string; C | `play12-json` | R checks literal |
| `version` | string; C | `0.1` | R checks literal |
| `source` | object; O | Origin of this document; variants below | A |
| `play12` | object; C | Symbol mapping and reference zero | R/E/W |
| `score` | object; C | Musical hierarchy | R/E/W |
| `method` | object; Opt | Document-level method metadata, absent in Manual | A |
| `manual_transcription` | object; Opt | Manual-specific transcription description | A |
| `source.type` | string; O | `musicxml`, `play12_manual_diagram` | A |
| `source.file_name` | string; Opt | Source basename for imported examples | A |
| `source.container_entry` | string/null; Opt | `score.xml` for MXL, null for plain XML | A |
| `source.musicxml_version` | string; Opt | `3.1` | A |
| `source.sha256` | string; Opt | Recorded source digest; not proof of local availability | A |
| `source.title` | string; Opt | `Play12 Manual, Chapter 4` | A |
| `source.derived_musicxml` | null; Opt | Manual has no derived XML; non-null shape unproven | A |
| root `method.skill_links`, `method.comments`, `method.exceptions` | array; Opt | Empty in imported examples; element shapes unproven | A |

### Play12 and zero

| Field under `play12` | Observed type; presence | Meaning / observed values | Consumer |
| --- | --- | --- | --- |
| `zero_pitch_class` | string; C | A in generated Saints/Für Elise, C in Manual | R verifies config; E candidate/mapping context; W fallback |
| `reference_zero_midi` | integer; Opt | 24 in Manual only; explicit reference register | W → P |
| `symbols` | string; C in E | `0123456789XY`, twelve pitch-class symbols | E pitch edit |
| `pitch_class_mapping` | object; C in E | Keys `"0"`…`"11"`, string symbol values; maps absolute pitch class to relative symbol | E locates zero |

Observed mapping: `symbolIndex = (midi % 12 - zeroPitchClass + 12) % 12`; select from `0123456789XY`. In A-zero, C maps to `3`; in C-zero, C maps to `0`. `pitch.midi` is reference physical pitch. W uses the explicit reference zero when present, otherwise the lowest piano MIDI matching the zero pitch class. P computes `effectiveMidiPitch = sourceMidiPitch + runtimeZeroNote - referenceZeroNote` without rewriting source data. Runtime transposition does not currently recompute fingering.

Proposal, not a hard invariant: future generated compositions should always identify reference zero unambiguously. Requiring it now would reject two references. Symbol/pitch/zero correspondence and octave/color agreement are deferred semantic checks, not silently normalized.

### Score, parts, measures and attributes

| Field | Observed type; presence | Meaning / observed values | Consumer |
| --- | --- | --- | --- |
| `score.title` | string; O | Composition title | R accessibility label, W |
| `score.creators` | array of objects; O | Credits | A |
| creator `type`, `name` | string; O | Credit role and name; includes source credit | A |
| `score.parts` | array of objects; C | Ordered parts; 1 or 2 observed | R/E/W |
| part `id` | string; O | P1/P2 | A; event IDs separately identify events |
| part `name` | string; O | Display/provenance part name | A |
| part `measures` | array of objects; C | Ordered measures | R/E/W |
| measure `index` | integer; C for layout | Zero-based position | R/E |
| measure `number` | string; Opt for E | Source label, includes `"0"`; E has fallback | E |
| measure `implicit` | boolean; O | Opening pickup indicator | R pads pickup to nominal frame |
| measure `attributes` | object; C | Effective attributes repeated in each observed measure | R/W |
| measure `events` | array of objects; C | Ordered note/rest records | R/E/W |
| measure `tempo_marks` | array of objects; O | Zero or more tempo marks | A in direct R/P/E; W initializes playback tempo separately |
| measure `dynamic_marks` | array of objects; Opt in R | Zero or more dynamic marks; R uses `[]` fallback | R initial dynamics |
| attributes `divisions` | integer; O | Positive source subdivisions per quarter | A; validator exact comparison |
| attributes `time` | object; C | Meter | R/W |
| time `beats`, `beat_type` | integer; C | E.g. 3/8, 4/4; nominal quarters = beats × 4 / beat_type | R/W → P rounds |
| attributes `key_fifths` | integer; O | Key signature count; does not replace explicit pitches | A |
| attributes `staves` | integer/null; Opt | Declared staff count, nullable for Saints two-part source | A |

R accumulates nominal measure lengths separately for each part; the first part provides selected measure/round metadata. Matching measure counts, numbering, changing meters and pickup interpretation are not fully validated. `measure_count` in validator output counts stored measure objects across parts: generated Saints is **38**, representing **19 aligned musical measures**.

### Events, pitch and timing

| Event field | Observed type; presence | Meaning / observed values | Consumer |
| --- | --- | --- | --- |
| `id` | string; C | Stable composition-wide identity; `P1.m0.e0`, `manual.m0.e0` | E overlay, R DOM, P derived note IDs |
| `kind` | string; C | `note`, `rest`; R selects notes | R/W |
| `staff` | integer; O | Staff assignment (1/2 observed); E sets it from hand | E |
| `hand` | string; C for note layout | R/L; assignment, not proof that source supplied it | R/E/W |
| `voice` | string; O | Source voice identifier | A; repetition metadata elsewhere |
| `start_divisions` | integer; O | Onset relative to measure, source units | A; validator |
| `duration_divisions` | integer; O | Duration in source units | A; validator |
| `start_quarters` | string; C | Exact onset relative to measure, e.g. `0`, `1/4`, `5/4` | R fraction conversion; E edits; W/P derived timing |
| `duration_quarters` | string; C | Exact duration in quarter units | R/E/W/P |
| `chord` | boolean; O | Source chord-member marker, not a complete chord ID | A |
| `grace` | boolean; O | Grace event; 3 in Für Elise | A; runtime semantics incomplete |
| `type` | string/null; Opt | Source notation duration name; null occurs | A |
| `dots` | integer; O | Notation dot count | A |
| `method` | object; C on notes | Selected/candidate fingering and method metadata | R/E |
| `pitch` | object; C on notes | Absent on observed rests | R/E/W/P |
| pitch `step` | string; O on notes | Letter name C…B, spelling | E produces; R hover spelling; P uses MIDI |
| pitch `alter` | integer; O on notes | Accidental semitone offset | E produces; R hover spelling |
| pitch `octave` | integer; O on notes | Scientific pitch octave | E produces; R hover spelling |
| pitch `midi` | integer; C on notes | Absolute reference pitch; observed 31…100 across all examples | R/E/W/P |
| `play12_symbol` | object; C for labelled display/editor | Absent on observed rests | R/E |
| symbol `value` | string; C when symbol used | One character from `0123456789XY` | R/E |
| symbol `origin` | string; O on notes | `play12_rule`, `play12_manual`; E emits `manual_review_pitch` | E produces; provenance |
| `ties` | array of strings; Opt on notes | Empty or `start`/`stop`; Saints has 6 of each | A in reviewed direct consumers; no tie-graph guarantee |
| `source_fingering` | integer/null; Opt | Manual source finger 1…5, null in imported references | A |
| `onboarding` | object; Opt | Generated Saints display-only metadata | R when onboarding layout enabled |
| `review_override_id` | string; Opt, E-produced | Effective overlay marker, not in base references | E produces |

Exact arithmetic: validator uses `Fraction`, never a floating-point conversion of quarter strings. Observed quarter fields are strings. As a baseline input policy, integer JSON values are also accepted (R can read them), but JSON float quarter values are rejected to avoid ambiguous binary timing. Accepted string grammar is signed integer, integer fraction with positive denominator, or exact decimal (E emits decimals): `1`, `1/4`, `0.125`. Whitespace, exponents, nonfinite numbers, zero denominators and malformed fractions are rejected. This is a validation policy, not evidence that every accepted spelling occurs in references.

When a measure explicitly has positive integer `attributes.divisions = D`, compare `Fraction(start_divisions, D)` and `Fraction(duration_divisions, D)` to the quarter fields, including mark onsets. No MusicXML inheritance is inferred in this JSON baseline. Missing divisions produces a warning; comparison is skipped. A mismatch is a warning: E updates quarter strings without updating divisions. Neither representation is overwritten. Negative values remain errors in either representation.

Visual grid is not source truth. Grid 1/4, 1/8, 1/16, 1/32, 1/64 corresponds to 1, 1/2, 1/4, 1/8, 1/16 quarters. Changing grid must not change saved music. E explicitly snaps timing when saving an edit; switching grid alone only redraws. E currently uses `Number()` to populate timing fields, so exact fraction strings also expose editor display/parsing debt; this task does not change E.

Rests have timing and method containers in the reference data, but no pitch/symbol/ties/source_fingering. R excludes rests from drawn notes while they contribute to measure extent. Normal note/rest duration must be positive under the baseline; `grace: true` permits zero (but never negative) duration. Grace scheduling and whether grace rests should ever exist remain unproven. Manual simultaneous notes have `chord: false`; simultaneous onset must not be equated with a source chord flag, nor treated as a duplicate ID/musical event. Tie connectivity and sustain are not inferred from the existence of the field.

### Fingering and method

| Field under event `method` | Observed type; presence | Meaning / observed values | Consumer |
| --- | --- | --- | --- |
| `finger` | integer/null; Opt | Selected 1…5 or no assignment | R/E; no finger may mean invisible without fallback |
| `fingering_source` | string/null; Opt | `methodist` in base assignments; E emits `user` | E/R metadata |
| `fingering_confidence` | number/null; Opt | 1.0 for manual assignments; E clears to null | R |
| `fingering_exception_id` | null; Opt | Reserved exception reference; non-null observed type unproven | A |
| `auto_fingering_candidate` | object/null; Opt | Candidate proposal, distinct from confirmed finger | R |
| `fingering_history` | array; Opt | Empty in base files; E appends object with `source: manual_review`, integer `finger`, string `timestamp` | E |
| `skill_ids` | array; Opt | Empty in references; future method links | A |
| `comments` | array; Opt | Empty or manual transcription comment strings | A |
| `exceptions` | array; Opt | Empty, item schema unproven | A |

| Candidate field | Observed type; presence | Meaning / observed values | Consumer |
| --- | --- | --- | --- |
| `finger` | integer; C for preview | Proposed 1…5 | R |
| `confidence` | number; O | Historical confidence | R |
| `total_path_cost` | number; O | Historical path score | A |
| `main_cost` | object; O | Dominant historical cost | A |
| main_cost `name` | string; O | Cost label | A |
| main_cost `value` | number; O | Cost contribution | A |
| `engine` | string; O | `play12-fingering-engine/0.2` | A |
| `mode` | string; O | `candidate-only` | A |
| `hand_profile` | string; O | `global-ergonomic-baseline/0.1` | A |
| `zero_note` | string; C for preview | A in candidates; must match document zero for R preview | R |
| `physical_layout_fingerprint` | string; O | Historical physical layout digest | A |
| `physical_pitch_midi` | integer; O | Candidate's physical pitch | A |
| `key_geometry` | object; O | Keyboard geometry metadata | A |
| key_geometry `kind` | string; O | white/black | A |
| key_geometry `x` | number; O | Horizontal geometry coordinate | A |

All candidate metadata is retained. There is no source engine or reproducible benchmark runner in the frozen repository; weights/rules cannot be reconstructed reliably from outputs. Confidence bounds, candidate provenance, geometry agreement and fingering quality are **not** validated by this baseline.

| Field under event `onboarding` | Observed type; presence | Meaning / observed values | Consumer |
| --- | --- | --- | --- |
| `display_finger` | integer; Opt | Display lane 1…5 | R |
| `source` | string; Opt | `beginner_demo_layout` | E display |
| `approved_fingering` | boolean; Opt | false; display layout is not approved fingering | A |

### Tempo, dynamics, manual extension

| Field | Observed type; presence | Meaning / observed values | Consumer |
| --- | --- | --- | --- |
| tempo `start_divisions` | integer; O | Measure-relative onset | A; validator |
| tempo `start_quarters` | string; O | Exact measure-relative onset | A; validator |
| tempo `bpm` | number; O | Recorded BPM | A in direct R/P/E; P takes runtime BPM |
| tempo `text` | string/null; Opt | Tempo direction text | A |
| dynamic `start_divisions` | integer; O | Measure-relative onset | A; validator |
| dynamic `start_quarters` | string; O | Exact measure-relative onset | A; validator |
| dynamic `value` | string; C when used | Dynamic label; R/P know pp,p,mp,mf,f,ff | R → runtime P gain |
| dynamic `sound_value` | number; O | Recorded MusicXML sound value | A |
| dynamic `staff` | integer/null; Opt | R takes first mark with staff 1 or null/missing | R |
| manual `reading_order` | string; Opt | bottom_to_top_then_left_field_to_right_field | A |
| manual `round_count` | integer; Opt | 9 | A |
| manual `last_round_contains_only_release_space_after_beat_one` | boolean; Opt | false | A |
| manual `grid_resolution` | string; Opt | 1/8 | A |
| manual `count` | array of strings; Opt | ONE,AND,TWO,AND,THREE,AND,FOUR,AND | A |

Presence of tempo/dynamic fields does not prove complete handling of changes. R's initial-dynamic lookup can throw if no eligible mark exists; this is a mode-specific consumer limitation, not a proven universal format invariant. Tempo/dynamic contents beyond timing/container shape are recorded here but not exhaustively type/semantically validated yet.

## Baseline rules and CLI

```sh
python3 -B MVP/tools/validate_play12.py MVP/examples/when_the_saints_manual.play12.json
python3 -B MVP/tools/validate_play12.py MVP/examples/when_the_saints_manual.play12.json --json
python3 -B MVP/tests/test_validate_play12.py
```

Standard library only. No writes to input or auto-repair. CLI status is `VALID` (exit 0) or `INVALID` (exit 1); invocation misuse is argparse exit 2. Text output separates errors, warnings, counts and explicitly unvalidated checks. JSON output exposes the same information with stable diagnostic codes and object paths. `VALID` means only that baseline errors are absent; it is neither approval nor full consumer compatibility.

Hard errors in this baseline:

- Invalid JSON/input (also ambiguous duplicate object keys), wrong format/version, incorrect required hierarchy (`play12`, `score.parts[].measures[].attributes.time`, `events[]`), wrong supplied known container shapes.
- Nonempty stable event ID missing, or reused anywhere across the composition. IDs are not rewritten; duplicate count counts occurrences after the first.
- Unrecognized event kind; invalid present hand; invalid present non-null finger (selected, candidate, source or onboarding); boolean is not an integer.
- Missing note pitch/MIDI or note method container (direct consumer dependencies); MIDI must be an integer in the MIDI domain 0…127.
- Missing/malformed quarter timing; negative timing; zero ordinary duration; malformed/negative supplied divisions; nonpositive measure divisions or meter values.
- Invalid supplied Play12 symbol value; basic supplied flag/type checks implemented in the CLI. A missing symbol or mapping is not yet a hard error even though certain rendering/editor paths need it.

Warning policies, consciously not hard errors:

- `TIMING_MISMATCH`: stale divisions after review. Count is mismatched field pairs, not distinct events.
- `DIVISIONS_ABSENT`: no proven JSON inheritance; cannot compare units.
- `REFERENCE_ZERO_ABSENT`: consumers have a fallback; two references omit it.
- `PIANO_RANGE`: MIDI outside 21…108 but inside 0…127. E clamps to piano range, R has its own color-cycle range; neither proves a universal 21…108 data contract.
- `MEASURE_OVERFLOW`: outside nominal meter; polymeter/pickup/voice interpretation requires more work.
- `UNKNOWN_STRUCTURE`: unknown named fields in enumerated containers or unrecognized tie markers, not discarded. Arrays whose item schema is unproven (history, skills, exceptions etc.) and mapping contents remain opaque; this is not complete semantic coverage.
- Missing source/hand and empty parts/measures: provenance/layout limitations reported without guesses.

Deferred, not asserted: pitch spelling versus MIDI, symbol/zero agreement, reference-register agreement, tie/chord topology, duplicate musical events, complete grace/tuplet/pedal/articulation semantics, source/output equivalence, measure alignment, complete metadata types, confidence/history consistency, algorithm quality and approval. There is no MusicXML parser here, so unknown structures in unavailable source XML cannot be counted. `unknown_structures: 0` means no unfamiliar structures detected at the inspected JSON locations, not that every musical feature is supported. `not_validated` is always present in the report.

## Regression baseline and known debt

| Composition | Errors | Warnings | Stored measures (per part) | Events | Duplicate IDs | Timing mismatches | Unknown JSON structures |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| Manual Saints | 0 | 0 | 9 (9) | 60 | 0 | 0 | 0 |
| Generated Saints | 0 | 1: REFERENCE_ZERO_ABSENT | 38 (19+19) | 63 | 0 | 0 | 0 |
| Für Elise | 0 | 1: REFERENCE_ZERO_ABSENT | 106 (106) | 1106 | 0 | 0 | 0 |

Tests assert these exact counts/warning codes, CLI exit behavior and input hashes before/after validation. Separate deliberately-invalid fixtures assert duplicate IDs across parts, invalid MIDI, invalid finger, negative timing, invalid symbol, malformed fraction, unsupported format and unsupported version. Additional tests exercise exact thirds, review timing warnings, grace zero duration, bad container shapes, JSON errors, booleans masquerading as integers and extension warnings.

Existing debt not necessarily a per-file warning: Für Elise's 106-measure filename mismatch; missing `Fur_Elise.mxl` source; no source engine; source-generated Saints is not production truth; zero/fingering behavior under transposition; review timing's two representations; opaque method payloads; incomplete runtime treatment of musical structures. The 49-note first-8 fingering benchmark is historical ground truth, not a test run of an engine. Measures 9–24 have no established holdout labels.

## Overlay boundary and migration

`play12-manual-review-overlay/0.1` is a separate format, rejected by this composition validator. Base + seed edits keyed by event ID + saved browser overlay yields an effective composition. E chooses matching browser storage in preference to seed, then applies its edits to a clone of base. Storage key: `play12.review.when-the-saints.v0.2`. Existing seed filename `when_the_saints_manual_review.overlay.json` actually identifies the **beginner** composition. Browser changes do not automatically export to repository.

E assigns `method.finger`, sets source `user`, clears confidence, appends history, and can change MIDI, hand/staff, quarters and deletion state. Stable IDs and original metadata must survive future parser/editor work.

Any future tightened required fields or canonical timing choice needs a separately agreed migration: characterize old artifacts, preserve provenance/unknown fields/IDs, define an explicit compatibility policy and test Product consumers before changing outputs or version. This step creates no migration, converter, new fingering engine or approved composition; production JSON and runtime remain untouched.
