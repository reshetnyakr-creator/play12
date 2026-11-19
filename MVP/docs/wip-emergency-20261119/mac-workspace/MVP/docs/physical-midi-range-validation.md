# Main physical MIDI range — validation

Base: 8314271cc21b88987c9ba04299d5b9eca3a243f6.
Rollback: rollback-before-physical-midi-range-20261115.

Desktop uses the confirmed calibration only for its exact connected input ID.
Supported bounds remain MIDI 21–108. Invalid records are not clipped, rewritten
or deleted. Without an applicable input, show 21–108. With several inputs, the
saved confirmed input remains primary. Mobile retains the composition window.

Reuse production SVG contours, absolute MIDI mapping, zero and color cycles.
Physical keyboards retain full-keyboard reference height with uniform scaling,
horizontal centering and permissible side margins. Dock height does not grow
to fill the available width.

TrainingZones owns Main's range. Legacy initial setRange remains for Onboarding.
Display changes wait for notes, virtual pointers and function/control holds to
release. Subscriptions are disposed with the shell. Independent zero/fingering
warnings are preserved alongside physical-range warnings.

Validation: 235 JavaScript tests, 9 Python tests; syntax checks passed.
Tests parse production SVG contours and transforms, including cubic extrema,
black endpoint cases, 49/61/73/76/88 keys, 37–85 and 41–98 bounds, unchanged
height at 1024/1280/1440/1920 widths, same-ID reconnect, different/multiple inputs,
invalid calibration, function release/disconnect, Mobile range and disposal.

Not performed: browser DOM/visual acceptance or hardware MIDI testing.
Production-contour tests use a DOM test double; they are not browser rendering.
A local Inkscape query exited 134 and is not counted as validation.
Existing calibration steps and MIDI permission mechanism are unchanged.
