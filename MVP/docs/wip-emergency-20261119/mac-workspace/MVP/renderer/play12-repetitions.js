/* Exact per-hand repetition segmentation for review/onboarding notation. */
(function (global) {
  "use strict";

  const COLORS = ["#6F7FA3", "#9A7B8F", "#718C82", "#A18468", "#747E8B"];
  const fraction = value => {
    const [numerator, denominator] = String(value).split("/").map(Number);
    return denominator ? numerator / denominator : numerator;
  };

  function detect(document) {
    const measures = document.score.parts[0].measures;
    const starts = [];
    let cursor = 0;
    for (const measure of measures) {
      starts.push(cursor);
      cursor += measure.attributes.time.beats * 4 / measure.attributes.time.beat_type;
    }
    const segments = [];
    let colorIndex = 0;
    for (const hand of ["L", "R"]) {
      const fingerprints = measures.map(measure => {
        const events = measure.events.filter(event => event.kind === "note" && event.hand === hand)
          .map(event => [event.pitch.midi, fraction(event.start_quarters), fraction(event.duration_quarters), event.voice])
          .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        return events.length ? JSON.stringify(events) : null;
      });
      const occupied = new Set();
      for (let length = Math.floor(measures.length / 2); length >= 1; length--) {
        const groups = new Map();
        for (let start = 0; start + length <= measures.length; start++) {
          const slice = fingerprints.slice(start, start + length);
          if (slice.some(value => value == null)) continue;
          const signature = slice.join("|");
          if (!groups.has(signature)) groups.set(signature, []);
          groups.get(signature).push(start);
        }
        for (const [signature, candidates] of groups) {
          const occurrences = [];
          for (const start of candidates) {
            const indexes = Array.from({ length }, (_, offset) => start + offset);
            if (indexes.some(index => occupied.has(index))) continue;
            if (occurrences.some(previous => start < previous + length)) continue;
            occurrences.push(start);
          }
          if (occurrences.length < 2) continue;
          occurrences.flatMap(start => Array.from({ length }, (_, offset) => start + offset)).forEach(index => occupied.add(index));
          const idSeed = `${hand}:${signature}`;
          let hash = 2166136261;
          for (const character of idSeed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
          segments.push({
            segment_id: `exact-${hand.toLowerCase()}-${(hash >>> 0).toString(16).padStart(8, "0")}`,
            hand,
            match_type: "exact",
            measure_length: length,
            display_color: COLORS[colorIndex++ % COLORS.length],
            occurrences: occurrences.map(start => ({
              measure_start: start + 1,
              measure_end: start + length,
              start_quarters_global: String(starts[start]),
              end_quarters_global: String(starts[start + length] ?? cursor),
              event_ids: measures.slice(start, start + length).flatMap(measure => measure.events
                .filter(event => event.kind === "note" && event.hand === hand).map(event => event.id))
            }))
          });
        }
      }
    }
    return {
      format: "play12-segments",
      version: "0.1",
      match_policy: { alignment: "measure", fields: ["pitch.midi", "relative_start", "duration", "hand", "voice"], contained_repeats_suppressed: true },
      segments
    };
  }

  global.Play12Repetitions = { detect };
})(window);
