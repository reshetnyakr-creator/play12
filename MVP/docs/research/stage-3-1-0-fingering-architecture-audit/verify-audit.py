"""Validate Stage 3.1.0 tables and reference evidence, without running an engine."""
from collections import Counter
import csv
from graphlib import TopologicalSorter
from itertools import combinations
import json
from pathlib import Path

here = Path(__file__).resolve().parent
stages = here.parent
registry = json.loads((here / "rule-registry.json").read_text())
rules = [r["id"] for r in registry["rules"]]
assert rules == [f"R{i:02}" for i in range(1, 61)]
with (here / "05_Rule_Conflict_Matrix.csv").open() as stream:
    pairs = list(csv.DictReader(stream))
assert [(r["rule_a"], r["rule_b"]) for r in pairs] == list(combinations(rules, 2))
assert Counter(row["relation"] for row in pairs) == registry["relations"]
edges = [(e["before"], e["after"]) for e in registry["edges"]]
assert len(set(edges)) == len(edges)
assert all(a in rules and b in rules and a != b for a, b in edges)
order = list(TopologicalSorter({
    r: {a for a, b in edges if b == r} for r in rules
}).static_order())
assert order == registry["precedenceOrder"]
assert len({t["id"] for t in json.loads((here / "contract-audit.json").read_text())}) == 72

evidence = json.loads((stages / "stage-3-0-10-fingering-priority/results.json").read_text())
assert [len(r["proof"]) for r in evidence.values()] == [7, 41]
assert all(p["status"] == "infeasible" and p["hand"] == "L"
           for r in evidence.values() for p in r["proof"])
control = evidence["time"]["control"]
assert control["automatic"] == [5, 2, 1, 2, 3, 1]
assert control["reference"] == [5, 2, 1, 2, 3, 4]
assert control["schedules"][0]["cost"][:3] == control["constrainedReference"]["cost"][:3]
assert control["schedules"][0]["cost"][3] < control["constrainedReference"]["cost"][3]
technique = evidence["time"]["techniques"][0]
assert technique["measure"] == "46" and technique["fingers"] == [5, 2, 1]
assert technique["diagnostic"]["schedule"] is None
print(f"{len(rules)} rules, {len(pairs)} pairs, {len(edges)} DAG edges, 72 test contracts, 48 replay references")
