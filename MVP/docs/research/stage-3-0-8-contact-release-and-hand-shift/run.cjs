'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {runWide}=require('../stage-3-0-6-maxprac-contact-analysis/wide-experiment.cjs');
const widePrior=require('../stage-3-0-6-maxprac-contact-analysis/wide-results.json');
const {experiment,findChords}=require('../stage-3-0-7-wide-chord-fingering/chord-experiment.cjs');
const prior=require('../stage-3-0-7-wide-chord-fingering/results.json');
const {planTarget}=require('./release-experiment.cjs');
const replay=require(path.resolve(process.argv[2]));
const imports=process.argv[3];
const summary={};
const assignments=(contacts,map)=>Object.fromEntries(contacts.flatMap(c=>c.ids.map(id=>[id,map[c.id]??null])));
for(const [name,prefix] of [['time','hans-'],['no-surprises','radiohead-']]){
  const file=fs.readdirSync(imports).find(f=>f.startsWith(prefix)&&f.endsWith('-0.json'));
  const {score,run:imported}=JSON.parse(fs.readFileSync(path.join(imports,file)));
  const original=JSON.stringify(score);
  const data=replay[name];
  const base={...imported,...data.run,assigned:data.stage305,elapsed_ms:0,
    assignments:assignments(data.run.contacts,data.run.contactAssignments)};
  const wide=runWide(score,base,{locks:data.manual,frozen:data.rests});
  assert.equal(wide.assigned,prior[name].before);
  const joint=experiment(score,wide,widePrior[name].remaining.map(c=>c.id),{locks:data.manual,frozen:data.rests});
  assert.equal(joint.assigned,prior[name].after);
  const before=assignments(wide.contacts,joint.map);
  const j=Object.entries(before).filter(([id,f])=>wide.assignments[id]!==f).map(([id,f])=>[id,f]);
  assert.deepEqual(j,prior[name].changes.map(({id,after})=>[id,after]));
  const accepted=findChords(score,wide.contacts,wide.profile).filter(g=>joint.chords.some(c=>
    JSON.stringify(g.map(n=>n.ids))===JSON.stringify(c.eventIds)));
  const frozen=[...data.rests,...widePrior[name].gained,...prior[name].changes.filter(c=>c.before==null).map(c=>c.id)];
  const settings={locks:data.manual,frozen,accepted};
  let current={...wide,contacts:wide.contacts,contactAssignments:joint.map,assignments:before};
  const pedal=Number(data.xml.pedal)>0;
  const describe=(plan,start)=>({
    status:plan.status,attempts:plan.attempts,shortening:plan.shortening?.toString()??'0/1',
    movement:plan.movement??null,releases:(plan.releases??[]).map(r=>{
      const c=start.contacts.find(c=>c.id===r.id);
      return {...r,events:c.ids.map(id=>({id,notatedStart:data.events[id].onset,notatedDuration:data.events[id].duration,
        ties:data.events[id].ties})),hand:c.hand,midi:c.key,finger:plan.map[c.id],start:c.start,
        previousFinger:start.contactAssignments[c.id]??null,earlyRelease:true,reason:'holding_blocks_later_fingering',
        handShift:'candidate',travelTime:'unknown',pedalNotated:pedal,physical:'unknown',sounding:'unknown'};
    }),
    members:plan.component.map(c=>({id:c.id,eventIds:c.ids,hand:c.hand,midi:c.key,start:c.start,end:c.end,
      musical:c.ids.map(id=>({id,start:data.events[id].onset,duration:data.events[id].duration})),
      releaseEnd:plan.revised?.find(n=>n.id===c.id).end??c.end,
      before:start.contactAssignments[c.id]??null,after:plan.map?.[c.id]??start.contactAssignments[c.id]??null}))
  });

  const cases=[];
  let control;
  for(const entry of prior[name].cases.filter(c=>!c.finger)){
    const plan=planTarget(score,current,entry.id,settings);
    const result={id:entry.id,measure:entry.measure,midi:entry.midi,...describe(plan,current)};
    cases.push(result);
    if(entry.id==='P1.m37.e7'){
      const ids=['P1.m37.e7','P1.m37.e8','P1.m37.e3','P1.m37.e4','P1.m37.e5','P1.m37.e6'];
      const fingers=[5,2,1,2,3,4];
      const prescribed=planTarget(score,current,entry.id,
        {...settings,referenceFingers:Object.fromEntries(ids.map((id,i)=>[id,fingers[i]]))});
      assert.deepEqual(ids.map(id=>prescribed.map?.[id]),fingers);
      control={reference:describe(prescribed,current),fingers,automatic:ids.map(id=>plan.map?.[id]??null)};
    }
    if(plan.map){
      current={...current,contacts:plan.revised,contactAssignments:plan.map,assignments:assignments(plan.revised,plan.map)};
      settings.accepted=plan.groups;
    }
  }
  assert.equal(JSON.stringify(score),original);
  assert.ok(Object.entries(before).every(([id,f])=>!f||current.assignments[id]));
  for(const id of [...frozen,...Object.keys(data.manual)])assert.equal(current.assignments[id],before[id]);
  const changes=Object.entries(current.assignments).filter(([id,f])=>f!==before[id])
    .map(([id,f])=>({id,measure:data.events[id].measure,midi:data.events[id].midi,before:before[id],after:f}));
  const after=Object.values(current.assignments).filter(Boolean).length;
  if(name==='time'&&process.argv[4]){
    const measures=new Set(cases.map(c=>c.measure));
    const correction=Object.fromEntries(Object.entries(before).filter(([id,f])=>measures.has(data.events[id]?.measure)&&f!==imported.assignments[id]));
    fs.writeFileSync(process.argv[4],JSON.stringify({time:correction},null,2)+'\n');
  }
  summary[name]={before:joint.assigned,after,total:wide.total,changes,cases,...(control?{control}:{}),
    releases:cases.flatMap(c=>c.releases).length,physical:'unknown',sounding:'unknown'};
}
const sections=Object.entries(summary).map(([name,data])=>{
  const fields=Object.entries(data).map(([key,value])=>{
    const entries=Array.isArray(value)&&value.length ? '[\n'+value.map(x=>'      '+JSON.stringify(x)).join(',\n')+'\n    ]' : JSON.stringify(value);
    return '    '+JSON.stringify(key)+': '+entries;
  });
  return '  '+JSON.stringify(name)+': {\n'+fields.join(',\n')+'\n  }';
});
console.log('{\n'+sections.join(',\n')+'\n}');
