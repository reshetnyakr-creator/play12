#!/usr/bin/env python3
"""Read-only, dependency-free baseline validation for play12-json/0.1.

VALID means no baseline errors, not approval or complete musical validation.
See MVP/docs/play12-json-0.1.md for deliberately deferred semantics.
"""
from __future__ import annotations

import argparse
from collections import Counter
from fractions import Fraction
import json
from pathlib import Path
import re

SYMBOLS = "0123456789XY"
# Observed shapes, not a closed schema. Unknown fields are reported, retained.
SHAPES = {
    "root": "format version source play12 score method manual_transcription",
    "source": "type title derived_musicxml file_name container_entry musicxml_version sha256",
    "play12": "zero_pitch_class reference_zero_midi symbols pitch_class_mapping",
    "score": "title creators parts",
    "creator": "type name",
    "part": "id name measures",
    "measure": "index number implicit attributes tempo_marks dynamic_marks events",
    "attributes": "divisions time key_fifths staves",
    "time": "beats beat_type",
    "event": "id kind staff hand voice start_divisions duration_divisions start_quarters duration_quarters chord grace type dots method pitch play12_symbol ties source_fingering onboarding review_override_id",
    "pitch": "step alter octave midi",
    "symbol": "value origin",
    "method": "finger fingering_source fingering_confidence fingering_exception_id auto_fingering_candidate fingering_history skill_ids comments exceptions",
    "candidate": "finger confidence total_path_cost main_cost engine mode hand_profile zero_note physical_layout_fingerprint physical_pitch_midi key_geometry",
    "cost": "name value",
    "geometry": "kind x",
    "onboarding": "display_finger source approved_fingering",
    "tempo": "start_divisions start_quarters bpm text",
    "dynamic": "start_divisions start_quarters value sound_value staff",
    "document_method": "skill_links comments exceptions",
    "manual": "reading_order round_count last_round_contains_only_release_space_after_beat_one grid_resolution count",
}


def integer(value):
    return type(value) is int  # JSON booleans are not integers.


def rational(value):
    """Accept exact integer/decimal/fraction strings; never parse through float."""
    if integer(value):
        return Fraction(value)
    if not isinstance(value, str) or not re.fullmatch(r"[+-]?\d+(?:/\d+|\.\d+)?", value):
        raise ValueError("expected an integer or exact rational string (e.g. '5/4')")
    try:
        return Fraction(value)
    except (ValueError, ZeroDivisionError) as exc:
        raise ValueError("invalid rational or zero denominator") from exc


