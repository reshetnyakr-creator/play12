/* Play12 static renderer v0.1. Input: a play12-json/0.1 document. */
(function (global) {
  "use strict";

  const DEFAULTS = {
    gridResolution: "1/16",
    cellWidth: 20,
    cellHeight: 32,
    countColumnWidthRatio: 1.6,
    zoom: 1,
    radiusRatio: 0.4,
    gridLineWidth: 1,
    noteBorderRatio: 1.25,
    symbolOutlineEnabled: true,
    symbolOutlineColor: "rgba(0, 0, 0, 0.24)",
    symbolOutlineWidth: 0.35,
    candidatePreview: true,
    candidateDebug: false,
    segmentRibbonWidth: 7,
    segmentRibbonGap: 5,
    zeroNote: "A",
    colors: ["#FF0C31", "#FC7B00", "#FBD12C", "#009640", "#0381ED", "#AE78D2", "#FF9FF3"],
    dynamicsOpacity: { pp: 0.5, p: 0.6, mp: 0.7, mf: 0.8, f: 0.9, ff: 1 },
    metricOpacity: { primary: 0.36, secondary: 0.24, weak: 0.12 },
    metricMaps: { "3/8": ["primary", "weak", "weak"], "4/4": ["primary", "weak", "secondary", "weak"] },
    countWords: { 1: "РАЗ", 2: "ДВА", 3: "ТРИ", 4: "ЧЕТЫРЕ" },
  };

  function fraction(value) {
    const [n, d] = String(value).split("/").map(Number);
    return d ? n / d : n;
  }

  function gridInQuarters(resolution) {
    const [n, d] = resolution.split("/").map(Number);
    return (n / d) * 4;
  }

  function colorForMidi(midi, colors) {
    // A0 (MIDI 21) starts color cycle 0; each next A starts the next cycle.
    const cycle = Math.floor((midi - 21) / 12);
    if (cycle < 0 || cycle >= colors.length) throw new Error(`No Play12 color cycle for MIDI ${midi}`);
    return colors[cycle];
  }

  function mixWithWhite(hex, amount) {
    const value = hex.replace("#", "");
    const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
    const mixed = channels.map((channel) => Math.round(channel * amount + 255 * (1 - amount)));
    return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }

  function selectMeasureRange(document, measureCount) {
    const notes = [];
    const selectedMeasures = document.score.parts[0].measures.slice(0, measureCount);
    let totalQuarters = 0;
    for (const part of document.score.parts) {
      let offset = 0;
      for (const measure of part.measures.slice(0, measureCount)) {
        const events = measure.events;
        const extent = events.reduce((v, e) => Math.max(v, fraction(e.start_quarters) + fraction(e.duration_quarters)), 0);
        const meter = measure.attributes.time;
        const nominal = meter.beats * (4 / meter.beat_type);
        // An implicit opening measure is an upbeat: align its content to the
        // end of a complete metric frame, leaving empty time before it.
        const pickupPadding = measure.implicit ? Math.max(0, nominal - extent) : 0;
        for (const event of events) {
          if (event.kind === "note") {
            notes.push({ ...event, globalStart: offset + pickupPadding + fraction(event.start_quarters), measureIndex: measure.index });
          }
        }
        offset += nominal;
      }
      totalQuarters = Math.max(totalQuarters, offset);
    }
    if (selectedMeasures.length < measureCount) throw new Error(`The score has fewer than ${measureCount} measures`);
    return { notes, selectedMeasures, totalQuarters };
  }

  function collectMissingFingering(document, measureCount = 8) {
    const selection = selectMeasureRange(document, measureCount);
    return selection.notes.filter((note) => !Number.isInteger(note.method.finger));
  }

  function resolveDisplayFingering(document, note, cfg) {
    if (Number.isInteger(note.method.finger)) {
      return { finger: note.method.finger, mode: "selected", confidence: note.method.fingering_confidence };
    }
    const onboardingFinger = note.onboarding && note.onboarding.display_finger;
    if (cfg.onboardingLayout && Number.isInteger(onboardingFinger)) {
      return { finger: onboardingFinger, mode: "onboarding-layout", confidence: null };
    }
    const benchmarkFinger = cfg.benchmarkFingering && cfg.benchmarkFingering[note.id];
    if (Number.isInteger(benchmarkFinger)) {
      return { finger: benchmarkFinger, mode: "benchmark", confidence: 1 };
    }
    const candidate = note.method.auto_fingering_candidate;
    if (!cfg.candidatePreview || !candidate || !Number.isInteger(candidate.finger)) return null;
    if (candidate.zero_note !== document.play12.zero_pitch_class) return null;
    const reviewedFinger = cfg.reviewOverrides && cfg.reviewOverrides[note.id];
    if (Number.isInteger(reviewedFinger)) {
      return { finger: reviewedFinger, mode: "review", confidence: candidate.confidence, candidate };
    }
    return { finger: candidate.finger, mode: "auto-candidate", confidence: candidate.confidence, candidate };
  }

  function dynamicAtStart(document) {
    for (const part of document.score.parts) {
      for (const measure of part.measures) {
        const mark = (measure.dynamic_marks || []).find((m) => m.staff === 1 || m.staff == null);
        if (mark) return mark.value;
      }
    }
    throw new Error("The reference fragment has no dynamic mark in Play12 JSON");
  }

  function renderPlay12(document, mount, options = {}) {
    if (document.format !== "play12-json" || document.version !== "0.1") throw new Error("Expected play12-json/0.1");
    const cfg = { ...DEFAULTS, ...options };
    if (document.play12.zero_pitch_class !== cfg.zeroNote) throw new Error("Renderer zeroNote does not match the score");
    const measureCount = options.measureCount || 8;
    const selection = selectMeasureRange(document, measureCount);
    const notes = selection.notes
      .map((note) => ({ note, displayFingering: resolveDisplayFingering(document, note, cfg) }))
      .filter((item) => item.displayFingering);
    const stepQ = gridInQuarters(cfg.gridResolution);
    const startQ = 0;
    const endQ = selection.totalQuarters;
    const steps = Math.ceil((endQ - startQ) / stepQ);
    const width = cfg.cellWidth * cfg.zoom;
    const height = cfg.cellHeight * cfg.zoom;
    const handWidth = 5 * width;
    const countWidth = width * cfg.countColumnWidthRatio;
    const rightStart = handWidth + countWidth;
    const totalWidth = handWidth * 2 + countWidth;
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = global.document.createElementNS(svgNS, "svg");
    const edgePadding = Math.max(1, cfg.gridLineWidth * cfg.noteBorderRatio);
    const ribbonWidth = cfg.segmentRibbonWidth * cfg.zoom;
    const ribbonGap = cfg.segmentRibbonGap * cfg.zoom;
    const ribbonSpace = cfg.segments && cfg.segments.segments.length ? ribbonWidth + ribbonGap : 0;
    const renderedWidth = totalWidth + edgePadding * 2 + ribbonSpace;
    svg.setAttribute("viewBox", `${-edgePadding - ribbonSpace} ${-edgePadding} ${renderedWidth} ${steps * height + edgePadding * 2}`);
    // Expanding the viewBox for ribbons must not scale down the established grid geometry.
    svg.style.width = `${renderedWidth}px`;
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${document.score.title}: первые ${measureCount} такта в нотации Play12`);
    svg.classList.add("play12-score");
    svg.dataset.totalQuarters = String(endQ);
    svg.dataset.stepQuarters = String(stepQ);
    svg.dataset.cellHeight = String(height);
    svg.dataset.timelineOriginY = String(steps * height + edgePadding);

    const make = (tag, attrs = {}, text = null) => {
      const el = global.document.createElementNS(svgNS, tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
      if (text != null) el.textContent = text;
      svg.appendChild(el);
      return el;
    };

    if (cfg.segments) {
      for (const segment of cfg.segments.segments) {
        for (const occurrence of segment.occurrences) {
          const occurrenceStart = fraction(occurrence.start_quarters_global);
          const occurrenceEnd = fraction(occurrence.end_quarters_global);
          const y = (steps - (occurrenceEnd - startQ) / stepQ) * height;
          const ribbon = make("rect", {
            x: -ribbonGap - ribbonWidth,
            y,
            width: ribbonWidth,
            height: ((occurrenceEnd - occurrenceStart) / stepQ) * height,
            rx: ribbonWidth / 2,
            fill: segment.display_color,
            "fill-opacity": 0.78,
            class: "play12-segment-ribbon",
            "data-segment-id": segment.segment_id,
          });
          const title = global.document.createElementNS(svgNS, "title");
          title.textContent = `${segment.segment_id}: такты ${occurrence.measure_start}–${occurrence.measure_end}`;
          ribbon.appendChild(title);
        }
      }
    }

    const time = selection.selectedMeasures[0].attributes.time;
    const meter = `${time.beats}/${time.beat_type}`;
    const beatSteps = (4 / time.beat_type) / stepQ;
    const measureSteps = time.beats * beatSteps;
    const metricMap = cfg.metricMaps[meter];
    const countLabels = [];
    for (let s = 0; s < steps; s++) {
      const y = (steps - 1 - s) * height;
      const beat = Math.floor((s % measureSteps) / beatSteps);
      const withinBeat = s % beatSteps;
      const level = withinBeat === 0 ? metricMap[beat] : null;
      make("rect", {
        x: handWidth,
        y,
        width: countWidth,
        height,
        rx: width * cfg.radiusRatio,
        fill: level ? "#CEF932" : "#FFFFFF",
        "fill-opacity": level ? cfg.metricOpacity[level] : 1,
        class: "play12-count-space",
      });
      for (let lane = 0; lane < 10; lane++) {
        const x = lane < 5 ? lane * width : rightStart + (lane - 5) * width;
        make("rect", {
          x,
          y,
          width,
          height,
          rx: width * cfg.radiusRatio,
          fill: level ? "#CEF932" : "#FFFFFF",
          "fill-opacity": level ? cfg.metricOpacity[level] : 1,
          class: "play12-cell",
        });
      }
      const countText = withinBeat === 0 ? cfg.countWords[beat + 1] : "И";
      countLabels.push({ text: countText, x: handWidth + countWidth / 2, y: y + height * 0.63, beat: withinBeat === 0, primary: withinBeat === 0 && beat === 0 });
    }

    for (let s = 0; s < steps; s += measureSteps) {
      const measureY = (steps - s - measureSteps) * height;
      const measureHeight = measureSteps * height;
      make("rect", { x: 0, y: measureY, width: handWidth, height: measureHeight, rx: width * cfg.radiusRatio, fill: "none", stroke: "#6B7280", "stroke-opacity": 0.28, "stroke-width": 1 });
      make("rect", { x: rightStart, y: measureY, width: handWidth, height: measureHeight, rx: width * cfg.radiusRatio, fill: "none", stroke: "#6B7280", "stroke-opacity": 0.28, "stroke-width": 1 });
    }
    for (const item of countLabels) {
      const countClass = item.primary ? "play12-count play12-count-primary" : item.beat ? "play12-count play12-count-beat" : "play12-count play12-count-and";
      make("text", { x: item.x, y: item.y, "text-anchor": "middle", class: countClass }, item.text);
    }

    const dynamic = dynamicAtStart(document);
    const fillOpacity = cfg.dynamicsOpacity[dynamic];
    if (fillOpacity == null) throw new Error(`No opacity configured for dynamic ${dynamic}`);
    for (const item of notes) {
      const { note, displayFingering } = item;
      const finger = displayFingering.finger;
      const noteX = rightStart + (finger - 1) * width;
      const handX = note.hand === "R" ? noteX : (5 - finger) * width;
      const noteStart = (note.globalStart - startQ) / stepQ;
      const noteDuration = fraction(note.duration_quarters) / stepQ;
      const y = (steps - noteStart - noteDuration) * height;
      const group = global.document.createElementNS(svgNS, "g");
      group.setAttribute("data-event-id", note.id);
      group.setAttribute("data-hand", note.hand);
      group.setAttribute("data-finger", finger);
      group.setAttribute("data-global-start-quarters", note.globalStart);
      group.setAttribute("data-duration-quarters", fraction(note.duration_quarters));
      group.setAttribute("data-midi", note.pitch.midi);
      group.setAttribute("data-dynamic", dynamic);
      group.setAttribute("data-fingering-mode", displayFingering.mode);
      if (displayFingering.confidence != null) group.setAttribute("data-fingering-confidence", displayFingering.confidence);
      if (displayFingering.mode === "auto-candidate") group.classList.add("play12-auto-candidate");
      if (displayFingering.mode === "review") group.classList.add("play12-reviewed-candidate");
      if (displayFingering.candidate) {
        group.setAttribute("role", "button");
        group.setAttribute("tabindex", "0");
        group.setAttribute("aria-label", `${note.pitch.step}${note.pitch.alter === 1 ? "#" : note.pitch.alter === -1 ? "b" : ""}${note.pitch.octave}, ${note.hand}, кандидат: палец ${displayFingering.candidate.finger}`);
        if (typeof cfg.onNoteSelect === "function") {
          group.addEventListener("click", () => cfg.onNoteSelect(note.id));
          group.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              cfg.onNoteSelect(note.id);
            }
          });
        }
      }
      const block = global.document.createElementNS(svgNS, "rect");
      block.setAttribute("x", handX);
      block.setAttribute("y", y);
      block.setAttribute("width", width);
      block.setAttribute("height", noteDuration * height);
      block.setAttribute("rx", width * cfg.radiusRatio);
      const officialColor = colorForMidi(note.pitch.midi, cfg.colors);
      block.setAttribute("fill", mixWithWhite(officialColor, fillOpacity));
      block.setAttribute("fill-opacity", 1);
      block.setAttribute("stroke", "#111111");
      block.setAttribute("stroke-width", cfg.gridLineWidth * cfg.noteBorderRatio);
      group.appendChild(block);
      const activeGlow = global.document.createElementNS(svgNS, "rect");
      activeGlow.setAttribute("x", handX);
      activeGlow.setAttribute("y", y);
      activeGlow.setAttribute("width", width);
      activeGlow.setAttribute("height", noteDuration * height);
      activeGlow.setAttribute("rx", width * cfg.radiusRatio);
      activeGlow.setAttribute("fill", "#FFFFFF");
      activeGlow.setAttribute("class", "play12-active-glow");
      activeGlow.setAttribute("pointer-events", "none");
      group.appendChild(activeGlow);
      const label = global.document.createElementNS(svgNS, "text");
      label.setAttribute("x", handX + width / 2);
      label.setAttribute("y", y + noteDuration * height - 5 * cfg.zoom);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "play12-symbol");
      if (note.hand === "L") label.classList.add("play12-symbol-left");
      if (cfg.symbolOutlineEnabled) {
        label.setAttribute("stroke", cfg.symbolOutlineColor);
        label.setAttribute("stroke-width", cfg.symbolOutlineWidth * cfg.zoom);
        label.setAttribute("paint-order", "stroke fill");
      }
      label.textContent = note.play12_symbol.value;
      group.appendChild(label);
      if (cfg.candidateDebug && displayFingering.candidate) {
        const title = global.document.createElementNS(svgNS, "title");
        title.textContent = `AUTO candidate: палец ${finger}, confidence ${Math.round(displayFingering.confidence * 100)}%`;
        group.prepend(title);
      }
      svg.appendChild(group);
    }

    mount.replaceChildren(svg);
    return svg;
  }

  global.Play12Renderer = { render: renderPlay12, collectMissingFingering, resolveDisplayFingering, defaults: DEFAULTS };
})(window);
