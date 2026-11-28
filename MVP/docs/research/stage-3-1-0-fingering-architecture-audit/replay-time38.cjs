'use strict';
// Validate existence of old-model continuations. Locks here are test constraints.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { optimize } = require('../stage-3-0-10-fingering-priority/priority.cjs');
const { time } = require('../stage-3-0-10-fingering-priority/results.json');

const [snapshotPath, controlPath] = process.argv.slice(2);
if (!snapshotPath || !controlPath) throw Error('Supply local Stage 3.0.10 Time snapshot and control files.');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const { ids } = JSON.parse(fs.readFileSync(controlPath, 'utf8')).time.control;
const alternatives = [[1, 2, 3], [2, 3, 4], [3, 4, 5], [2, 3, 1]];
const results = [];
for (const { releases } of time.control.schedules) {
  const ends = new Map(releases.map(({ id, end }) => [id, end]));
  const contacts = snapshot.contacts.map(contact => ends.has(contact.id)
    ? { ...contact, end: ends.get(contact.id) } : contact);
  for (const fingers of alternatives) {
    const fixed = Object.fromEntries(ids.map((id, i) => [id, [5, 2, 1, ...fingers][i]]));
    try {
      const run = optimize({ ...snapshot, contacts, manual: { ...snapshot.manual, ...fixed } },
        { explain: false });
      results.push({ releases, fingers, feasible: true, cost: run.attempts.L.cost });
    } catch (error) {
      if (error.message !== 'L infeasible') throw error;
      results.push({ releases, fingers, feasible: false });
    }
  }
}
const authored = results.filter(({ fingers, feasible }) =>
  feasible && fingers.join('') === '234');
assert.equal(authored.length, 1);
assert.equal(authored[0].releases.length, 2);
assert.ok(authored[0].releases.every(({ end }) => end === '149/1'));
console.log(JSON.stringify(results, null, 2));
