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
    roundMarkerDiameter: 22,
    roundMarkerGap: 10,
    zeroNote: "A",
    colors: ["#FF0C31", "#FC7B00", "#FBD12C", "#009640", "#0381ED", "#AE78D2", "#FF9FF3"],
    dynamicsOpacity: { pp: 0.5, p: 0.6, mp: 0.7, mf: 0.8, f: 0.9, ff: 1 },
    metricOpacity: { primary: 0.36, secondary: 0.24, weak: 0.12 },
    metricMaps: { "3/8": ["primary", "weak", "weak"], "4/4": ["primary", "weak", "secondary", "weak"] },
    countWords: { 1: "РАЗ", 2: "ДВА", 3: "ТРИ", 4: "ЧЕ" },
    countAnd: "И",
  };

  function fraction(value) {
    const [n, d] = String(value).split("/").map(Number);
    return d ? n / d : n;
  }

  function gridInQuarters(resolution) {
    const [n, d] = resolution.split("/").map(Number);
    return (n / d) * 4;
  }

  function colorForMidi(midi, colors, referenceZeroMidi) {
    // source MIDI - reference zero equals effective MIDI - runtime zero.
    const cycle = Math.floor((midi - referenceZeroMidi) / 12);
    if (cycle < 0 || cycle >= colors.length) throw new Error(`No Play12 color cycle for MIDI ${midi}`);
    return colors[cycle];
  }

  function mixWithWhite(hex, amount) {
    const value = hex.replace("#", "");
    const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
    const mixed = channels.map((channel) => Math.round(channel * amount + 255 * (1 - amount)));
    return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }

  function selectMeasureRange(document, measureCount, cfg = {}) {
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
          if (event.kind === "note" && !(cfg.editorTimeline && event.sharedContactRepresentative)) {
            const performance = cfg.editorTimeline ? event.continuousPerformance ?? event.fermataPerformance ?? event.arpeggioPerformance : null;
            const globalStart = performance ? fraction(performance.attack) :
              cfg.editorTimeline && event.editor_onset_q != null ? fraction(event.editor_onset_q) :
              offset + pickupPadding + fraction(event.start_quarters);
            notes.push({ ...event, globalStart, measureIndex: measure.index,
              ...(performance ? {
                duration_quarters:fraction(performance.mainEnd??performance.end)-globalStart,
                fermataTrail:performance.trail??null, trailSegment:performance.trailSegment??event.duration_quarters
              } : {}) });
          }
        }
        offset += cfg.editorTimeline && measure.editor_duration_q ? fraction(measure.editor_duration_q) : nominal;
      }
      totalQuarters = Math.max(totalQuarters, offset);
    }
    if (selectedMeasures.length < measureCount) throw new Error(`The score has fewer than ${measureCount} measures`);
    if(cfg.editorTimeline && document.editor.fermataTimeline) {
      totalQuarters=document.editor.fermataTimeline.rounds[measureCount-1]?.end??totalQuarters;
    }
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
    if (!cfg.candidatePreview || !candidate || !Number.isInteger(candidate.finger)) return cfg.unassignedDisplay ? { finger: null, mode: "unassigned", confidence: null } : null;
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
    const selection = options.selection || selectMeasureRange(document, measureCount, cfg);
    const stepQ = gridInQuarters(cfg.gridResolution);
    const steps = Math.ceil(selection.totalQuarters / stepQ);
    const window = options.scoreWindow;
    const firstRow = window?.from ?? 0, lastRow = window?.to ?? steps;
    const notes = (options.windowNotes ?? selection.notes)
      .map((note) => ({ note, displayFingering: resolveDisplayFingering(document, note, cfg) }))
      .filter((item) => item.displayFingering);
    const startQ = 0;
    const endQ = selection.totalQuarters;
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
    const segmentList = cfg.segments?.segments || [];
    const hasLeftRibbons = segmentList.some((segment) => segment.hand === "L" || !segment.hand);
    const hasRightRibbons = segmentList.some((segment) => segment.hand === "R");
    const leftRibbonSpace = hasLeftRibbons ? ribbonWidth + ribbonGap : 0;
    const rightRibbonSpace = hasRightRibbons ? ribbonWidth + ribbonGap : 0;
    const markerDiameter = cfg.roundMarkerDiameter * cfg.zoom;
    const markerGap = cfg.roundMarkerGap * cfg.zoom;
    const noteFieldWidth = totalWidth + edgePadding * 2 + leftRibbonSpace + rightRibbonSpace;
    const renderedWidth = noteFieldWidth + markerGap + markerDiameter;
    const noteFieldLeft = -edgePadding - leftRibbonSpace;
    const viewportY = (steps - lastRow) * height - edgePadding;
    svg.setAttribute("viewBox", `${noteFieldLeft - markerGap - markerDiameter} ${viewportY} ${renderedWidth} ${(lastRow-firstRow) * height + edgePadding * 2}`);
    svg.dataset.windowShiftY = String((steps - lastRow) * height);
    svg.dataset.gridOriginY = String(steps * height);
    // Expanding the viewBox for ribbons must not scale down the established grid geometry.
    svg.style.width = `${renderedWidth}px`;
    svg.setAttribute("role", "img");
    const scoreDescription=global.Play12I18n?.t?.('First {count} measures in Play12 notation',{count:measureCount}) || `First ${measureCount} measures in Play12 notation`;
    svg.setAttribute("aria-label", `${document.score.title}: ${scoreDescription}`);
    svg.classList.add("play12-score");
    svg.dataset.totalQuarters = String(endQ);
    svg.dataset.stepQuarters = String(stepQ);
    svg.dataset.cellHeight = String(height);
    svg.dataset.timelineOriginY = String(steps * height + edgePadding);
    svg.dataset.noteFieldWidth = String(noteFieldWidth);
    svg.dataset.roundMarkerGap = String(markerGap);
    svg.dataset.roundMarkerDiameter = String(markerDiameter);

    const make = (tag, attrs = {}, text = null) => {
      const el = global.document.createElementNS(svgNS, tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
      if (text != null) el.textContent = text;
      svg.appendChild(el);
      return el;
    };

    if (cfg.segments) {
      for (const segment of segmentList) {
        for (const occurrence of segment.occurrences) {
          const occurrenceStart = fraction(occurrence.start_quarters_global);
          const occurrenceEnd = fraction(occurrence.end_quarters_global);
          if (window && (occurrenceEnd < firstRow * stepQ || occurrenceStart > lastRow * stepQ)) continue;
          const y = (steps - (occurrenceEnd - startQ) / stepQ) * height;
          const ribbon = make("rect", {
            x: segment.hand === "R" ? totalWidth + ribbonGap : -ribbonGap - ribbonWidth,
            y,
            width: ribbonWidth,
            height: ((occurrenceEnd - occurrenceStart) / stepQ) * height,
            rx: ribbonWidth / 2,
            fill: segment.display_color,
            "fill-opacity": 0.78,
            class: "play12-segment-ribbon",
            "data-segment-id": segment.segment_id,
            "data-hand": segment.hand || "both",
          });
          const title = global.document.createElementNS(svgNS, "title");
          title.textContent = `${segment.segment_id} · ${segment.hand || "both"}: rounds ${occurrence.measure_start}–${occurrence.measure_end}`;
          ribbon.appendChild(title);
        }
      }
    }

    const editorRounds=document.editor?.fermataTimeline?.rounds??document.editor?.rounds;
    const holds=cfg.editorTimeline ? document.editor?.fermataTimeline?.holds??[] : [];
    let roundStart = 0;
    selection.selectedMeasures.forEach((measure, index) => {
      const time = measure.attributes.time;
      const length = cfg.editorTimeline && measure.editor_duration_q ? editorRounds?.[index]?.measureQuarters??fraction(measure.editor_duration_q) : time.beats * 4 / time.beat_type;
      const measureStart = roundStart;
      roundStart += length;
      if (window && (roundStart < firstRow * stepQ || measureStart > lastRow * stepQ)) return;
      const centerY = (steps - (measureStart + length / 2 - startQ) / stepQ) * height;
      const centerX = noteFieldLeft - markerGap - markerDiameter / 2;
      const marker = global.document.createElementNS(svgNS, "g");
      marker.setAttribute("class", "play12-round-marker");
      marker.setAttribute("data-round-marker", String(index + 1));
      marker.setAttribute("data-round-left-x",String(centerX));
      marker.setAttribute("data-round-top-x", String(noteFieldLeft + noteFieldWidth / 2));
      marker.setAttribute("data-round-top-y", String((steps - (roundStart - startQ) / stepQ) * height));
      marker.setAttribute("transform", cfg.roundMarkerPlacement==='left-top'?`translate(${centerX} ${marker.getAttribute("data-round-top-y")})`:cfg.roundMarkerPlacement==='top-center'?`translate(${marker.getAttribute("data-round-top-x")} ${marker.getAttribute("data-round-top-y")})`:`translate(${centerX} ${centerY})`);
      const circle = global.document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", String(markerDiameter / 2)); circle.setAttribute("class", "play12-round-marker-circle");
      const number = global.document.createElementNS(svgNS, "text");
      number.setAttribute("class", "play12-round-marker-number"); number.textContent = String(index + 1);
      const check = global.document.createElementNS(svgNS, "text");
      check.setAttribute("class", "play12-round-marker-check"); check.textContent = "✓";
      marker.appendChild(circle); marker.appendChild(number); marker.appendChild(check); svg.appendChild(marker);
    });

    const time = selection.selectedMeasures[0].attributes.time;
    const meter = `${time.beats}/${time.beat_type}`;
    const beatSteps = (4 / time.beat_type) / stepQ;
    const measureSteps = time.beats * beatSteps;
    const metricMap = cfg.metricMaps[meter] || (cfg.editorTimeline ? Array.from({length:time.beats}, (_,i) => i === 0 ? "primary" : "weak") : undefined);
    const countLabels = [];
    const metricRounds=cfg.editorTimeline&&(document.editor?.fermataTimeline?.metricRounds??document.editor?.metricMap?.rounds);
    if(metricRounds){
      const lower=firstRow*stepQ, upper=lastRow*stepQ;
      const words=cfg.countAnd==='И'
        ? ['РАЗ','ДВА','ТРИ','ЧЕ','ПЯТЬ','ШЕСТЬ','СЕМЬ','ВОСЕМЬ','ДЕВЯТЬ','ДЕСЯТЬ','ОДИННАДЦАТЬ','ДВЕНАДЦАТЬ']
        : ['ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE'];
      const drawStep=(start,end,level,label)=>{
        const top=Math.min(upper,end),bottom=Math.max(lower,start);
        if(top<=bottom)return;
        const y=(steps-top/stepQ)*height, h=(top-bottom)/stepQ*height;
        const background={y,height:h,rx:width*cfg.radiusRatio,fill:level?'#CEF932':'#FFFFFF',
          'fill-opacity':level?cfg.metricOpacity[level]:1};
        make('rect',{...background,x:handWidth,width:countWidth,class:'play12-count-space'});
        for(let lane=0;lane<10;lane++){
          const x=lane<5?lane*width:rightStart+(lane-5)*width;
          make('rect',{...background,x,width,class:'play12-cell'});
        }
        const center=(start+end)/2;
        if(label&&center>=lower&&center<upper)countLabels.push({
          text:label,x:handWidth+countWidth/2,y:(steps-center/stepQ)*height,
          beat:!!level,primary:level==='primary',fit:true,
        });
      };
      for(const round of metricRounds.slice(0,measureCount)){
        const start=fraction(round.start),end=fraction(round.end);
        if(end<=lower||start>=upper)continue;
        if(!round.counts.length){drawStep(start,end,null,null);continue;}
        for(const count of round.counts){
          const at=fraction(count.start),until=at+fraction(count.duration);
          if(until<=lower||at>=upper)continue;
          const subdivisions=count.subdivisions;
          if(!subdivisions.length){drawStep(at,until,null,null);continue;}
          const first=fraction(subdivisions[0].position);
          if(first>at)drawStep(at,first,null,null);
          for(const step of subdivisions){
            const start=fraction(step.position);
            const isCount=count.pulse&&step.count===true;
            const level=isCount?count.accent.toLowerCase():null;
            const label=isCount?(words[count.index]??String(count.index+1)):(cfg.countAnd==='И'?step.labelRU:step.labelEN);
            drawStep(start,start+fraction(step.duration),level,label);
          }
        }
      }
    }else{
      for (let s = firstRow; s < lastRow; s++) {
        const y = (steps - 1 - s) * height;
        const round = cfg.editorTimeline ? editorRounds.find(r => s * stepQ >= r.start && s * stepQ < r.end) : null;
        const size = round ? round.beatQuarters / stepQ : beatSteps;
        const relative = round ? s - round.measureStart / stepQ : s % measureSteps;
        const beat = round?.beatsAt ? round.beatsAt.findIndex(q=>Math.abs(q-s*stepQ)<1e-7) : Math.floor(relative / size);
        const withinBeat = round?.beatsAt ? (beat<0?1:0) : relative % size;
        const map = round ? cfg.metricMaps[`${round.beats}/${round.beatType}`] : metricMap;
        const level = withinBeat === 0 ? (map?.[beat] ?? (beat === 0 ? "primary" : "weak")) : null;
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
        const inHold=holds.some(h=>h.start<=s*stepQ&&s*stepQ<h.end);
        const countText = withinBeat === 0 ? (cfg.countWords[beat + 1] ?? String(beat + 1)) : cfg.countAnd;
        if (!inHold && !(cfg.editorTimeline && (round?.beatQuarters ?? beatSteps*stepQ) < stepQ)) countLabels.push({ text: countText, x: handWidth + countWidth / 2, y: y + height * 0.63, beat: withinBeat === 0, primary: withinBeat === 0 && beat === 0 });
      }

      // A coarse grid can have fewer rows than the meter has beats (e.g. 6/8).
      // Place beat labels at their own times, independent of the editable grid.
      if (cfg.editorTimeline) {
        for (const round of editorRounds.slice(0, measureCount)) {
          if (round.beatQuarters >= stepQ || round.end <= firstRow * stepQ || round.start >= lastRow * stepQ) continue;
          for (let beat = 0; beat < round.beats; beat++) {
            const start = round.beatsAt?.[beat]??round.measureStart + beat * round.beatQuarters;
            if (start < round.start || start >= round.end) continue;
            const y = (steps - (start + round.beatQuarters / 2) / stepQ) * height;
            countLabels.push({text: cfg.countWords[beat + 1] ?? String(beat + 1), x: handWidth + countWidth / 2, y, beat: true, primary: beat === 0});
          }
        }
      }

    }

    const borders = cfg.editorTimeline ? editorRounds.slice(0, measureCount) :
      Array.from({length: Math.ceil(steps / measureSteps)}, (_, i) => ({start: i * measureSteps * stepQ, end: (i + 1) * measureSteps * stepQ}));
    for (const round of borders) {
      if (round.end <= firstRow * stepQ || round.start >= lastRow * stepQ) continue;
      const measureY = (steps - round.end / stepQ) * height;
      const measureHeight = (round.end - round.start) / stepQ * height;
      make("rect", { x: 0, y: measureY, width: handWidth, height: measureHeight, rx: width * cfg.radiusRatio, fill: "none", stroke: "#6B7280", "stroke-opacity": 0.28, "stroke-width": 1 });
      make("rect", { x: rightStart, y: measureY, width: handWidth, height: measureHeight, rx: width * cfg.radiusRatio, fill: "none", stroke: "#6B7280", "stroke-opacity": 0.28, "stroke-width": 1 });
    }
    for (const item of countLabels) {
      const countClass = item.primary ? "play12-count play12-count-primary" : item.beat ? "play12-count play12-count-beat" : "play12-count play12-count-and";
      const fit=item.fit&&item.text.length>=5?{textLength:Math.min(countWidth*.9,item.text.length*3.8),lengthAdjust:'spacingAndGlyphs'}:{};
      make("text", { x: item.x, y: item.y, "text-anchor": "middle", class: countClass,
        ...(item.fit?{'dominant-baseline':'central'}:{}),...fit }, item.text);
    }

    const dynamic = cfg.editorTimeline ? (document.score.parts.flatMap(p => p.measures).flatMap(m => m.dynamic_marks || [])[0]?.value || "mf") : dynamicAtStart(document);
    const fillOpacity = cfg.dynamicsOpacity[dynamic];
    if (fillOpacity == null) throw new Error(`No opacity configured for dynamic ${dynamic}`);
    const hasTrails=notes.some(({note})=>note.fermataTrail);
    const trailDefs=hasTrails?make("defs"):null;
    const trailLayer=hasTrails?make("g",{class:"play12-fermata-trails","pointer-events":"none"}):null;
    const trailGradients=new Map();
    for (const item of notes) {
      const { note, displayFingering } = item;
      const finger = displayFingering.finger;
      const noteX = rightStart + (finger - 1) * width;
      const unassigned = displayFingering.mode === "unassigned";
      const blockWidth = unassigned ? Math.min(countWidth / 3, width * .55) : width;
      const handX = unassigned ? (note.hand === "R" ? rightStart - blockWidth : handWidth)
        : (note.hand === "R" ? noteX : (5 - finger) * width);
      const noteStart = (note.globalStart - startQ) / stepQ;
      const noteDuration = fraction(note.duration_quarters) / stepQ;
      const y = (steps - noteStart - noteDuration) * height;
      const group = global.document.createElementNS(svgNS, "g");
      group.setAttribute("data-event-id", note.id);
      group.setAttribute("data-hand", note.hand);
      group.setAttribute("data-finger", displayFingering.mode === "unassigned" ? "" : finger);
      group.setAttribute("data-global-start-quarters", note.globalStart);
      group.setAttribute("data-duration-quarters", fraction(note.duration_quarters));
      group.setAttribute("data-midi", note.pitch.midi);
      group.setAttribute("data-dynamic", dynamic);
      group.setAttribute("data-fingering-mode", displayFingering.mode);
      if (note.method.fingering_source) group.setAttribute("data-fingering-source", note.method.fingering_source);
      group.setAttribute("data-measure-index", note.measureIndex);
      if (displayFingering.confidence != null) group.setAttribute("data-fingering-confidence", displayFingering.confidence);
      if (displayFingering.mode === "auto-candidate") group.classList.add("play12-auto-candidate");
      if (displayFingering.mode === "review") group.classList.add("play12-reviewed-candidate");
      if (cfg.noteSelectionEnabled || displayFingering.candidate) {
        group.setAttribute("role", "button");
        group.setAttribute("tabindex", "0");
        group.setAttribute("aria-label", cfg.noteSelectionEnabled
          ? `${note.pitch.step}${note.pitch.alter === 1 ? "#" : note.pitch.alter === -1 ? "b" : ""}${note.pitch.octave}, ${note.hand}, edit note`
          : `${note.pitch.step}${note.pitch.alter === 1 ? "#" : note.pitch.alter === -1 ? "b" : ""}${note.pitch.octave}, ${note.hand}, кандидат: палец ${displayFingering.candidate.finger}`);
        if (cfg.selectedEventId === note.id) group.classList.add("is-review-selected");
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
      block.setAttribute("width", blockWidth);
      block.setAttribute("height", noteDuration * height);
      block.setAttribute("rx", width * cfg.radiusRatio);
      const officialColor = cfg.wrapCycles ? cfg.colors[((Math.floor((note.pitch.midi-(document.play12.reference_zero_midi ?? 21))/12)%cfg.colors.length)+cfg.colors.length)%cfg.colors.length] : colorForMidi(note.pitch.midi, cfg.colors, document.play12.reference_zero_midi ?? 21);
      block.setAttribute("fill", mixWithWhite(officialColor, fillOpacity));
      if(note.fermataTrail){
        const trailHeight=fraction(note.fermataTrail)/stepQ*height;
        const overlap=(note.continuousPerformance ? fraction(note.trailSegment)/stepQ : noteDuration)*height/3;
        const color=block.getAttribute("fill");
        const fadeStart=(overlap/(trailHeight+overlap)).toFixed(9);
        const key=`${color}:${fadeStart}`;
        let id=trailGradients.get(key);
        if(!id){
          id=`play12-fermata-${trailGradients.size+1}`;
          trailGradients.set(key,id);
          const gradient=global.document.createElementNS(svgNS,"linearGradient");
          for(const [name,value] of Object.entries({id,x1:0,x2:0,y1:1,y2:0})){
            gradient.setAttribute(name,value);
          }
          for(const [offset,opacity] of [[fadeStart,1],[1,0]]){
            const stop=global.document.createElementNS(svgNS,"stop");
            stop.setAttribute("offset",offset);
            stop.setAttribute("stop-color",color);
            stop.setAttribute("stop-opacity",opacity);
            gradient.appendChild(stop);
          }
          trailDefs.appendChild(gradient);
        }
        const trail=global.document.createElementNS(svgNS,"rect");
        for(const [key,value] of Object.entries({x:handX,y:y-trailHeight,width:blockWidth,height:trailHeight+overlap,
          fill:`url(#${id})`,"data-fermata-trail":note.id}))trail.setAttribute(key,value);
        trailLayer.appendChild(trail);
      }
      block.setAttribute("fill-opacity", 1);
      block.setAttribute("stroke", "#111111");
      if (unassigned) block.setAttribute("stroke-dasharray", "3 2");
      block.setAttribute("stroke-width", cfg.gridLineWidth * cfg.noteBorderRatio);
      group.appendChild(block);
      const activeGlow = global.document.createElementNS(svgNS, "rect");
      activeGlow.setAttribute("x", handX);
      activeGlow.setAttribute("y", y);
      activeGlow.setAttribute("width", blockWidth);
      activeGlow.setAttribute("height", noteDuration * height);
      activeGlow.setAttribute("rx", width * cfg.radiusRatio);
      activeGlow.setAttribute("fill", "#FFFFFF");
      activeGlow.setAttribute("class", "play12-active-glow");
      activeGlow.setAttribute("pointer-events", "none");
      group.appendChild(activeGlow);
      const label = global.document.createElementNS(svgNS, "text");
      label.setAttribute("x", handX + blockWidth / 2);
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

  function renderWindowed(document, mount, options) {
    const selection = selectMeasureRange(document, options.measureCount, options);
    const step = gridInQuarters(options.gridResolution);
    const steps = Math.ceil(selection.totalQuarters / step);
    const buffer = Math.ceil(8 / step);
    let range = {from: 0, to: Math.min(steps, buffer * 2)};
    let longest = 0;
    const index = selection.notes.map((note, order) => {
      const duration = fraction(note.duration_quarters) + (note.fermataTrail ? fraction(note.fermataTrail) : 0);
      longest = Math.max(longest, duration);
      return {note, order, end: note.globalStart + duration};
    }).sort((a, b) => a.note.globalStart - b.note.globalStart);
    const draw = (scoreWindow, host) => {
      const start = scoreWindow.from * step, stop = scoreWindow.to * step;
      let low = 0, high = index.length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (index[mid].note.globalStart < start - longest) low = mid + 1;
        else high = mid;
      }
      const visible = [];
      for (let i = low; i < index.length && index[i].note.globalStart < stop; i++) {
        if (index[i].end >= start) visible.push(index[i]);
      }
      const windowNotes = visible.sort((a, b) => a.order - b.order).map(item => item.note);
      return renderPlay12(document, host, {...options, selection, scoreWindow, windowNotes});
    };
    const svg = draw(range, mount);
    svg.ensureScoreWindow = (position, span, anchor = position) => {
      const from = Math.min(steps-1, Math.max(0, Math.floor(position / step)));
      const to = Math.min(steps, Math.max(from+1, Math.ceil(Math.max(anchor, position+span) / step)+1));
      if (from >= range.from && to <= range.to &&
          (range.from === 0 || from - range.from >= buffer / 2) &&
          (range.to === steps || range.to - to >= buffer / 2)) return false;
      range = {from: Math.max(0, from-buffer), to: Math.min(steps, to+buffer)};
      const next = draw(range, {replaceChildren(){}});
      const preCount = svg.querySelector(".play12-precount-layer");
      svg.replaceChildren(...next.children);
      if (preCount) svg.appendChild(preCount);
      svg.setAttribute("viewBox", next.getAttribute("viewBox"));
      svg.dataset.windowShiftY = next.dataset.windowShiftY;
      return true;
    };
    return svg;
  }

  global.Play12Renderer = { render: renderPlay12, renderWindowed, collectMissingFingering, resolveDisplayFingering, defaults: DEFAULTS };
})(window);
