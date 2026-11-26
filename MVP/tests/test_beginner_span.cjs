'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../editor/core.js');
const profile=require('../editor/beginner.json');
const expected={'1-2':8,'1-3':10,'1-4':12,'1-5':13,'2-3':3,'2-4':5,'2-5':8,'3-4':2,'3-5':5,'4-5':3};
const contact=(id,key,hand='R',start='0',end='2')=>({id,ids:[id],key,hand,start,end,releaseBasis:'measured'});
const note=(id,midi,hand,start='0',duration='2',ties=[])=>({id,kind:'note',hand,voice:'1',pitch:{midi},
  editor_supported:true,editor_onset_q:start,duration_quarters:duration,ties,method:{finger:null}});
const score=events=>({score:{parts:[{id:'P1',measures:[{events}]}]}});
test('all ten published MaxComf boundaries are checked independently, in each hand and finger order',()=>{
  assert.deepEqual(profile.comfortSpan,expected);
  const spanOnly={...profile,practicalSpan:undefined,octaveFingers:false};
  for(const [pair,limit] of Object.entries(expected)){
    const [f,g]=pair.split('-').map(Number);
    for(const hand of ['R','L'])for(const [a,b] of [[f,g],[g,f]])for(const delta of [-1,0,1]){
      const check=E.validate([contact('a',48,hand),contact('b',48+limit+delta,hand)],{a,b},{profile:spanOnly});
      assert.equal(check.conflicts.length,Number(delta===1),[pair,hand,a,b,delta].join('/'));
    }
  }
});
test('all twelve octave pitch classes, both hands, alone and in chords with held attacks',()=>{
  for(const hand of ['R','L'])for(let low=60;low<72;low++)for(const middle of [[],[7],[4,7],[4,7,9]]){
    const input=score([note('low',low,hand),note('high',low+12,hand,'1'),
      ...middle.map((offset,i)=>note('mid'+i,low+(hand==='R'?offset:12-offset),hand,'1'))]);
    const options=hand==='R'?[1,5]:[5,1];
    const run=E.propose(input,profile);
    assert.equal(run.assigned,2+middle.length);
    assert.deepEqual([run.assignments.low,run.assignments.high],options);
    assert.equal(run.validation.conflicts.length,0);
    const contacts=[contact('a',low,hand),contact('b',low+12,hand)];
    for(let a=1;a<=5;a++)for(let b=1;b<=5;b++){
      if(a===b)continue;
      const check=E.validate(contacts,{a,b},{profile});
      assert.equal(check.conflicts.some(x=>x.rule==='BEGINNER_OCTAVE_FINGERING_VIOLATION'),
        a!==options[0]||b!==options[1]);
    }
  }
});
test('valid outer octave does not conceal an excessive internal pair',()=>{
  const cs=[contact('a',60),contact('b',64),contact('c',68),contact('d',72)];
  const result=E.validate(cs,{a:1,b:2,c:3,d:5},{profile:{...profile,practicalSpan:undefined}});
  assert.deepEqual(result.conflicts.map(x=>x.ids),[['b','c']]);
  assert(result.conflicts.every(x=>x.code==='BEGINNER_COMFORT_SPAN_EXCEEDED'));
});
test('physical release at the next attack allows a large move; sounding pedal duration is irrelevant',()=>{
  const a={...contact('a',48,'R','0','1'),soundEnd:'4'};
  const b=contact('b',72,'R','1','2');
  assert.deepEqual(E.validate([a,b],{a:4,b:5},{profile}).conflicts,[]);
  b.start='1/2';
  const [issue]=E.validate([a,b],{a:4,b:5},{profile,rounds:[{index:0,start:0,end:1}]}).conflicts;
  assert.deepEqual([issue.distance,issue.limit,issue.excess,issue.overlap,issue.rounds],[24,5,19,['1/2','1/1'],[1]]);
});
test('manual pair is retained and warned, and an impossible automatic layer recovers after release',()=>{
  const input=score([note('a',48,'R'),note('b',60,'R'),note('c',72,'R','2')]);
  const run=E.propose(input,profile,{a:4,b:5});
  assert.deepEqual([run.assignments.a,run.assignments.b],[4,5]);
  assert.equal(run.validation.conflicts.length,0);
  assert.equal(run.validation.warnings.filter(d=>d.code==='MANUAL_ASSIGNMENT_SPAN_VIOLATION').length,2);
  const manualDoc={score:input,mode:'engine',manual:{},run:E.propose(input,profile)};
  const trial=E.edit(manualDoc,'a',4);
  assert(trial.accepted);
  assert(trial.check.warnings.some(d=>d.code==='MANUAL_ASSIGNMENT_SPAN_VIOLATION'));
  const failed=E.propose(score([note('a',40,'L'),note('b',60,'L'),note('c',65,'L','2')]),profile);
  assert.equal(failed.unassignedReasons.a,'NO_PATH_UNDER_BEGINNER_CONSTRAINTS');
  assert(failed.assignments.c);
  assert(failed.warnings.some(d=>d.diagnosis==='NO_LOCAL_SHAPE_WITH_CURRENT_CONTACTS'));
});

