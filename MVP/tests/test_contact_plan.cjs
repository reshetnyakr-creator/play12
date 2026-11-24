'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { damperWindows, planContacts, validateFingers } = require('../editor/contact-plan.cjs');

const note = (id, midi, start, duration, hand = 'L', articulations = [], ties = []) => ({
  id, kind: 'note', hand, voice: '1', editor_supported: true, pitch: { midi },
  editor_onset_q: start, duration_quarters: duration, articulations, ties
});
const pedal = (type, at) => ({ source: 'notation', type, at, number: '1' });
const score = (events, pedals = []) => ({
  score: { parts: [{ id: 'P1', pedals, measures: [{ events }] }] }
});
const notes = [41, 48, 53].map((key, i) => note('first' + i, key, '0', '3'))
  .concat([53, 60, 65].map((key, i) => note('second' + i, key, '1', '2')));
const controls = { releases: {first0: '1/2', first1: '1/2', first2: '1/2'},
  resetByKey: {53: '1/4'}, minimumHoldByContact: {first0: '1/4', first1: '1/4', first2: '1/4'} };

test('damper stays down across continue and resets at change across both staves', () => {
  const part = score([], [pedal('start', '0'), pedal('continue', '1'),
    pedal('change', '2'), pedal('stop', '4')]).score.parts[0];
  assert.deepEqual(damperWindows(part), [{start:'0',end:'2'}, {start:'2',end:'4'}]);
  assert.deepEqual(damperWindows({pedals:[pedal('sostenuto','0'),pedal('stop','4')]}), []);
});
test('round 33 explicit research plan separates sound and key contact, and requires reset', () => {
  const input = score(notes, [pedal('start','0'),pedal('stop','3')]);
  const before = JSON.stringify(input);
  assert(planContacts(input).issues.some(i => i.code === 'KEY_OWNERSHIP_UNKNOWN'));
  const result = planContacts(input, controls);
  assert.deepEqual(result.issues, []);
  assert.equal(result.actions.filter(c => c.end === '1/2' && c.soundEnd === '3').length, 3);
  assert.equal(JSON.stringify(input), before);
  assert(planContacts(input, {...controls, resetByKey:{}}).issues.some(i => i.code === 'KEY_RESET_UNKNOWN'));
  assert(planContacts(input, {...controls, resetByKey:{53:'3/4'}}).issues.some(i => i.code === 'KEY_RESET_INSUFFICIENT'));
});
test('early release needs a defined minimum, pedal coverage or staccato, and cannot break a tie', () => {
  assert(planContacts(score(notes), controls).issues.some(i => i.code === 'RELEASE_NOT_SUPPORTED'));
  const input = score([note('s', 60,'0','2','R',['staccato'])]);
  assert.deepEqual(planContacts(input, {releases:{s:'1'},minimumHoldByContact:{s:'1/2'}}).issues, []);
  assert.equal(planContacts(input, {releases:{s:'1'}}).issues[0].code, 'MINIMUM_HOLD_UNKNOWN');
  const tied = score([note('a',60,'0','1','R',[],['start']), note('b',60,'1','1','R',[],['stop'])],
    [pedal('start','0'),pedal('stop','2')]);
  const result = planContacts(tied, {releases:{a:'1/2'},minimumHoldByContact:{a:'1/4'}});
  assert.equal(result.issues[0].code, 'RELEASE_NOT_SUPPORTED');
  assert.equal(result.actions[0].end,'2/1');
});

test('control fingers 5–3–1 / 5–3–1 require explicit transition support', () => {
  const input = score(notes, [pedal('start','0'),pedal('stop','3')]);
  const { actions, issues } = planContacts(input, controls);
  const fingers = {first0:5, first1:3, first2:1, second0:5, second1:3, second2:1};
  assert.deepEqual(issues, []);
  const mockTransition = ({previous, pose}) =>
    pose.length === 3 && (!previous || previous.every(contact => contact.end === '1/2'));
  assert.deepEqual(validateFingers(actions, fingers, mockTransition), []);
  assert(validateFingers(actions, fingers).every(issue => issue.code === 'TRANSITION_UNKNOWN'));
  assert(validateFingers(actions, fingers, ({previous}) => !previous).some(issue =>
    issue.code === 'TRANSITION_REJECTED'));
  assert(validateFingers(planContacts(input).actions, fingers, () => true).some(issue =>
    issue.code === 'FINGER_OVERLAP'));
});
