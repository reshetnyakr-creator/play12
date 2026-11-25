'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const E=require('../editor/core.js');
const cfg=require('../editor/beginner.json');
const mark=[{shape:'normal',type:'upright'}];
const note=(id,at,duration,params={})=>({id,kind:'note',hand:'R',voice:'1',pitch:{midi:64},
  editor_onset_q:at,duration_quarters:duration,editor_supported:true,ties:[],method:{finger:null},...params});
function model(events){
  const rounds=[0,2,4].map((start,index)=>({index,start,measureStart:start,end:start+2,
    beats:2,beatType:4,beatQuarters:1,measureQuarters:2}));
  return E.realizeFermatas({score:{parts:[{id:'P1',measures:[{events}],pedals:[
    {source:'notation',type:'start',at:'0/1'},{source:'notation',type:'stop',at:'2/1'}
  ]}]},editor:{rounds,tempoMap:[{at:0,bpm:80},{at:2,bpm:60}]}});
}
test('quarter, half, whole and short notes receive the exact marked extra duration',()=>{
  for(const duration of ['1','2','4','1/8']){
    const e=note('a','0/1',duration,{fermata:mark});
    model([e]);
    const d=new E.Q(duration);
    assert.deepEqual(e.fermataPerformance,{attack:'0/1',mainEnd:d.toString(),
      end:d.add(d).toString(),trail:d.toString()});
    assert.equal(e.duration_quarters,duration);
  }
});
test('shared chord hold is added once, shifts the next attack, tempo and pedal',()=>{
  const a=note('a','0/1','2/1',{fermata:mark}), b=note('b','0/1','2/1',{hand:'L',voice:'5',pitch:{midi:43}});
  const c=note('c','2/1','1/1');
  const s=model([a,b,c]),r=s.editor.fermataTimeline;
  assert.deepEqual(r.holds,[{q:'2/1',extra:'2/1',start:2,end:4}]);
  assert.equal(b.fermataPerformance.end,'4/1');
  assert.equal(c.fermataPerformance.attack,'4/1');
  assert.equal(r.rounds[0].end,4);
  assert.equal(r.rounds[1].start,4);
  assert.deepEqual(r.rounds.flatMap(x=>x.beatsAt),[0,1,4,5,6,7]);
  assert.equal(r.tempoMap[1].at,4);
  assert.equal(s.score.parts[0].fermataPedals[1].at,'4/1');
  assert.equal(E.propose(s,cfg).assigned,3);
});
test('a rest adds silence and successive holds do not manufacture contacts',()=>{
  const a=note('rest','0/1','1/1',{kind:'rest',fermata:mark});
  const b=note('b','1/1','1/1',{fermata:mark});
  const s=model([a,b]),r=E.propose(s,cfg);
  assert.equal(r.contacts.length,1);
  assert.equal(r.contacts[0].start,'2/1');
  assert.equal(r.contacts[0].end,'4/1');
  assert.equal(r.assigned,1);
});
test('tied arpeggio retains an attack, continuous block and terminal segment-sized trail',()=>{
  const a=note('a','0/1','2/1',{ties:['start'],arpeggioPerformance:{attack:'1/8',end:'2/1',group:'g'}});
  const b=note('b','2/1','2/1',{ties:['stop','start']});
  const c=note('c','4/1','2/1',{ties:['stop'],fermata:mark});
  const s=model([a,b,c]),run=E.propose(s,cfg);
  assert.equal(run.assigned,3);
  assert.deepEqual(run.contacts[0].ids,['a','b','c']);
  assert.equal(run.contacts[0].start,'1/8');
  assert.equal(run.contacts[0].end,'8/1');
  const doc={score:s,run,mode:'engine',manual:{},history:[],cursor:0,revision:1};
  const edit=E.edit(doc,'a',4);E.commit(doc,edit);
  assert.deepEqual(doc.manual,{a:4,b:4,c:4});
  const notes=E.events(E.effective(E.clone(doc)));
  assert.deepEqual(notes.filter(e=>!e.sharedContactRepresentative).map(e=>e.id),['a']);
  assert.deepEqual(notes[0].continuousPerformance,{attack:'1/8',mainEnd:'6/1',end:'8/1',trail:'2/1',trailSegment:'2/1'});
});
test('an internal fermata stays in a chain without manufacturing a terminal trail',()=>{
  const a=note('a','0/1','2/1',{ties:['start'],fermata:mark});
  const b=note('b','2/1','2/1',{ties:['stop']});
  const s=model([a,b]),run=E.propose(s,cfg);
  assert.equal(run.contacts.length,1);
  assert.equal(run.contacts[0].end,'6/1');
  const notes=E.events(E.effective({score:s,run,mode:'engine',manual:{}}));
  assert.equal(notes[0].continuousPerformance.trail,null);
  assert.equal(notes[0].continuousPerformance.mainEnd,'6/1');
});