test('MaxComf and MaxPrac boundaries classify independent validation in either hand and order',()=>{
  const practical={'1-2':10,'1-3':12,'1-4':14,'1-5':15,'2-3':5,'2-4':7,'2-5':10,'3-4':4,'3-5':7,'4-5':5};
  assert.deepEqual(profile.practicalSpan,practical);
  for(const [pair,comfort] of Object.entries(expected)){
    const limit=practical[pair],[f,g]=pair.split('-').map(Number);
    for(const hand of ['L','R'])for(const [a,b] of [[f,g],[g,f]]){
      for(const distance of [comfort-1,comfort,comfort+1,limit,limit+1]){
        const current=E.validate([contact('a',48,hand),contact('b',48+distance,hand)],{a,b},
          {profile:{...profile,octaveFingers:false}});
        const category=distance<=comfort?'COMFORTABLE':distance<=limit?'PRACTICAL_EXTENSION':'SPAN_VIOLATION';
        assert.deepEqual(current.categories,{a:category,b:category});
        assert.equal(current.extensions.length,Number(category==='PRACTICAL_EXTENSION'));
        assert.equal(current.conflicts.length,Number(category==='SPAN_VIOLATION'));
      }
    }
  }
});
test('local repair recovers the two real octaves, diagnoses each excess and returns to comfort',()=>{
  for(const [pitches,extra] of [[[62,64,74],2],[[72,75,84],1]]){
    const input=score([
      note('keep',pitches[0],'R','0','4'),note('middle',pitches[1],'R','1'),note('octave',pitches[2],'R','1'),
      note('next1',60,'R','4'),note('next2',64,'R','4')
    ]);
    const run=E.propose(input,profile);
    assert.equal(run.assigned,5);
    assert.deepEqual([run.assignments.keep,run.assignments.middle,run.assignments.octave],[1,2,5]);
    assert.deepEqual(run.validation.conflicts,[]);
    assert.equal(run.validation.extensions.length,1);
    const [stretch]=run.validation.extensions;
    assert.deepEqual(stretch.ids,['middle','octave']);
    assert.deepEqual(stretch.overlap,['1/1','3/1']);
    assert.equal(stretch.excess,extra);
    assert.equal(run.validation.categories.next1,'COMFORTABLE');
    assert.equal(run.validation.categories.next2,'COMFORTABLE');
  }
});
test('practical tier never relaxes octaves, MaxPrac or a saved manual finger',()=>{
  const cs=[contact('a',60),contact('b',72)];
  assert(E.validate(cs,{a:1,b:4},{profile}).conflicts.some(x=>x.rule==='BEGINNER_OCTAVE_FINGERING_VIOLATION'));
  const run=E.propose(score([note('a',60,'R'),note('b',72,'R'),note('c',88,'R','2')]),profile,{a:4});
  assert.equal(run.assignments.a,null);
  assert.equal(run.unassignedReasons.a,'MANUAL_LOCK_BLOCKS_BEGINNER_PATH');
  assert(run.assignments.c);
  const manual=E.validate(cs,{a:4,b:5},{profile,locks:{a:4,b:5}});
  assert.equal(manual.conflicts.length,0);
  assert(manual.warnings.some(x=>x.rule==='SPAN_VIOLATION'));
  assert.equal(manual.categories.a,'SPAN_VIOLATION');
});
test('even very high movement cost cannot displace a comfortable feasible path',()=>{
  const input=score([note('a',60,'R'),note('b',64,'R')]);
  const result=E.propose(input,{...profile,weights:{...profile.weights,chordShape:-10000}});
  assert.equal(result.assigned,2);
  assert.equal(result.validation.extensions.length,0);
});
