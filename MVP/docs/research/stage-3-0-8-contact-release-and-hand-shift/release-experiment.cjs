'use strict';
const E=require('../../../editor/core');
const {components,findChords,policy,groupValid,validate}=require('../stage-3-0-7-wide-chord-fingering/chord-experiment.cjs');
const {Q}=E;
const cmp=(a,b)=>new Q(a).cmp(b);

function* schedules(options,remaining,index=0,prefix=[]){
  if(!remaining){yield prefix;return;}
  if(options.length-index<remaining)return;
  yield* schedules(options,remaining,index+1,prefix);
  for(const choice of options[index])
    yield* schedules(options,remaining-1,index+1,[...prefix,choice]);
}

// Same position estimate and weight as the ordinary Fingering Engine.
// This is an ordering cost, never a measured travel-time requirement.
function movement(contacts,map,profile){
  const groups=new Map();
  for(const c of contacts){
    const finger=map[c.id];
    if(!finger)continue;
    const key=JSON.stringify([c.hand,new Q(c.start).toString()]);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(c);
  }
  const previous=new Map();
  let cost=0;
  for(const layer of [...groups.values()].sort((a,b)=>cmp(a[0].start,b[0].start))){
    const {hand}=layer[0];
    const position=layer.reduce((sum,c)=>sum+E.keyX(c.key,profile)-(hand==='R'?1:-1)*(map[c.id]-1)*100,0)/layer.length;
    if(previous.has(hand))cost+=Math.round(Math.abs(position-previous.get(hand)))*profile.weights.positionShift;
    previous.set(hand,position);
  }
  return cost;
}

function compare(a,b){
  return a.releases.length-b.releases.length || cmp(a.shortening,b.shortening) ||
    a.changed-b.changed || a.movement-b.movement;
}

function planTarget(score,baseline,targetId,options={}){
  const {locks={},frozen=[],accepted=[],referenceFingers={},candidateBudget=10000}=options;
  const {contacts,profile,contactAssignments:before}=baseline;
  const target=contacts.find(c=>c.ids.includes(targetId));
  if(!target)throw new Error('Missing contact: '+targetId);
  const component=components(contacts,target);
  const chord=findChords(score,contacts,profile).find(g=>g.includes(target));
  if(chord?.length>5)return {status:'more_keys_than_fingers',component,attempts:0};
  const activeGroups=[...accepted,...(chord&&!accepted.some(g=>g.some(c=>c.id===target.id))?[chord]:[])];
  const groupIds=activeGroups.map(g=>g.map(c=>c.id));
  const members=new Set(groupIds.flat());
  const selected=component.filter(c=>before[c.id]!=null||c===target||members.has(c.id));
  const protectedIds=new Set(Object.keys(locks));
  const fixed={...locks};
  for(const id of frozen)if(baseline.assignments[id]!=null)fixed[id]=baseline.assignments[id];

  function solve(releases){
    const ends=new Map(releases.map(r=>[r.id,r.end]));
    const revised=contacts.map(c=>ends.has(c.id)?{...c,end:ends.get(c.id)}:c);
    const byId=new Map(revised.map(c=>[c.id,c]));
    const local=selected.map(c=>byId.get(c.id));
    const groups=groupIds.map(ids=>ids.map(id=>byId.get(id)));
    const scoped=policy(groups,local);
    scoped.required.add(target.id);
    for(const c of local){
      const current=before[c.id];
      const requested=new Set(c.ids.map(id=>referenceFingers[id]).filter(f=>f!=null));
      if(requested.size>1)return null;
      const desired=[...requested][0];
      if(c.ids.some(id=>fixed[id]!=null &&
        ((desired!=null&&fixed[id]!==desired)||(scoped.domains.has(c.id)&&!scoped.domains.get(c.id).includes(fixed[id])))))return null;
      if(desired!=null && scoped.domains.has(c.id)&&!scoped.domains.get(c.id).includes(desired))return null;
      if(desired!=null)scoped.domains.set(c.id,[desired]);
      if(current!=null&&c.ids.some(id=>fixed[id]!=null)&&desired!=null&&current!==desired)return null;
    }
    const assignments=Object.fromEntries(local.flatMap(c=>c.ids.map(id=>[id,before[c.id]??null])));
    const assigned=Object.values(assignments).filter(Boolean).length;
    const run={...baseline,contacts:local,assignments,assigned,total:Object.keys(assignments).length,elapsed_ms:0};
    const reconsider=new Set(local.map(c=>c.id));
    const next=E.recoverPartial(score,run,fixed,Date.now,{wideIntervals:true,reconsider,...scoped});
    if(next.recovery?.status==='budget_exhausted')return {budget:true};
    if(next.recovery?.status!=='complete'||!next.contactAssignments[target.id])return null;
    const map={...before,...next.contactAssignments};
    if(!groups.every(g=>groupValid(g,map)))return null;
    const validation=validate(revised,map,profile,groups);
    if(validation.conflicts.length||validation.warnings.length)return null;
    return {map,revised,groups,releases,shortening:releases.reduce((total,r)=>total.add(new Q(r.before).sub(r.end)),new Q(0)),
      changed:selected.filter(c=>before[c.id]&&before[c.id]!==map[c.id]).length,
      movement:movement(local,map,profile),validation};
  }
  const literal=solve([]);
  if(literal?.budget)return {status:'budget',component,attempts:1};
  if(literal)return {...literal,status:'assigned_without_release',component,attempts:1};

  const optionsByContact=[];
  for(const held of selected){
    if(held.hand!==target.hand||held.ids.some(id=>protectedIds.has(id)))continue;
    const byOnset=new Map();
    for(const next of selected){
      if(next.hand!==held.hand||cmp(held.start,next.start)>=0||cmp(next.start,held.end)>=0)continue;
      const end=new Q(next.start).toString();
      if(!byOnset.has(end))byOnset.set(end,{id:held.id,before:held.end,end,related:[]});
      byOnset.get(end).related.push(next.id);
    }
    if(byOnset.size)optionsByContact.push([...byOnset.values()]);
  }
  let attempts=1;
  for(let count=1;count<=optionsByContact.length;count++){
    let best;
    for(const releases of schedules(optionsByContact,count)){
      if(attempts>=candidateBudget)return {status:'budget',component,attempts};
      attempts++;
      const next=solve(releases);
      if(next?.budget)return {status:'budget',component,attempts};
      if(next&&(!best||compare(next,best)<0))best=next;
    }
    if(best)return {...best,status:'assigned_after_release',component,attempts};
  }
  return {status:'no_compatible_release',component,attempts};
}
module.exports={planTarget};
