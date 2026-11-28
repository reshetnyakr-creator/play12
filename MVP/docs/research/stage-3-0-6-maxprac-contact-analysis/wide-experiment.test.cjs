'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../../editor/core');
const profile = require('../../../editor/beginner.json');
const { runWide, residualReasons } = require('./wide-experiment.cjs');

const contact = (id, key, start=0, end=2, hand='R', ids=[id]) =>
  ({id,key,start:String(start),end:String(end),hand,ids,releaseBasis:'assumed_score_duration'});
function perform(contacts, map={}, { locks={}, frozen=[], pedals=[] }={}) {
  const assignments = Object.fromEntries(contacts.flatMap(c=>c.ids.map(id=>[id,map[c.id]??null])));
  const baseline = {profile,contacts,contactAssignments:map,assignments,
    total:Object.keys(assignments).length,assigned:Object.values(assignments).filter(Boolean).length,
    elapsed_ms:0,warnings:[],unassignedReasons:{},validation:{warnings:[]}};
  const score={editor:{},score:{parts:[{pedals}]}};
  const snapshot=JSON.stringify({baseline,score,locks});
  const run=runWide(score,baseline,{locks,frozen});
  assert.equal(JSON.stringify({baseline,score,locks}),snapshot);
  assert.equal(run.contacts,contacts);
  return {run,baseline,score};
}
function assertOuter(run, lower, upper, expected) {
  assert.deepEqual([run.assignments[lower],run.assignments[upper]],expected);
  assert.equal(run.validation.conflicts.length,0);
  assert.equal(run.validation.physical,'unknown');
  assert.equal(run.validation.wideExceptions.length,1);
  assert.deepEqual(run.validation.wideExceptions[0].ids,[lower,upper]);
}

