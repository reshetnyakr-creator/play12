/* Play12 Playback UX v0.3. AudioContext.currentTime is the only running clock. */
(function (global) {
  "use strict";

  const DYNAMIC_GAIN = { pp: .5, p: .6, mp: .7, mf: .8, f: .9, ff: 1 };
  const METRONOME_GAIN = [0, .12, .25, .45, .75, 1.15, 1.65];
  const LOOP_EMPTY_ROUNDS = 2;
  const PRACTICE_TIMING = Object.freeze({ earlyToleranceMs:150, lateToleranceMs:200, perfectEarlyMs:-50, perfectLateMs:80 });
  const CHORD_WINDOW_MS = 150;
  const EPSILON = 1e-7;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const practiceScheduleEnd = (normalHorizon, expectedStart) =>
    Number.isFinite(expectedStart) ? Math.min(normalHorizon, expectedStart - EPSILON) : normalHorizon;
  const findPracticeEvent = (events, position, loop = null) => events.find(expected =>
    !expected.completed &&
    expected.start >= position - EPSILON &&
    (!loop || (expected.start >= loop.start - EPSILON && expected.start < loop.end - EPSILON))
  ) || null;
  const classifyPracticeTiming = deltaMs => {
    if (deltaMs < -PRACTICE_TIMING.earlyToleranceMs) return "too_early";
    if (deltaMs < PRACTICE_TIMING.perfectEarlyMs) return "early_ok";
    if (deltaMs <= PRACTICE_TIMING.perfectLateMs) return "perfect";
    if (deltaMs <= PRACTICE_TIMING.lateToleranceMs) return "late_ok";
    return "too_late_waited";
  };
  const effectiveMidiPitch = (sourceMidiPitch, referenceZeroNote, runtimeZeroNote) =>
    sourceMidiPitch + runtimeZeroNote - referenceZeroNote;

  class PlaybackClock {
    constructor(audioContext, bpm, position = 0) {
      this.context = audioContext;
      this.bpm = bpm;
      this.anchorQuarter = position;
      this.anchorAudioTime = audioContext.currentTime;
      this.running = false;
      this.ceiling = Infinity;
    }
    get position() {
      if (!this.running) return this.anchorQuarter;
      return Math.min(this.ceiling, this.anchorQuarter + (this.context.currentTime - this.anchorAudioTime) * this.bpm / 60);
    }
    start(position = this.anchorQuarter, audioTime = this.context.currentTime) {
      this.anchorQuarter = position;
      this.anchorAudioTime = audioTime;
      this.running = true;
    }
    pause(position = this.position) {
      this.anchorQuarter = position;
      this.anchorAudioTime = this.context.currentTime;
      this.running = false;
    }
    seek(position) {
      const wasRunning = this.running;
      this.anchorQuarter = position;
      this.anchorAudioTime = this.context.currentTime;
      this.running = wasRunning;
    }
    setBpm(bpm) {
      const now = this.position;
      this.bpm = bpm;
      this.anchorQuarter = now;
      this.anchorAudioTime = this.context.currentTime;
    }
    quarterToAudioTime(quarter) {
      return this.anchorAudioTime + (quarter - this.anchorQuarter) * 60 / this.bpm;
    }
    setCeiling(quarter = Infinity) {
      this.ceiling = quarter;
    }
  }

  class WebAudioEngine {
    constructor(context, stage) {
      this.context = context;
      this.stage = stage;
      this.sources = new Set();
      this.voices = new Map();
      this.noteKeys = new Set();
      this.beatKeys = new Set();
      this.pendingBeatVisuals = [];
      this.master = context.createGain();
      this.master.gain.value = .18;
      this.master.connect(context.destination);
      this.robotGain = context.createGain();
      this.robotGain.connect(this.master);
      this.metronomeGain = context.createGain();
      this.metronomeGain.gain.value = METRONOME_GAIN[4];
      this.metronomeGain.connect(this.master);
    }
    track(source) {
      this.sources.add(source);
      source.addEventListener("ended", () => this.sources.delete(source), { once: true });
    }
    stopAll(at = this.context.currentTime, preserveRobot = false, preserveMusical = false) {
      const retainedSources = new Set();
      for (const [key, voice] of this.voices) {
        if ((preserveRobot && key.startsWith("robot:")) || (preserveMusical && voice.startedAt <= at && voice.endsAt > at)) voice.oscillators.forEach(source => retainedSources.add(source));
      }
      for (const source of this.sources) {
        if (retainedSources.has(source)) continue;
        try { source.stop(at); } catch (_) {}
        this.sources.delete(source);
      }
      for (const [key, voice] of this.voices) if (!voice.oscillators.some(source => retainedSources.has(source))) this.voices.delete(key);
      this.noteKeys.clear();
      this.beatKeys.clear();
      this.pendingBeatVisuals.length = 0;
      this.stage.dataset.activeAudioSources = String(this.sources.size);
    }
    scheduleStopAt(at) {
      for (const source of this.sources) { try { source.stop(at); } catch (_) {} }
      this.stage.dataset.scheduledStopAudioTime = String(at);
    }
    scheduleNote(event, when, durationQuarters, bpm) {
      const key = `${event.id}@${event.start}`;
      if (this.noteKeys.has(key)) return;
      this.noteKeys.add(key);
      const duration = Math.max(.035, durationQuarters * 60 / bpm);
      this.noteOn(key, event.midi, event.dynamic, when, when + duration);
      this.noteOff(key, when + duration, true, true);
      this.stage.dataset.lastScheduledNote = event.id;
      this.stage.dataset.lastScheduledNoteAudioTime = String(when);
      this.stage.dataset.activeAudioSources = String(this.sources.size);
    }
    noteOn(key, midi, dynamic = "mf", when = this.context.currentTime, decayAt = null, output = this.master) {
      if (this.voices.has(key)) this.noteOff(key, when);
      const gain = this.context.createGain();
      const level = DYNAMIC_GAIN[dynamic] || .8;
      gain.gain.setValueAtTime(.0001, when);
      gain.gain.exponentialRampToValueAtTime(.34 * level, when + .012);
      if (decayAt != null) gain.gain.exponentialRampToValueAtTime(.0001, decayAt);
      gain.connect(output);
      const oscillators = [];
      for (const [type, ratio, amount] of [["triangle", 1, 1], ["sine", 2, .16]]) {
        const oscillator = this.context.createOscillator();
        const partial = this.context.createGain();
        oscillator.type = type;
        oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12) * ratio;
        partial.gain.value = amount;
        oscillator.connect(partial).connect(gain);
        oscillator.start(when);
        this.track(oscillator);
        oscillators.push(oscillator);
      }
      this.voices.set(key, { gain, oscillators, startedAt: when, endsAt: decayAt });
      this.stage.dataset.activeAudioSources = String(this.sources.size);
    }
    noteOff(key, when = this.context.currentTime, preserveScheduledEnvelope = false, retainUntilEnd = false) {
      const voice = this.voices.get(key);
      if (!voice) return;
      const releaseEnd = when + (preserveScheduledEnvelope ? .025 : .035);
      if (!preserveScheduledEnvelope) {
        voice.gain.gain.cancelScheduledValues(when);
        voice.gain.gain.setValueAtTime(Math.max(.0001, voice.gain.gain.value), when);
        voice.gain.gain.exponentialRampToValueAtTime(.0001, releaseEnd);
      }
      for (const oscillator of voice.oscillators) { try { oscillator.stop(releaseEnd); } catch (_) {} }
      if (retainUntilEnd) {
        voice.oscillators[0].addEventListener("ended", () => {
          if (this.voices.get(key) === voice) this.voices.delete(key);
        }, { once: true });
      } else this.voices.delete(key);
    }
    scheduleClick(key, when, accent) {
      if (this.beatKeys.has(key)) return;
      this.beatKeys.add(key);
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = accent ? 1320 : 920;
      gain.gain.setValueAtTime(accent ? .34 : .19, when);
      gain.gain.exponentialRampToValueAtTime(.0001, when + .045);
      oscillator.connect(gain).connect(this.metronomeGain);
      oscillator.start(when);
      oscillator.stop(when + .05);
      this.track(oscillator);
      this.pendingBeatVisuals.push({ key, when, accent });
      this.pendingBeatVisuals.sort((a, b) => a.when - b.when);
      this.stage.dataset.lastScheduledBeat = key;
      this.stage.dataset.lastScheduledBeatAudioTime = String(when);
    }
    flushBeatVisuals(now, callback) {
      while (this.pendingBeatVisuals.length && this.pendingBeatVisuals[0].when <= now + .008) {
        callback(this.pendingBeatVisuals.shift());
      }
    }
    setMetronomeLevel(level) {
      const safeLevel = clamp(Math.round(Number(level) || 0), 0, 6);
      this.metronomeGain.gain.setValueAtTime(METRONOME_GAIN[safeLevel], this.context.currentTime);
      this.stage.dataset.metronomeVolume = String(safeLevel);
    }
  }

  class Controller {
    constructor(options) {
      Object.assign(this, options);
      if (!Number.isInteger(options.referenceZeroNote) || !Number.isInteger(options.runtimeZeroNote)) {
        throw new Error("Playback requires integer referenceZeroNote and runtimeZeroNote");
      }
      this.referenceZeroNote = options.referenceZeroNote;
      this.runtimeZeroNote = options.runtimeZeroNote;
      this.transposeDelta = this.runtimeZeroNote - this.referenceZeroNote;
      const AudioContext = global.AudioContext || global.webkitAudioContext;
      this.audioContext = new AudioContext();
      this.clock = new PlaybackClock(this.audioContext, options.initialBpm, 0);
      this.audio = new WebAudioEngine(this.audioContext, this.stage);
      this.audio.setMetronomeLevel(this.metronomeVolumeInput?.value ?? 4);
      if (this.metronomeButton) {
        // Separate sources, same AudioContext and BPM: musical transport can wait/stop independently.
        this.metronomeAudio = new WebAudioEngine(this.audioContext, this.stage);
        this.metronomeBeatCounter = 0;
        this.syncTempoControls();
        this.setMetronome(this.metronomeInput.checked, false);
      }
      this.inputNotes = new Map();
      this.noteListeners = new Set();
      this.stateListeners = new Set();
      this.audioResumePromise = Promise.resolve();
      if (this.pianoView) this.pianoView.mount.addEventListener("pointerdown", () => {
        this.unlockAudio();
      }, { capture: true });
      if (this.pianoView) this.pianoView.setVirtualNoteHandlers({
        noteOn: (midi, pointerId) => this.handleNoteOn(midi, 100, "mouse", pointerId),
        noteOff: (midi, pointerId) => this.handleNoteOff(midi, "mouse", pointerId)
      });
      this.preRollPrep = null;
      this.countIn = null;
      this.pauseTarget = null;
      this.loopGap = null;
      this.lastPulseIndex = null;
      this.loopWrapCount = 0;
      this.beatQuarters = this.rounds[0].beatQuarters;
      this.beatsPerMeasure = this.rounds[0].beats;
      this.measureQuarters = this.rounds[0].measureQuarters;
      this.lastPlaybackPosition = null;
      this.robotEvents = new Map();
      this.practiceSettings = { practiceLeftHandEnabled: true, practiceRightHandEnabled: true, oneSkillMode: false, activeSkillId: null };
      this.practicePaused = true;
      this.practiceEvents = [];
      this.expectedPracticeEvent = null;
      this.waitingForInput = null;
      this.playline.addEventListener("play12:modulemove", () => this.syncDraggedPlayMode());
      this.bindControls();
      this.replaceSvg(this.svg);
      this.coreResizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(this.coreResizeFrame);
        this.coreResizeFrame = requestAnimationFrame(() => this.layoutCoreGeometry());
      });
      this.coreResizeObserver.observe(this.stage);
      if (this.pianoView?.mount) this.coreResizeObserver.observe(this.pianoView.mount);
      this.paint(0);
      this.updateControls();
      this.frame = requestAnimationFrame(() => this.tick());
    }
    unlockAudio() {
      if (this.audioContext.state !== "running") this.audioResumePromise = this.audioContext.resume();
      return this.audioResumePromise;
    }
    handleNoteOn(midiNote, velocity = 100, source = "mouse", token = midiNote) {
      const key = `${source}:${token}`;
      this.handleNoteOff(midiNote, source, token);
      const intent = { midi: midiNote, velocity, source, started: false, released: false };
      this.inputNotes.set(key, intent);
      for (const listener of this.noteListeners) listener({ type: "note-on", midiNote, velocity, source });
      if (source === "mouse" || source === "midi") this.acceptPracticeInput(midiNote);
      this.syncInputVisual(source);
      const start = async () => {
        await this.unlockAudio();
        if (this.audioContext.state !== "running") throw new Error(`AudioContext remained ${this.audioContext.state}`);
        if (this.inputNotes.get(key) !== intent) return;
        this.audio.noteOn(key, midiNote, "mf", this.audioContext.currentTime);
        intent.started = true;
        this.stage.dataset.lastInputNoteOn = `${source}:${midiNote}:${velocity}`;
        if (intent.released) {
          this.audio.noteOff(key, this.audioContext.currentTime + .06);
          this.inputNotes.delete(key);
        }
      };
      start().catch(error => {
        this.stage.dataset.inputAudioError = error.message;
        console.error(`${source} piano note-on failed`, error);
      });
    }
    handleNoteOff(midiNote, source = "mouse", token = midiNote) {
      const key = `${source}:${token}`;
      const intent = this.inputNotes.get(key);
      if (!intent) return;
      intent.released = true;
      if (intent.started) {
        this.audio.noteOff(key, this.audioContext.currentTime);
        this.inputNotes.delete(key);
      }
      this.syncInputVisual(source);
      this.stage.dataset.lastInputNoteOff = `${source}:${midiNote}`;
    }
    addNoteListener(listener) {
      this.noteListeners.add(listener);
      return () => this.noteListeners.delete(listener);
    }
    snapshot() {
      const position = this.clock.position;
      return {
        state: this.stage.dataset.state || "paused",
        position,
        bpm: this.clock.bpm,
        running: this.clock.running,
        ended: position >= this.totalQuarters - EPSILON && !this.clock.running
      };
    }
    addStateListener(listener) {
      this.stateListeners.add(listener);
      listener(this.snapshot());
      return () => this.stateListeners.delete(listener);
    }
    emitState() {
      const snapshot = this.snapshot();
      for (const listener of this.stateListeners) listener(snapshot);
    }
    setRuntimeZeroNote(midiNote) {
      if (!Number.isInteger(midiNote)) throw new Error(`Invalid runtime zero MIDI note: ${midiNote}`);
      if (midiNote === this.runtimeZeroNote) return;
      this.resetRobotNotes();
      this.runtimeZeroNote = midiNote;
      this.transposeDelta = this.runtimeZeroNote - this.referenceZeroNote;
      for (const event of this.events) {
        event.midi = effectiveMidiPitch(event.sourceMidi, this.referenceZeroNote, this.runtimeZeroNote);
        event.group.dataset.effectiveMidi = String(event.midi);
      }
      Object.assign(this.stage.dataset, {
        referenceZeroNote: String(this.referenceZeroNote),
        runtimeZeroNote: String(this.runtimeZeroNote),
        transposeDelta: String(this.transposeDelta)
      });
      if (this.practiceEnabled()) {
        for (const expected of this.practiceEvents) { expected.matchedPitches.clear(); expected.candidateStartedAt = null; }
        this.armPracticeGate(this.clock.position);
      }
      this.paint(this.displayPosition ?? this.clock.position);
      if (this.clock.running) {
        this.audio.stopAll();
        for (const [key, intent] of this.inputNotes) {
          if (intent.released) continue;
          this.audio.noteOn(key, intent.midi, "mf", this.audioContext.currentTime);
          intent.started = true;
        }
        this.lastPlaybackPosition = this.clock.position - EPSILON;
        this.scheduleAhead();
      }
    }
    syncInputVisual(source) {
      if (!this.pianoView) return;
      const midis = [...this.inputNotes.values()].filter(note => note.source === source && !note.released).map(note => note.midi);
      this.pianoView.setActiveMidis(midis, source);
    }
    replaceSvg(svg) {
      this.resetRobotNotes();
      this.svg = svg;
      this.totalQuarters = Number(svg.dataset.totalQuarters) - this.timelineOffset;
      this.stepQuarters = Number(svg.dataset.stepQuarters);
      this.cellHeight = Number(svg.dataset.cellHeight);
      this.originY = Number(svg.dataset.timelineOriginY);
      this.events = [...svg.querySelectorAll("g[data-event-id]")].map(group => {
        const sourceMidi = Number(group.dataset.midi);
        const midi = effectiveMidiPitch(sourceMidi, this.referenceZeroNote, this.runtimeZeroNote);
        group.dataset.sourceMidi = String(sourceMidi);
        group.dataset.effectiveMidi = String(midi);
        return {
          group, id: group.dataset.eventId, start: Number(group.dataset.globalStartQuarters) - this.timelineOffset,
          duration: Number(group.dataset.durationQuarters), hand: group.dataset.hand, sourceMidi, midi, dynamic: group.dataset.dynamic
        };
      });
      this.buildPracticeEvents();
      Object.assign(this.stage.dataset, {
        referenceZeroNote: String(this.referenceZeroNote),
        runtimeZeroNote: String(this.runtimeZeroNote),
        transposeDelta: String(this.transposeDelta)
      });
      this.stage.dataset.gridResolution = this.gridResolutionInput ? this.gridResolutionInput.value : "1/16";
      this.stage.dataset.stepQuarters = String(this.stepQuarters);
      this.layoutCoreGeometry();
    }
    layoutCoreGeometry() {
      if (!this.svg?.isConnected || !this.pianoView?.mount?.isConnected) return;
      const lineOverhang = Number(this.svg.querySelector(".play12-cell").getAttribute("width"));
      const scoreWidth = this.svg.getBoundingClientRect().width;
      const compactPlayer = this.stage.closest(".mvp-playback-host");
      const shellPadding = 7;
      if (compactPlayer) {
        this.stage.style.width = `${scoreWidth + shellPadding * 2}px`;
        this.stage.dataset.playerShellPadding = String(shellPadding);
        this.playline.style.setProperty("--mvp-note-field-width", `${scoreWidth}px`);
      }
      const stageRect = this.stage.getBoundingClientRect();
      const pianoRect = this.pianoView.mount.getBoundingClientRect();
      const scoreLeft = compactPlayer
        ? shellPadding
        : pianoRect.left - stageRect.left + (pianoRect.width - scoreWidth) / 2;
      this.svg.parentElement.style.left = `${scoreLeft}px`;
      if (compactPlayer) {
        const scoreRect = this.svg.getBoundingClientRect();
        this.playline.style.setProperty("--mvp-note-field-center-x", `${(scoreRect.left + scoreRect.right) / 2}px`);
      }
      const executionHeight = Math.max(0, this.executionY());
      // Extend the clipped score one physical pixel under the opaque zone.
      // This hides fractional-transform antialias seams without exposing past music.
      this.svg.parentElement.style.height = `${executionHeight + 1}px`;
      this.svg.parentElement.style.overflow = "hidden";
      if (compactPlayer && document.body.classList.contains("play12-onboarding-listen")) {
        const shell = this.stage.querySelector(".unified-playback-block");
        if (shell) shell.style.height = `${executionHeight + 1}px`;
      }
      if (this.playline.dataset.dragPositioned !== "true") {
        this.playline.style.left = `${compactPlayer ? 0 : scoreLeft - lineOverhang}px`;
        this.playline.style.right = "auto";
      }
      this.playline.style.width = `${compactPlayer ? scoreWidth + shellPadding * 2 : scoreWidth + lineOverhang * 2}px`;
      this.playline.style.height = `${this.cellHeight}px`;
      this.pulse.style.left = `${compactPlayer ? 0 : scoreLeft - lineOverhang}px`;
      this.pulse.style.right = "auto";
      this.pulse.style.width = `${compactPlayer ? scoreWidth + shellPadding * 2 : scoreWidth + lineOverhang * 2}px`;
      const zoneRect = this.playline.getBoundingClientRect();
      const zoneBorder = parseFloat(getComputedStyle(this.playline).borderLeftWidth) || 0;
      const cellRects = [...this.svg.querySelectorAll(".play12-cell")].map(cell => cell.getBoundingClientRect());
      this.progressStartX = Math.min(...cellRects.map(rect => rect.left)) - zoneRect.left - zoneBorder;
      this.progressEndX = Math.max(...cellRects.map(rect => rect.right)) - zoneRect.left - zoneBorder;
      if (this.playline.closest('.mvp-control-row')) {
        this.progressStartX = 16; this.progressEndX = zoneRect.width - 16;
      }
      this.stage.dataset.playlineOverhang = String(lineOverhang);
      this.stage.dataset.progressStartX = String(this.progressStartX);
      this.stage.dataset.progressEndX = String(this.progressEndX);
      this.paint(this.displayPosition ?? this.clock.position);
    }
    syncDraggedPlayMode() {
      if (!this.svg?.parentElement) return;
      this.svg.parentElement.style.height = `${this.executionY() + 1}px`;
      const zoneRect = this.playline.getBoundingClientRect();
      const zoneBorder = parseFloat(getComputedStyle(this.playline).borderLeftWidth) || 0;
      const cellRects = [...this.svg.querySelectorAll(".play12-cell")].map(cell => cell.getBoundingClientRect());
      this.progressStartX = Math.min(...cellRects.map(rect => rect.left)) - zoneRect.left - zoneBorder;
      this.progressEndX = Math.max(...cellRects.map(rect => rect.right)) - zoneRect.left - zoneBorder;
      this.paint(this.displayPosition ?? this.clock.position);
    }
    executionY() {
      return this.playline.getBoundingClientRect().top - this.stage.getBoundingClientRect().top;
    }
    signatureAt(position) {
      return this.rounds.find(round => position >= round.start - EPSILON && position < round.end - EPSILON) || this.rounds[this.rounds.length - 1];
    }
    resetRobotNotes() {
      for (const [id, state] of this.robotEvents || []) {
        if (state.status === "active") this.audio.noteOff(`robot:${id}`);
      }
      this.robotEvents?.clear();
    }
    expireRobotNotes() {
      for (const state of this.robotEvents.values()) {
        if (state.status === "active" && this.audioContext.currentTime >= state.endsAt) state.status = "completed";
      }
    }
    syncRobotNotes(position) {
      this.expireRobotNotes();
      if (!this.practiceEnabled()) return;
      for (const event of this.events) {
        if (this.isUserPracticeEvent(event) || this.robotEvents.has(event.id)) continue;
        if (position >= event.start + event.duration - EPSILON) {
          this.robotEvents.set(event.id, { status: "completed" });
        } else if (position >= event.start - EPSILON && this.musicAudioInput.checked) {
          const when = this.audioContext.currentTime;
          const endsAt = when + event.duration * 60 / this.clock.bpm;
          this.audio.noteOn(`robot:${event.id}`, event.midi, event.dynamic, when, endsAt, this.audio.robotGain);
          this.audio.noteOff(`robot:${event.id}`, endsAt, true, true);
          this.robotEvents.set(event.id, { status: "active", endsAt });
        }
      }
    }
    isUserPracticeEvent(event) {
      return event.hand === "L" ? this.practiceSettings.practiceLeftHandEnabled : this.practiceSettings.practiceRightHandEnabled;
    }
    getPracticeSettings() {
      return { practiceModeEnabled: this.practiceEnabled(), ...this.practiceSettings };
    }
    setPracticeSettings(settings) {
      const next = { ...this.practiceSettings, ...settings };
      if (!next.practiceLeftHandEnabled && !next.practiceRightHandEnabled) return false;
      this.practiceSettings = {
        practiceLeftHandEnabled: next.practiceLeftHandEnabled,
        practiceRightHandEnabled: next.practiceRightHandEnabled,
        oneSkillMode: false, activeSkillId: null
      };
      if (typeof settings.practiceModeEnabled === "boolean") this.practiceModeInput.checked = settings.practiceModeEnabled;
      this.buildPracticeEvents();
      this.changePracticeMode();
      return true;
    }
    buildPracticeEvents() {
      const slices = new Map();
      for (const event of this.events) {
        if (!this.isUserPracticeEvent(event)) continue;
        const key = event.start.toFixed(7);
        if (!slices.has(key)) slices.set(key, { start: event.start, events: [], completed: false, matchedPitches: new Set(), candidateStartedAt: null, expectedAudioTime: null, timingDeltaMs: null, timingClass: null });
        slices.get(key).events.push(event);
      }
      this.practiceEvents = [...slices.values()].sort((a, b) => a.start - b.start);
    }
    practiceEnabled() {
      return !!this.practiceModeInput?.checked;
    }
    preparePractice(position) {
      for (const expected of this.practiceEvents) {
        expected.completed = expected.start < position - EPSILON;
        expected.matchedPitches.clear();
        expected.candidateStartedAt = null;
        expected.expectedAudioTime = null;
        expected.timingDeltaMs = null;
        expected.timingClass = null;
      }
      this.waitingForInput = null;
      this.armPracticeGate(position);
    }
    armPracticeGate(position) {
      if (!this.practiceEnabled()) {
        this.expectedPracticeEvent = null;
        this.clock.setCeiling(Infinity);
        return null;
      }
      const loop = this.currentLoop();
      this.expectedPracticeEvent = findPracticeEvent(this.practiceEvents, position, loop);
      this.clock.setCeiling(this.expectedPracticeEvent?.start ?? Infinity);
      if (this.expectedPracticeEvent) {
        if (this.clock.running) this.expectedPracticeEvent.expectedAudioTime = this.clock.quarterToAudioTime(this.expectedPracticeEvent.start);
        this.stage.dataset.expectedEventStart = String(this.expectedPracticeEvent.start);
        this.stage.dataset.expectedPitches = [...new Set(this.expectedPracticeEvent.events.map(event => event.midi))].sort((a,b)=>a-b).join(",");
      }
      return this.expectedPracticeEvent;
    }
    enterPracticeWait(expected = this.expectedPracticeEvent) {
      if (!expected || expected.completed || this.waitingForInput === expected) return;
      if (!Number.isFinite(expected.expectedAudioTime)) expected.expectedAudioTime = this.clock.quarterToAudioTime(expected.start);
      this.clock.pause(expected.start);
      this.clock.setCeiling(expected.start);
      this.audio.stopAll(this.audioContext.currentTime, true);
      this.waitingForInput = expected;
      this.syncRobotNotes(expected.start);
      this.paint(expected.start);
      this.stage.dataset.practiceState = "waiting_for_input";
      this.stage.dataset.waitingSinceAudioTime = String(this.audioContext.currentTime);
      this.updateControls();
    }
    clearPracticeCandidate() {
      const expected = this.waitingForInput || this.expectedPracticeEvent;
      if (expected) { expected.matchedPitches.clear(); expected.candidateStartedAt = null; }
    }
    expirePracticeCandidate() {
      const expected = this.waitingForInput || this.expectedPracticeEvent;
      if (expected?.candidateStartedAt != null && (this.audioContext.currentTime - expected.candidateStartedAt) * 1000 > CHORD_WINDOW_MS + EPSILON) this.clearPracticeCandidate();
    }
    acceptPracticeInput(midiNote) {
      this.expirePracticeCandidate();
      const expected = this.waitingForInput || this.expectedPracticeEvent;
      if (!this.practiceEnabled() || !expected || this.practicePaused) return false;
      const expectedPitches = new Set(expected.events.map(event => event.midi));
      if (!expectedPitches.has(midiNote)) {
        this.stage.dataset.lastPracticeInput = `wrong:${midiNote}`;
        return false;
      }
      let timingDeltaMs;
      if (this.waitingForInput || this.countIn) {
        const expectedAudioTime = Number.isFinite(expected.expectedAudioTime) ? expected.expectedAudioTime : this.audioContext.currentTime;
        timingDeltaMs = (this.audioContext.currentTime - expectedAudioTime) * 1000;
      } else {
        timingDeltaMs = (this.clock.position - expected.start) * 60000 / this.clock.bpm;
      }
      if (timingDeltaMs < -PRACTICE_TIMING.earlyToleranceMs) {
        this.stage.dataset.lastPracticeInput = `too_early:${midiNote}:${timingDeltaMs.toFixed(2)}`;
        return false;
      }
      if (expectedPitches.size > 1 && expected.candidateStartedAt == null) expected.candidateStartedAt = this.audioContext.currentTime;
      expected.matchedPitches.add(midiNote);
      this.stage.dataset.lastPracticeInput = `correct:${midiNote}:${timingDeltaMs.toFixed(2)}`;
      if ([...expectedPitches].some(pitch => !expected.matchedPitches.has(pitch))) return true;
      expected.completed = true;
      expected.timingDeltaMs = timingDeltaMs;
      expected.timingClass = classifyPracticeTiming(timingDeltaMs);
      expected.confirmedAtAudioTime = this.audioContext.currentTime;
      this.stage.dataset.lastPracticeTimingDeltaMs = timingDeltaMs.toFixed(2);
      this.stage.dataset.lastPracticeTimingClass = expected.timingClass;
      this.stage.dataset.lastCompletedPracticeEventStart = String(expected.start);
      const frozenTime = expected.start;
      if (this.waitingForInput) {
        this.waitingForInput = null;
        this.clock.setCeiling(Infinity);
        this.clock.start(frozenTime, this.audioContext.currentTime);
        this.armPracticeGate(frozenTime + EPSILON * 2);
        this.lastPlaybackPosition = frozenTime;
        this.stage.dataset.practiceState = "playing";
        this.scheduleAhead();
        this.updateControls();
      } else {
        this.armPracticeGate(frozenTime + EPSILON * 2);
        this.scheduleAhead();
      }
      return true;
    }
    changePracticeMode() {
      this.resetRobotNotes();
      const position = this.clock.position;
      const wasActive = this.clock.running || !!this.waitingForInput;
      this.audio.stopAll();
      this.practicePaused = !wasActive;
      if (this.practiceEnabled()) {
        this.preparePractice(position);
        if (wasActive) this.clock.start(position, this.audioContext.currentTime);
        if (this.clock.running) {
          this.audio.stopAll();
          this.stage.dataset.practiceState = "playing";
          if (this.expectedPracticeEvent?.start <= position + EPSILON) this.enterPracticeWait();
          else this.scheduleAhead();
        } else {
          this.stage.dataset.practiceState = "armed";
          this.updateControls();
        }
      } else {
        this.audio.stopAll();
        const wasWaiting = !!this.waitingForInput;
        this.waitingForInput = null;
        this.expectedPracticeEvent = null;
        this.clock.setCeiling(Infinity);
        this.stage.dataset.practiceState = "off";
        if (wasWaiting) this.clock.start(position, this.audioContext.currentTime);
        if (this.clock.running) this.scheduleAhead();
        this.updateControls();
      }
    }
    bindControls() {
      this.playButton.addEventListener("click", () => this.play());
      this.pauseButton.addEventListener("click", () => this.requestPause());
      this.restartButton.addEventListener("click", () => this.restart());
      this.previousRoundButton.addEventListener("click", () => this.moveRound(-1));
      this.nextRoundButton.addEventListener("click", () => this.moveRound(1));
      this.bpmInput.addEventListener("change", () => this.changeBpm());
      this.bpmInput.addEventListener("blur", () => this.changeBpm());
      this.bpmInput.addEventListener("keydown", event => {
        if (event.key === 'Enter') { event.preventDefault(); this.changeBpm(); this.bpmInput.blur(); }
        if (event.key === 'Escape') { this.bpmInput.value = String(this.clock.bpm); this.bpmInput.blur(); }
      });
      this.bpmMinus?.addEventListener('click', () => { this.bpmInput.value = String(this.clock.bpm - 10); this.changeBpm(true); });
      this.bpmPlus?.addEventListener('click', () => { this.bpmInput.value = String(this.clock.bpm + 10); this.changeBpm(true); });
      this.metronomeButton?.addEventListener('click', () => this.setMetronome(!this.metronomeInput.checked));
      document.addEventListener('pointerdown', () => { if (this.metronomeAudio && this.metronomeInput.checked) this.unlockAudio(); }, {once: true});
      this.loopInput.addEventListener("change", () => { this.audio.stopAll(); this.stage.dataset.loopEnabled = String(this.loopInput.checked); });
      this.loopGapInput?.addEventListener("change", () => {
        localStorage.setItem("play12.loop-gap", this.loopGapInput.value);
        this.stage.dataset.loopGap = this.loopGapInput.value;
      });
      this.metronomeVolumeInput?.addEventListener("change", () => {
        this.audio.setMetronomeLevel(this.metronomeVolumeInput.value);
        localStorage.setItem("play12.metronome-volume", this.metronomeVolumeInput.value);
      });
      this.practiceModeInput?.addEventListener("change", () => this.changePracticeMode());
      document.addEventListener("keydown", event => {
        const target = event.target;
        const interactive = target?.closest?.("button,input,select,textarea,[contenteditable]:not([contenteditable='false']),[role='button'],[role='checkbox'],[role='radio'],[role='slider'],[role='combobox'],[role='listbox'],[role='menu'],[role='menuitem'],[role='dialog'],[aria-modal='true']");
        const onboarding = document.getElementById?.('play12-onboarding');
        const musicalScreen = !onboarding || onboarding.hidden || onboarding.dataset.playbackShortcutsEnabled === 'true';
        if (musicalScreen && event.code === "Space" && !event.defaultPrevented && !interactive) {
          event.preventDefault();
          this.clock.running || this.countIn || this.waitingForInput ? this.requestPause() : this.play();
        }
      });
    }
    async play() {
      if (this.clock.running || this.countIn || this.waitingForInput) return;
      await this.audioContext.resume();
      if (this.clock.position >= this.totalQuarters - EPSILON) {
        this.clock.pause(0);
        if (this.practiceEnabled()) this.preparePractice(0);
      }
      this.pauseTarget = null;
      this.audio.stopAll(this.audioContext.currentTime, this.practiceEnabled(), true);
      this.audio.robotGain.gain.setValueAtTime(1, this.audioContext.currentTime);
      const selected = this.clock.position;
      if (this.practiceEnabled()) {
        this.practicePaused = false;
        this.armPracticeGate(selected);
      }
      if (this.countInInput.checked) {
        const signature = this.signatureAt(selected);
        const preparationSeconds = .22;
        const seconds = signature.measureQuarters * 60 / this.clock.bpm;
        const preparationStartedAt = this.audioContext.currentTime;
        const preparationEndsAt = preparationStartedAt + preparationSeconds;
        this.preRollPrep = { selected, signature, startedAt: preparationStartedAt, endsAt: preparationEndsAt };
        this.countIn = { selected, signature, startedAt: preparationEndsAt, endsAt: preparationEndsAt + seconds };
        this.stage.dataset.countInSelectedPosition = String(selected);
        this.stage.dataset.countInBeats = String(signature.beats);
        this.stage.dataset.countInBeatType = String(signature.beatType);
        this.stage.dataset.countInMeasureQuarters = String(signature.measureQuarters);
        this.stage.dataset.countInEndsAudioTime = String(this.countIn.endsAt);
        this.stage.dataset.countInMusicScheduled = "false";
        this.stage.dataset.preRollPreparationSeconds = String(preparationSeconds);
        this.setPreRollVisibility(selected, true);
        this.paint(selected);
        this.stage.classList.add("is-preroll-prep");
        void this.svg.getBoundingClientRect();
        requestAnimationFrame(() => {
          if (this.preRollPrep) this.paint(selected - signature.measureQuarters);
        });
        this.scheduleCountIn();
        this.schedulePlaybackAnchor(selected, this.countIn.endsAt);
      } else {
        if (this.practiceEnabled() && this.expectedPracticeEvent?.start <= selected + EPSILON) {
          this.enterPracticeWait();
          return;
        }
        this.clock.start(selected, this.audioContext.currentTime);
        this.armPracticeGate(selected);
        this.lastPlaybackPosition = selected - EPSILON;
        this.scheduleAhead();
      }
      this.updateControls();
    }
    setPreRollVisibility(selected, active) {
      for (const event of this.events) {
        event.group.style.visibility = active && event.start < selected - EPSILON ? "hidden" : "";
      }
    }
    clearNoteOnEffects() {
      for (const event of this.events) event.group.classList.remove("is-note-on-event");
    }
    scheduleCountIn() {
      const beatSeconds = this.countIn.signature.beatQuarters * 60 / this.clock.bpm;
      this.stage.dataset.countInClickCount = String(this.countIn.signature.beats);
      for (let i = 0; i < this.countIn.signature.beats; i++) {
        if ((this.metronomeInput.checked && !this.metronomeAudio)) this.audio.scheduleClick(`count-in-${this.countIn.startedAt}-${i}`, this.countIn.startedAt + i * beatSeconds, i === 0);
      }
    }
    schedulePlaybackAnchor(selected, audioTime) {
      const practiceLimit = this.practiceEnabled() && this.expectedPracticeEvent ? this.expectedPracticeEvent.start : Infinity;
      const loop = this.currentLoop();
      const loopLimit = loop?.end ?? Infinity;
      if (this.practiceEnabled() && this.expectedPracticeEvent) {
        this.expectedPracticeEvent.expectedAudioTime = audioTime + (this.expectedPracticeEvent.start - selected) * 60 / this.clock.bpm;
      }
      const horizon = practiceScheduleEnd(Math.min(selected + .15 * this.clock.bpm / 60, loopLimit), practiceLimit);
      for (const event of this.events) {
        if (this.practiceEnabled()) continue;
        if (Number.isFinite(practiceLimit) && event.start >= practiceLimit - EPSILON) continue;
        if (event.start >= loopLimit - EPSILON) continue;
        if (event.start < selected - EPSILON || event.start > horizon + EPSILON) continue;
        if (this.musicAudioInput.checked) {
          const when = audioTime + (event.start - selected) * 60 / this.clock.bpm;
          this.audio.scheduleNote(event, when, event.duration, this.clock.bpm);
          this.stage.dataset.countInMusicScheduled = "future-only";
          this.stage.dataset.firstPlaybackAudioTime = String(when);
        }
      }
      const signature = this.signatureAt(selected);
      if ((this.metronomeInput.checked && !this.metronomeAudio) && selected < loopLimit - EPSILON && (!Number.isFinite(practiceLimit) || selected < practiceLimit - EPSILON)) {
        this.audio.scheduleClick(`playback-anchor-${audioTime}`, audioTime, Math.abs(selected - signature.start) < EPSILON);
      }
    }
    requestPause() {
      this.clearPracticeCandidate();
      if (this.practiceEnabled() && (this.clock.running || this.waitingForInput) && !this.countIn && !this.loopGap) {
        this.clock.pause();
        this.audio.stopAll(this.audioContext.currentTime, true);
        this.audio.robotGain.gain.setValueAtTime(0, this.audioContext.currentTime);
        this.practicePaused = true;
        this.waitingForInput = null;
        this.pauseTarget = null;
        this.stage.dataset.practiceState = "paused";
        this.paint(this.clock.position);
        this.updateControls();
        return;
      }
      if (this.loopGap) {
        this.pauseImmediate(this.clock.position);
        return;
      }
      if (this.waitingForInput) {
        this.waitingForInput = null;
        this.expectedPracticeEvent = null;
        this.clock.setCeiling(Infinity);
        this.stage.dataset.practiceState = "paused";
        this.updateControls();
        return;
      }
      if (this.preRollPrep || this.countIn) {
        this.audio.stopAll();
        const selected = this.preRollPrep ? this.preRollPrep.selected : this.countIn.selected;
        this.preRollPrep = null;
        this.countIn = null;
        this.stage.classList.remove("is-preroll-prep");
        this.setPreRollVisibility(selected, false);
        this.clearNoteOnEffects();
        this.paint(selected);
        this.updateControls();
        return;
      }
      if (!this.clock.running || this.pauseTarget != null) return;
      const now = this.clock.position;
      this.pauseTarget = Math.ceil((now + EPSILON) / this.stepQuarters) * this.stepQuarters;
      const stopAt = this.clock.quarterToAudioTime(this.pauseTarget);
      this.audio.scheduleStopAt(stopAt);
      this.stage.dataset.pauseTarget = String(this.pauseTarget);
      this.updateControls();
    }
    pauseImmediate(position = this.clock.position) {
      this.resetRobotNotes();
      this.audio.stopAll();
      this.preRollPrep = null;
      this.countIn = null;
      this.pauseTarget = null;
      this.loopGap = null;
      this.setLoopGapVisibility(false);
      this.waitingForInput = null;
      this.expectedPracticeEvent = null;
      this.clock.setCeiling(Infinity);
      this.clock.pause(clamp(position, 0, this.totalQuarters));
      this.practicePaused = true;
      if (this.practiceEnabled()) this.preparePractice(this.clock.position);
      this.displayPosition = this.clock.position;
      this.lastPlaybackPosition = null;
      this.stage.classList.remove("is-preroll-prep");
      this.setPreRollVisibility(this.clock.position, false);
      this.clearNoteOnEffects();
      this.paint(this.displayPosition);
      this.updateControls();
    }
    restart() {
      this.resetRobotNotes();
      this.audio.stopAll();
      this.preRollPrep = null;
      this.countIn = null;
      this.pauseTarget = null;
      this.loopGap = null;
      this.setLoopGapVisibility(false);
      this.waitingForInput = null;
      this.expectedPracticeEvent = null;
      this.clock.setCeiling(Infinity);
      this.clock.pause(0);
      this.practicePaused = true;
      if (this.practiceEnabled()) this.preparePractice(0);
      this.displayPosition = 0;
      this.lastPulseIndex = null;
      this.lastPlaybackPosition = null;
      delete this.stage.dataset.lastPulseQuarter;
      delete this.stage.dataset.lastPulseStrong;
      delete this.stage.dataset.lastContactEvent;
      delete this.stage.dataset.lastContactQuarter;
      for (const effect of this.stage.querySelectorAll(".playback-note-contact")) effect.remove();
      this.clearNoteOnEffects();
      this.paint(this.displayPosition);
      this.updateControls();
    }
    seek(position) {
      this.pauseImmediate(clamp(Number(position) || 0, 0, this.totalQuarters));
    }
    moveRound(direction) {
      const q = this.clock.position;
      let index = this.rounds.findIndex(round => q >= round.start - EPSILON && q < round.end - EPSILON);
      if (index < 0) index = this.rounds.length - 1;
      this.pauseImmediate(this.rounds[clamp(index + direction, 0, this.rounds.length - 1)].start);
    }
    syncTempoControls() {
      this.bpmInput.value = String(this.clock.bpm);
      this.bpmInput.classList.toggle('is-original-tempo', this.clock.bpm === this.originalTempo);
      this.stage.dataset.bpm = String(this.clock.bpm);
      this.stage.dataset.originalTempo = String(this.originalTempo ?? this.clock.bpm);
    }
    saveTempoSettings() {
      if (!this.tempoStorageKey) return;
      try { localStorage.setItem(this.tempoStorageKey, JSON.stringify({bpm: this.clock.bpm, enabled: this.metronomeInput.checked})); } catch (_) {}
    }
    setMetronome(enabled, interaction = true) {
      this.metronomeInput.checked = enabled;
      this.metronomeButton.setAttribute('aria-pressed', String(enabled));
      this.metronomeButton.textContent = enabled ? 'ON' : 'OFF';
      clearInterval(this.metronomeTimer);
      this.metronomeAudio.stopAll();
      this.beatLamp?.classList.remove('is-beat', 'is-accent');
      this.stage.dataset.metronomeEnabled = String(enabled);
      if (enabled) {
        if (interaction) this.unlockAudio();
        this.nextMetronomeBeat = this.audioContext.currentTime + .025;
        this.metronomeTimer = setInterval(() => this.scheduleMetronome(), 25);
        this.scheduleMetronome();
      }
      this.saveTempoSettings();
      if (interaction) global.dispatchEvent(new CustomEvent('play12:metronome-change', {detail: {enabled}}));
    }
    scheduleMetronome() {
      if (!this.metronomeAudio || !this.metronomeInput.checked || this.audioContext.state !== 'running') return;
      const now = this.audioContext.currentTime;
      const interval = 60 / this.clock.bpm;
      // After tab suspension skip elapsed beats instead of emitting a burst.
      if (this.nextMetronomeBeat < now - interval) this.nextMetronomeBeat = now + .025;
      while (this.nextMetronomeBeat <= now + .1) {
        this.metronomeAudio.scheduleClick(`steady-${++this.metronomeBeatCounter}`, this.nextMetronomeBeat, false);
        this.stage.dataset.metronomeBeatCounter = String(this.metronomeBeatCounter);
        this.nextMetronomeBeat += interval;
      }
      // Unique keys never need to accumulate for this monotonic scheduler.
      this.metronomeAudio.beatKeys.clear();
    }
    changeBpm(interaction = false) {
      const raw = this.bpmInput.value.trim();
      const valid = /^-?\d+$/.test(raw);
      const bpm = valid ? clamp(Number(raw), 30, 240) : this.clock.bpm;
      const previousBpm = this.clock.bpm;
      if (bpm === previousBpm) {
        this.syncTempoControls();
        if (interaction) global.dispatchEvent(new CustomEvent('play12:tempo-change'));
        return;
      }
      this.bpmInput.value = String(bpm);
      if (this.countIn) {
        const selected = this.countIn.selected;
        this.audio.stopAll();
        this.preRollPrep = null;
        this.countIn = null;
        this.stage.classList.remove("is-preroll-prep");
        this.setPreRollVisibility(selected, false);
        this.clock.pause(selected);
        this.clock.setBpm(bpm);
        this.play();
      } else if (this.loopGap) {
        this.audio.stopAll();
        this.clock.setBpm(bpm);
        this.scheduleLoopGapMetronome(this.clock.position);
      } else {
        this.audio.stopAll(this.audioContext.currentTime, this.practiceEnabled(), true);
        this.clock.setBpm(bpm);
      }
      // Retime only the remaining audio duration; waiting for an answer never extends a note.
      const nowAudio = this.audioContext.currentTime;
      for (const [key, voice] of this.audio.voices) {
        if (voice.startedAt > nowAudio || !(voice.endsAt > nowAudio)) continue;
        voice.endsAt = nowAudio + (voice.endsAt - nowAudio) * previousBpm / bpm;
        const robot = key.startsWith('robot:') ? this.robotEvents.get(key.slice(6)) : null;
        if (robot) robot.endsAt = voice.endsAt;
        const gain = voice.gain.gain;
        if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(nowAudio);
        else { gain.cancelScheduledValues(nowAudio); gain.setValueAtTime(Math.max(.0001, gain.value), nowAudio); }
        gain.exponentialRampToValueAtTime(.0001, voice.endsAt);
        this.audio.noteOff(key, voice.endsAt, true, true);
      }
      if (this.clock.running && !this.loopGap) this.scheduleAhead();
      if (this.metronomeAudio && this.metronomeInput.checked) {
        const now = this.audioContext.currentTime;
        const next = this.metronomeAudio.pendingBeatVisuals.find(beat => beat.when >= now)?.when ?? this.nextMetronomeBeat;
        this.metronomeAudio.stopAll();
        this.nextMetronomeBeat = now + Math.max(0, next - now) * previousBpm / bpm;
        this.scheduleMetronome();
      }
      this.syncTempoControls();
      this.saveTempoSettings();
      global.dispatchEvent(new CustomEvent('play12:tempo-change'));
    }
    setLoopGapVisibility(active) {
      this.stage.classList.toggle("is-loop-gap", active);
    }
    scheduleLoopGapMetronome(fromQuarter) {
      if (!this.loopGap || !(this.metronomeInput.checked && !this.metronomeAudio)) return;
      const { start, end, signature } = this.loopGap;
      const firstBeat = Math.max(0, Math.ceil((fromQuarter - start + EPSILON) / signature.beatQuarters));
      for (let index = firstBeat; index < signature.beats * LOOP_EMPTY_ROUNDS; index++) {
        const quarter = start + index * signature.beatQuarters;
        if (quarter >= end - EPSILON) break;
        this.audio.scheduleClick(`loop-gap-${this.loopWrapCount}-${index}`, this.clock.quarterToAudioTime(quarter), index % signature.beats === 0);
      }
    }
    startLoopGap(loop) {
      this.audio.stopAll();
      const signature = this.signatureAt(loop.end - EPSILON);
      const start = loop.end;
      const end = start + signature.measureQuarters * LOOP_EMPTY_ROUNDS;
      this.loopGap = { loop, signature, rounds: LOOP_EMPTY_ROUNDS, start, end };
      this.clock.setCeiling(end);
      this.clock.start(start, this.audioContext.currentTime);
      this.lastPlaybackPosition = start;
      this.setLoopGapVisibility(true);
      this.paint(loop.start - signature.measureQuarters * LOOP_EMPTY_ROUNDS);
      this.scheduleLoopGapMetronome(start - EPSILON * 2);
      this.stage.dataset.loopGapState = "empty-round";
      this.stage.dataset.loopGapStart = String(start);
      this.stage.dataset.loopGapEnd = String(end);
      this.stage.dataset.loopGapRounds = String(LOOP_EMPTY_ROUNDS);
      this.updateControls();
    }
    finishLoopCycle(loop) {
      this.resetRobotNotes();
      this.audio.stopAll();
      this.loopGap = null;
      this.setLoopGapVisibility(false);
      this.clock.setCeiling(Infinity);
      if (this.practiceEnabled()) this.preparePractice(loop.start);
      this.clock.start(loop.start, this.audioContext.currentTime);
      this.lastPlaybackPosition = loop.start - EPSILON;
      this.loopWrapCount += 1;
      this.stage.dataset.loopWrapCount = String(this.loopWrapCount);
      this.stage.dataset.loopGapState = "off";
      this.paint(loop.start);
      this.pulseAt(loop.start);
      this.scheduleAhead();
    }
    currentLoop() {
      if (!this.loopInput.checked) return null;
      const startIndex = Number(this.loopStartInput.value);
      const endIndex = Math.max(startIndex, Number(this.loopEndInput.value));
      return { start: this.rounds[startIndex].start, end: this.rounds[endIndex].end };
    }
    scheduleAhead() {
      if (!this.clock.running) return;
      const nowQ = this.clock.position;
      this.syncRobotNotes(nowQ);
      const loop = this.currentLoop();
      const practiceLimit = this.practiceEnabled() && this.expectedPracticeEvent ? this.expectedPracticeEvent.start : Infinity;
      const hardEnd = Math.min(loop ? loop.end : this.totalQuarters, this.pauseTarget == null ? Infinity : this.pauseTarget, practiceLimit);
      const horizon = practiceScheduleEnd(Math.min(hardEnd, nowQ + .15 * this.clock.bpm / 60), practiceLimit);
      for (const event of this.events) {
        if (this.practiceEnabled()) continue;
        if (Number.isFinite(practiceLimit) && event.start >= practiceLimit - EPSILON) continue;
        if (event.start + EPSILON < nowQ || event.start > horizon + EPSILON) continue;
        if (this.musicAudioInput.checked) this.audio.scheduleNote(event, this.clock.quarterToAudioTime(event.start), Math.min(event.duration, hardEnd - event.start), this.clock.bpm);
      }
      if ((this.metronomeInput.checked && !this.metronomeAudio)) {
        const first = Math.ceil((nowQ + this.timelineOffset - EPSILON) / this.beatQuarters);
        const last = Math.floor((horizon + this.timelineOffset + EPSILON) / this.beatQuarters);
        for (let i = first; i <= last; i++) {
          const q = i * this.beatQuarters - this.timelineOffset;
          if (Number.isFinite(practiceLimit) && q >= practiceLimit - EPSILON) continue;
          this.audio.scheduleClick(`beat-${i}`, this.clock.quarterToAudioTime(q), ((i % this.beatsPerMeasure) + this.beatsPerMeasure) % this.beatsPerMeasure === 0);
        }
      }
    }
    pulseAt(position) {
      const index = Math.floor((position + this.timelineOffset + EPSILON) / this.stepQuarters);
      if (index === this.lastPulseIndex) return;
      this.lastPulseIndex = index;
      const q = index * this.stepQuarters - this.timelineOffset;
      const round = this.signatureAt(q);
      const strong = Math.abs(q - round.start) < this.stepQuarters / 3;
      this.pulse.classList.remove("is-pulsing", "is-strong");
      void this.pulse.offsetWidth;
      this.pulse.classList.add("is-pulsing");
      if (strong) this.pulse.classList.add("is-strong");
      this.stage.dataset.lastPulseQuarter = String(q);
      this.stage.dataset.lastPulseStrong = String(strong);
    }
    formatTime(seconds) {
      const value = Math.max(0, Math.floor(seconds + EPSILON));
      return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    }
    updateProgress(position) {
      const q = clamp(position, 0, this.totalQuarters);
      const progress = this.totalQuarters ? q / this.totalQuarters : 0;
      this.progressHead.style.left = `${this.progressStartX + progress * (this.progressEndX - this.progressStartX)}px`;
      this.timecode.textContent = `${this.formatTime(q * 60 / this.clock.bpm)} / ${this.formatTime(this.totalQuarters * 60 / this.clock.bpm)}`;
      this.stage.dataset.progress = String(progress);
    }
    triggerContacts(from, to) {
      if (from == null || to < from) return;
      const contacts = this.events.filter(event => event.start >= from - EPSILON && event.start <= to + EPSILON);
      if (!contacts.length) return;
      this.playline.classList.remove("is-note-on");
      void this.playline.offsetWidth;
      this.playline.classList.add("is-note-on");
      for (const event of contacts) {
        event.group.classList.remove("is-note-on-event");
        void event.group.getBoundingClientRect();
        event.group.classList.add("is-note-on-event");
        setTimeout(() => event.group.classList.remove("is-note-on-event"), 230);
      }
      this.stage.dataset.lastContactEvent = contacts.map(event => event.id).join(",");
      this.stage.dataset.lastContactQuarter = String(contacts[0].start);
    }
    paint(position) {
      this.displayPosition = position;
      const playlineY = this.executionY();
      // SVG coordinates retain the score's global pickup padding; playback time
      // is normalized so the first sounding event is q=0.
      const scoreY = playlineY - this.originY + (position + this.timelineOffset) / this.stepQuarters * this.cellHeight;
      this.svg.style.transform = `translateY(${scoreY}px)`;
      this.stage.dataset.musicalPosition = String(this.clock.position);
      this.stage.dataset.displayPosition = String(position);
      const soundingMidis = [];
      for (const event of this.events) {
        let state = "upcoming", opacity = 1;
        event.group.classList.toggle("is-practice-expected", !!this.waitingForInput?.events.includes(event));
        if (this.clock.running && !this.countIn && !this.preRollPrep && !this.loopGap && position >= event.start && position < event.start + event.duration) {
          state = "active";
          soundingMidis.push(event.midi);
        }
        else if (position >= event.start + event.duration) {
          const age = position - event.start - event.duration;
          const measureQuarters = this.signatureAt(position).measureQuarters;
          state = age <= measureQuarters ? "played" : "faded";
          if (state === "played") opacity = .72;
          if (state === "faded") opacity = Math.max(.06, 1 - (age - measureQuarters) / (3 * measureQuarters));
        }
        event.group.dataset.noteState = state;
        event.group.classList.toggle("is-active", state === "active");
        event.group.classList.toggle("is-played", state === "played");
        event.group.classList.toggle("is-faded", state === "faded");
        event.group.style.opacity = String(opacity);
      }
      if (this.pianoView) this.pianoView.setActiveMidis(soundingMidis);
      this.updateProgress(this.clock.position);
      this.positionOutput.value = `${position < 0 ? "Подводка" : "Позиция"}: ${position.toFixed(2)} q`;
      this.emitState();
    }
    updateControls() {
      const busy = this.clock.running || !!this.preRollPrep || !!this.countIn || !!this.waitingForInput || !!this.loopGap;
      this.playButton.disabled = busy;
      this.pauseButton.disabled = !busy || this.pauseTarget != null;
      this.stage.dataset.state = this.preRollPrep ? "pre-roll-prep" : this.countIn ? "count-in" : this.loopGap ? "loop-gap" : this.waitingForInput ? "waiting_for_input" : this.pauseTarget != null ? "pause-queued" : this.clock.running ? "playing" : "paused";
      const playing = this.clock.running && this.clock.position < this.totalQuarters - EPSILON;
      const paused = this.stage.dataset.state === 'paused' && this.clock.position > EPSILON && this.clock.position < this.totalQuarters - EPSILON;
      this.playButton.classList.toggle('is-transport-active', playing);
      this.pauseButton.classList.toggle('is-transport-active', paused);
      this.playButton.setAttribute('aria-pressed', String(playing));
      this.pauseButton.setAttribute('aria-pressed', String(paused));
      if (this.preRollPrep) this.positionOutput.value = `Подготовка · позиция ${this.preRollPrep.selected.toFixed(2)} q`;
      else if (this.countIn) this.positionOutput.value = `Count-in · позиция ${this.countIn.selected.toFixed(2)} q`;
      else if (this.loopGap) this.positionOutput.value = "Loop · пустой такт";
      else if (this.waitingForInput) this.positionOutput.value = `Practice · ожидается ${this.stage.dataset.expectedPitches}`;
      else if (this.pauseTarget != null) this.positionOutput.value = `Pause на ${this.pauseTarget.toFixed(2)} q`;
      this.emitState();
    }
    flashBeatLamp(beat) {
      if (!this.beatLamp) return;
      this.beatLamp.classList.remove("is-beat", "is-accent");
      void this.beatLamp.offsetWidth;
      this.beatLamp.classList.add("is-beat");
      if (beat.accent) this.beatLamp.classList.add("is-accent");
      this.stage.dataset.lastBeatLampKey = beat.key;
      this.stage.dataset.lastBeatLampAudioTime = String(beat.when);
    }
    tick() {
      this.expireRobotNotes();
      this.expirePracticeCandidate();
      this.metronomeAudio?.flushBeatVisuals(this.audioContext.currentTime, beat => this.flashBeatLamp(beat));
      this.audio.flushBeatVisuals(this.audioContext.currentTime, beat => this.flashBeatLamp(beat));
      if (this.preRollPrep) {
        if (this.audioContext.currentTime >= this.preRollPrep.endsAt) {
          this.preRollPrep = null;
          this.stage.classList.remove("is-preroll-prep");
          this.updateControls();
        }
      } else if (this.countIn) {
        const progress = clamp((this.audioContext.currentTime - this.countIn.startedAt) / (this.countIn.endsAt - this.countIn.startedAt), 0, 1);
        const visual = this.countIn.selected - this.countIn.signature.measureQuarters * (1 - progress);
        this.paint(visual);
        this.pulseAt(visual);
        if (progress >= 1) {
          const selected = this.countIn.selected;
          const startAt = this.countIn.endsAt;
          this.countIn = null;
          this.setPreRollVisibility(selected, false);
          if (this.practiceEnabled() && this.expectedPracticeEvent?.start <= selected + EPSILON) {
            this.enterPracticeWait();
            this.frame = requestAnimationFrame(() => this.tick());
            return;
          }
          this.clock.start(selected, startAt);
          this.armPracticeGate(selected);
          this.lastPlaybackPosition = selected - EPSILON;
          this.scheduleAhead();
          this.updateControls();
        }
      } else if (this.loopGap) {
        const q = this.clock.position;
        const visualPosition = this.loopGap.loop.start - this.loopGap.signature.measureQuarters * this.loopGap.rounds + (q - this.loopGap.start);
        this.paint(visualPosition);
        this.pulseAt(q);
        this.positionOutput.value = "Loop · пустой такт";
        if (q >= this.loopGap.end - EPSILON) this.finishLoopCycle(this.loopGap.loop);
      } else if (this.clock.running) {
        let q = this.clock.position;
        const loop = this.currentLoop();
        if (this.practiceEnabled() && this.expectedPracticeEvent && q >= this.expectedPracticeEvent.start - EPSILON) {
          this.enterPracticeWait();
        } else if (this.pauseTarget != null && q >= this.pauseTarget - EPSILON) {
          q = this.pauseTarget;
          this.clock.pause(q);
          this.audio.stopAll();
          this.pauseTarget = null;
          this.clearNoteOnEffects();
          this.paint(q);
          this.pulseAt(q);
          this.updateControls();
        } else if (loop && q >= loop.end - EPSILON) {
          if (this.loopGapInput?.value === "empty-round") this.startLoopGap(loop);
          else this.finishLoopCycle(loop);
        } else if (q >= this.totalQuarters) {
          this.pauseImmediate(this.totalQuarters);
        } else {
          this.paint(q);
          this.pulseAt(q);
          this.triggerContacts(this.lastPlaybackPosition, q);
          this.lastPlaybackPosition = q;
          this.scheduleAhead();
        }
      }
      this.frame = requestAnimationFrame(() => this.tick());
    }
  }

  global.Play12Playback = { start: options => new Controller(options), effectiveMidiPitch, practiceScheduleEnd, findPracticeEvent, classifyPracticeTiming, PRACTICE_TIMING, LOOP_EMPTY_ROUNDS, PlaybackClock };
})(window);
