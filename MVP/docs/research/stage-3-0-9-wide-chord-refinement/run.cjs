'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {runWide}=require('../stage-3-0-6-maxprac-contact-analysis/wide-experiment.cjs');
const widePrior=require('../stage-3-0-6-maxprac-contact-analysis/wide-results.json');
const {experiment,findChords,validate,middleFingers}=require('../stage-3-0-7-wide-chord-fingering/chord-experiment.cjs');
const jointPrior=require('../stage-3-0-7-wide-chord-fingering/results.json');
const {planTarget}=require('../stage-3-0-8-contact-release-and-hand-shift/release-experiment.cjs');
const prior=require('../stage-3-0-8-contact-release-and-hand-shift/results.json');
const {rescore,conditional,pairs}=require('./refine.cjs');
const replay=require(path.resolve(process.argv[2]));
const imports=process.argv[3];
const output={};
const assignments=(contacts,map)=>Object.fromEntries(contacts.flatMap(c=>c.ids.map(id=>[id,map[c.id]??null])));
function apply(current,plan){
  return {...current,contacts:plan.revised,contactAssignments:plan.map,assignments:assignments(plan.revised,plan.map)};
}
for(const [name,prefix] of [['time','hans-'],['no-surprises','radiohead-']]){
  const file=fs.readdirSync(imports).find(f=>f.startsWith(prefix)&&f.endsWith('-0.json'));
  const {score,run:imported}=JSON.parse(fs.readFileSync(path.join(imports,file)));
  const original=JSON.stringify(score);
  const data=replay[name];
  const base={...imported,...data.run,assigned:data.stage305,elapsed_ms:0,
    assignments:assignments(data.run.contacts,data.run.contactAssignments)};
  const wide=runWide(score,base,{locks:data.manual,frozen:data.rests});
  const joint=experiment(score,wide,widePrior[name].remaining.map(c=>c.id),{locks:data.manual,frozen:data.rests});
  assert.equal(joint.assigned,jointPrior[name].after);
  const originalContacts=wide.contacts;
  let current={...wide,contacts:originalContacts,contactAssignments:joint.map,assignments:assignments(originalContacts,joint.map)};
  const accepted=findChords(score,originalContacts,wide.profile).filter(g=>joint.chords.some(c=>
    JSON.stringify(g.map(n=>n.ids))===JSON.stringify(c.eventIds)));
  const frozen=[...data.rests,...widePrior[name].gained,...jointPrior[name].changes.filter(c=>c.before==null).map(c=>c.id)];
  const options={locks:data.manual,frozen,accepted};
  for(const entry of prior[name].cases){
    const p=planTarget(score,current,entry.id,options);
    assert.equal(p.status,entry.status);
    assert.deepEqual(p.releases?.map(({id,end})=>[id,end])??[],entry.releases.map(({id,end})=>[id,end]));
    if(p.map){ current=apply(current,p);options.accepted=p.groups; }
  }
  const before=current;
  assert.equal(Object.values(before.assignments).filter(Boolean).length,prior[name].after);
  for(const {id,after} of prior[name].changes)assert.equal(before.assignments[id],after);
  const strictAudit=validate(before.contacts,before.contactAssignments,before.profile,options.accepted,true);
  const rejected=new Set(strictAudit.conflicts.flatMap(c=>c.ids));
  const affected=options.accepted.filter(group=>group.some(c=>rejected.has(c.id)));
  const audits=options.accepted.map(group=>({hand:group[0].hand,ids:group.map(c=>c.id),midi:group.map(c=>c.key),
    middleAllowed:group.length===3?middleFingers(group,wide.profile):null,pairs:pairs(group,before.contactAssignments,wide.profile),
    needsRecalculation:affected.includes(group)}));
  const attempts=[];
  let control;
  for(const group of affected){
    const entry=prior[name].cases.find(c=>group.some(n=>n.ids.includes(c.id)));
    const targetId=entry?.id??group[0].ids[0];
    const target=group.find(c=>c.ids.includes(targetId));
    const memberIds=new Set(entry?.members.map(n=>n.id)??group.map(c=>c.id));
    const reset=originalContacts.filter(c=>memberIds.has(c.id));
    const resetById=new Map(reset.map(c=>[c.id,c]));
    const restored=current.contacts.map(c=>resetById.get(c.id)??c);
    const reopen={...current.contactAssignments};
    delete reopen[target.id];
    const baseline={...current,contacts:restored,contactAssignments:reopen,assignments:assignments(restored,reopen)};
    const settings={...options,accepted:options.accepted.filter(g=>g!==group)};
    const p=rescore(score,baseline,targetId,settings);
    assert.ok(p.map,'Refinement failed: '+targetId);
    current=apply(current,p);
    options.accepted=p.groups;
    attempts.push({id:targetId,status:p.status,releases:p.releases,pairs:pairs(group,p.map,wide.profile)});
    if(entry?.measure==='38'){
      const ids=['P1.m37.e7','P1.m37.e8','P1.m37.e3','P1.m37.e4','P1.m37.e5','P1.m37.e6'];
      const reference=[5,2,1,2,3,4];
      const witness=rescore(score,baseline,targetId,{...settings,
        referenceFingers:Object.fromEntries(ids.map((id,i)=>[id,reference[i]]))});
      assert.deepEqual(ids.map(id=>witness.map?.[id]),reference);
      control={ids,reference,referenceReleases:witness.releases,automatic:ids.map(id=>p.map[id]),
        releases:p.releases,physical:'unknown',sounding:'unknown'};
    }
  }
  const decorated=[];
  for(const entry of prior[name].cases.filter(c=>!before.assignments[c.id])){
    const plan=conditional(score,current,entry.id,options);
    assert.ok(plan);
    decorated.push({...plan,measure:entry.measure,pedalNotated:Number(data.xml.pedal)>0});
  }
  const strict=validate(current.contacts,current.contactAssignments,wide.profile,options.accepted,true);
  assert.equal(strict.conflicts.length+strict.warnings.length,0);
  assert.ok(strict.wideExceptions.every(x=>x.fingers.slice().sort().join()==='1,5'));
  assert.equal(JSON.stringify(score),original);
  for(const id of [...frozen,...Object.keys(data.manual)])assert.equal(current.assignments[id],before.assignments[id]);
  const after={...current.assignments,...Object.assign({},...decorated.map(d=>d.assignments))};
  assert.ok(Object.entries(before.assignments).every(([id,f])=>!f||after[id]));
  const changes=Object.entries(after).filter(([id,f])=>before.assignments[id]!==f)
    .map(([id,f])=>({id,measure:data.events[id].measure,midi:data.events[id].midi,before:before.assignments[id],after:f}));
  const measures=new Set([...changes.map(c=>c.measure),...decorated.map(c=>c.measure)]);
  const beforeContacts=new Map(before.contacts.map(c=>[c.id,c]));
  const views=[...measures].sort((a,b)=>a-b).map(measure=>({measure,notes:current.contacts.filter(c=>
    c.ids.some(id=>data.events[id].measure===measure)).map(c=>({id:c.id,ids:c.ids,hand:c.hand,midi:c.key,
      start:c.start,endBefore:beforeContacts.get(c.id).end,endAfter:c.end,before:before.assignments[c.id],after:after[c.id],
      conditional:decorated.some(d=>d.assignments[c.id]!=null),musical:c.ids.map(id=>({id,
        start:data.events[id].onset,duration:data.events[id].duration}))}))}));
  const originalById=new Map(originalContacts.map(c=>[c.id,c]));
  const E=require('../../../editor/core');
  const releaseDiagnostics=current.contacts.filter(c=>new E.Q(c.end).cmp(originalById.get(c.id).end)<0).map(c=>({
    category:'release_held_contact',eventIds:c.ids,hand:c.hand,midi:c.key,finger:current.assignments[c.id],
    notated:c.ids.map(id=>({id,start:data.events[id].onset,duration:data.events[id].duration})),
    start:c.start,previousEnd:originalById.get(c.id).end,end:c.end,
    related:current.contacts.filter(n=>n.hand===c.hand&&n.start===c.end&&current.assignments[n.id]).map(n=>n.id),
    reason:'held_contact_blocks_later_assignment',holdShortened:true,handShiftRequired:'candidate',sequentialRequired:false,
    pedalNotated:Number(data.xml.pedal)>0,physical:'unknown',sounding:'unknown'
  }));
  output[name]={before:prior[name].after,after:Object.values(after).filter(Boolean).length,total:wide.total,
    simultaneousModel:Object.values(current.assignments).filter(Boolean).length,
    exceptions:strict.wideExceptions.map(x=>({...x,category:x.code==='WIDE_CHORD_PAIR'?'wide_chord_outer_pair':'wide_interval_outer_pair',
      reason:x.code,releaseRequired:x.ids.some(id=>releaseDiagnostics.some(r=>r.eventIds.includes(id))),
      handShiftRequired:'unknown',sequentialRequired:false,pedalNotated:Number(data.xml.pedal)>0,sounding:'unknown'})),
    audits,attempts,changes,conditional:decorated,releaseDiagnostics,views,...(control?{control}:{})};
}
const sections=Object.entries(output).map(([name,data])=>{
  const fields=Object.entries(data).map(([key,value])=>{
    const entries=Array.isArray(value)&&value.length ? '[\n'+value.map(x=>'      '+JSON.stringify(x)).join(',\n')+'\n    ]' : JSON.stringify(value);
    return '    '+JSON.stringify(key)+': '+entries;
  });
  return '  '+JSON.stringify(name)+': {\n'+fields.join(',\n')+'\n  }';
});
console.log('{\n'+sections.join(',\n')+'\n}');
