'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const E=require('../editor/core.js');
const cfg=require('../editor/beginner.json');

function note(id,midi, options={}) {
  return {id,kind:'note',hand:'R',staff:1,voice:'1',pitch:{midi},editor_onset_q:'0/1',duration_quarters:'1',
    method:{finger:null},ties:[],articulations:[],arpeggioEligible:true,editor_supported:false,
    arpeggioMarks:[{type:'arpeggiate',number:null,direction:null}],...options};
}
function realize(events){
  const diagnostics=[],part={id:'P1',measures:[{events}]};
  E.realizeArpeggios(part,diagnostics);
  return {score:{parts:[part]},diagnostics};
}
test('2 to 5 attacks use one exact rational spread, independent of input pitch order',()=>{
  for(let n=2;n<=5;n++){
    const ns=Array.from({length:n},(_,i)=>note('n'+i,64+n-i));
    const score=realize(ns),r=E.propose(score,cfg);
    assert.equal(r.assigned,n);
    assert.equal(r.contacts[0].key,65);
    assert.equal(r.contacts.at(-1).start,'1/8');
    assert(r.contacts.every(c=>c.end==='1/1'));
    assert.equal(new Set(Object.values(r.assignments)).size,n);
    assert(ns.every(e=>e.editor_onset_q==='0/1'&&e.duration_quarters==='1'));
  }
});
test('numbered cross-staff spread, independent unnumbered groups and descending order',()=>{
  const down={type:'arpeggiate',number:'1',direction:'down'};
  const ns=[note('lo',48,{staff:2,hand:'L',arpeggioMarks:[down]}),
    note('hi',72,{arpeggioMarks:[down]}),note('mid',64,{arpeggioMarks:[down]})];
  assert.deepEqual(E.contacts(realize(ns)).contacts.map(c=>[c.key,c.start]),[[72,'0/1'],[64,'1/16'],[48,'1/8']]);
  const separate=[note('lo',48,{staff:2,hand:'L'}),note('lh',53,{staff:2,hand:'L'}),
    note('hi',72),note('mid',64)];
  assert.deepEqual(E.contacts(realize(separate)).contacts.map(c=>c.start),['0/1','0/1','1/8','1/8']);
});
test('short groups shrink without moving the notated end, and contradictory marks remain unresolved',()=>{
  const ns=[note('a',60,{duration_quarters:'1/16'}),note('b',64,{duration_quarters:'1/16'})];
  const r=E.contacts(realize(ns)).contacts;
  assert.equal(r[1].start,'1/32');
  assert.equal(r[1].end,'1/16');
  for (const marks of [[{type:'arpeggiate',direction:'down'},{type:'non-arpeggiate'}],
    [{type:'arpeggiate',direction:'up'},{type:'arpeggiate',direction:'down'}]]) {
    const input=realize([note('a',60),note('b',64,{arpeggioMarks:marks})]);
    assert.equal(E.contacts(input).contacts.length,0);
    assert.equal(input.diagnostics[0].code,'ARPEGGIO_UNRESOLVED');
  }
});
test('shared key consumes one attack and a tied continuation keeps the preceding finger',()=>{
  const mark={type:'arpeggiate',number:'1',direction:'up'};
  const notes=[
    note('a',60,{ties:['start'],arpeggioMarks:[mark]}),
    note('a-alias',60,{voice:'2',ties:['start'],arpeggioMarks:[mark]}),
    note('b',64,{arpeggioMarks:[mark]}),
    note('continued',60,{editor_onset_q:'1/1',ties:['stop'],arpeggioMarks:[],editor_supported:true}),
    note('continued-alias',60,{voice:'2',editor_onset_q:'1/1',ties:['stop'],arpeggioMarks:[],editor_supported:true})
  ];
  const r=E.propose(realize(notes),cfg);
  assert.equal(r.contacts.length,2);
  assert.equal(r.contacts[0].end,'2/1');
  assert.deepEqual(r.contacts[0].unisonGroups,[['a','a-alias'],['continued','continued-alias']]);
  assert.equal(r.contacts[1].start,'1/8');
  assert.equal(r.assignments.continued,r.assignments.a);
});
test('fermata continuation keeps a nominal hold without a new contact or automatic finger',()=>{
  const notes=[note('a',60,{ties:['start']}),note('b',64),
    note('hold',60,{editor_onset_q:'1/1',ties:['stop'],arpeggioMarks:[],fermata:true})];
  const r=E.propose(realize(notes),cfg);
  assert.deepEqual(r.contacts[0].sustainedIds,['hold']);
  assert.equal(r.contacts[0].end,'2/1');
  assert.equal(r.unassignedReasons.hold,'EXCLUDED');
});
test('tempo-map clock retimes arpeggio attacks with the selected BPM',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const win={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../renderer/play12-playback.js'),'utf8'),{window:win});
  const audio={currentTime:0};
  const clock=new win.Play12Playback.PlaybackClock(audio,80,0,[{at:0,bpm:80},{at:1/16,bpm:160}],80);
  assert.equal(clock.secondsBetween(0,1/8),0.0703125);
  clock.start(0);audio.currentTime=0.0703125;
  assert.equal(clock.position,1/8);
  clock.setBpm(40);
  assert.equal(clock.secondsBetween(0,1/8),0.125);
});