test('Simultaneous wide right hand pair uses low 1, high 5',()=>{
  const {run}=perform([contact('low',60),contact('high',77)],{low:1});
  assertOuter(run,'low','high',[1,5]);
});
test('Simultaneous wide left hand pair uses low 5, high 1',()=>{
  const {run}=perform([contact('low',43,0,2,'L'),contact('high',60,0,2,'L')],{high:1});
  assertOuter(run,'low','high',[5,1]);
});
for(const lowFirst of [true,false])test('Staggered attacks with overlapping contacts, low first='+lowFirst,()=>{
  const {run}=perform([contact('low',43,lowFirst?0:1,3),contact('high',59,lowFirst?1:0,3)],{low:1});
  assertOuter(run,'low','high',[1,5]);
});
for(const [gap,category] of [[13,'COMFORTABLE'],[14,'PRACTICAL_EXTENSION'],[15,'PRACTICAL_EXTENSION']]){
  test('Boundary '+gap+' retains standard assignment category',()=>{
    const {run}=perform([contact('low',60),contact('high',60+gap)],{low:1},{locks:{high:5}});
    assert.equal(run.assignments.high,5);
    assert.equal(run.validation.wideExceptions.length,0);
    assert.equal(run.validation.categories.high,category);
  });
}
test('First semitone beyond MaxPrac needs an explicit exception',()=>{
  const {run,baseline,score}=perform([contact('low',60),contact('high',76)],{low:1});
  assert.equal(E.recoverPartial(score,baseline).assignments.high,null);
  assertOuter(run,'low','high',[1,5]);
  assert.equal(E.validate(run.contacts,run.contactAssignments,{profile}).conflicts[0].code,'SPAN_VIOLATION');
});
test('Third simultaneous note must satisfy both remaining pairs',()=>{
  const {run}=perform([contact('low',60),contact('mid',69),contact('high',76)],{low:1,mid:3});
  assertOuter(run,'low','high',[1,5]);
  assert.equal(run.assignments.mid,3);
  const bad=perform([contact('low',60),contact('mid',67),contact('high',77)],{low:1,mid:3}).run;
  assert.equal(bad.assignments.high,null);
  assert.equal(bad.validation.wideExceptions.length,0);
});
test('An occupied thumb or little finger cannot be duplicated',()=>{
  for(const [fixed,target,blocker,fixedFinger,blockedFinger] of [
    [76,60,62,5,1], [60,76,65,1,5]
  ]){
    const contacts=[contact('fixed',fixed),contact('target',target),contact('blocker',blocker)];
    const map={fixed:fixedFinger,blocker:blockedFinger};
    assert.equal(E.validate([contacts[0],contacts[2]],map,{profile}).conflicts.length,0);
    const {run}=perform(contacts,map,{locks:map});
    assert.equal(run.assignments.target,null);
    const issues=residualReasons(contacts[1],contacts,run.contactAssignments,profile,{});
    assert.ok(issues[blockedFinger].some(x=>x.rule==='R04_FINGER_OCCUPIED'&&x.id==='blocker'));
  }
});
test('Current manual finger persists and an incompatible manual choice prevents exception',()=>{
  const actions=[contact('low',60),contact('high',76)];
  const {run}=perform(actions,{low:2},{locks:{low:2}});
  assert.deepEqual(run.assignments,{low:2,high:null});
  assert.equal(run.validation.wideExceptions.length,0);
  const valid=perform(actions,{low:1},{locks:{low:1,high:5}}).run;
  assertOuter(valid,'low','high',[1,5]);
  assert.deepEqual(valid.validation.wideExceptions[0].source,['manual','manual']);
});
test('Reconsideration changes only an unlocked wide neighbor',()=>{
  const contacts=[contact('low',60),contact('high',76),contact('next',63,2,3)];
  const {run}=perform(contacts,{low:2,next:4});
  assertOuter(run,'low','high',[1,5]);
  assert.equal(run.assignments.next,4);
  const frozen=perform(contacts,{low:2,next:4},{frozen:['low']}).run;
  assert.equal(frozen.assignments.low,2);
  assert.equal(frozen.assignments.high,null);
});
test('Several nonoverlapping high attacks can use finger 5 against one held low note',()=>{
  const {run}=perform([contact('low',48,0,4),contact('b',65,0,1),contact('c',67,1,2),contact('d',69,2,4)],{low:1});
  assert.deepEqual(run.assignments,{low:1,b:5,c:5,d:5});
  assert.equal(run.validation.wideExceptions.length,3);
});
test('Tied segments retain one contact and all original event IDs reach diagnostics',()=>{
  const {run}=perform([contact('a',43,0,4,'L',['a','a-tie']),contact('b',59,2,4,'L')],{b:1});
  assertOuter(run,'a','b',[5,1]);
  assert.equal(run.assignments['a-tie'],5);
  assert.deepEqual(run.validation.wideExceptions[0].eventIds,[['a','a-tie'],['b']]);
});
test('Pedal metadata has no influence on assignment or contact timing',()=>{
  const actions=[contact('low',48),contact('high',64,1,3)];
  const dry=perform(actions,{low:1}).run;
  const wet=perform(actions,{low:1},{pedals:[{at:'0',type:'start'},{at:'3',type:'stop'}]}).run;
  assert.deepEqual(dry.assignments,wet.assignments);
  assert.deepEqual(dry.validation.wideExceptions,wet.validation.wideExceptions);
});
test('Exception record includes thresholds, deltas, interval and physical status',()=>{
  const {run}=perform([contact('low',60,0,3),contact('high',79,1,4)],{low:1});
  const [d]=run.validation.wideExceptions;
  assert.deepEqual([d.code,d.hand,d.fingers,d.midi,d.distance,d.comfortLimit,d.practicalLimit,
    d.comfortExcess,d.practicalExcess,d.wideIntervalException,d.overlap,d.physical],
  ['WIDE_OUTER_PAIR','R',[1,5],[60,79],19,13,15,6,4,true,['1/1','3/1'],'unknown']);
});
test('No exemption for inner pairs, reversed order, regular octave, two hands or adjacent intervals',()=>{
  for(const [high,keyFinger] of [[76,4],[74,4],[72,3]]){
    const { run }=perform([contact('low',60),contact('high',high)],{low:2},
      {locks:{low:2,high:keyFinger}});
    assert.equal(run.assignments.high,null);
    assert.equal(run.validation.wideExceptions.length,0);
  }
  const reversed=perform([contact('low',60),contact('high',76)],{low:5},{locks:{low:5,high:1}}).run;
  assert.equal(reversed.assignments.high,null);
  const split=perform([contact('low',60,0,2,'L'),contact('high',76)],{low:5}).run;
  assert.equal(split.assigned,2);
  assert.equal(split.validation.wideExceptions.length,0);
  const later=perform([contact('low',60),contact('high',76,2,3)],{low:1}).run;
  assert.equal(later.assigned,2);
  assert.equal(later.validation.wideExceptions.length,0);
});
