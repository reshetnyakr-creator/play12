#!/usr/bin/env python3
"""Build the Play12 Manual transcription of When the Saints Go Marching In.

The transcription source is the Chapter 4 Play12 Manual diagram.  Musical
time is expressed in quarter notes; the diagram's ONE/AND grid is 1/8.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "examples" / "when_the_saints_manual.play12.json"
SYMBOLS = "0123456789XY"
PITCH_CLASS = {symbol: index for index, symbol in enumerate(SYMBOLS)}


def midi_for(symbol: str, cycle: str) -> int:
    cycle_zero = {"yellow": 48, "green": 60, "blue": 72}[cycle]
    return cycle_zero + PITCH_CLASS[symbol]


def pitch(midi: int) -> dict:
    names = (("C", 0), ("C", 1), ("D", 0), ("D", 1), ("E", 0), ("F", 0),
             ("F", 1), ("G", 0), ("G", 1), ("A", 0), ("A", 1), ("B", 0))
    step, alter = names[midi % 12]
    return {"step": step, "alter": alter, "octave": midi // 12 - 1, "midi": midi}


def method(finger: int) -> dict:
    return {
        "finger": finger,
        "fingering_source": "methodist",
        "fingering_confidence": 1.0,
        "fingering_exception_id": None,
        "auto_fingering_candidate": None,
        "fingering_history": [],
        "skill_ids": [],
        "comments": ["Transcribed from Play12 Manual, Chapter 4"],
        "exceptions": [],
    }


# (measure index, beat offset, duration, hand, finger, symbol, color cycle)
NOTES = [
    (0, 1, 1, "R", 1, "0", "blue"),
    (0, 2, 1, "R", 3, "4", "blue"),
    (0, 3, 1, "R", 4, "5", "blue"),
    (1, 0, 4, "R", 5, "7", "blue"),
    (1, 1, 1, "L", 5, "4", "yellow"), (1, 1, 1, "L", 3, "7", "yellow"), (1, 1, 1, "L", 1, "0", "green"),
    (1, 2, 1, "L", 4, "5", "yellow"), (1, 2, 1, "L", 2, "9", "yellow"), (1, 2, 1, "L", 1, "0", "green"),
    (1, 3, 1, "L", 4, "5", "yellow"), (1, 3, 1, "L", 2, "9", "yellow"), (1, 3, 1, "L", 1, "0", "green"),
    (2, 0, 1, "L", 5, "4", "yellow"), (2, 0, 1, "L", 3, "7", "yellow"), (2, 0, 1, "L", 1, "0", "green"),
    (2, 1, 1, "R", 1, "0", "blue"),
    (2, 2, 1, "R", 3, "4", "blue"),
    (2, 3, 1, "R", 4, "5", "blue"),
    (3, 0, 4, "R", 5, "7", "blue"),
    (3, 1, 1, "L", 5, "4", "yellow"), (3, 1, 1, "L", 3, "7", "yellow"), (3, 1, 1, "L", 1, "0", "green"),
    (3, 2, 1, "L", 4, "5", "yellow"), (3, 2, 1, "L", 2, "9", "yellow"), (3, 2, 1, "L", 1, "0", "green"),
    (3, 3, 1, "L", 4, "5", "yellow"), (3, 3, 1, "L", 2, "9", "yellow"), (3, 3, 1, "L", 1, "0", "green"),
    (4, 0, 1, "L", 5, "4", "yellow"), (4, 0, 1, "L", 3, "7", "yellow"), (4, 0, 1, "L", 1, "0", "green"),
    (4, 1, 1, "R", 1, "0", "blue"),
    (4, 2, 1, "R", 3, "4", "blue"),
    (4, 3, 1, "R", 4, "5", "blue"),
    (5, 0, 2, "R", 5, "7", "blue"), (5, 2, 2, "R", 3, "4", "blue"),
    (5, 1, 1, "L", 5, "0", "yellow"), (5, 1, 1, "L", 3, "4", "yellow"), (5, 1, 1, "L", 1, "7", "yellow"),
    (5, 3, 1, "L", 5, "0", "yellow"), (5, 3, 1, "L", 3, "4", "yellow"), (5, 3, 1, "L", 1, "7", "yellow"),
    (6, 0, 2, "R", 1, "0", "blue"), (6, 2, 2, "R", 3, "4", "blue"),
    (6, 1, 1, "L", 5, "0", "yellow"), (6, 1, 1, "L", 3, "4", "yellow"), (6, 1, 1, "L", 1, "7", "yellow"),
    (6, 3, 1, "L", 5, "0", "yellow"), (6, 3, 1, "L", 3, "4", "yellow"), (6, 3, 1, "L", 1, "7", "yellow"),
    (7, 0, 4, "R", 2, "2", "blue"),
    (7, 1, 1, "L", 5, "Y", "yellow"), (7, 1, 1, "L", 1, "7", "yellow"),
    (7, 2, 1, "L", 4, "0", "yellow"), (7, 2, 1, "L", 1, "7", "yellow"),
    (7, 3, 1, "L", 3, "1", "yellow"), (7, 3, 1, "L", 1, "7", "yellow"),
    (8, 0, 1, "L", 2, "2", "yellow"), (8, 0, 1, "L", 1, "7", "yellow"),
]


def event(index: int, measure: int, start: int, duration: int, hand: str, finger: int, symbol: str, cycle: str) -> dict:
    midi = midi_for(symbol, cycle)
    return {
        "id": f"manual.m{measure}.e{index}", "kind": "note", "staff": 1 if hand == "R" else 2,
        "hand": hand, "voice": "1", "start_divisions": start * 2, "duration_divisions": duration * 2,
        "start_quarters": str(start), "duration_quarters": str(duration), "chord": False, "grace": False,
        "type": {1: "quarter", 2: "half", 4: "whole"}[duration], "dots": 0,
        "method": method(finger), "pitch": pitch(midi),
        "play12_symbol": {"value": symbol, "origin": "play12_manual"},
        "ties": [], "source_fingering": finger,
    }


def main() -> None:
    measures = []
    for measure_index in range(10):
        events = [event(i, *row) for i, row in enumerate(NOTES) if row[0] == measure_index]
        measures.append({
            "index": measure_index, "number": str(measure_index + 1), "implicit": False,
            "attributes": {"divisions": 2, "time": {"beats": 4, "beat_type": 4}, "key_fifths": 0, "staves": 2},
            "tempo_marks": ([{"start_divisions": 0, "start_quarters": "0", "bpm": 96.0, "text": "Review playback tempo"}] if measure_index == 0 else []),
            "dynamic_marks": ([{"start_divisions": 0, "start_quarters": "0", "value": "mf", "sound_value": 80.0, "staff": None}] if measure_index == 0 else []),
            "events": events,
        })
    document = {
        "format": "play12-json", "version": "0.1",
        "source": {"type": "play12_manual_diagram", "title": "Play12 Manual, Chapter 4", "derived_musicxml": None},
        "play12": {
            "zero_pitch_class": "C", "reference_zero_midi": 24, "symbols": SYMBOLS,
            "pitch_class_mapping": {str(i): SYMBOLS[i] for i in range(12)},
        },
        "score": {
            "title": "When the Saints Go Marching In — Play12 Manual",
            "creators": [{"type": "source", "name": "Play12 Manual, Chapter 4"}],
            "parts": [{"id": "P1", "name": "Play12 Manual transcription", "measures": measures}],
        },
        "manual_transcription": {
            "reading_order": "bottom_to_top_then_left_field_to_right_field",
            "round_count": 10, "last_round_contains_only_release_space_after_beat_one": True,
            "grid_resolution": "1/8", "count": ["ONE", "AND", "TWO", "AND", "THREE", "AND", "FOUR", "AND"],
        },
    }
    OUTPUT.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
