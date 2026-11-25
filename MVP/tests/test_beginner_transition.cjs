'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {reference,keyGeometry,elapsedMs,evaluateTransition,proposeWithTransitions} =
  require('../editor/beginner-transition.cjs');
const config = require('../editor/beginner.json');
const event = (id,midi,start,duration) => ({id,kind:'note',voice:'1',hand:'L',
  editor_supported:true,pitch:{midi},editor_onset_q:start,duration_quarters:duration,ties:[]});
const firstIds = ['a','b','c'], nextIds = ['d','e','f'];
const notes = [41,48,53].map((m,i)=>event(firstIds[i],m,'0','3'))
  .concat([53,60,65].map((m,i)=>event(nextIds[i],m,'1','2')));
const score = pedals => ({score:{parts:[{id:'P1',measures:[{events:notes}],pedals}]}});
const pedal = [{source:'notation',type:'start',at:'0'},{source:'notation',type:'stop',at:'3'}];
const demo = {firstIds,nextIds,geometry:reference,tempo:[{at:0,bpm:80}], releaseOptions:['2/5'],
  minimumHoldByContact:{a:'1/4',b:'1/4',c:'1/4'}, resetByKey:{53:'1/10'},resetMsByKey:{53:75},
  capability:()=>({poseAllowed:true,minimumMs:300})};
test('MIDI key geometry includes octave displacement, black elevation and variable scale',()=>{
  assert.equal(keyGeometry(65).x-keyGeometry(53).x,164.5);
  assert.equal(keyGeometry(54).black,true);
  assert(keyGeometry(54).y>keyGeometry(53).y);
  assert.equal(keyGeometry(65,{...reference,whiteWidth:21}).x-keyGeometry(53,{...reference,whiteWidth:21}).x,147);
});
test('tempo map integrates the movement window without changing score tempo',()=>{
  assert.equal(elapsedMs('2/5','1',demo.tempo),450);
  assert.equal(elapsedMs('0','1',[{at:0,bpm:60},{at:0.5,bpm:120}]),750);
  assert.equal(elapsedMs('0','1',[{at:0,bpm:0}]),null);
});
test('bounded search derives 5–3–1 as one candidate and preserves the literal run',()=>{
  const input = score(pedal), snapshot = JSON.stringify(input);
  const result = proposeWithTransitions(input,config,[demo]);
  assert.equal(result.baseline.assigned,3);
  const [transition] = result.transitions;
  assert.equal(transition.status,'conditionally_feasible');
  assert.equal(transition.candidates.length,100);
  const target = transition.candidates.find(c=>JSON.stringify(Object.values(c.fingers))==='[5,3,1,5,3,1]');
  assert(target);
  assert.equal(target.evaluation.availableMs,450);
  assert.equal(target.evaluation.distance,164.5);
  assert.equal(target.actions[0].soundEnd,'3');
  assert(transition.candidates[0].evaluation.sameShape);
  assert.equal(JSON.stringify(input),snapshot);
  assert.equal(proposeWithTransitions(score([]),config,[demo]).transitions[0].candidates.length,0);
  for (const request of [{...demo,geometry:null},{...demo,resetMsByKey:{}},
    {...demo,resetMsByKey:{53:500}},{...demo,tempo:[{at:0,bpm:180}]},
    {...demo,capability:()=>({poseAllowed:false,minimumMs:300})}]) {
    assert.equal(proposeWithTransitions(input,config,[request]).transitions[0].status,'unknown');
  }
  const one = proposeWithTransitions(input,config,[demo],{a:4}).transitions[0];
  assert(one.candidates.length && one.candidates.every(c=>c.fingers.a===4));
  assert.equal(evaluateTransition(target.evaluation.from,target.evaluation.to, {...demo,resetMsByKey:{53:500}}).status,
    'constraint_violation');
});
