/* MIDI input diagnostic. It never opens or sends to MIDI outputs. */
(function (global) {
  "use strict";

  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const CALIBRATION_KEY = "play12.midi-calibration.v1";
  const COMMON_KEY_COUNTS = new Set([49, 61, 73, 76, 88]);
  const COMMANDS = Object.freeze([
    [0,"metronome","Met"],[1,"previous-round","Prev"],[2,"bpm-down","Bpm−"],[3,"next-round","Next"],[4,"bpm-up","Bpm+"],
    [6,"play","Play"],[8,"pause","Pause"],[10,"restart","Restart"]
  ]);
  const modulo = (value, base) => ((value % base) + base) % base;

  function pitchForMidi(note) {
    return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
  }

  function parseMessage(data) {
    const [status = 0, note = 0, velocity = 0] = data;
    const command = status & 0xF0;
    if (command !== 0x80 && command !== 0x90) return null;
    const noteOn = command === 0x90 && velocity > 0;
    return {
      type: noteOn ? "Note On" : "Note Off",
      note,
      pitch: pitchForMidi(note),
      velocity,
      channel: (status & 0x0F) + 1,
      noteOn
    };
  }

  function readCalibration(storage) {
    try {
      const value = JSON.parse(storage.getItem(CALIBRATION_KEY));
      return value && Number.isInteger(value.leftMidi) && Number.isInteger(value.rightMidi) &&
        value.rightMidi > value.leftMidi && value.verified === true ? value : null;
    } catch (_) { return null; }
  }

  class MidiDiagnostic {
    constructor({ root, enableButton, pianoView, noteEvents, commandActions, storage = global.localStorage }) {
      this.root = root;
      this.enableButton = enableButton;
      this.pianoView = pianoView;
      this.noteEvents = noteEvents;
      this.commandActions = commandActions;
      this.storage = storage;
      this.activeMidiNotes = new Set();
      this.activeMidiTokens = new Map();
      this.inputHandlers = new Map();
      this.inputInterceptors = new Set();
      this.statusListeners = new Set();
      this.calibrationListeners = new Set();
      this.calibration = readCalibration(storage);
      this.calibrationDraft = null;
      this.calibrationMode = null;
      this.functionTokens = new Set();
      this.commandTokens = new Map();
      this.rangeWarningDismissed = false;
      this.currentStatus = null;
      this.enablePromise = null;
      this.handleStateChange = () => this.refreshInputs();
      this.fields = Object.fromEntries([
        "status", "input-name", "manufacturer", "event-type", "note", "pitch", "velocity", "channel", "active-notes", "message"
      ].map(name => [name, root.querySelector(`#midi-${name}`)]));
      enableButton.addEventListener("click", () => {
        this.noteEvents?.unlockAudio();
        this.enable();
      });
      if (!("requestMIDIAccess" in navigator)) {
        enableButton.disabled = true;
        this.fields.message.textContent = "Web MIDI API недоступен в этом браузере.";
        this.setStatus("unavailable", { safari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent) });
      }
      this.pianoView.setCommandRouter?.({
        noteOn: (note, pointerId) => this.handleVirtualCommand(note, pointerId, true),
        noteOff: (note, pointerId) => this.handleVirtualCommand(note, pointerId, false)
      });
    }

    setStatus(status, detail = null) {
      this.currentStatus = { status, detail };
      for (const listener of this.statusListeners) listener(this.currentStatus);
    }

    addStatusListener(listener) {
      this.statusListeners.add(listener);
      if (this.currentStatus) listener(this.currentStatus);
      return () => this.statusListeners.delete(listener);
    }

    addCalibrationListener(listener) {
      this.calibrationListeners.add(listener);
      return () => this.calibrationListeners.delete(listener);
    }

    addInputInterceptor(listener) {
      this.inputInterceptors.add(listener);
      return () => this.inputInterceptors.delete(listener);
    }

    interceptInput(message, source, token) {
      for (const listener of this.inputInterceptors) {
        if (listener({ type: message.noteOn ? "note-on" : "note-off", midiNote: message.note,
          velocity: message.velocity, source, token }) === true) return true;
      }
      return false;
    }

    emitCalibration(type, detail = {}) {
      const event = { type, ...detail };
      for (const listener of this.calibrationListeners) listener(event);
      global.dispatchEvent(new CustomEvent("play12:midi-calibration", { detail: event }));
    }

    getCalibration() { return this.calibration ? { ...this.calibration } : null; }
    clearCalibration() {
      this.clearFunctionState();
      this.calibration = null;
      this.calibrationDraft = null;
      this.calibrationMode = null;
      this.storage.removeItem(CALIBRATION_KEY);
    }
    beginCalibration() { this.clearFunctionState(); this.calibrationDraft = null; this.calibrationMode = "left"; this.emitCalibration("capture-left"); }
    retryCalibration() { this.beginCalibration(); }
    useUnusualRange() {
      if (!this.calibrationDraft) return;
      this.calibrationMode = "confirm";
      this.emitCalibration("confirm", { range: { ...this.calibrationDraft } });
    }
    confirmRange() {
      if (!this.calibrationDraft) return;
      this.calibrationMode = "verify";
      this.emitCalibration("verify-function", { range: { ...this.calibrationDraft } });
    }
    retryFunctionVerification() {
      if (!this.calibrationDraft) return;
      this.calibrationMode = "verify";
      this.emitCalibration("verify-function", { range: { ...this.calibrationDraft } });
    }
    keepCurrentRange() { this.rangeWarningDismissed = true; this.emitCalibration("kept", { calibration: this.getCalibration() }); }

    sameInput(range, input, message) { return range && range.inputId === input.id && range.channel === message.channel; }

    commandMapFor(range) {
      if (range.functionMidi < 21 || range.functionMidi > 108) return null;
      const firstC = range.leftMidi + modulo(12 - modulo(range.leftMidi, 12), 12);
      const map = new Map();
      for (const [offset, action, label] of COMMANDS) {
        const midi = firstC + offset;
        if (midi > range.rightMidi || midi < 21 || midi > 108 || (range.verified && !this.pianoView.keys.has(midi))) return null;
        map.set(midi, { action, label });
      }
      return map;
    }

    clearFunctionState() {
      this.functionTokens.clear();
      this.commandTokens.clear();
      this.pianoView.hideFunctionOverlay?.();
      delete this.root.dataset.functionMode;
    }

    clearTransientInputState() {
      for (const [token, note] of this.activeMidiTokens) this.noteEvents?.handleNoteOff(note, "midi", token);
      this.activeMidiTokens.clear();
      this.activeMidiNotes.clear();
      this.clearFunctionState();
      this.syncDiagnostic();
    }

    detachInputs() {
      for (const input of this.inputHandlers.values()) input.onmidimessage = null;
      this.inputHandlers.clear();
    }

    async enable({ reacquire = false } = {}) {
      if (reacquire) {
        this.detachInputs();
        this.clearTransientInputState();
        this.access?.removeEventListener?.("statechange", this.handleStateChange);
        this.access = null;
      }
      if (this.access) {
        this.refreshInputs();
        return this.access;
      }
      if (this.enablePromise) return this.enablePromise;
      this.enableButton.disabled = true;
      this.fields.message.textContent = "Запрашивается доступ к MIDI input…";
      this.setStatus("requesting");
      this.enablePromise = navigator.requestMIDIAccess({ sysex: false, software: false })
        .then(access => {
          this.access = access;
          this.access.addEventListener("statechange", this.handleStateChange);
          this.refreshInputs();
          this.fields.message.textContent = "MIDI input включён. Нажмите клавишу на подключённом MIDI-устройстве.";
          return access;
        })
        .catch(error => {
          this.enableButton.disabled = false;
          this.fields.status.textContent = "Not connected";
          this.fields.message.textContent = "MIDI access was not granted.";
          this.setStatus(error?.name === "NotAllowedError" ? "permission-denied" : "error", { name: error?.name || "Error" });
          return null;
        })
        .finally(() => { this.enablePromise = null; });
      return this.enablePromise;
    }

    refreshInputs() {
      const connected = [...this.access.inputs.values()].filter(input => input.state === "connected");
      const connectedIds = new Set(connected.map(input => input.id));
      for (const [id, input] of this.inputHandlers) {
        if (!connectedIds.has(id)) {
          input.onmidimessage = null;
          this.inputHandlers.delete(id);
          for (const [token, note] of [...this.activeMidiTokens]) {
            if (!token.startsWith(`${id}:`)) continue;
            this.activeMidiTokens.delete(token);
            this.noteEvents?.handleNoteOff(note, "midi", token);
          }
          if (this.calibrationDraft?.inputId === id) {
            this.calibrationMode = "invalid";
            this.emitCalibration("invalid", { reason: "device-disconnected" });
          }
        }
      }
      this.activeMidiNotes = new Set(this.activeMidiTokens.values());
      for (const input of connected) {
        const previous = this.inputHandlers.get(input.id);
        if (previous && previous !== input) { previous.onmidimessage = null; this.inputHandlers.delete(input.id); }
        if (!this.inputHandlers.has(input.id)) {
          input.onmidimessage = event => this.handleMessage(event, input);
          this.inputHandlers.set(input.id, input);
        }
      }
      this.root.classList.toggle("is-connected", connected.length > 0);
      this.setStatus(connected.length ? "connected" : "no-input");
      this.fields.status.textContent = connected.length ? "Connected" : "Not connected";
      this.fields["input-name"].textContent = connected.map(input => input.name || "Unnamed MIDI input").join(", ") || "—";
      this.fields.manufacturer.textContent = connected.map(input => input.manufacturer).filter(Boolean).join(", ") || "—";
      if (!connected.length) {
        this.clearTransientInputState();
      } else if (this.calibration?.verified && !connectedIds.has(this.calibration.inputId)) {
        this.emitCalibration("device-changed", { calibration: this.getCalibration() });
      }
    }

    captureCalibration(message, input) {
      if (!message.noteOn) return this.calibrationMode !== null;
      if (this.calibrationMode === "left") {
        this.calibrationDraft = { inputId: input.id, inputName: input.name || "Unnamed MIDI input",
          manufacturer: input.manufacturer || "", channel: message.channel, leftMidi: message.note };
        this.calibrationMode = "right";
        this.emitCalibration("capture-right", { leftMidi: message.note });
        return true;
      }
      if (this.calibrationMode === "right") {
        const draft = this.calibrationDraft;
        if (!this.sameInput(draft, input, message) || message.note <= draft.leftMidi) {
          this.calibrationMode = "invalid";
          this.emitCalibration("invalid");
          return true;
        }
        Object.assign(draft, { rightMidi: message.note, keyCount: message.note - draft.leftMidi + 1, functionMidi: message.note });
        if (!this.commandMapFor(draft)) {
          this.calibrationMode = "invalid";
          this.emitCalibration("invalid", { reason: "command-range" });
        } else if (!COMMON_KEY_COUNTS.has(draft.keyCount)) {
          this.calibrationMode = "unusual";
          this.emitCalibration("unusual", { range: { ...draft } });
        } else {
          this.calibrationMode = "confirm";
          this.emitCalibration("confirm", { range: { ...draft } });
        }
        return true;
      }
      if (this.calibrationMode === "verify") {
        const draft = this.calibrationDraft;
        if (this.sameInput(draft, input, message) && message.note === draft.rightMidi) {
          this.calibration = { ...draft, verified: true };
          this.storage.setItem(CALIBRATION_KEY, JSON.stringify(this.calibration));
          this.calibrationMode = null;
          this.rangeWarningDismissed = false;
          this.emitCalibration("complete", { calibration: this.getCalibration() });
        } else {
          this.calibrationMode = "verify-retry";
          this.emitCalibration("verify-retry");
        }
        return true;
      }
      return this.calibrationMode !== null;
    }

    routeCommand(message, input, token) {
      const range = this.calibration;
      if (!range?.verified || !this.sameInput(range, input, message)) return false;
      if (message.noteOn && !this.rangeWarningDismissed && (message.note < range.leftMidi || message.note > range.rightMidi)) {
        this.clearFunctionState();
        this.commandTokens.set(token, "range-warning");
        this.emitCalibration("range-changed", { note: message.note, calibration: this.getCalibration() });
        return true;
      }
      if (message.note === range.functionMidi) {
        if (message.noteOn) {
          const commands = this.commandMapFor(range);
          if (!commands) { this.emitCalibration("overlay-unavailable"); return true; }
          this.functionTokens.add(token);
          this.pianoView.showFunctionOverlay(new Map([...commands].map(([midi, value]) => [midi, value.label])), range.functionMidi);
          this.root.dataset.functionMode = "true";
        } else {
          this.functionTokens.delete(token);
          if (!this.functionTokens.size) {
            this.pianoView.hideFunctionOverlay?.();
            delete this.root.dataset.functionMode;
          }
        }
        return true;
      }
      if (!message.noteOn && this.commandTokens.has(token)) {
        this.commandTokens.delete(token);
        this.pianoView.setFunctionCommandPressed?.(message.note, false);
        return true;
      }
      if (message.noteOn && this.functionTokens.size) {
        const command = this.commandMapFor(range)?.get(message.note);
        if (!command) return false;
        this.commandTokens.set(token, command.action);
        this.pianoView.setFunctionCommandPressed?.(message.note, true);
        if (this.commandActions?.available?.(command.action) !== false) this.commandActions?.run?.(command.action);
        return true;
      }
      return false;
    }

    handleVirtualCommand(note, pointerId, noteOn) {
      const range = this.calibration;
      if (!range?.verified) return false;
      const message = { note, noteOn, velocity: noteOn ? 100 : 0, channel: range.channel };
      const token = `mouse:${pointerId}:${note}`;
      return this.interceptInput(message, "mouse", token) || this.routeCommand(message, { id: range.inputId }, token);
    }

    handleMessage(event, input) {
      const message = parseMessage(event.data);
      if (!message) return;
      const token = `${input.id}:${message.channel}:${message.note}`;
      const consumed = this.calibrationMode !== null
        ? this.captureCalibration(message, input)
        : this.interceptInput(message, "midi", token) || this.routeCommand(message, input, token);
      if (!consumed && message.noteOn) {
        this.activeMidiTokens.set(token, message.note);
        this.activeMidiNotes.add(message.note);
        this.noteEvents?.handleNoteOn(message.note, message.velocity, "midi", token);
      } else if (!consumed) {
        this.activeMidiTokens.delete(token);
        if (![...this.activeMidiTokens.values()].includes(message.note)) this.activeMidiNotes.delete(message.note);
        this.noteEvents?.handleNoteOff(message.note, "midi", token);
      }
      this.fields["event-type"].textContent = message.type;
      this.fields.note.textContent = String(message.note);
      this.fields.pitch.textContent = message.pitch;
      this.fields.velocity.textContent = String(message.velocity);
      this.fields.channel.textContent = String(message.channel);
      this.fields["input-name"].textContent = input.name || "Unnamed MIDI input";
      this.fields.manufacturer.textContent = input.manufacturer || "—";
      this.fields["active-notes"].textContent = [...this.activeMidiNotes].sort((a, b) => a - b).join(", ") || "—";
      const inRange = this.pianoView.keys.has(message.note);
      this.fields.message.textContent = consumed ? "Function/control input consumed."
        : inRange ? "Физическая клавиша найдена в Piano View." : "Нота вне отображаемого диапазона Piano View.";
      this.syncDiagnostic();
    }

    syncDiagnostic() {
      this.fields["active-notes"].textContent = [...this.activeMidiNotes].sort((a, b) => a - b).join(", ") || "—";
    }
  }

  global.Play12MidiDiagnostic = Object.freeze({
    create: options => new MidiDiagnostic(options),
    parseMessage,
    pitchForMidi,
    CALIBRATION_KEY
  });
})(window);
