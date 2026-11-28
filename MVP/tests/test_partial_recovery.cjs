const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../editor/core.js');
const profile=require('../editor/beginner.json');
const contact=(id,key,start,end,ids=[id],hand='R')=>({id,key,start:String(start),end:String(end),ids,hand,releaseBasis:'assumed_score_duration'});
function fixture(contacts,baseline={},overrides={}){
  const assignments=Object.fromEntries(contacts.flatMap(c=>c.ids.map(id=>[id,baseline[c.id]??null])));
  const unassignedReasons=Object.fromEntries(Object.entries(assignments).filter(([,f])=>f==null).map(([id])=>[id,'RECOVERY_PENDING_RELEASE']));
  return {contacts,contactAssignments:baseline,assignments,unassignedReasons,elapsed_ms:0,search_status:'partial',
    assigned:Object.values(assignments).filter(Boolean).length,total:Object.keys(assignments).length,
    warnings:[{code:'EXPERIMENTAL_PROFILE'}],validation:{conflicts:[],warnings:[]},profile:{...profile,...overrides}};
}
const recover=(r,locks,clock)=>E.recoverPartial({editor:{}},r,locks,clock);
test('S01 fully assigned is the identical baseline object',()=>{
 const r=fixture([contact('a',60,0,1)],{a:1});
 assert.equal(recover(r),r);
});
test('S02/S03 choose maximum subset of a chord that exceeds MaxPrac',()=>{
 const r=recover(fixture([contact('a',48,0,1),contact('b',51,0,1),contact('c',69,0,1)]));
 assert.equal(r.assigned,2);
 assert(r.assignments.a&&r.assignments.b);
 assert.equal(r.assignments.c,null);
});
test('S04 minimizes practical extensions at equal coverage',()=>{
 const r=recover(fixture([contact('a',48,0,1),contact('b',61,0,1)],{a:1}));
 assert.equal(r.assignments.b,5);
 assert.equal(r.recovery.contacts[0].ergonomic,'COMFORTABLE');
});
test('S05/S06 held baseline persists; eligible skipped attack is recovered',()=>{
 const r=recover(fixture([contact('a',60,0,3),contact('b',63,1,2)],{a:2}));
 assert.equal(r.assignments.a,2);
 assert(r.assignments.b&&r.assignments.b!==2);
 assert.equal(r.recovery.contacts[0].previous[0],'RECOVERY_PENDING_RELEASE');
});
test('S07/S08 jointly optimize neighboring subsets against future intervals',()=>{
 const r=recover(fixture([contact('a',40,0,5),contact('b',64,1,2),contact('c',64,2,3)]));
 assert.equal(r.assignments.a,null);
 assert(r.assignments.b&&r.assignments.c);
});
test('S09/S10 no hard span or octave exceptions',()=>{
 for(const key of [76,72]){
   const r=recover(fixture([contact('a',60,0,2),contact('b',key,1,2)],{a:2}));
   assert.equal(r.assignments.b,null);
 }
});
test('S11/S13 all segments of a single physical contact get the same finger',()=>{
 const c=contact('a',60,0,2,['a','b']);
 const r=recover(fixture([c]));
 assert.equal(r.assignments.a,r.assignments.b);
 assert.equal(r.recovery.additional,2);
 assert.equal(r.recovery.contacts.length,1);
 assert.deepEqual(r.contacts,[c]);
});
test('S12 repeated attacks obey half-open contact ownership',()=>{
 const r=recover(fixture([contact('a',60,0,2),contact('b',60,1,2),contact('c',60,2,3)],{a:1}));
 assert.equal(r.assignments.b,null);
 assert(r.assignments.c);
});
test('S14 budget keeps baseline safe and retains solved earlier groups',()=>{
 const r=fixture([contact('a',60,0,2),contact('b',62,3,4),contact('c',64,4,5)],{a:3}, {search:{...profile.search,maxCandidatesPerLayer:8}});
 const out=recover(r);
 assert.equal(out.recovery.status,'budget_exhausted');
 assert.equal(out.assignments.a,3);
 assert(out.assignments.b);
 assert.equal(out.assignments.c,null);
});
test('S15 equivalent paths are deterministic',()=>{
 const r=fixture([contact('a',60,0,1),contact('b',62,0,1)]);
 assert.deepEqual(recover(r).assignments,recover(r).assignments);
});
test('S16 fully assigned long scores do not enter recovery',()=>{
 const cs=Array.from({length:1000},(_,i)=>contact('a'+i,60,i,i+1));
 const r=fixture(cs,Object.fromEntries(cs.map(c=>[c.id,2])));
 assert.equal(recover(r,{},()=>{throw Error('clock must not be read');}),r);
});
test('S17 fixed-held duplicate candidates are rejected at generation and validation reports no added conflict',()=>{
 const r=recover(fixture([contact('a',60,0,2),contact('b',60,1,2)],{a:4}));
 assert.equal(r.assigned,1);
 assert.equal(r.recovery.rejected.KEY_OVERLAP,5);
 assert.deepEqual(r.validation.conflicts,[]);
});
test('S18 manual and baseline fingers stay fixed',()=>{
 const r=recover(fixture([contact('a',60,0,2),contact('b',62,1,2)],{a:4}),{a:4,b:2});
 assert.equal(r.assignments.a,4);
 assert.equal(r.assignments.b,2);
});
test('Recovery cannot assign a key already held by the opposite hand',()=>{
 const r=recover(fixture([contact('right',60,0,2),contact('left',60,1,3,['left'],'L')],{right:1}));
 assert.equal(r.assignments.left,null);
 assert.equal(r.assignments.right,1);
 assert.equal(r.recovery.rejected.KEY_OVERLAP,5);
});
