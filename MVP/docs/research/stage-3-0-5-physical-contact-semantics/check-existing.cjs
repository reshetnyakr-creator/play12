const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('../../../editor/core');
const {planContacts}=require('../../../editor/contact-plan');
const [imports]=process.argv.slice(2);
const audit=require('./cases.json');
const rows=[];
for(const name of ['time','no-surprises']){
 const file=fs.readdirSync(imports).find(f=>f.startsWith(name==='time'?'hans-':'radiohead-'));
 const {score,run}=JSON.parse(fs.readFileSync(path.join(imports,file)));
 const original=JSON.stringify(score);
 for(const target of audit.cases.filter(c=>c.composition===name)){
  const early=[target,...target.blockers].sort((a,b)=>new E.Q(a.onset).cmp(b.onset));
  const stop=early[1].onset;
  const earlier=early[0];
  const min=new E.Q(stop).sub(earlier.onset).toString();
  const plan=planContacts(score,{releases:{[earlier.id]:stop},minimumHoldByContact:{[earlier.id]:min}},run.contacts);
  const issue=plan.issues.find(issue=>issue.id===earlier.id);
  assert.equal(issue?.code,'RELEASE_NOT_SUPPORTED');
  assert.equal(plan.actions.find(c=>c.id===earlier.id).end,earlier.contact[1]);
  rows.push({event:target.id,earlier:earlier.id,requested_stop:stop,reason:issue.code});
 }
 assert.equal(JSON.stringify(score),original);
}
console.log(JSON.stringify(rows,null,2));
