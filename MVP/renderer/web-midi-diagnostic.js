/* MIDI input diagnostic. It never opens or sends to MIDI outputs. */
(function (global) {
  "use strict";

  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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

  class MidiDiagnostic {
    constructor({ root, enableButton, pianoView, noteEvents }) {
      this.root = root;
      this.enableButton = enableButton;
      this.pianoView = pianoView;
      this.noteEvents = noteEvents;
      this.activeMidiNotes = new Set();
      this.activeMidiTokens = new Map();
      this.inputHandlers = new Map();
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
      }
    }

    async enable() {
      this.enableButton.disabled = true;
      this.fields.message.textContent = "Запрашивается доступ к MIDI input…";
      try {
        this.access = await navigator.requestMIDIAccess({ sysex: false, software: false });
        this.access.addEventListener("statechange", () => this.refreshInputs());
        this.refreshInputs();
        this.fields.message.textContent = "MIDI input включён. Нажмите клавишу на подключённом MIDI-устройстве.";
      } catch (error) {
        this.enableButton.disabled = false;
        this.fields.status.textContent = "Not connected";
        this.fields.message.textContent = `Доступ к MIDI не получен: ${error.message}`;
      }
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
        }
      }
      this.activeMidiNotes = new Set(this.activeMidiTokens.values());
      for (const input of connected) {
        if (!this.inputHandlers.has(input.id)) {
          input.onmidimessage = event => this.handleMessage(event, input);
          this.inputHandlers.set(input.id, input);
        }
      }
      this.root.classList.toggle("is-connected", connected.length > 0);
      this.fields.status.textContent = connected.length ? "Connected" : "Not connected";
      this.fields["input-name"].textContent = connected.map(input => input.name || "Unnamed MIDI input").join(", ") || "—";
      this.fields.manufacturer.textContent = connected.map(input => input.manufacturer).filter(Boolean).join(", ") || "—";
      if (!connected.length) {
        for (const [token, note] of this.activeMidiTokens) this.noteEvents?.handleNoteOff(note, "midi", token);
        this.activeMidiTokens.clear();
        this.activeMidiNotes.clear();
        this.syncDiagnostic();
      }
    }

    handleMessage(event, input) {
      const message = parseMessage(event.data);
      if (!message) return;
      const token = `${input.id}:${message.channel}:${message.note}`;
      if (message.noteOn) {
        this.activeMidiTokens.set(token, message.note);
        this.activeMidiNotes.add(message.note);
        this.noteEvents?.handleNoteOn(message.note, message.velocity, "midi", token);
      } else {
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
      this.fields.message.textContent = inRange ? "Физическая клавиша найдена в Piano View." : "Нота вне отображаемого диапазона Piano View.";
      this.syncDiagnostic();
    }

    syncDiagnostic() {
      this.fields["active-notes"].textContent = [...this.activeMidiNotes].sort((a, b) => a - b).join(", ") || "—";
    }
  }

  global.Play12MidiDiagnostic = Object.freeze({
    create: options => new MidiDiagnostic(options),
    parseMessage,
    pitchForMidi
  });
})(window);
