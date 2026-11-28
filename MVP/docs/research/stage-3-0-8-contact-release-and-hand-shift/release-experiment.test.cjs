'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../../editor/core');
const profile=require('../../../editor/beginner.json');
const {planTarget}=require('./release-experiment.cjs');

function fixture(keys,times,map,{hand='L',pedals=[],tied=false}={}){
  const contacts=keys.map((key,i)=>({id:String(i),ids:[String(i)],hand,key,
    start:String(times[i][0]),end:String(times[i][1]),releaseBasis:'assumed_score_duration'}));
  const events=contacts.map(c=>({id:c.id,hand,kind:'note',pitch:{midi:c.key},
    editor_onset_q:c.start,duration_quarters:new E.Q(c.end).sub(c.start).toString(),ties:[]}));
  if(tied){
    events[0].duration_quarters='1/1';
    events[0].ties=['start'];
    contacts[0].ids.push('tie');
    events.push({...events[0],id:'tie',editor_onset_q:'1',ties:['stop']});
  }
  const score={editor:{},score:{parts:[{pedals,measures:[{events}]}]}};
  const baseline={profile,contacts,contactAssignments:map,total:events.length,
    assignments:Object.fromEntries(contacts.flatMap(c=>c.ids.map(id=>[id,map[c.id]??null]))),
    assigned:Object.keys(map).length,validation:{warnings:[]},warnings:[],unassignedReasons:{}};
  return {score,baseline};
}
function run(f,target,options={}){
  const snapshot=JSON.stringify([f,options]);
  const out=planTarget(f.score,f.baseline,String(target),options);
  assert.equal(JSON.stringify([f,options]),snapshot);
  if(out.map){
    assert.equal(out.validation.conflicts.length+out.validation.warnings.length,0);
    assert.equal(out.validation.physical,'unknown');
    assert.deepEqual(out.revised.map(c=>[c.id,c.ids,c.key,c.start,c.hand]),
      f.baseline.contacts.map(c=>[c.id,c.ids,c.key,c.start,c.hand]));
  }
  return out;
}
const sourceKeys=[36,43,52,57,55,54];
const sourceTimes=[[0,4],[0,'7/2'],[0,1],[1,2],[2,3],[3,4]];
const old={1:5,2:1,3:1,4:1,5:1};
const author={0:5,1:2,2:1,3:2,4:3,5:4};
const releaseSet=p=>p.releases.map(r=>[r.id,r.end]);

test('Time 38 verifies authored fingers with bass and inner release and discovers one-contact plan',()=>{
  const f=fixture(sourceKeys,sourceTimes,old);
  const manual=run(f,0,{referenceFingers:author});
  assert.deepEqual(manual.map,author);
  assert.deepEqual(releaseSet(manual),[['0','1/1'],['1','1/1']]);
  const automatic=run(f,0);
  assert.deepEqual(releaseSet(automatic),[['1','2/1']]);
  assert.deepEqual(automatic.map,{...old,0:5,1:4});
});
test('Mirrored right hand retains the same direction of fingers relative to hand',()=>{
  const f=fixture(sourceKeys.map(k=>100-k),sourceTimes,old,{hand:'R'});
  assert.deepEqual(releaseSet(run(f,0,{referenceFingers:author})),[['0','1/1'],['1','1/1']]);
});
test('A single lower held note can be released at a strictly later attack',()=>{
  const f=fixture([38,61],[[0,4],[1,2]],{0:2});
  const out=run(f,1,{referenceFingers:{0:2,1:2}});
  assert.deepEqual(releaseSet(out),[['0','1/1']]);
});
test('The latest compatible boundary minimizes lost physical hold',()=>{
  const f=fixture([48,55,64],[[0,4],[1,2],[2,3]],{0:4,1:1});
  const out=run(f,2,{referenceFingers:{0:4,1:1,2:1}});
  assert.deepEqual(releaseSet(out),[['0','2/1']]);
  assert.equal(out.shortening.toString(),'2/1');
  assert.ok(Number.isFinite(out.movement));
});
test('Do not trim a physically compatible original assignment',()=>{
  const f=fixture([43,59],[[0,3],[1,2]],{0:5});
  const out=run(f,1);
  assert.equal(out.status,'assigned_without_release');
  assert.deepEqual(out.releases,[]);
});
test('Preserve both ties and event duration while shortening the contact',()=>{
  const f=fixture([43,59],[[0,2],[1,2]],{0:2},{tied:true});
  const out=run(f,1,{referenceFingers:{0:2,1:2}});
  assert.deepEqual(releaseSet(out),[['0','1/1']]);
  assert.deepEqual(out.revised[0].ids,['0','tie']);
});
test('Pedal annotation changes neither contact solution nor score',()=>{
  const dry=fixture(sourceKeys,sourceTimes,old);
  const wet=fixture(sourceKeys,sourceTimes,old,{pedals:[{type:'start',at:'0'},{type:'stop',at:'4'}]});
  assert.deepEqual(releaseSet(run(dry,0)),releaseSet(run(wet,0)));
});
test('Locked finger and its physical contact are protected',()=>{
  const f=fixture([38,61],[[0,4],[1,2]],{0:2});
  const out=run(f,1,{locks:{0:2}});
  assert.equal(out.status,'no_compatible_release');
});
test('Simultaneous attacks may not be removed by zero-length contacts',()=>{
  const f=fixture([48,59,60,65],[[0,4],[0,1],[0,2],[2,3]],{1:2,2:1,3:2});
  const out=run(f,0);
  assert.equal(out.status,'no_compatible_release');
});
test('A calibrated interval is not inferred from the boundary',()=>{
  const f=fixture(sourceKeys,sourceTimes,old);
  const out=run(f,0);
  assert.equal(out.validation.physical,'unknown');
  assert.equal(out.releases[0].before,'7/2');
  assert.deepEqual(out.releases[0].related,['4']);
});
test('Candidate limit yields an explicit inconclusive result',()=>{
  const f=fixture(sourceKeys,sourceTimes,old);
  assert.equal(run(f,0,{candidateBudget:1}).status,'budget');
});
