'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {performance}=require('node:perf_hooks');
const {run,snapshot}=require('./engine.cjs');
const {groupLayers,transitions,position}=require('./search.cjs');
const {optimize}=require('../stage-3-0-10-fingering-priority/priority.cjs');
const wide=require('../stage-3-1-0-fingering-architecture-audit/wide-evidence.json');
const previous=require('../stage-3-0-10-fingering-priority/results.json');
const {proposeBeginner}=require('../../../editor/beginner-transition');
const {recoverPartial}=require('../../../editor/core');
const profile=require('../../../editor/beginner.json');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const [timeFile,surprisesFile,controlFile,clocksFile,interstellarFile,saintsFile]=process.argv.slice(2);
if(!saintsFile)throw Error('Expected paths to Time, No Surprises, previous control, Clocks, Interstellar, Saints JSON.');

function metrics(contacts,map,events,configuration,excluded=new Set()){
  let repeats=0,transitionsObserved=0,normalizedMovement=0;
  for(const hand of ['L','R']){
    const layers=groupLayers(contacts.filter(c=>c.hand===hand&&map[c.id]!=null&&!excluded.has(c.id)));
    for(let i=1;i<layers.length;i++){
      normalizedMovement+=Math.abs(position(layers[i],map,configuration)-position(layers[i-1],map,configuration));
      const edges=transitions(layers[i-1],layers[i],events).filter(([a,b])=>a.key!==b.key);
      transitionsObserved+=edges.length;
      repeats+=edges.filter(([a,b])=>map[a.id]===map[b.id]).length;
    }
  }
  return {repeats,transitionsObserved,normalizedMovement:Math.round(normalizedMovement)};
}

function counts(out){
  return {assigned:Object.values(out.assignments).filter(a=>a.finger!=null).length,
    exceptions:out.exceptions.length,special:out.special.length,L0Failures:out.validation.failures,
    physical:out.validation.physical,search:out.attempts};
}

const reports={};
for(const [name,file] of Object.entries({time:timeFile,'no-surprises':surprisesFile})){
  const input=read(file);
  // Historical contact-plan inputs contain timings only; no control fingering is applied.
  const control=read(controlFile).time.control;
  const ends=new Map((name==='time'?previous.time.control.schedules[0].releases:[]).map(r=>[r.id,r.end]));
  input.contacts=input.contacts.map(c=>ends.has(c.id)?{...c,end:ends.get(c.id)}:c);
  const excluded=new Set(input.contacts.filter(c=>
    input.decorated.some(d=>d.eventIds.some(ids=>ids.some(id=>c.ids.includes(id))))).map(c=>c.id));
  let start=performance.now();
  const old=optimize(input);
  const oldMs=performance.now()-start;
  start=performance.now();
  const out=run(input);
  const ms=performance.now()-start;
  assert.equal(out.validation.ok,true);
  const proofKey=p=>JSON.stringify([p.from,p.to]);
  assert.deepEqual(out.exceptions.map(proofKey).sort(),previous[name].proof.map(proofKey).sort());
  const byEvent=new Map(input.contacts.flatMap(c=>c.ids.map(id=>[id,c.id])));
  const widePairs=wide[name].exceptions.map(record=>({
    ids:record.ids,expected:record.fingers,actual:record.ids.map(id=>out.map[byEvent.get(id)]??null)
  }));
  const preservedWidePairs=widePairs.filter(pair=>pair.expected.every((f,i)=>f===pair.actual[i])).length;
  const lost=Object.keys(input.after??{}).filter(id=>input.after[id]!=null&&out.assignments[id]?.finger==null);
  assert.equal(lost.length,0);
  if(name==='time'){
    assert.ok(control.ids.every(id=>input.manual[id]==null));
    assert.deepEqual(control.ids.map(id=>out.assignments[id].finger),[5,2,1,2,3,4]);
    assert.deepEqual(out.special[0].fingers,[5,2,1]);
    assert.equal(out.special[0].diagnostic.positions.length,2);
    for(const chord of wide.time.audits){
      assert.deepEqual(chord.ids.map(id=>out.assignments[id].finger),[5,2,1]);
    }
    for(const weight of [-1e6,0,1e6]){
      const weights=Object.fromEntries(Object.keys(input.profile.weights).map(key=>[key,weight]));
      const changed=run({...input,profile:{...input.profile,weights}});
      assert.equal(changed.validation.ok,true);
      assert.deepEqual(control.ids.map(id=>changed.assignments[id].finger),[5,2,1,2,3,4]);
    }
  }
  if(name==='time'){
    const direct=run(snapshot(input.score));
    reports.timeDirect={input:'imported_score_without_historical_contact_plan',total:Object.keys(input.events).length,
      candidate:counts(direct)};
  }
  reports[name]={input:'historical_stage_3_0_10_contact_plan',total:Object.keys(input.events).length,
    previous:{assigned:previous[name].assigned,ms:oldMs,...metrics(input.contacts,old.map,input.events,input.profile,excluded)},
    candidate:{...counts(out),ms,...metrics(input.contacts,out.map,input.events,input.profile,excluded)},
    sameForcedRepeatEdges:out.exceptions.length,preservedWidePairs,widePairs:widePairs.length,
    wideDifferences:widePairs.filter(pair=>pair.expected.some((f,i)=>f!==pair.actual[i])),lost};
}

for(const [name,file] of Object.entries({clocks:clocksFile,interstellar:interstellarFile,saints:saintsFile})){
  const {score}=read(file);
  let start=performance.now();
  const old=recoverPartial(score,proposeBeginner(score,profile),{});
  const oldMs=performance.now()-start;
  start=performance.now();
  const input=snapshot(score);
  const preparedMs=performance.now()-start;
  start=performance.now();
  const out=run(input);
  const ms=performance.now()-start;
  reports[name]={input:'imported_score',total:old.total,
    previous:{assigned:old.assigned,ms:oldMs,...metrics(old.contacts,old.contactAssignments,input.events,profile),
      search:old.search_status},
    candidate:{...counts(out),preparedMs,ms,...metrics(input.contacts,out.map,input.events,profile)}};
}
console.log(JSON.stringify({node:process.version,platform:process.platform,report:reports},null,2));
