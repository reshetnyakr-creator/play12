'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const E = require('../../../editor/core');
const planner = require('../../../editor/contact-plan');
const { experiment } = require('../stage-3-0-5-physical-contact-semantics/experiment.cjs');
const baseline = require('../stage-3-0-4-residual-fingering-classification/results/reproduction.json');
const stage305 = require('../stage-3-0-5-physical-contact-semantics/results.json');

const dir = process.argv[2];
const out = {};
for (const [name, prefix] of [['time', 'hans-'], ['no-surprises', 'radiohead-']]) {
  const file = fs.readdirSync(dir).find(f => f.startsWith(prefix) && f.endsWith('-0.json'));
  const { score, run, manual, sourceHash, xml } = JSON.parse(fs.readFileSync(path.join(dir, file)));
  assert.equal(sourceHash, baseline[name].input_hash);
  const before = { ...run.assignments };
  for (const delta of baseline[name].strict_map_delta) before[delta.id] = delta.after || null;
  run.contactAssignments = Object.fromEntries(run.contacts.flatMap(c => {
    const fingers = [...new Set(c.ids.map(id => before[id]).filter(Boolean))];
    assert.ok(fingers.length <= 1);
    return fingers.length ? [[c.id, fingers[0]]] : [];
  }));
  const snapshot = JSON.stringify(score);
  const result = experiment(score, run, { locks: manual });
  assert.equal(JSON.stringify(score), snapshot);
  assert.equal(result.assigned, stage305[name].after);
  assert.equal(result.rejected, false);
  assert.equal(result.recoveryStatus, 'complete');
  for (const [id, f] of Object.entries(before)) if (f) assert.equal(result.assignments[id], f);
  for (const target of stage305[name].targets) {
    const own = target.sequence.find(c => c.id === target.id);
    assert.equal(result.assignments[target.id], own.finger);
    for (const item of target.sequence) {
      const contact = result.actions.find(c => c.id === item.id);
      assert.deepEqual([contact.hand, contact.start, contact.end], [item.hand, item.start, item.end]);
    }
  }
  const events = Object.fromEntries(score.score.parts.flatMap(part => part.measures.flatMap(bar =>
    bar.events.filter(e => e.kind === 'note').map(e => [e.id, {
      measure: bar.number, hand: e.hand, voice: e.voice, staff: e.staff, onset: e.editor_onset_q,
      duration: e.duration_quarters, midi: e.pitch.midi, ties: e.ties, articulations: e.articulations
    }]))));
  const limit = Math.max(...Object.values(run.profile.practicalSpan));
  const releaseChecks = {};
  for (const target of result.actions.filter(c => !result.contactAssignments[c.id])) {
    for (const neighbor of result.actions) {
      if (!result.contactAssignments[neighbor.id] || neighbor.hand !== target.hand ||
          Math.abs(neighbor.key - target.key) <= limit) continue;
      const at = new E.Q(neighbor.start).cmp(target.start);
      if (!at) continue;
      const [earlier, later] = at < 0 ? [neighbor, target] : [target, neighbor];
      if (new E.Q(earlier.end).cmp(later.start) <= 0) continue;
      const key = earlier.id + '|' + later.id;
      if (key in releaseChecks) continue;
      // This requests the boundary for a diagnostic only. It supplies no calibrated
      // minimum or acoustic evidence. The second pass isolates the notation gate.
      const end = new E.Q(later.start).toString();
      const releases = { [earlier.id]: end };
      const first = planner.planContacts(score, { releases }, result.actions);
      const hold = new E.Q(end).sub(earlier.start).toString();
      const second = planner.planContacts(score, { releases, minimumHoldByContact: { [earlier.id]: hold } }, result.actions);
      releaseChecks[key] = [first, second].map(plan => plan.issues.find(i => i.id === earlier.id)?.code ?? 'accepted_by_contract');
    }
  }
  out[name] = {
    run: { contacts: result.actions, contactAssignments: result.contactAssignments, profile: run.profile },
    rests: stage305[name].targets.map(target => target.id),
    events, xml, manual: manual ?? {}, original: Object.fromEntries(run.contacts.map(c => [c.id, c.end])),
    stage305: result.assigned, resets: result.resets, releaseChecks
  };
}
console.log(JSON.stringify(out));
