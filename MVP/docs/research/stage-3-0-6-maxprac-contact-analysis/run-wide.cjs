'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../../editor/core');
const { runWide, residualReasons } = require('./wide-experiment.cjs');
const replay = require(process.argv[2]);
const originalImports = process.argv[3];
const register = require('./register.json');
const summary = require('./summary.json');
const result = {};
for(const [composition,prefix] of [['time','hans-'],['no-surprises','radiohead-']]){
  const file = fs.readdirSync(originalImports).find(f=>f.startsWith(prefix)&&f.endsWith('-0.json'));
  const {score,run:original} = JSON.parse(fs.readFileSync(path.join(originalImports,file)));
  const data = replay[composition];
  const state = JSON.stringify({score,data});
  const contacts = data.run.contacts;
  const before = Object.fromEntries(contacts.flatMap(c=>c.ids.map(id=>[id,data.run.contactAssignments[c.id]??null])));
  const baseline = {...original,...data.run,assignments:before,assigned:data.stage305,elapsed_ms:0};
  assert.equal(Object.values(before).filter(Boolean).length,baseline.assigned);
  const run = runWide(score,baseline,{locks:data.manual,frozen:data.rests});
  assert.equal(JSON.stringify({score,data}),state);
  assert.equal(run.recovery.status,'complete');
  assert.equal(run.validation.conflicts.length,0);
  assert.equal(run.validation.physical,'unknown');
  for(const id of [...data.rests,...Object.keys(data.manual)])assert.equal(run.assignments[id],before[id]);
  const map = run.contactAssignments;
  const assignedContacts = contacts.filter(c=>map[c.id]!=null);
  const validation = E.validate(assignedContacts,map,{profile:baseline.profile,experimentalWideIntervals:true});
  assert.equal(validation.conflicts.length,0);
  assert.equal(validation.warnings.length,0);
  const exceptions = validation.wideExceptions;
  assert.deepEqual(exceptions.map(x=>x.ids),run.validation.wideExceptions.map(x=>x.ids));
  assert.equal(Object.values(run.assignments).filter(Boolean).length,run.assigned);
  const remaining = E.events(score).filter(e=>!run.assignments[e.id]).map(e=>{
    const c = contacts.find(c=>c.ids.includes(e.id));
    const reasons = c ? residualReasons(c,contacts,map,baseline.profile,data.manual) : null;
    assert.ok(!reasons || Object.values(reasons).every(list=>list.length),e.id);
    return {id:e.id,midi:e.pitch.midi,hand:e.hand,voice:e.voice,
      measure:data.events[e.id].measure,interval:c?[c.start,c.end]:null,reasons};
  });
  const changed = Object.keys(before).filter(id=>before[id] && before[id]!==run.assignments[id])
    .map(id=>({id,from:before[id],to:run.assignments[id]??null,
      measure:data.events[id].measure,
      exceptions:exceptions.filter(x=>x.eventIds.flat().includes(id)).map(x=>x.ids)}));
  assert.ok(changed.every(c=>c.to && c.exceptions.length));
  const cases = register.filter(r=>r.composition===composition).map(r=>{
    const id=r.id;
    const pairs=exceptions.filter(x=>x.eventIds.flat().includes(id));
    return {id,measure:r.measure,hand:r.hand,midi:r.midi,category:r.category,
      finger:run.assignments[id]??null,exceptions:pairs.map(x=>x.ids),
      otherConstraints:'passed_for_assigned_plan',newConflicts:0,
      reasons:remaining.find(c=>c.id===id)?.reasons??null};
  });
  result[composition]={total:run.total,before:baseline.assigned,after:run.assigned,
    restoredPreserved:data.rests,remaining,changed,exceptions,cases,
    gained:Object.keys(before).filter(id=>!before[id]&&run.assignments[id]),
    g4:summary[composition].g4.map(id=>({id,finger:run.assignments[id]??null})),
    physical:'unknown'};
}
// Each evidence record occupies one line so it can be reviewed in GitHub.
const rows = Object.entries(result).map(([name, report]) => {
  const fields = Object.entries(report).map(([key, value]) => {
    const content = Array.isArray(value) && value.length ?
      '[\n' + value.map(item=>'      '+JSON.stringify(item)).join(',\n') + '\n    ]' : JSON.stringify(value);
    return '    '+JSON.stringify(key)+': '+content;
  });
  return '  '+JSON.stringify(name)+': {\n'+fields.join(',\n')+'\n  }';
});
console.log('{\n'+rows.join(',\n')+'\n}');
