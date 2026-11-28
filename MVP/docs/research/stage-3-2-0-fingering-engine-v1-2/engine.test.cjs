'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {run}=require('./engine.cjs');
const {verify}=require('./verify.cjs');
const profile=require('../../../editor/beginner.json');

function fixture(notes,{hand='R',locks={},overrides={}}={}){
  const events={},contacts=[];
  notes.forEach(([key,start,end,technique],i)=>{
    const id='n'+i;
    events[id]={id,key,hand,voice:'1',annotation:{preserve:true},technique};
    contacts.push({id,ids:[id],hand,key,start:String(start),end:String(end)});
  });
  return {score:{title:'synthetic',events},events,contacts,manual:locks,
    profile:{...profile,...overrides},map:{},decorated:[],chords:[]};
}
const fingers=result=>Object.values(result.assignments).map(x=>x.finger);
const tuned=scale=>Object.fromEntries(Object.keys(profile.weights).map(key=>[key,scale]));
test('T01/T53/M01/M02/A01 source projection, manual locks and mirror',()=>{
  for(const hand of ['L','R']){
    const expected=hand==='R'?[1,2,3,4,5]:[5,4,3,2,1];
    const input=fixture([60,62,64,65,67].map((key,i)=>[key,i,i+1]),
      {hand,locks:Object.fromEntries(expected.map((f,i)=>['n'+i,f]))});
    const saved=structuredClone(input);
    const outcome=run(input);
    assert.deepEqual(input,saved);
    assert.deepEqual(fingers(outcome),expected);
    assert.equal(outcome.validation.ok,true);
    assert.equal(outcome.why('n0').assignment.status,'manual');
  }
});
test('T36/T37/M19/M20/A22 PRO techniques never reach weighting',()=>{
  for(const technique of ['E08','R35'])for(const value of [-1e9,0,1e9]){
    const blocked=run(fixture([[60,0,1,technique]],{overrides:{weights:tuned(value)}}));
    assert.deepEqual(fingers(blocked),[null]);
    assert.equal(blocked.why('n0').rejected[0].reason,'L0_PRO_ONLY');
    assert.equal(blocked.exceptions.length,0);
    assert.equal(blocked.validation.ok,true);
  }
});
test('A02/A05/A20/A24 priorities survive residual costs and hand reflection',()=>{
  for(const value of [-1e9,0,1e9,NaN]){
    const input=fixture([[57,0,1],[55,1,2],[54,2,3]],
      {hand:'L',locks:{n0:2},overrides:{weights:tuned(value)}});
    const solution=run(input);
    assert.deepEqual(fingers(solution),[2,3,4]);
    assert.equal(solution.why('n2').alternatives.length,4);
    assert.deepEqual(fingers(run(input)),fingers(solution));
  }
  const reflected=run(fixture([[63,0,1],[65,1,2],[66,2,3]],{locks:{n0:2}}));
  assert.deepEqual(fingers(reflected),[2,3,4]);
});
test('T05/T06/T11/M09/M10/A15 verifier rejects overlapping fingers but accepts half-open boundaries',()=>{
  const input=fixture([[60,0,2],[64,1,3]]);
  const good=run(input);
  assert.equal(good.validation.ok,true);
  assert.notEqual(...fingers(good));
  good.map.n1=good.map.n0;
  good.assignments.n1.finger=good.map.n0;
  assert.equal(verify(input,good).ok,false);
  const adjacent=run(fixture([[60,0,1],[64,1,3]],{locks:{n0:2,n1:2}}));
  assert.deepEqual(fingers(adjacent),[2,2]);
  assert.equal(adjacent.validation.ok,true);
});
test('T08/M15 ordinary model cannot assign six simultaneous physical keys',()=>{
  const result=run(fixture([60,61,62,63,64,65].map(key=>[key,0,1])));
  assert.equal(result.attempts.R.status,'infeasible');
  assert.deepEqual(fingers(result),Array(6).fill(null));
  assert.equal(result.validation.physical,'unknown');
});
test('T65/A04 budget exhaustion cannot certify an exception',()=>{
  const result=run(fixture([[60,0,1],[62,1,2]]),{budget:0});
  assert.equal(result.attempts.R.status,'budget');
  assert.deepEqual(fingers(result),[null,null]);
  assert.deepEqual(result.exceptions,[]);
});
test('A18 special split keeps both positions and all three fingers',()=>{
  const input=fixture([[48,0,2],[59,0,2],[60,0,2]],{hand:'L'});
  input.decorated=[{eventIds:[['n0'],['n1'],['n2']],ordinaryProof:'no_compatible_assignment'}];
  const result=run(input);
  assert.deepEqual(fingers(result),[5,2,1]);
  assert.ok(Object.values(result.assignments).every(x=>x.status==='assigned'));
  assert.equal(result.special[0].diagnostic.positions.length,2);
  assert.equal(result.special[0].diagnostic.schedule,null);
  assert.equal(result.validation.ok,true);
  result.special[0].ordinaryProof='budget';
  assert.equal(verify(input,result).ok,false);
});
test('T39/A20 directed octave applies on both hands even on black keys',()=>{
  for(const hand of ['R','L']){
    const result=run(fixture([[61,0,1],[73,0,1]],{hand}));
    assert.deepEqual(fingers(result),hand==='R'?[1,5]:[5,1]);
    assert.equal(result.validation.ok,true);
  }
});
test('A10 wrong internal wide pair fails while directed outer pair remains allowed',()=>{
  const input=fixture([[36,0,1],[43,0,1],[52,0,1]],{hand:'L'});
  input.chords=[['n0','n1','n2']];
  const result=run(input);
  assert.deepEqual(fingers(result),[5,2,1]);
  result.map.n1=4;
  result.assignments.n1.finger=4;
  assert.equal(verify(input,result).ok,false);
});
test('T01/T45/T56 verifier rejects invented notes, altered provenance and physical overclaim',()=>{
  const input=fixture([[60,0,1]]);
  const result=run(input);
  assert.equal(verify(input,result).ok,true);
  result.score.title='mutated';
  result.contacts[0].end='7';
  result.assignments.unknown={finger:3,status:'assigned',movement:'confirmed',sounding:'confirmed'};
  const verdict=verify(input,result);
  assert.ok(verdict.failures.includes('R01_SOURCE_CHANGED'));
  assert.ok(verdict.failures.includes('R01_UNKNOWN_EVENT:unknown'));
  assert.ok(verdict.failures.includes('CONTACT_PLAN_CHANGED'));
  assert.ok(verdict.failures.includes('R56:unknown'));
});
test('A03/T11/M16 held bass proves necessity of one exact E07 repeat',()=>{
  const held=fixture([[40,0,3],[54,1,2],[52,2,3]],{hand:'L',locks:{n0:5}});
  const result=run(held);
  assert.deepEqual(fingers(result),[5,1,1]);
  assert.deepEqual(result.exceptions,[{id:'E07',from:'n1',to:'n2',status:'infeasible'}]);
  const released=structuredClone(held);
  released.contacts[0].end='1';
  assert.notEqual(...fingers(run(released)).slice(1));
  assert.deepEqual(run(held,{budget:0}).exceptions,[]);
});
test('T67/A09 invalid second key ownership stays a verifier failure across hands',()=>{
  const input=fixture([[60,0,2],[60,1,3]]);
  input.contacts[1].hand='L';
  input.events.n1.hand='L';
  const result=run(input);
  assert.deepEqual(fingers(result),[null,null]);
  assert.equal(result.validation.ok,true);
  assert.ok(result.rejected.every(x=>x.reason==='R55_KEY_ALREADY_DOWN'));
  result.map={n0:1,n1:1};
  for(const assignment of Object.values(result.assignments)){
    assignment.finger=1;
    assignment.status='assigned';
  }
  assert.ok(verify(input,result).failures.some(x=>x.startsWith('R55:')));
});
test('A18 E05 discovered without a prepared plan; feasible shape and budget never qualify',()=>{
  const input=fixture([[48,0,2],[59,0,2],[60,0,2]],{hand:'L'});
  const result=run(input);
  assert.deepEqual(fingers(result),[5,2,1]);
  assert.equal(result.validation.proofs[0].rule,'E05');
  assert.equal(result.validation.proofs[0].status,'infeasible');
  assert.deepEqual(run(input,{budget:0}).special,[]);
  const feasible=fixture([[48,0,2],[53,0,2],[60,0,2]],{hand:'L'});
  feasible.decorated=[{eventIds:[['n0'],['n1'],['n2']],ordinaryProof:'no_compatible_assignment'}];
  assert.deepEqual(run(feasible).special,[]);
});
test('A03/A04 E07 cannot be forged and verification budget does not create proof',()=>{
  const held=fixture([[40,0,3],[54,1,2],[52,2,3]],{hand:'L',locks:{n0:5}});
  const solution=run(held);
  assert.ok(verify(held,solution,{budget:0}).failures.some(x=>x.startsWith('E07_NOT_PROVEN')));
  solution.exceptions=[];
  assert.ok(verify(held,solution).failures.some(x=>x.startsWith('E07_MISSING')));
  const free=fixture([[60,0,1],[62,1,2]]);
  const forged=run(free);
  forged.map.n1=forged.map.n0;
  forged.assignments.n1.finger=forged.map.n0;
  forged.exceptions=[{id:'E07',from:'n0',to:'n1',status:'infeasible'}];
  assert.ok(verify(free,forged).failures.some(x=>x.startsWith('E07_NOT_PROVEN')));
});

test('E03 first preserves feasible holdings, then changes only physical contact with complete search',()=>{
  const input=fixture([[36,0,4],[43,0,4],[52,0,1],[57,1,2],[55,2,3],[54,3,4]],{hand:'L'});
  input.chords=[['n0','n1','n2']];
  input.events.n0.voice='2'; input.events.n1.voice='2';
  const original=structuredClone(input);
  const result=run(input);
  assert.deepEqual(input,original);
  assert.deepEqual(fingers(result),[5,2,1,2,3,4]);
  assert.equal(result.releaseSearch.status,'complete');
  assert.equal(result.releases.length,2);
  assert.ok(result.releases.every(r=>r.to==='1'&&r.sounding==='unknown'));
  assert.deepEqual(run(input,{releaseBudget:0}).releases,[]);
  assert.deepEqual(run(input,{budget:0}).releases,[]);
  assert.deepEqual(run(fixture([[60,0,3],[64,1,2]])).releases,[]);
});
