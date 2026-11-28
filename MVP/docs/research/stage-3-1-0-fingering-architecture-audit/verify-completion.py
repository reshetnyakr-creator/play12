"""Check the audit's concrete witnesses. This is not a fingering implementation."""
import csv
import hashlib
from itertools import product
import json
from pathlib import Path
import sys

here = Path(__file__).resolve().parent
research = here.parent
mvp = research.parent.parent
source = research / "stage-3-0-10-fingering-priority" / "results.json"
evidence = json.loads(source.read_text())
if len(sys.argv) == 2:
    replay = Path(sys.argv[1]).read_bytes()
    assert replay == source.read_bytes(), hashlib.sha256(replay).hexdigest()

# Left hand, descending adjacent keys in the compact candidate family.
# The static tests deliberately use a three-note part of a confirmed complete path.
pitches = (57, 55, 54)
assert tuple(a - b for a, b in zip(pitches, pitches[1:])) == (2, 1)
paths = list(product(range(1, 6), repeat=3))
natural = [p for p in paths if all(b == a + 1 for a, b in zip(p, p[1:]))]
assert natural == [(1, 2, 3), (2, 3, 4), (3, 4, 5)]
entry_finger = 1  # previous adjacent-in-time attack E3 uses thumb in 5–2–1
remaining = [p for p in natural if p[0] != entry_finger]
long_on_black = [p for p in remaining if p[2] in (2, 3, 4)]
assert long_on_black == [(2, 3, 4)]
control = evidence["time"]["control"]
assert tuple(control["reference"][3:]) == long_on_black[0]
assert tuple(control["automatic"][3:]) not in natural
assert control["schedules"][0]["cost"][:3] == control["constrainedReference"]["cost"][:3]
assert len(control["localComparison"]) == len(paths)
assert next(x for x in control["localComparison"] if x["fingers"] == [2, 3, 4])["repeats"] == 0
# Changing a finite residual cost cannot alter the already filtered set.
for cost in (-10**99, 0, 10**99):
    assert min(long_on_black, key=lambda p: 0 if p == (2, 3, 1) else cost) == (2, 3, 4)

with (here / "residual-repeats.csv").open() as stream:
    rows = list(csv.DictReader(stream))
assert len(rows) == 48
for name, result in evidence.items():
    local = [r for r in rows if r["composition"] == name]
    assert len(local) == len(result["proof"])
    for row, record in zip(local, result["proof"]):
        assert (row["from"], row["to"], int(row["finger"]), row["proof"]) == (
            record["from"], record["to"], record["finger"], "infeasible"
        )

# Audit every retained wide pair with the published current profile and whitelist.
profile = json.loads((mvp / "editor/beginner.json").read_text())
wide = json.loads((here / "wide-evidence.json").read_text())
assert sum(len(work["exceptions"]) for work in wide.values()) == 68
for work in wide.values():
    for case in work["exceptions"]:
        expected = [5, 1] if case["hand"] == "L" else [1, 5]
        assert case["fingers"] == expected
        assert abs(case["midi"][1] - case["midi"][0]) == case["distance"]
        assert case["distance"] > profile["practicalSpan"]["1-5"]
        assert case["physical"] == "unknown"
    for chord in work["audits"]:
        assert chord["middleAllowed"] == [2]
        for pair in chord["pairs"]:
            lo, hi = pair["fingers"]
            if (lo, hi) == (5, 1):
                continue
            limit = pair["comfort"] if 5 in (lo, hi) else pair["practical"]
            if chord["needsRecalculation"]:
                assert chord["midi"] == [36, 43, 52]
                if (lo, hi) == (5, 4):
                    assert pair["distance"] > limit  # historical rejected form
            else:
                assert pair["distance"] <= limit, pair

technique, = evidence["time"]["techniques"]
assert technique["measure"] == "46" and technique["status"] == "assigned"
assert technique["fingers"] == [5, 2, 1]
assert technique["diagnostic"]["positions"][1]["fingers"] == [2, 1]
assert 59 - 48 > profile["practicalSpan"]["2-5"]
assert 60 - 59 <= profile["practicalSpan"]["1-2"]
assert all(technique["diagnostic"][key] == "unknown" for key in ("physical", "sounding"))
print("Time 38 and 46; 48 residual repeat witnesses; 68 wide pairs and three wide triads")