class Validator:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.ids = {}
        self.stats = dict(part_count=0, measure_count=0, measures_per_part=[], event_count=0,
                          duplicate_ids=0, timing_inconsistencies=0, unknown_structures=0)

    def error(self, code, path, message):
        self.errors.append(dict(code=code, path=path, message=message))

    def warn(self, code, path, message):
        self.warnings.append(dict(code=code, path=path, message=message))
        if code == "UNKNOWN_STRUCTURE":
            self.stats["unknown_structures"] += 1

    def obj(self, value, path, shape):
        if not isinstance(value, dict):
            self.error("STRUCTURE", path, "expected object")
            return None
        for key in sorted(value.keys() - set(SHAPES[shape].split())):
            self.warn("UNKNOWN_STRUCTURE", f"{path}.{key}", "extension not covered by this baseline")
        return value

    def array(self, value, path):
        if not isinstance(value, list):
            self.error("STRUCTURE", path, "expected array")
            return []
        return value

    def field_type(self, obj, key, types, path, required=False):
        if key not in obj:
            if required:
                self.error("MISSING", f"{path}.{key}", "required by baseline/consumer")
            return
        if type(obj[key]) not in types:
            self.error("TYPE", f"{path}.{key}", "expected " + "/".join(t.__name__ for t in types))

    def finger(self, value, path):
        if value is not None and (not integer(value) or not 1 <= value <= 5):
            self.error("FINGER", path, "expected null or integer 1..5")

    def timing(self, item, path, divisions, duration=False):
        result = {}
        for prefix in (["start", "duration"] if duration else ["start"]):
            qkey, dkey = prefix + "_quarters", prefix + "_divisions"
            try:
                q = rational(item.get(qkey))
                result[prefix] = q
                if q < 0:
                    self.error("NEGATIVE_TIMING", path + "." + qkey, "must be nonnegative")
            except ValueError as exc:
                self.error("FRACTION", path + "." + qkey, str(exc))
                q = None
            if dkey in item:
                d = item[dkey]
                if not integer(d):
                    self.error("DIVISIONS", path + "." + dkey, "expected integer")
                elif d < 0:
                    self.error("NEGATIVE_TIMING", path + "." + dkey, "must be nonnegative")
                elif q is not None and divisions is not None and Fraction(d, divisions) != q:
                    self.stats["timing_inconsistencies"] += 1
                    self.warn("TIMING_MISMATCH", path + "." + dkey,
                              f"{d}/{divisions} differs from {qkey}={q}; review timing debt, no repair")
        return result

    def method(self, value, path):
        obj = self.obj(value, path, "method")
        if obj is None:
            return
        self.finger(obj.get("finger"), path + ".finger")
        for key in ("fingering_source", "fingering_exception_id"):
            self.field_type(obj, key, (str, type(None)), path)
        self.field_type(obj, "fingering_confidence", (int, float, type(None)), path)
        for key in ("fingering_history", "skill_ids", "comments", "exceptions"):
            if key in obj:
                self.array(obj[key], path + "." + key)
        candidate = obj.get("auto_fingering_candidate")
        if candidate is not None:
            cp = path + ".auto_fingering_candidate"
            c = self.obj(candidate, cp, "candidate")
            if c is not None:
                self.finger(c.get("finger"), cp + ".finger")
                for key, shape in (("main_cost", "cost"), ("key_geometry", "geometry")):
                    if key in c:
                        self.obj(c[key], cp + "." + key, shape)

    def event(self, value, path, divisions, nominal):
        self.stats["event_count"] += 1
        e = self.obj(value, path, "event")
        if e is None:
            return
        event_id = e.get("id")
        if not isinstance(event_id, str) or not event_id.strip():
            self.error("EVENT_ID", path + ".id", "expected nonempty stable string")
        elif event_id in self.ids:
            self.stats["duplicate_ids"] += 1
            self.error("DUPLICATE_ID", path + ".id", f"{event_id!r} already at {self.ids[event_id]}")
        else:
            self.ids[event_id] = path
        if e.get("kind") not in ("note", "rest"):
            self.error("KIND", path + ".kind", "supported kinds: note, rest")
            self.stats["unknown_structures"] += 1
        if "hand" in e and e["hand"] not in ("R", "L"):
            self.error("HAND", path + ".hand", "expected R or L")
        elif "hand" not in e:
            self.warn("MISSING_HAND", path, "renderer/editor expect hand; no source inference performed")
        for key in ("chord", "grace"):
            self.field_type(e, key, (bool,), path)
        for key in ("staff", "dots"):
            self.field_type(e, key, (int,), path)
        self.field_type(e, "voice", (str,), path)
        self.field_type(e, "type", (str, type(None)), path)
        timing = self.timing(e, path, divisions, duration=True)
        if timing.get("duration") == 0 and e.get("grace") is not True:
            self.error("ZERO_DURATION", path + ".duration_quarters", "ordinary note/rest must have positive duration")
        if nominal is not None and set(timing) == {"start", "duration"} and sum(timing.values()) > nominal:
            self.warn("MEASURE_OVERFLOW", path, f"event extends beyond nominal {nominal} quarters; interpretation deferred")
        if "method" in e:
            self.method(e["method"], path + ".method")
        elif e.get("kind") == "note":
            self.error("MISSING", path + ".method", "note method object dereferenced by renderer/editor")
        if e.get("kind") == "note" or "pitch" in e:
            p = self.obj(e.get("pitch"), path + ".pitch", "pitch")
            if p is not None:
                midi = p.get("midi")
                if not integer(midi) or not 0 <= midi <= 127:
                    self.error("MIDI", path + ".pitch.midi", "expected integer MIDI 0..127")
                elif not 21 <= midi <= 108:
                    self.warn("PIANO_RANGE", path + ".pitch.midi", "outside editor's piano range 21..108; not proven universal data limit")
                for key, types in (("step", (str,)), ("alter", (int,)), ("octave", (int,))):
                    self.field_type(p, key, types, path + ".pitch")
        if "play12_symbol" in e:
            symbol = self.obj(e["play12_symbol"], path + ".play12_symbol", "symbol")
            if symbol is not None and (not isinstance(symbol.get("value"), str) or symbol["value"] not in list(SYMBOLS)):
                self.error("SYMBOL", path + ".play12_symbol.value", "expected one of 0123456789XY")
        if "ties" in e:
            for i, tie in enumerate(self.array(e["ties"], path + ".ties")):
                if tie not in ("start", "stop"):
                    self.warn("UNKNOWN_STRUCTURE", f"{path}.ties[{i}]", "unrecognized tie marker; tie semantics not validated")
        if "source_fingering" in e:
            self.finger(e["source_fingering"], path + ".source_fingering")
        if "onboarding" in e:
            o = self.obj(e["onboarding"], path + ".onboarding", "onboarding")
            if o is not None:
                self.finger(o.get("display_finger"), path + ".onboarding.display_finger")

    def validate(self, value):
        d = self.obj(value, "$", "root")
        if d is None:
            return self.report()
        for key, expected in (("format", "play12-json"), ("version", "0.1")):
            if d.get(key) != expected:
                self.error(key.upper(), "$." + key, f"expected {expected!r}")
        # Provenance is observed everywhere, but not needed by current consumers.
        if "source" in d:
            self.obj(d["source"], "$.source", "source")
        else:
            self.warn("MISSING_SOURCE", "$.source", "provenance absent; observed in all reference compositions")
        p12 = self.obj(d.get("play12"), "$.play12", "play12")
        if p12 is not None:
            self.field_type(p12, "zero_pitch_class", (str,), "$.play12", required=True)
            self.field_type(p12, "symbols", (str,), "$.play12")
            if "pitch_class_mapping" in p12 and not isinstance(p12["pitch_class_mapping"], dict):
                self.error("STRUCTURE", "$.play12.pitch_class_mapping", "expected object")
            if "reference_zero_midi" not in p12:
                self.warn("REFERENCE_ZERO_ABSENT", "$.play12", "runtime falls back to lowest matching piano pitch; reference octave not explicit")
            else:
                self.field_type(p12, "reference_zero_midi", (int,), "$.play12")
        for key, shape in (("method", "document_method"), ("manual_transcription", "manual")):
            if key in d:
                self.obj(d[key], "$." + key, shape)
        score = self.obj(d.get("score"), "$.score", "score")
        if score is None:
            return self.report()
        self.field_type(score, "title", (str,), "$.score")
        if "creators" in score:
            for i, c in enumerate(self.array(score["creators"], "$.score.creators")):
                self.obj(c, f"$.score.creators[{i}]", "creator")
        parts = self.array(score.get("parts"), "$.score.parts")
        if not parts:
            self.warn("EMPTY_SCORE", "$.score.parts", "current playback/renderer require at least one part with measures")
        for pi, part in enumerate(parts):
            pp = f"$.score.parts[{pi}]"
            part = self.obj(part, pp, "part")
            if part is None:
                continue
            self.stats["part_count"] += 1
            measures = self.array(part.get("measures"), pp + ".measures")
            self.stats["measures_per_part"].append(len(measures))
            if not measures:
                self.warn("EMPTY_PART", pp, "current renderer requires measures")
            for mi, measure in enumerate(measures):
                mp = f"{pp}.measures[{mi}]"
                self.stats["measure_count"] += 1
                m = self.obj(measure, mp, "measure")
                if m is None:
                    continue
                for key, types in (("index", (int,)), ("number", (str,)), ("implicit", (bool,))):
                    self.field_type(m, key, types, mp)
                a = self.obj(m.get("attributes"), mp + ".attributes", "attributes")
                divisions = nominal = None
                if a is not None:
                    if "divisions" in a:
                        if not integer(a["divisions"]) or a["divisions"] <= 0:
                            self.error("DIVISIONS", mp + ".attributes.divisions", "expected positive integer")
                        else:
                            divisions = a["divisions"]
                    else:
                        self.warn("DIVISIONS_ABSENT", mp + ".attributes", "cannot compare timing; no undocumented inheritance assumed")
                    time = self.obj(a.get("time"), mp + ".attributes.time", "time")
                    if time is not None:
                        for key in ("beats", "beat_type"):
                            if not integer(time.get(key)) or time[key] <= 0:
                                self.error("METER", mp + ".attributes.time." + key, "expected positive integer")
                        if all(integer(time.get(k)) and time[k] > 0 for k in ("beats", "beat_type")):
                            nominal = Fraction(time["beats"] * 4, time["beat_type"])
                for key, shape in (("tempo_marks", "tempo"), ("dynamic_marks", "dynamic")):
                    if key in m:
                        for i, mark in enumerate(self.array(m[key], mp + "." + key)):
                            mark_path = f"{mp}.{key}[{i}]"
                            mark = self.obj(mark, mark_path, shape)
                            if mark is not None:
                                self.timing(mark, mark_path, divisions)
                for ei, e in enumerate(self.array(m.get("events"), mp + ".events")):
                    self.event(e, f"{mp}.events[{ei}]", divisions, nominal)
        return self.report()

    def report(self):
        return dict(status="INVALID" if self.errors else "VALID", errors=self.errors,
                    warnings=self.warnings, stats=self.stats,
                    warning_counts=dict(sorted(Counter(w["code"] for w in self.warnings).items())),
                    not_validated=["tie/chord relationships", "grace playback semantics", "tuplet/articulation/pedal semantics",
                                   "duplicate musical events", "source/output equivalence", "fingering quality/provenance consistency",
                                   "pitch spelling/symbol/zero agreement", "complete extension metadata semantics"])


def validate_document(document):
    return Validator().validate(document)


def validate_file(path):
    validator = Validator()
    try:
        def reject_constant(value):
            raise ValueError(f"non-JSON numeric constant {value}")
        def unique_object(pairs):
            obj = {}
            for key, value in pairs:
                if key in obj:
                    raise ValueError(f"ambiguous duplicate JSON object key {key!r}")
                obj[key] = value
            return obj
        with Path(path).open(encoding="utf-8") as stream:
            document = json.load(stream, parse_constant=reject_constant, object_pairs_hook=unique_object)
        return validator.validate(document)
    except (OSError, UnicodeError, ValueError, RecursionError) as exc:
        validator.error("JSON_INPUT", "$", str(exc))
        return validator.report()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--json", action="store_true", help="machine-readable report")
    args = parser.parse_args()
    report = validate_file(args.path)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(report["status"])
        for name in ("errors", "warnings"):
            print(f"{name.upper()} ({len(report[name])})")
            for issue in report[name]:
                print(f"- {issue['code']} {issue['path']}: {issue['message']}")
        print("COUNTS " + json.dumps(report["stats"]))
        print("NOT VALIDATED: " + "; ".join(report["not_validated"]))
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
