'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../../editor/core');
const { experiment } = require('./experiment.cjs');
const audit = require('./cases.json');
const prior = require('../stage-3-0-4-residual-fingering-classification/results/reproduction.json');

const residuals = fs.readFileSync(path.join(__dirname,
  '../stage-3-0-4-residual-fingering-classification/results/residual-notes.csv'), 'utf8')
  .trimEnd().split('\n').slice(1).map(line => {
    // The first 15 columns precede the quoted text/JSON fields. Tie marks may
    // be quoted, so group boundaries are identified by their CSV field.
    const [, composition, id] = line.match(/^(time|no-surprises),([^,]+)/);
    return { composition, id, group: line.match(/,(G[1-4]),/)[1] };
  });
const imports = process.argv[2];
const report = {};
for (const [name, prefix] of [['time', 'hans-'], ['no-surprises', 'radiohead-']]) {
  const files = fs.readdirSync(imports).filter(f => f.startsWith(prefix) && f.endsWith('-0.json'));
  assert.equal(files.length, 1);
  const { score, run, manual } = JSON.parse(fs.readFileSync(path.join(imports, files[0])));
  const pristine = JSON.stringify(score);
  const priorFinger = { ...run.assignments };
  for (const delta of prior[name].strict_map_delta) priorFinger[delta.id] = delta.after || null;
  run.contactAssignments = Object.fromEntries(run.contacts.flatMap(c => {
    const fingers = [...new Set(c.ids.map(id => priorFinger[id]))].filter(Boolean);
    assert.ok(fingers.length <= 1);
    return fingers.length ? [[c.id, fingers[0]]] : [];
  }));
  assert.equal(Object.values(priorFinger).filter(Boolean).length, prior[name].strict);
  const next = experiment(score, run, { locks: manual });
  assert.equal(JSON.stringify(score), pristine);
  assert.equal(next.rejected, false);
  assert.equal(next.recoveryStatus, 'complete');
  const ids = next.actions.flatMap(c => c.ids).sort();
  assert.deepEqual(ids, run.contacts.flatMap(c => c.ids).sort());
  const gained = E.events(score).map(e => e.id).filter(id => !priorFinger[id] && next.assignments[id]);
  const lost = Object.keys(priorFinger).filter(id => priorFinger[id] && !next.assignments[id]);
  const reassigned = Object.keys(priorFinger).filter(id => priorFinger[id] && next.assignments[id] &&
    priorFinger[id] !== next.assignments[id]);
  const targets = audit.cases.filter(c => c.composition === name).map(target => {
    const relevant = new Set([target.id, ...target.blockers.map(c => c.id)]);
    const sequence = next.actions.filter(c => c.ids.some(id => relevant.has(id)))
      .sort((a, b) => new E.Q(a.start).cmp(b.start)).map(c => ({
        id: c.id, hand: c.hand, before: priorFinger[c.id] ?? null, finger: next.contactAssignments[c.id] ?? null,
        start: c.start, end: c.end
      }));
    const resets = next.resets.filter(r => relevant.has(r.id) && r.next.some(id => relevant.has(id)));
    return { id: target.id, group: target.group, measure: target.measure, midi: target.midi, sequence, resets };
  });
  const collateral = Object.fromEntries(['G3', 'G4'].map(group => {
    const ids = residuals.filter(r => r.composition === name && r.group === group).map(r => r.id);
    return [group, { baselineResiduals: ids.length, assignedAfter: ids.filter(id => next.assignments[id]).length,
      contactShortened: ids.filter(id => next.actions.some(c => c.ids.includes(id) &&
        next.resets.some(r => r.id === c.id && r.shortened))).length }];
  }));
  report[name] = { before: prior[name].strict, after: next.assigned, total: run.total, gained, lost, reassigned, targets,
    collateral, crossHandUnisons: next.shared.length, unresolvedCrossHandUnisons: next.unresolved.length, shortenedContacts: next.resets.filter(r => r.shortened).length,
    newConflicts: next.conflicts.length, recovery: next.recoveryStatus };
}
console.log(JSON.stringify(report, null, 2));
