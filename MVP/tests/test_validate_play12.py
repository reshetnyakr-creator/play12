#!/usr/bin/env python3
"""Run with: python3 -B MVP/tests/test_validate_play12.py (standard library only)."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

MVP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MVP / "tools"))
from validate_play12 import rational, validate_document, validate_file

FIXTURES = Path(__file__).parent / "fixtures"
REFERENCES = {
    "when_the_saints_manual.play12.json": (60, [9], {}),
    "when_the_saints_play12_beginner.play12.json": (63, [19, 19], {"REFERENCE_ZERO_ABSENT": 1}),
    "fur_elise_first_24_measures.candidates.v0.2.play12.json": (1106, [106], {"REFERENCE_ZERO_ABSENT": 1}),
}
INVALID = {
    "duplicate-id": "DUPLICATE_ID", "invalid-midi": "MIDI", "invalid-finger": "FINGER",
    "negative-timing": "NEGATIVE_TIMING", "invalid-symbol": "SYMBOL", "malformed-fraction": "FRACTION",
    "unsupported-format": "FORMAT", "unsupported-version": "VERSION",
}


def minimal():
    return json.loads((FIXTURES / "minimal-valid.play12.json").read_text())


def event(d):
    return d["score"]["parts"][0]["measures"][0]["events"][0]


class ValidationTests(unittest.TestCase):
    def cli(self, path, structured=True):
        return subprocess.run([sys.executable, "-B", str(MVP / "tools/validate_play12.py"), str(path)]
                              + (["--json"] if structured else []), capture_output=True, text=True)

    def test_references_and_no_writes(self):
        for name, (events, measures, warnings) in REFERENCES.items():
            with self.subTest(name=name):
                path = MVP / "examples" / name
                before = hashlib.sha256(path.read_bytes()).hexdigest()
                result = self.cli(path)
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                report = json.loads(result.stdout)
                self.assertEqual(report["status"], "VALID")
                self.assertEqual(report["errors"], [])
                self.assertEqual(report["warning_counts"], warnings)
                stats = report["stats"]
                self.assertEqual(stats["event_count"], events)
                self.assertEqual(stats["measures_per_part"], measures)
                self.assertEqual(stats["measure_count"], sum(measures))
                for key in ("duplicate_ids", "timing_inconsistencies", "unknown_structures"):
                    self.assertEqual(stats[key], 0)
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)

    def test_deliberately_invalid_fixtures_cli(self):
        for name, code in INVALID.items():
            with self.subTest(name=name):
                result = self.cli(FIXTURES / "invalid" / (name + ".play12.json"))
                self.assertEqual(result.returncode, 1, result.stderr)
                report = json.loads(result.stdout)
                self.assertEqual(report["status"], "INVALID")
                self.assertIn(code, [e["code"] for e in report["errors"]])

    def test_readable_cli(self):
        result = self.cli(FIXTURES / "minimal-valid.play12.json", False)
        self.assertEqual(result.returncode, 0)
        self.assertTrue(result.stdout.startswith("VALID\nERRORS (0)\nWARNINGS (0)"))
        result = self.cli(FIXTURES / "invalid/invalid-midi.play12.json", False)
        self.assertEqual(result.returncode, 1)
        self.assertTrue(result.stdout.startswith("INVALID\n"))
        self.assertIn(".pitch.midi", result.stdout)

    def test_bad_json_and_unreadable_input(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.json"
            for raw in ('{', '{"score": NaN}', '{"x": Infinity}', '{"id":"a","id":"b"}', '\ufffd'):
                path.write_text(raw)
                self.assertEqual(validate_file(path)["errors"][0]["code"], "JSON_INPUT")
            path.write_bytes(b'\xff')
            self.assertEqual(validate_file(path)["status"], "INVALID")
            self.assertEqual(validate_file(Path(directory) / "absent")["status"], "INVALID")

    def test_exact_rationals_and_timing_warning(self):
        self.assertEqual(rational("1/3") * 3, 1)
        self.assertEqual(rational("0.125"), rational("1/8"))
        for bad in (True, .25, "1/0", "NaN", "1/2/3", None):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                rational(bad)
        d = minimal()
        m = d["score"]["parts"][0]["measures"][0]
        m["attributes"]["divisions"] = 3
        event(d).update(start_divisions=1, start_quarters="1/3", duration_divisions=1, duration_quarters="1/3")
        self.assertEqual(validate_document(d)["warnings"], [])
        event(d)["start_quarters"] = "1/2"  # Same mutation as review's quarter-only edit.
        before = copy.deepcopy(d)
        report = validate_document(d)
        self.assertEqual(report["status"], "VALID")
        self.assertEqual(report["warning_counts"], {"TIMING_MISMATCH": 1})
        self.assertEqual(report["stats"]["timing_inconsistencies"], 1)
        self.assertEqual(d, before)

    def test_zero_duration_and_grace(self):
        for kind, grace, valid in (("note", False, False), ("rest", False, False), ("note", True, True)):
            d = minimal()
            event(d).update(kind=kind, grace=grace, duration_quarters="0", duration_divisions=0)
            self.assertEqual(validate_document(d)["status"] == "VALID", valid)

    def test_bad_container_shapes_do_not_crash(self):
        for value in (None, [], 1, "score"):
            self.assertEqual(validate_document(value)["status"], "INVALID")
        paths = [("score",), ("play12",), ("score", "parts"),
                 ("score", "parts", 0), ("score", "parts", 0, "measures"),
                 ("score", "parts", 0, "measures", 0),
                 ("score", "parts", 0, "measures", 0, "attributes"),
                 ("score", "parts", 0, "measures", 0, "events"),
                 ("score", "parts", 0, "measures", 0, "events", 0)]
        for path in paths:
            d = minimal()
            parent = d
            for key in path[:-1]:
                parent = parent[key]
            parent[path[-1]] = None
            self.assertEqual(validate_document(d)["status"], "INVALID", path)

    def test_basic_event_constraints(self):
        cases = [("id", "", "EVENT_ID"), ("id", None, "EVENT_ID"), ("kind", "pedal", "KIND"),
                 ("hand", "both", "HAND"), ("grace", "true", "TYPE"),
                 ("start_divisions", True, "DIVISIONS"), ("duration_divisions", 1.5, "DIVISIONS"),
                 ("duration_quarters", "-1/4", "NEGATIVE_TIMING")]
        for field, value, code in cases:
            d = minimal()
            event(d)[field] = value
            self.assertIn(code, [e["code"] for e in validate_document(d)["errors"]])
        for field, value, code in (("pitch", {"midi": True}, "MIDI"), ("pitch", {"midi": 60.5}, "MIDI"),
                                   ("method", {"finger": True}, "FINGER")):
            d = minimal()
            event(d)[field] = value
            self.assertIn(code, [e["code"] for e in validate_document(d)["errors"]])

    def test_extensions_and_deferred_constraints_warn(self):
        d = minimal()
        event(d)["future_articulation"] = {"value": "staccato"}
        event(d)["pitch"]["midi"] = 12
        event(d).update(duration_quarters="5", duration_divisions=20)
        report = validate_document(d)
        self.assertEqual(report["status"], "VALID")
        self.assertEqual(report["warning_counts"], {"MEASURE_OVERFLOW": 1, "PIANO_RANGE": 1, "UNKNOWN_STRUCTURE": 1})
        self.assertEqual(report["stats"]["unknown_structures"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
