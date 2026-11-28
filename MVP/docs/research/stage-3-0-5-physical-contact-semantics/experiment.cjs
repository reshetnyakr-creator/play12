'use strict';

const E = require('../../../editor/core');
const { Q } = E;
const cmp = (a, b) => new Q(a).cmp(b);
const sort = (a, b) => cmp(a.start, b.start) || a.id.localeCompare(b.id);

function catalog(score) {
  return new Map(score.score.parts.flatMap(part => part.measures.flatMap(bar =>
    bar.events.map(event => [event.id, { event, part }]))));
}

function unisons(actions, source, locks) {
  const buckets = new Map();
  for (const contact of actions) {
    const notes = contact.ids.map(id => source.get(id));
    if (contact.arpeggio || contact.notatedEnd || contact.sustainedIds?.length ||
        notes.some(({ event: e }) => !e.editor_supported || !e.voice || e.grace || e.ties?.length ||
          e.unisonSpecial || e.unisonTiming?.some(value => value != null))) continue;
    const { event, part } = notes[0];
    const time = [event.editor_onset_q, event.duration_quarters].map(value => new Q(value).toString());
    const marks = JSON.stringify([...(event.articulations || [])].sort());
    if (!notes.every(({ event: e, part: p }) => p === part && cmp(e.editor_onset_q, time[0]) === 0 &&
        cmp(e.duration_quarters, time[1]) === 0 && JSON.stringify([...(e.articulations || [])].sort()) === marks)) continue;
    const key = JSON.stringify([part.id, contact.key, ...time, new Q(contact.start).toString(),
      new Q(contact.end).toString(), marks]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(contact);
  }
  return [...buckets.values()].filter(group => {
    if (new Set(group.map(c => c.hand)).size < 2) return false;
    const ids = group.flatMap(c => c.ids);
    const notes = ids.map(id => source.get(id).event);
    // Voices may have the same number on separate staves.
    if (new Set(notes.map(e => JSON.stringify([e.staff, e.voice]))).size !== ids.length) return false;
    const written = new Set(notes.map(e => e.source_fingering).filter(f => f != null));
    const manual = group.filter(c => c.ids.some(id => locks[id] != null));
    return written.size <= 1 && new Set(manual.map(c => c.hand)).size <= 1 &&
      new Set(ids.map(id => locks[id]).filter(f => f != null)).size <= 1;
  });
}

function releasePlan(actions, resetByMidi, isAttack = () => true) {
  const byKey = new Map();
  const times = [...new Set(actions.map(c => new Q(c.start).toString()))].sort(cmp);
  const priorAttack = new Map(times.map((t, i) => [t, times[i - 1]]));
  const changes = new Map();
  const resets = [];
  for (const c of actions.slice().sort(sort)) {
    if (!isAttack(c)) continue;
    if (!byKey.has(c.key)) byKey.set(c.key, new Map());
    const onsets = byKey.get(c.key);
    const start = new Q(c.start).toString();
    if (!onsets.has(start)) onsets.set(start, []);
    onsets.get(start).push(c);
  }
  for (const onsets of byKey.values()) {
    const starts = [...onsets.keys()];
    for (let i = 1; i < starts.length; i++) {
      const next = starts[i];
      for (const earlier of onsets.get(starts[i - 1])) {
        const required = resetByMidi[earlier.key];
        if (required != null && cmp(required, 0) <= 0) throw new RangeError('Expected a positive measured reset interval');
        const latest = required == null ? null : new Q(next).sub(required);
        let end = earlier.end;
        if (latest != null && cmp(end, latest) > 0) end = latest.toString();
        if (latest == null && cmp(end, next) >= 0) {
          // Stay between the last intervening attack and this attack. This is
          // an order witness for the solver, never a universal reset duration.
          const sum = new Q(priorAttack.get(next)).add(next);
          end = new Q(sum.n, sum.d * 2n).toString();
        }
        const valid = cmp(end, earlier.start) > 0;
        const shortened = valid && cmp(end, earlier.end) < 0;
        if (shortened) changes.set(earlier.id, { ...earlier, end, releaseBasis: 'experimental_reattack' });
        resets.push({ id: earlier.id, next: onsets.get(next).map(c => c.id), attack: next,
          writtenContactEnd: earlier.end, plannedEnd: valid ? end : null,
          gap: valid ? new Q(next).sub(end).toString() : null, shortened,
          reset: !valid ? 'measured_window_insufficient' : required == null ? 'uncalibrated' : 'meets_supplied_interval',
          sounding: shortened ? 'unverified' : 'unchanged_contact' });
      }
    }
  }
  return { actions: actions.map(c => changes.get(c.id) ?? c), resets };
}

function collisions(actions, assignments) {
  const sorted = actions.filter(c => assignments[c.id] != null).sort(sort);
  return sorted.flatMap((a, i) => {
    const issues = [];
    for (let j = i + 1; j < sorted.length && cmp(sorted[j].start, a.end) < 0; j++) {
      const b = sorted[j];
      if (a.key === b.key || (a.hand === b.hand && assignments[a.id] === assignments[b.id]))
        issues.push([a.id, b.id]);
    }
    return issues;
  });
}

function experiment(score, baseline, { locks = {}, resetByMidi = {} } = {}) {
  const source = catalog(score);
  const independent = c => !source.get(c.id).event.ties?.includes('stop');
  const manual = { ...locks };
  for (const [id, { event }] of source) if (event.sharedContactLock != null) {
    if (manual[id] != null && manual[id] !== event.sharedContactLock) throw new Error('Conflicting manual locks: ' + id);
    manual[id] = event.sharedContactLock;
  }
  const profile = baseline.profile;
  const base = { contacts: baseline.contacts, warnings: [] };
  let actions = base.contacts.slice();
  const shared = [];
  const sharedFingers = new Map();
  const fixedFinger = c => c.ids.map(id => manual[id]).find(f => f != null) ??
    sharedFingers.get(c.id) ?? baseline.contactAssignments[c.id];
  const eligible = unisons(actions, source, manual);
  const unresolved = [];
  for (const group of eligible) {
    const ids = group.flatMap(c => c.ids).sort();
    const rest = actions.filter(c => !group.includes(c));
    const owner = group.find(c => c.ids.some(id => manual[id] != null))?.hand;
    const candidates = [];
    const contextualLocks = Object.fromEntries(rest.flatMap(c => {
      const finger = fixedFinger(c);
      return finger == null ? [] : c.ids.map(id => [id, finger]);
    }));
    for (const c of group.filter((current, i) => group.findIndex(x => x.hand === current.hand) === i)) {
      if (owner && c.hand !== owner) continue;
      const merged = { ...c, ids, sharedAcrossHands: true };
      const proposed = [...rest, merged];
      const plan = releasePlan(proposed, resetByMidi, independent);
      const run = E.propose(score, profile, { ...contextualLocks, ...manual }, false, { base, actions: plan.actions, preferred: {} });
      if (run.search_status === 'budget_exhausted' || !run.contactAssignments[c.id] ||
          Object.entries(manual).some(([id, f]) => run.assignments[id] !== f) ||
          E.validate(plan.actions, run.contactAssignments, { profile }).conflicts.length || collisions(plan.actions, run.contactAssignments).length) continue;
      const sum = name => run.alternatives.reduce((total, h) => total + (h.paths[0]?.[name] ?? 0), 0);
      candidates.push({ actions: proposed, contact: merged, finger: run.contactAssignments[c.id],
        rank: [-run.assigned, sum('expandedPairs'), sum('excess'), sum('cost')] });
    }
    candidates.sort((a, b) => {
      const i = a.rank.findIndex((value, index) => value !== b.rank[index]);
      return i < 0 ? a.contact.id.localeCompare(b.contact.id) : a.rank[i] - b.rank[i];
    });
    if (!candidates.length) {
      unresolved.push({ ids, reason: 'no_valid_scored_assignment' });
      continue;
    }
    actions = candidates[0].actions;
    sharedFingers.set(candidates[0].contact.id, candidates[0].finger);
    shared.push({ ...candidates[0].contact, finger: candidates[0].finger,
      candidates: candidates.map(({ contact, finger, rank }) => ({ hand: contact.hand, finger, rank })) });
  }
  const plan = releasePlan(actions, resetByMidi, independent);
  const contactAssignments = Object.fromEntries(plan.actions.flatMap(c => {
    const fixed = [...new Set(c.ids.map(id => manual[id]).filter(f => f != null))];
    if (fixed.length > 1) throw new Error('Conflicting manual locks: ' + c.id);
    const finger = fixedFinger(c);
    return finger == null ? [] : [[c.id, finger]];
  }));
  const assignments = Object.fromEntries(plan.actions.flatMap(c => c.ids.map(id => [id, contactAssignments[c.id] ?? null])));
  const assigned = E.events(score).filter(e => assignments[e.id] != null).length;
  const recovered = E.recoverPartial(score, {
    ...baseline, contactAssignments, assignments, contacts: plan.actions, assigned, elapsed_ms: 0,
    warnings: [], unassignedReasons: {}, validation: { warnings: [] }
  }, manual);
  const validation = E.validate(plan.actions, recovered.contactAssignments, { profile });
  const conflicts = collisions(plan.actions, recovered.contactAssignments);
  return { ...plan, shared, unresolved, assignments: recovered.assignments,
    contactAssignments: recovered.contactAssignments, assigned: recovered.assigned,
    recoveryStatus: recovered.recovery?.status ?? 'complete', conflicts,
    constraintViolations: [...validation.conflicts, ...validation.warnings.filter(w => w.code === 'KEY_OWNERSHIP_UNKNOWN' &&
      w.ids.every(id => recovered.contactAssignments[id] != null))],
    rejected: conflicts.length > 0 || validation.conflicts.length > 0 ||
      plan.resets.some(r => r.reset === 'measured_window_insufficient') ||
      Object.entries(manual).some(([id, f]) => recovered.assignments[id] !== f) };
}

module.exports = { experiment, releasePlan };
