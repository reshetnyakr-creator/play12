'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../../editor/core');
const profile=require('../../../editor/beginner.json');
const {findChords,validate,middleFingers}=require('../stage-3-0-7-wide-chord-fingering/chord-experiment.cjs');
const {rescore,conditional,simultaneousProof}=require('./refine.cjs');

function fixture(keys,{hand='L',starts=[],ends=[],map={}}={}){
  const contacts=keys.map((key,i)=>({id:String(i),ids:[String(i)],hand,key,start:String(starts[i]??0),
    end:String(ends[i]??1),releaseBasis:'assumed_score_duration'}));
  const events=contacts.map(c=>({id:c.id,kind:'note',hand,pitch:{midi:c.key},editor_onset_q:c.start,
    duration_quarters:new E.Q(c.end).sub(c.start).toString(),ties:[]}));
  const score={editor:{},score:{parts:[{pedals:[],measures:[{events}]}]}};
  const baseline={profile,contacts,contactAssignments:map,total:keys.length,assigned:Object.keys(map).length,
    assignments:Object.fromEntries(contacts.map(c=>[c.id,map[c.id]??null])),
    validation:{warnings:[]},warnings:[],unassignedReasons:{}};
  return {score,baseline};
}
function run(f,options={}){
  const before=JSON.stringify(f);
  const out=rescore(f.score,f.baseline,'0',options);
  assert.equal(JSON.stringify(f),before);
  return out;
}
function group(f){
  return findChords(f.score,f.baseline.contacts,profile)[0];
}
test('Directed wide triads choose 2 on both hands',()=>{
  assert.deepEqual(run(fixture([36,43,52])).map,{0:5,1:2,2:1});
  assert.deepEqual(run(fixture([48,57,64],{hand:'R'})).map,{0:1,1:2,2:5});
});
test('3 and 4 are independently available for closer pinky and wider thumb pairs',()=>{
  for(const [keys,middle] of [[[36,41,52],3],[[36,38,52],4]]){
    assert.ok(middleFingers(group(fixture(keys)),profile).includes(middle));
    assert.equal(run(fixture(keys),{referenceFingers:{1:middle}}).map[1],middle);
  }
});
test('Pinky MaxComf and thumb MaxPrac are both tested for every candidate',()=>{
  const f=fixture([36,43,52]);
  assert.deepEqual(middleFingers(group(f),profile),[2]);
  const thumb=fixture([36,39,54]);
  assert.deepEqual(middleFingers(group(thumb),profile),[]);
  assert.equal(run(thumb).map,undefined);
});
test('Independent validation rejects the old wide inner pair and accepts only the outer exception',()=>{
  const f=fixture([36,43,52]);
  const chords=[group(f)];
  const bad=validate(f.baseline.contacts,{0:5,1:4,2:1},profile,chords,true);
  assert.ok(bad.conflicts.some(c=>c.code==='SPAN_VIOLATION'));
  assert.ok(bad.conflicts.some(c=>c.code==='REFINED_CHORD_SHAPE'));
  const good=validate(f.baseline.contacts,{0:5,1:2,2:1},profile,chords,true);
  assert.equal(good.conflicts.length,0);
  assert.deepEqual(good.wideExceptions.map(e=>e.fingers),[[5,1]]);
});
test('Four-note chord rejects any pair outside its limit except directed 1–5',()=>{
  const f=fixture([36,43,46,53]);
  const v=validate(f.baseline.contacts,{0:5,1:4,2:2,3:1},profile,[group(f)],true);
  assert.ok(v.conflicts.some(p=>p.ids.join()==='0,1'));
  assert.deepEqual(v.wideExceptions.map(p=>p.ids),[['0','3']]);
});
test('Time 38: verify reference without using it in the automatic rule',()=>{
  const f=fixture([36,43,52,57,55,54],{starts:[0,0,0,1,2,3],ends:[4,'7/2',1,2,3,4],
    map:{1:4,2:1,3:1,4:1,5:1}});
  const auto=run(f);
  assert.deepEqual([auto.map[0],auto.map[1],auto.map[2]],[5,2,1]);
  assert.ok(new Set([auto.map[3],auto.map[4],auto.map[5]]).size>1);
  const reference={0:5,1:2,2:1,3:2,4:3,5:4};
  const fixed=run(f,{referenceFingers:reference});
  assert.deepEqual(fixed.map,reference);
  assert.deepEqual(fixed.releases.map(r=>r.end),['1/1','1/1']);
});
test('Time 46: conditional assignment is separate from a rejected simultaneous plan',()=>{
  const f=fixture([48,59,60],{map:{1:2,2:1}});
  const before=JSON.stringify(f);
  const plan=conditional(f.score,f.baseline,'0');
  assert.deepEqual(plan.fingers,[5,2,1]);
  assert.equal(simultaneousProof(f.score,f.baseline,f.baseline.contacts,{}),'no_compatible_assignment');
  assert.equal(plan.simultaneous,'rejected');
  assert.equal(plan.physical,'unknown');
  assert.equal(plan.sounding,'unknown');
  assert.equal(plan.schedule,null);
  assert.equal(plan.handShiftRequired,true);
  assert.equal(plan.start,'0');
  assert.equal(JSON.stringify(f),before);
});
test('Mirrored conditional triad stays within its octave',()=>{
  const f=fixture([48,49,60],{hand:'R',map:{0:1,1:2}});
  const plan=conditional(f.score,f.baseline,'2');
  assert.deepEqual(plan.fingers,[1,2,5]);
});
test('Ordinary feasible chords do not receive a sequential label',()=>{
  const f=fixture([48,53,60],{map:{1:2,2:1}});
  assert.equal(conditional(f.score,f.baseline,'0'),null);
});
test('Manual choices are protected in both mechanisms',()=>{
  assert.equal(run(fixture([36,43,52],{map:{1:4}}),{locks:{1:4}}).map,undefined);
  const f=fixture([48,59,60],{map:{1:3,2:1}});
  assert.equal(conditional(f.score,f.baseline,'0',{locks:{1:3}}).assignments['1'],3);
});
test('No conditional chord reuses the same finger, keys or timing while respecting locks',()=>{
  const f=fixture([48,59,60],{map:{1:2,2:2}});
  assert.equal(conditional(f.score,f.baseline,'0',{locks:{1:2,2:2}}),null);
  const repeated=fixture([48,59,59],{map:{1:2}});
  assert.equal(conditional(repeated.score,repeated.baseline,'0'),null);
});
