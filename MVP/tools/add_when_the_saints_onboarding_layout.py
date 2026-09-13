#!/usr/bin/env python3
"""Add provisional, non-methodist display lanes for the listening demo."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def display_finger(event: dict) -> int:
    if event["hand"] == "L":
        return 5
    # Beginner melody spans C4–G4: one fixed five-finger position.
    return max(1, min(5, event["pitch"]["midi"] - 59))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    document = json.loads(args.path.read_text(encoding="utf-8"))
    for part in document["score"]["parts"]:
        for measure in part["measures"]:
            for event in measure["events"]:
                if event["kind"] == "note":
                    event["onboarding"] = {
                        "display_finger": display_finger(event),
                        "source": "beginner_demo_layout",
                        "approved_fingering": False,
                    }
    args.path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
