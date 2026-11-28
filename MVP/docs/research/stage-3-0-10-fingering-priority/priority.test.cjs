'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const profile=require('../../../editor/beginner.json');
const {policy,middleFingers}=require('../stage-3-0-7-wide-chord-fingering/chord-experiment.cjs');
const {solveHand,simultaneousPair}=require('./priority.cjs');
const {positionFits,specialPositions}=require('./positions.cjs');

const c=(id,key,start,end=start+1,hand='L')=>({id,ids:[id],key,hand,start:String(start),end:String(end)});
function solve(contacts,{domains=new Map(),weights=profile.weights,locks={},budget=100000,avoid=null,before={}}={}){
  return solveHand(contacts,before,{...profile,weights},{constraints:{chords:new Map(),domains},locks,budget,avoid});
}
for(const hand of ['L','R'])for(const direction of [-1,1])test('Different fingers '+hand+'/'+direction,()=>{
  for(const gap of [1,15]){
    const out=solve([c('a',60,0,1,hand),c('b',60+direction*gap,1,2,hand)]);
    assert.equal(out.status,'exact');assert.notEqual(out.map.a,out.map.b);
  }
});
test('Weights cannot beat the obligatory rank',()=>{
  // R: position changes by zero only for finger 2 on both across these black
  // and white keys when the competing asymmetric position is engineered by the test domains.
  const notes=[c('a',60,0,1,'R'),c('b',62,1,2,'R')];
  const out=solve(notes,{domains:new Map([['a',[2]],['b',[1,2]]]),weights:{...profile.weights,positionShift:1000000,sameFingerMove:0}});
  assert.notEqual(out.map.a,out.map.b);
  assert.equal(out.cost[0],0);
});
test('The complete sequence retains the only compatible path through a later held note',()=>{
  const notes=[c('a',60,0,1),c('b',62,1,3),c('d',74,2,3)];
  const out=solve(notes,{domains:new Map([['a',[4,5]],['b',[4,5]],['d',[1]]])});
  assert.deepEqual(out.map,{a:4,b:5,d:1});
});
test('Same key repetitions are exempt',()=>{
  const result=solve([c('a',60,0),c('b',60,1)],{domains:new Map([['a',[2]],['b',[2]]])});
  assert.deepEqual(result.map,{a:2,b:2});assert.equal(result.cost[0],0);
});
test('A required repetition needs an exact negative witness, not a timeout',()=>{
  const notes=[c('a',60,0),c('b',62,1)];
  const options={domains:new Map([['a',[2]],['b',[2]]])};
  assert.equal(solve(notes,options).cost[0],1);
  assert.equal(solve(notes,{...options,avoid:['a','b']}).status,'infeasible');
  assert.equal(solve(notes,{...options,avoid:['a','b'],budget:0}).status,'budget');
});
test('Manual fingers stay fixed and a fully protected pair is exempt',()=>{
  const notes=[c('a',60,0),c('b',62,1)];
  const locks={a:2,b:2};
  assert.deepEqual(solve(notes,{locks}).map,locks);
  assert.equal(solve(notes,{locks}).cost[0],0);
  assert.notEqual(solve(notes,{locks:{a:2}}).map.b,2);
});
test('L and R choose middle 2 if pinky and thumb allow it',()=>{
  const left=[c('a',36,0),c('b',43,0),c('c',52,0)];
  const right=[c('c',48,0,1,'R'),c('b',57,0,1,'R'),c('a',64,0,1,'R')];
  for(const notes of [left,right])assert.deepEqual(policy([notes],notes,profile).domains.get('b'),[2]);
});
test('Wide simultaneous groups admit 3 and 4 when the intervals fit',()=>{
  assert.ok(middleFingers([c('a',36,0),c('b',41,0),c('c',52,0)],profile).includes(3));
  assert.ok(middleFingers([c('a',36,0),c('b',38,0),c('c',52,0)],profile).includes(4));
});
test('5–3 range uses MaxComf for the wide simultaneous middle and MaxPrac within a shifted position',()=>{
  assert.deepEqual([5,6,7,8].map(d=>middleFingers([c('a',40,0),c('b',40+d,0),c('c',56,0)],profile).includes(3)),[true,false,false,false]);
  assert.deepEqual([5,6,7,8].map(d=>positionFits([c('a',40,0),c('b',40+d,0)],[5,3],profile)),[true,true,true,false]);
});
test('Only the directed 1–5 pair is allowed to exceed MaxPrac',()=>{
  const a=c('a',36,0),b=c('b',52,0);
  assert.equal(simultaneousPair(a,b,5,1,profile,new Map()),true);
  assert.equal(simultaneousPair(a,b,4,1,profile,new Map()),false);
  assert.equal(simultaneousPair(a,b,1,5,profile,new Map()),false);
});
test('Time 46 is a complete assignment, with a separate technique and unchanged source',()=>{
  const notes=[c('a',48,180),c('b',59,180),c('d',60,180)];
  const before=JSON.stringify(notes);
  const plan=specialPositions(notes,profile);
  assert.equal(plan.status,'assigned');
  assert.deepEqual(plan.fingers,[5,2,1]);
  assert.deepEqual(plan.assignments,{a:5,b:2,d:1});
  assert.deepEqual(plan.diagnostic.positions.map(k=>k.midi),[[48],[59,60]]);
  assert.equal(plan.diagnostic.schedule,null);
  assert.equal(plan.diagnostic.simultaneous,'rejected');
  assert.equal(JSON.stringify(notes),before);
});
test('Shifted chord permits alternatives 3 and 4, and forbids shared fingers',()=>{
  const notes=[c('a',48,0),c('b',59,0),c('d',60,0)];
  for(const f of [3,4])assert.deepEqual(specialPositions(notes,profile,{b:f}).fingers,[5,f,1]);
  assert.equal(specialPositions(notes,profile,{b:1,d:1}),null);
  assert.equal(positionFits(notes.slice(1),[1,1],profile),false);
});
test('A whole chord that fits is not relabelled as a special performance in the original pipeline',()=>{
  const notes=[c('a',48,0),c('b',53,0),c('d',60,0)];
  assert.ok(positionFits(notes,[5,2,1],profile));
  assert.equal(solve(notes).status,'exact');
});
