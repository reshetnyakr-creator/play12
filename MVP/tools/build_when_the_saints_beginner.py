#!/usr/bin/env python3
"""Build the reproducible Play12 Beginner score from the supplied MXL."""

from __future__ import annotations

import argparse
import copy
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

STEP_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
PC_SPELLING = {
    0: ("C", 0), 1: ("D", -1), 2: ("D", 0), 3: ("E", -1),
    4: ("E", 0), 5: ("F", 0), 6: ("G", -1), 7: ("G", 0),
    8: ("A", -1), 9: ("A", 0), 10: ("B", -1), 11: ("B", 0),
}
TRANSPOSE = -5  # F major -> C major, down a perfect fourth.


def read_score(path: Path) -> ET.Element:
    with zipfile.ZipFile(path) as archive:
        return ET.fromstring(archive.read("score.xml"))


def midi_of(note: ET.Element) -> int:
    pitch = note.find("pitch")
    step = pitch.findtext("step")
    alter = int(pitch.findtext("alter", "0"))
    octave = int(pitch.findtext("octave"))
    return (octave + 1) * 12 + STEP_PC[step] + alter


def set_natural_pitch(note: ET.Element, midi: int) -> None:
    pitch = note.find("pitch")
    step, accidental = PC_SPELLING[midi % 12]
    pitch.find("step").text = step
    alter = pitch.find("alter")
    if accidental and alter is None:
        alter = ET.SubElement(pitch, "alter")
    if accidental:
        alter.text = str(accidental)
    elif alter is not None:
        pitch.remove(alter)
    pitch.find("octave").text = str(midi // 12 - 1)


def measure_duration(measure: ET.Element) -> int:
    cursor = maximum = 0
    last_start = 0
    for item in list(measure):
        if item.tag == "backup":
            cursor -= int(item.findtext("duration", "0"))
        elif item.tag == "forward":
            cursor += int(item.findtext("duration", "0"))
            maximum = max(maximum, cursor)
        elif item.tag == "note":
            duration = int(item.findtext("duration", "0"))
            start = last_start if item.find("chord") is not None else cursor
            maximum = max(maximum, start + duration)
            if item.find("chord") is None:
                last_start = start
                cursor += duration
    return maximum


def simple_note(midi: int | None, duration: int, staff: int) -> ET.Element:
    note = ET.Element("note")
    if midi is None:
        ET.SubElement(note, "rest")
    else:
        pitch = ET.SubElement(note, "pitch")
        step, accidental = PC_SPELLING[midi % 12]
        ET.SubElement(pitch, "step").text = step
        if accidental:
            ET.SubElement(pitch, "alter").text = str(accidental)
        ET.SubElement(pitch, "octave").text = str(midi // 12 - 1)
    ET.SubElement(note, "duration").text = str(duration)
    ET.SubElement(note, "voice").text = "1"
    ET.SubElement(note, "type").text = "whole" if duration == 12 else "half"
    if duration == 9:
        ET.SubElement(note, "dot")
    ET.SubElement(note, "staff").text = str(staff)
    return note


def build(source: Path, output: Path) -> None:
    root = read_score(source)
    title = root.find("./work/work-title")
    if title is not None:
        title.text = "When the Saints Go Marching In — Play12 Beginner"
    movement = root.find("movement-title")
    if movement is not None:
        movement.text = "When the Saints Go Marching In — Play12 Beginner"

    score_parts = root.findall("./part-list/score-part")
    if len(score_parts) != 2:
        raise ValueError("Expected the supplied two-part piano score")
    score_parts[0].find("part-name").text = "Right Hand"
    score_parts[1].find("part-name").text = "Left Hand"

    parts = root.findall("part")
    if len(parts) != 2:
        raise ValueError("Expected the supplied two-part piano score")
    right, left = parts

    for measure in right.findall("measure"):
        fifths = measure.find("./attributes/key/fifths")
        if fifths is not None:
            fifths.text = "0"
        for note in measure.findall("note"):
            if note.find("pitch") is not None:
                set_natural_pitch(note, midi_of(note) + TRANSPOSE)
            if note.find("staff") is None:
                ET.SubElement(note, "staff").text = "1"

    right_measures = right.findall("measure")
    left_measures = left.findall("measure")
    if len(right_measures) != len(left_measures):
        raise ValueError("Right/left measure count mismatch")
    # The supplied score's first measure contains three quarter-note beats but
    # is not flagged as an anacrusis. Mark it explicitly in the derivative.
    right_measures[0].set("implicit", "yes")
    left_measures[0].set("implicit", "yes")

    for index, (right_measure, left_measure) in enumerate(zip(right_measures, left_measures)):
        duration = measure_duration(right_measure)
        basses = [midi_of(note) for note in left_measure.findall("note")
                  if note.find("pitch") is not None and note.find("chord") is None]
        bass = basses[0] + TRANSPOSE if basses and index > 0 else None
        keep = [copy.deepcopy(item) for item in list(left_measure)
                if item.tag in {"attributes", "print", "barline"}]
        for item in list(left_measure):
            left_measure.remove(item)
        for item in keep:
            fifths = item.find("key/fifths") if item.tag == "attributes" else None
            if fifths is not None:
                fifths.text = "0"
            left_measure.append(item)
        left_measure.insert(1 if keep and keep[0].tag == "attributes" else 0, simple_note(bass, duration, 2))

    ET.indent(root, space="  ")
    output.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(root).write(output, encoding="utf-8", xml_declaration=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.source, args.output)


if __name__ == "__main__":
    main()
