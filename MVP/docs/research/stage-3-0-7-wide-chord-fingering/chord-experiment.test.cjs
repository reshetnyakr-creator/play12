'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../../editor/core');
const profile=require('../../../editor/beginner.json');
const {experiment}=require('./chord-experiment.cjs');

function fixture(pitches,{hand='L',map={},times=[],locks={},frozen=[],pedals=[]}={}){
  const notes=pitches.map((key,i)=>({id:String(i),key,hand,start:String(times[i]?.[0]??0),
    end:String(times[i]?.[1]??1),ids:[String(i)],releaseBasis:'assumed_score_duration'}));
  const events=notes.map(n=>({id:n.id,kind:'note',hand,editor_onset_q:n.start,pitch:{midi:n.key},
    duration_quarters:new E.Q(n.end).sub(n.start).toString(),ties:[]}));
  const score={editor:{},score:{parts:[{pedals,measures:[{events}]}]}};
  const baseline={profile,contacts:notes,contactAssignments:map,
    assignments:Object.fromEntries(notes.map(n=>[n.id,map[n.id]??null])),
    assigned:Object.keys(map).length,total:notes.length,warnings:[],validation:{warnings:[]},unassignedReasons:{}};
  return {score,baseline,locks,frozen};
}
function run(pitches,opts){
  const f=fixture(pitches,opts);
  const snapshot=JSON.stringify(f);
  const out=experiment(f.score,f.baseline,['0'],f);
  assert.equal(JSON.stringify(f),snapshot);
  assert.equal(out.validation.conflicts.length+out.validation.warnings.length,0);
  return out;
}
function chord(keys,fingers,opts){
  const out=run(keys,opts);
  assert.equal(out.assigned,keys.length);
  assert.deepEqual(out.chords[0].fingers,fingers);
  return out;
}
test('Time bar 36 jointly reconsiders the two automatic attack fingers and keeps later events',()=>{
  const out=run([38,45,54,52,50,45,47],{map:{1:1,2:5,3:1,4:1,5:1,6:1},
    times:[[0,4],[0,1],[0,1],[1,2],[2,3],[3,'7/2'],['7/2',4]]});
  assert.deepEqual(out.map,{0:5,1:2,2:1,3:1,4:1,5:1,6:1});
});
test('Right hand calibration of outer fingers',()=>chord([60,69,76],[1,2,5],{hand:'R'}));
test('Four-note wide chord uses an ordered subset',()=>{
  const out=run([40,44,49,57],{map:{1:4,2:2,3:1}});
  assert.equal(out.assigned,4);
  const f=out.chords[0].fingers;
  assert.equal(f[0],5);assert.equal(f.at(-1),1);
  assert.ok(f[1]>f[2]);
});
test('Five-note chord uses all five fingers in pitch order',()=>chord([36,40,44,49,53],[5,4,3,2,1],{}));
test('Middle finger changes with key distribution',()=>{
  const a=run([38,45,54],{}).chords[0].fingers[1];
  const b=run([38,41,54],{}).chords[0].fingers[1];
  assert.notEqual(a,b);
});
test('Recalculation extends through actual shared contacts if chord-only search fails',()=>{
  const out=run([38,45,54,50],{times:[[0,3],[0,1],[0,1],[1,3]],map:{1:1,2:5,3:2}});
  assert.equal(out.map['3'],1);
  assert.deepEqual(out.trials[0].attempts.map(a=>a.status),['no_compatible_assignment','complete']);
});
test('Prior wide pair works for staggered attacks; chord exception stays absent',()=>{
  const out=run([38,54],{times:[[0,3],[1,2]],map:{1:1}});
  assert.equal(out.map[0],5);
  assert.equal(out.chords.length,0);
  assert.equal(out.validation.wideExceptions[0].code,'WIDE_OUTER_PAIR');
});
test('Ordinary chord and exact MaxPrac never activate the wide chord policy',()=>{
  for(const keys of [[40,43,47],[40,47,55]]){
    const out=run(keys,{});
    assert.equal(out.chords.length,0);
    assert.equal(out.validation.wideExceptions.length,0);
  }
});
test('An occupied outer finger on a preceding locked contact cannot be reused',()=>{
  const out=run([38,45,54,37],{times:[[1,3],[1,2],[1,2],[0,2]],map:{3:5},locks:{3:5}});
  assert.equal(out.map[0],undefined);
});
test('Conflicting manual chord fingers remain in place',()=>{
  const out=run([38,45,54],{map:{1:1,2:5},locks:{2:5}});
  assert.equal(out.map[2],5);
  assert.equal(out.trials[0].status,'protected_chord_finger');
});
test('Six simultaneous keys are not repackaged as a five-note wide chord',()=>{
  const out=run([36,39,42,46,51,54],{});
  assert.equal(out.assigned,0);
  assert.equal(out.trials[0].status,'more_keys_than_fingers');
});
test('Music onset and pedals are preserved by the calculation',()=>{
  const out=run([38,45,54],{pedals:[{type:'start',at:'0'},{type:'stop',at:'1'}]});
  assert.equal(out.chords[0].start,'0');
});
test('Diagnostic stores all pairs, including intermediate excess',()=>{
  const out=run([38,40,56],{});
  const c=out.chords[0];
  assert.equal(c.pairs.length,3);
  assert.equal(c.outerDistance,18);
  assert.ok(c.pairs.some(p=>p.practicalExcess>0&&p.distance<18));
  assert.ok(c.pairs.every(p=>Number.isInteger(p.comfortLimit)&&Number.isInteger(p.practicalLimit)));
  assert.equal(c.physical,'unknown');
});
test('Staggered middle note never obtains a chord waiver',()=>{
  const out=run([38,47,62],{times:[[0,3],[1,2],[0,3]],map:{1:5,2:1},locks:{1:5,2:1}});
  assert.equal(out.assigned,2);
  assert.equal(out.chords.length,0);
});
test('An octave orientation inside a wide chord still has to pass',()=>{
  const out=run([38,50,55],{});
  assert.equal(out.assigned,0);
  assert.equal(out.trials[0].status,'unassigned');
});
test('Frozen earlier recovered assignment cannot be changed',()=>{
  const out=run([38,45,54],{map:{2:5},frozen:['2']});
  assert.equal(out.map[2],5);
  assert.equal(out.trials[0].status,'protected_chord_finger');
});
