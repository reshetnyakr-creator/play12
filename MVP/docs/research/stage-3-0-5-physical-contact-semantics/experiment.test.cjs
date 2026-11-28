'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const E = require('../../../editor/core');
const profile = require('../../../editor/beginner.json');
const { experiment } = require('./experiment.cjs');

function fixture(data, locks = {}, pedals = []) {
  const events = data.map(([id, hand, midi, start, duration, ties = []], index) => ({
    id, hand, kind: 'note', pitch: { midi }, voice: String(hand === 'R' ? 1 : 2),
    staff: hand === 'R' ? 1 : 2, ties, order: index, editor_supported: true,
    editor_onset_q: String(start), duration_quarters: String(duration)
  }));
  const score = { editor: { schema: true }, score: { parts: [{ id: 'piano', pedals, measures: [{ events }] }] } };
  const baseline = { profile, contacts: E.contacts(score).contacts, contactAssignments: {}, total: events.length };
  const snapshot = JSON.stringify({ score, locks, baseline });
  return {
    run(options = {}) {
      const out = experiment(score, baseline, { locks, ...options });
      assert.equal(JSON.stringify({ score, locks, baseline }), snapshot);
      assert.deepEqual(out.actions.flatMap(c => c.ids).sort(), baseline.contacts.flatMap(c => c.ids).sort());
      return out;
    }
  };
}

for (const hand of ['L', 'R']) {
  const other = hand === 'L' ? 'R' : 'L';
  const mirror = key => hand === 'R' ? key : 120 - key;
  test('R05 existing ergonomic score selects nearby hand ' + hand, () => {
    const out = fixture([
      ['near-prev', hand, mirror(57), 0, 1], ['far-prev', other, mirror(43), 0, 1],
      ['right-event', 'R', 60, 1, 1], ['left-event', 'L', 60, 1, 1],
      ['near-next', hand, mirror(62), 2, 1], ['far-next', other, mirror(44), 2, 1]
    ]).run();
    assert.equal(out.rejected, false);
    assert.equal(out.assigned, 6);
    const [shared] = out.shared;
    assert.equal(shared.hand, hand);
    assert.equal(shared.candidates.length, 2);
    assert.ok(shared.candidates[0].rank[3] < shared.candidates[1].rank[3]);
    assert.equal(out.assignments['right-event'], shared.finger);
    assert.equal(out.assignments['left-event'], shared.finger);
  });

  for (const next of [hand, other]) {
    test('R11/R12/R55 repeated attack ' + hand + ' → ' + next, () => {
      const f = fixture([['a', hand, 60, 0, 2], ['b', next, 60, 1, 2]], { a: 4, b: 3 });
      const out = f.run();
      assert.equal(out.rejected, false);
      assert.equal(out.assigned, 2);
      assert.equal(out.assignments.a, 4);
      assert.equal(out.assignments.b, 3);
      assert.equal(out.resets[0].reset, 'uncalibrated');
      assert.equal(out.resets[0].sounding, 'unverified');
      assert.equal(out.resets[0].gap, '1/2');
      assert.equal(out.actions.find(c => c.id === 'b').hand, next);
      const calibrated = f.run({ resetByMidi: { 60: '1/8' } });
      assert.equal(calibrated.resets[0].gap, '1/8');
      assert.equal(calibrated.resets[0].reset, 'meets_supplied_interval');
      assert.equal(calibrated.rejected, false);
      assert.ok(f.run({ resetByMidi: { 60: '1' } }).rejected);
    });
  }
}

test('Pedal marking is preserved but does not manufacture proof of sounding', () => {
  const pedal = [{ at: '0', source: 'notation', type: 'start' }, { at: '6', source: 'notation', type: 'stop' }];
  const data = [['a', 'R', 60, 0, 3], ['b', 'L', 60, 2, 1]];
  const dry = fixture(data).run();
  const marked = fixture(data, {}, pedal).run();
  assert.deepEqual(dry.resets, marked.resets);
  assert.equal(marked.rejected, false);
});

test('Tie continuation is not a new attack, next independent attack is', () => {
  const data = [['a', 'R', 60, 0, 2, ['start']], ['b', 'R', 60, 2, 2, ['stop']],
    ['c', 'L', 60, 4, 1]];
  const out = fixture(data).run();
  assert.deepEqual(out.actions.map(c => c.ids), [['a', 'b'], ['c']]);
  assert.equal(out.resets.length, 1);
  assert.deepEqual(out.resets[0].next, ['c']);
  const orphan = fixture([['a', 'R', 60, 0, 2], ['b', 'L', 60, 1, 1, ['stop']]]).run();
  assert.equal(orphan.resets.length, 0);
});

test('Different durations and opposing manual locks prevent an inter-hand merge', () => {
  const events = [['a', 'R', 60, 0, 1], ['b', 'L', 60, 0, 1]];
  const out = fixture(events, { a: 3, b: 3 }).run();
  assert.equal(out.shared.length, 0);
  assert.deepEqual(out.assignments, { a: 3, b: 3 });
  assert.equal(out.rejected, true);
  const different = fixture([events[0], ['b', 'L', 60, 0, 2]]).run();
  assert.equal(different.rejected, false);
  assert.equal(different.shared.length, 0);
  assert.equal(different.assigned, 1);
});

test('A single manual lock fixes the physical hand and finger of a shared key', () => {
  const out = fixture([['a', 'R', 60, 0, 1], ['b', 'L', 60, 0, 1]], { b: 4 }).run();
  assert.equal(out.shared[0].hand, 'L');
  assert.equal(out.shared[0].finger, 4);
  assert.equal(out.rejected, false);
});

test('Manual lock that exceeds MaxPrac stays recorded, while the plan is rejected', () => {
  const out = fixture([['a', 'R', 60, 0, 2], ['b', 'R', 77, 0, 2]], { a: 1, b: 5 }).run();
  assert.deepEqual(out.assignments, { a: 1, b: 5 });
  assert.equal(out.rejected, true);
  assert.equal(out.constraintViolations[0].code, 'SPAN_VIOLATION');
});
