'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {experiment}=require('./chord-experiment.cjs');
const {runWide}=require('../stage-3-0-6-maxprac-contact-analysis/wide-experiment.cjs');
const prior=require('../stage-3-0-6-maxprac-contact-analysis/wide-results.json');
const replay=require(path.resolve(process.argv[2]));
const imports=process.argv[3];
const output={};
for(const [name,prefix] of [['time','hans-'],['no-surprises','radiohead-']]){
  const file=fs.readdirSync(imports).find(f=>f.startsWith(prefix)&&f.endsWith('-0.json'));
  const {score,run:imported}=JSON.parse(fs.readFileSync(path.join(imports,file)));
  const source=JSON.stringify(score);
  const data=replay[name];
  const base={...imported,...data.run, assigned:data.stage305,elapsed_ms:0,
    assignments:Object.fromEntries(data.run.contacts.flatMap(c=>c.ids.map(id=>[id,data.run.contactAssignments[c.id]??null])))};
  const before=runWide(score,base,{locks:data.manual,frozen:data.rests});
  assert.equal(before.assigned,prior[name].after);
  assert.deepEqual(before.validation.wideExceptions,prior[name].exceptions.map(item=>{
    // Published records are from the independent validator without round mapping.
    const actual=before.validation.wideExceptions.find(x=>x.ids.join()===item.ids.join());
    for(const field of ['ids','fingers','distance','practicalExcess'])assert.deepEqual(actual[field],item[field]);
    return actual;
  }));
  const after=experiment(score,before,prior[name].remaining.map(c=>c.id),{locks:data.manual,frozen:data.rests});
  assert.equal(JSON.stringify(score),source);
  assert.equal(after.validation.conflicts.length+after.validation.warnings.length,0);
  const events=Object.fromEntries(before.contacts.flatMap(c=>c.ids.map(id=>[id,after.map[c.id]??null])));
  assert.ok(Object.entries(before.assignments).every(([id,f])=>!f||events[id]));
  for(const id of [...data.rests,...prior[name].gained])assert.equal(events[id],before.assignments[id]);
  for(const [id,f] of Object.entries(data.manual))assert.equal(events[id],f);
  const changes=Object.entries(events).filter(([id,f])=>before.assignments[id]!==f)
    .map(([id,f])=>({id,before:before.assignments[id]??null,after:f,measure:data.events[id].measure,midi:data.events[id].midi}));
  const cases=after.trials.map(trial=>({...trial,
    measure:data.events[trial.id].measure,midi:data.events[trial.id].midi,finger:events[trial.id],
    members:before.contacts.filter(c=>trial.component.includes(c.id)).map(c=>({
      id:c.id,eventIds:c.ids,hand:c.hand,midi:c.key,start:c.start,end:c.end,
      before:before.contactAssignments[c.id]??null,after:after.map[c.id]??null
    })),
    applicableExceptions:after.validation.wideExceptions.filter(x=>x.eventIds.flat().includes(trial.id))
  }));
  const controlIds=['P1.m35.e8','P1.m35.e2','P1.m35.e3'];
  if(name==='time')assert.deepEqual(controlIds.map(id=>events[id]),[5,2,1]);
  if(name==='time'&&process.argv[4]){
    const measures=new Set(cases.map(c=>c.measure));
    const correction=Object.fromEntries(Object.entries(before.assignments).filter(([id,value])=>
      measures.has(data.events[id]?.measure)&&value!==imported.assignments[id]));
    fs.writeFileSync(process.argv[4],JSON.stringify({time:correction},null,2)+'\n');
  }
  output[name]={before:before.assigned,after:after.assigned,total:before.total,changes,cases,
    chords:after.chords,widePairs:after.validation.wideExceptions.length,physical:'unknown'};
}
const sections=Object.entries(output).map(([name,data])=>{
  const fields=Object.entries(data).map(([key,value])=>{
    const entries=Array.isArray(value)&&value.length ? '[\n'+value.map(x=>'      '+JSON.stringify(x)).join(',\n')+'\n    ]' : JSON.stringify(value);
    return '    '+JSON.stringify(key)+': '+entries;
  });
  return '  '+JSON.stringify(name)+': {\n'+fields.join(',\n')+'\n  }';
});
console.log('{\n'+sections.join(',\n')+'\n}');
