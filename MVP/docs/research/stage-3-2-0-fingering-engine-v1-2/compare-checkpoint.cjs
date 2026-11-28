'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {run,snapshot}=require('./engine.cjs');

const [base,folder,oracleFile]=process.argv.slice(2);
const baseline=require(path.resolve(base));
const oracle=JSON.parse(fs.readFileSync(oracleFile,'utf8'));
const report={};
for(const name of Object.keys(oracle)){
  const {score}=JSON.parse(fs.readFileSync(path.join(folder,name+'.json'),'utf8'));
  const previous=baseline.run(baseline.snapshot(score));
  const prepared=snapshot(score);
  const result=run(prepared);
  assert.equal(result.validation.ok,true);
  for(const [id,finger] of Object.entries(oracle[name].expected??{})){
    assert.equal(prepared.manual[id],undefined);
    assert.equal(result.assignments[id]?.finger,finger,id);
  }
  const changes=Object.entries(result.assignments).flatMap(([id,a])=>
    a.finger===previous.assignments[id]?.finger?[]:[[id,previous.assignments[id]?.finger??null,a.finger]]);
  const assigned=Object.values(result.assignments).filter(a=>a.finger!=null).length;
  assert.equal(assigned,Object.keys(result.events).length);
  const metrics=r=>({repetitions:r.exceptions.length,earlyReleases:r.releases.length,
    specialForms:r.special.length,modeledTravel:r.attempts.L.cost?.[6]+r.attempts.R.cost?.[6]});
  report[name]={assigned,changes,previous:metrics(previous),candidate:metrics(result),
    jointComfort:result.positions.filter(p=>p.comfort).length,positions:result.positions.length,
    groups:result.executionGroups.length,validationFailures:result.validation.failures};
  if(name==='time'){
    const target=result.releases.find(e=>e.id==='P1.m37.e7');
    assert.ok(target);
    const zero={...prepared.profile,weights:Object.fromEntries(Object.keys(prepared.profile.weights).map(k=>[k,0]))};
    const make=restore=>{
      const ends=new Map(result.releases.filter(e=>!restore||e!==target).map(e=>[e.id,e.to]));
      return {...prepared,profile:zero,contacts:prepared.contacts.map(c=>ends.has(c.id)?{...c,end:ends.get(c.id)}:c)};
    };
    const released=run(make(false),{releaseBudget:0}), retained=run(make(true),{releaseBudget:0});
    const extra=retained.validation.proofs.filter(p=>p.rule==='E07'&&!released.validation.proofs.some(q=>q.from===p.from&&q.to===p.to));
    assert.equal(released.attempts.L.status,'exact');
    assert.equal(retained.attempts.L.status,'exact');
    assert.ok(retained.attempts.L.cost[0]>released.attempts.L.cost[0]);
    assert.ok(extra.length&&extra.every(p=>p.status==='infeasible'));
    report.time.midi36={comparisonWeights:0,released:released.attempts.L.cost.slice(0,4),
      retained:retained.attempts.L.cost.slice(0,4),additionalIndependentlyForcedEdges:extra};
  }
}
console.log(JSON.stringify(report,null,2));
