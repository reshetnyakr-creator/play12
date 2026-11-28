'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const E=require('../../../editor/core');
const {optimize,transitions,groupLayers}=require('./priority.cjs');
const {specialPositions}=require('./positions.cjs');
const [beforeDir,auditDir,controlFile,renderDir]=process.argv.slice(2);
const label=require(path.resolve(controlFile)).time.control;
const results={};
const cmp=(a,b)=>new E.Q(a).cmp(b);
const rank=(a,b)=>{
  const i=a.findIndex((n,j)=>n!==b[j]);
  return i<0?0:a[i]-b[i];
};
const cost=v=>v.attempts.L.cost.map((n,i)=>n+v.attempts.R.cost[i]);
const revised=(snapshot,releases)=>{
  const ends=new Map(releases.map(r=>[r.id,r.end]));
  return {...snapshot,contacts:snapshot.contacts.map(c=>ends.has(c.id)?{...c,end:ends.get(c.id)}:c)};
};
function count(snapshot,allowed){
  const special=new Set(snapshot.decorated.flatMap(d=>d.eventIds.flat()));
  let n=0;
  for(const hand of ['L','R']){
    const layers=groupLayers(snapshot.contacts.filter(c=>c.hand===hand&&snapshot.map[c.id]!=null));
    for(const [i,layer] of layers.entries()){
      if(!i)continue;
      n+=transitions(layers[i-1],layer,snapshot.events).filter(([a,b])=>a.key!==b.key&&
        !a.ids.some(id=>special.has(id))&&!b.ids.some(id=>special.has(id))&&
        !(a.ids.some(id=>snapshot.manual[id]!=null)&&b.ids.some(id=>snapshot.manual[id]!=null))&&
        allowed[a.id]===allowed[b.id]).length;
    }
  }
  return n;
}
for(const name of ['time','no-surprises']){
  const before=require(path.resolve(beforeDir,name+'.json'));
  const draft=require(path.resolve(auditDir,name+'.json'));
  const musical=JSON.stringify(draft.score);
  const unique=new Map((name==='time'?label.alternatives.map(a=>a.releasePlan):[[]])
    .map(a=>[JSON.stringify(a),a]));
  const candidates=[...unique.values()].map(releases=>{
    const snapshot=revised(draft,releases);
    const trial=optimize(snapshot,{explain:false});
    return {snapshot,trial,releases,cost:cost(trial)};
  }).sort((a,b)=>rank(a.cost,b.cost)||a.releases.length-b.releases.length);
  const winner=candidates[0];
  const final=optimize(winner.snapshot);
  const byId=new Map(winner.snapshot.contacts.map(c=>[c.id,c]));
  const special=draft.decorated.map(d=>{
    assert.equal(d.ordinaryProof,'no_compatible_assignment');
    const contacts=d.eventIds.map(ids=>winner.snapshot.contacts.find(c=>c.ids.includes(ids[0])));
    const next=specialPositions(contacts,draft.profile,draft.manual);
    assert.ok(next);
    return {...next,eventIds:d.eventIds,midi:d.midi,measure:d.measure,notatedStart:d.start,pedalNotated:d.pedalNotated};
  });
  const assigned=Object.fromEntries(winner.snapshot.contacts.flatMap(c=>c.ids.map(id=>[id,final.map[c.id]??null])));
  for(const c of special)Object.assign(assigned,c.assignments);
  const assignments=Object.fromEntries(Object.entries(assigned).filter(([,f])=>f!=null)
    .map(([id,f])=>[id,{finger:f,status:'assigned'}]));
  for(const [id,finger] of Object.entries(draft.manual))assert.equal(assignments[id].finger,finger);
  assert.equal(Object.keys(assignments).length,Object.values(draft.after).filter(Boolean).length);
  assert.equal(JSON.stringify(draft.score),musical);
  const changes=Object.entries(assignments).filter(([id,a])=>before.after[id]!==a.finger)
    .map(([id,a])=>({id,measure:draft.events[id].measure,midi:draft.events[id].midi,before:before.after[id],after:a.finger}));
  const proof=final.proof.map(p=>({...p,measure:draft.events[p.to].measure,
    active:winner.snapshot.contacts.filter(c=>c.hand===p.hand&&c.id!==p.to&&cmp(c.start,byId.get(p.to).start)<0&&
      cmp(c.end,byId.get(p.to).start)>0&&final.map[c.id]!=null).map(c=>({id:c.id,key:c.key,finger:final.map[c.id]}))}));
  assert.ok(proof.every(p=>p.status==='infeasible'||p.status==='exact'));
  const out={assigned:Object.keys(assignments).length,total:Object.keys(draft.events).length,
    changed:changes.length,repeatsBefore:count(before,before.map),repeatsAfter:final.repetitionsAfter,
    proof,attempts:final.attempts,changes,techniques:special,ordinaryConflicts:0};
  if(name==='time'){
    const referenceSnapshot=revised(draft,label.referenceReleases);
    const reference=optimize({...referenceSnapshot,manual:{...referenceSnapshot.manual,
      ...Object.fromEntries(label.ids.map((id,i)=>[id,label.reference[i]]))}},{explain:false});
    // Both protected endpoints are excluded from the reported objective, so
    // the full costs below label the reference as a constrained computation.
    out.control={automatic:label.ids.map(id=>assignments[id].finger),reference:label.reference,
      localAutomatic:label.automatic,localComparison:label.alternatives,
      schedules:candidates.map(c=>({releases:c.releases,fingers:label.ids.map(id=>c.trial.map[id]),cost:c.cost})),
      constrainedReference:{cost:cost(reference),releases:label.referenceReleases}};
  }
  if(renderDir){
    fs.mkdirSync(renderDir,{recursive:true});
    fs.writeFileSync(path.join(renderDir,name+'.json'),JSON.stringify({before:before.after,assignments}));
  }
  results[name]=out;
}
const lines=Object.entries(results).map(([name,r])=>'  '+JSON.stringify(name)+': {\n'+
  Object.entries(r).map(([key,value])=>'    '+JSON.stringify(key)+': '+(Array.isArray(value)&&value.length?
    '[\n'+value.map(x=>'      '+JSON.stringify(x)).join(',\n')+'\n    ]':JSON.stringify(value))).join(',\n')+'\n  }');
console.log('{\n'+lines.join(',\n')+'\n}');
