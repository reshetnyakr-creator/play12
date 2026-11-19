(function (global) {
  "use strict";

  const STORAGE_KEY = "play12.review.when-the-saints.v0.2";
  const GRID_QUARTERS = Object.freeze({ "1/4": 1, "1/8": .5, "1/16": .25, "1/32": .125, "1/64": .0625 });
  const clone = value => JSON.parse(JSON.stringify(value));
  const round = value => Math.round(value * 1e8) / 1e8;
  const snap = (value, grid) => round(Math.round(value / GRID_QUARTERS[grid]) * GRID_QUARTERS[grid]);
  const pitchNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pitchName = midi => `${pitchNames[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  const pitchObject = midi => ({ step: pitchNames[midi % 12][0], alter: pitchNames[midi % 12].includes("#") ? 1 : 0, octave: Math.floor(midi / 12) - 1, midi });

  function findEvent(document, eventId) {
    for (const part of document.score.parts) {
      for (const measure of part.measures) {
        const event = measure.events.find(item => item.id === eventId);
        if (event) return { event, measure };
      }
    }
    return null;
  }

  function applyOverlay(baseDocument, overlay) {
    const effective = clone(baseDocument);
    const zeroPitchClass = Object.entries(baseDocument.play12.pitch_class_mapping).find(([, symbol]) => symbol === "0")?.[0];
    for (const [eventId, edit] of Object.entries(overlay.edits || {})) {
      const found = findEvent(effective, eventId);
      if (!found) continue;
      if (edit.deleted === true) {
        found.measure.events = found.measure.events.filter(event => event.id !== eventId);
        continue;
      }
      const event = found.event;
      if (Number.isInteger(edit.midi)) {
        event.pitch = pitchObject(edit.midi);
        const symbolIndex = ((edit.midi % 12) - Number(zeroPitchClass) + 12) % 12;
        event.play12_symbol = { value: baseDocument.play12.symbols[symbolIndex], origin: "manual_review_pitch" };
      }
      if (edit.hand === "R" || edit.hand === "L") {
        event.hand = edit.hand;
        event.staff = edit.hand === "R" ? 1 : 2;
      }
      if (Number.isInteger(edit.finger)) {
        event.method.finger = edit.finger;
        event.method.fingering_source = "user";
        event.method.fingering_confidence = null;
        event.method.fingering_history = [
          ...(event.method.fingering_history || []),
          { source: "manual_review", finger: edit.finger, timestamp: edit.updated_at }
        ];
      }
      if (Number.isFinite(edit.start_quarters)) event.start_quarters = String(edit.start_quarters);
      if (Number.isFinite(edit.duration_quarters)) event.duration_quarters = String(edit.duration_quarters);
      event.review_override_id = `when-the-saints:${eventId}`;
    }
    return effective;
  }

  function create(options) {
    const storage = options.storage || global.localStorage;
    const seed = clone(options.seedOverlay);
    let overlay = seed;
    try {
      const saved = JSON.parse(storage.getItem(STORAGE_KEY));
      if (saved?.format === seed.format && saved?.composition_id === seed.composition_id) overlay = saved;
    } catch (_) {}
    let selectedId = null;
    let onChange = () => {};
    const root = options.root;
    const fields = {
      id: root.querySelector("#review-event-id"), pitchName: root.querySelector("#review-pitch-name"), midi: root.querySelector("#review-midi"),
      symbol: root.querySelector("#review-symbol"), hand: root.querySelector("#review-hand"), finger: root.querySelector("#review-finger"),
      fingerSource: root.querySelector("#review-fingering-source"),
      start: root.querySelector("#review-start"), duration: root.querySelector("#review-duration"), measure: root.querySelector("#review-measure"),
      grid: root.querySelector("#review-grid"), save: root.querySelector("#review-save"), undo: root.querySelector("#review-undo"),
      reset: root.querySelector("#review-reset"), delete: root.querySelector("#review-delete"), resetAll: root.querySelector("#review-reset-all"),
      close: root.querySelector("#review-close"), status: root.querySelector("#review-status")
    };

    const persist = () => storage.setItem(STORAGE_KEY, JSON.stringify(overlay));
    const effective = () => applyOverlay(options.baseDocument, overlay);
    const setStatus = text => { fields.status.textContent = text; };
    const syncSelectedClass = () => {
      for (const node of document.querySelectorAll("g[data-event-id]")) node.classList.toggle("is-review-selected", node.dataset.eventId === selectedId);
    };
    const refreshInspector = () => {
      const found = selectedId && findEvent(effective(), selectedId);
      root.hidden = !selectedId;
      if (!found) {
        fields.undo.disabled = !(overlay.history || []).length;
        fields.reset.disabled = true;
        fields.delete.disabled = true;
        syncSelectedClass();
        return;
      }
      const { event, measure } = found;
      fields.id.textContent = event.id;
      fields.pitchName.textContent = pitchName(event.pitch.midi);
      fields.midi.value = String(event.pitch.midi);
      fields.symbol.textContent = event.play12_symbol.value;
      fields.hand.value = event.hand;
      fields.finger.value = String(event.method.finger || event.onboarding?.display_finger || 1);
      fields.fingerSource.textContent = event.method.fingering_source || event.onboarding?.source || "base";
      fields.start.value = String(Number(event.start_quarters));
      fields.duration.value = String(Number(event.duration_quarters));
      fields.measure.textContent = String(measure.number || measure.index + 1);
      fields.grid.textContent = options.gridSelect.value;
      fields.undo.disabled = !(overlay.history || []).length;
      fields.reset.disabled = !overlay.edits?.[selectedId];
      fields.delete.disabled = false;
      syncSelectedClass();
    };
    const commit = (eventId, nextEdit, action) => {
      const previous = overlay.edits?.[eventId] ? clone(overlay.edits[eventId]) : null;
      overlay.history = [...(overlay.history || []), { event_id: eventId, previous, action, timestamp: new Date().toISOString() }];
      overlay.edits = { ...(overlay.edits || {}) };
      if (nextEdit) overlay.edits[eventId] = nextEdit;
      else delete overlay.edits[eventId];
      persist(); onChange(effective()); refreshInspector(); setStatus(action);
    };
    const select = eventId => { selectedId = eventId; refreshInspector(); setStatus("Selected"); };
    fields.save.addEventListener("click", () => {
      if (!selectedId) return;
      const grid = options.gridSelect.value;
      const midi = Math.max(21, Math.min(108, Math.round(Number(fields.midi.value))));
      const finger = Math.max(1, Math.min(5, Math.round(Number(fields.finger.value))));
      const start = Math.max(0, snap(Number(fields.start.value), grid));
      const duration = Math.max(GRID_QUARTERS[grid], snap(Number(fields.duration.value), grid));
      commit(selectedId, { midi, hand: fields.hand.value, finger, start_quarters: start, duration_quarters: duration, fingering_source: "user", updated_at: new Date().toISOString() }, "Saved manual review edit");
    });
    fields.undo.addEventListener("click", () => {
      const history = [...(overlay.history || [])]; const last = history.pop(); if (!last) return;
      overlay.history = history; overlay.edits = { ...(overlay.edits || {}) };
      if (last.previous) overlay.edits[last.event_id] = last.previous; else delete overlay.edits[last.event_id];
      persist(); onChange(effective()); refreshInspector(); setStatus("Undid last edit");
    });
    fields.reset.addEventListener("click", () => { if (selectedId) commit(selectedId, null, "Reset selected note"); });
    fields.delete.addEventListener("click", () => {
      if (!selectedId || !global.confirm(`Delete note ${selectedId} from the effective review version?`)) return;
      commit(selectedId, { deleted: true, updated_at: new Date().toISOString() }, "Deleted selected note");
    });
    fields.resetAll.addEventListener("click", () => {
      if (!global.confirm("Reset all manual edits for When the Saints?")) return;
      overlay = clone(seed); persist(); onChange(effective()); refreshInspector(); setStatus("Reset all manual edits");
    });
    fields.close.addEventListener("click", () => { selectedId = null; root.hidden = true; syncSelectedClass(); });
    options.gridSelect.addEventListener("change", () => { fields.grid.textContent = options.gridSelect.value; onChange(effective()); });
    refreshInspector();

    return Object.freeze({
      storageKey: STORAGE_KEY, gridQuarters: GRID_QUARTERS, effective, select,
      connect(callback) { onChange = callback; },
      syncSelection: syncSelectedClass,
      getOverlay: () => clone(overlay), getSelectedId: () => selectedId
    });
  }

  global.Play12CompositionReview = Object.freeze({ create, applyOverlay, GRID_QUARTERS, STORAGE_KEY });
})(window);
