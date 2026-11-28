'use strict';
const {isDeepStrictEqual}=require('node:util');
const E=require('../../../editor/core');
const {certify}=require('./feasibility.cjs');
const {groupLayers,transitions}=require('../stage-3-0-10-fingering-priority/priority.cjs');
const {validate,policy,middleFingers}=require('../stage-3-0-7-wide-chord-fingering/chord-experiment.cjs');

function verify(source,result,{budget}={}){
  const failures=[];
  const proofs=[];
  if(!isDeepStrictEqual(source.events,result.events)||!isDeepStrictEqual(source.score,result.score))
    failures.push('R01_SOURCE_CHANGED');
  for(const [id,finger] of Object.entries(source.manual??{}))
    if(finger!==result.assignments[id]?.finger)failures.push('R45:'+id);
  if(!isDeepStrictEqual(source.contacts,result.contacts))failures.push('CONTACT_PLAN_CHANGED');
  if(!isDeepStrictEqual(source.manual??{},result.manual))failures.push('R45_LOCKS_CHANGED');
  for(const [id,assignment] of Object.entries(result.assignments)){
    if(!Object.hasOwn(source.events,id))failures.push('R01_UNKNOWN_EVENT:'+id);
    if(assignment.finger!=null&&(!Number.isInteger(assignment.finger)||assignment.finger<1||assignment.finger>5))
      failures.push('R02:'+id);
    if(assignment.movement!=='unknown'||assignment.sounding!=='unknown')failures.push('R56:'+id);
  }
  const assigned=result.contacts.filter(c=>result.map[c.id]!=null);
  const lookup=new Map(assigned.map(c=>[c.id,c]));
  const groups=(source.chords??[]).filter(ids=>ids.every(id=>lookup.has(id))).map(ids=>ids.map(id=>lookup.get(id)));
  for(const contact of assigned){
    const finger=result.map[contact.id];
    if(!Number.isInteger(finger)||finger<1||finger>5)failures.push('R02:'+contact.id);
    if(contact.ids.some(id=>result.assignments[id]?.finger!==finger))failures.push('R05:'+contact.id);
    if([contact.technique,...contact.ids.flatMap(id=>[source.events[id]?.technique,
      source.events[id]?.substitution?'E08':null,source.events[id]?.slide?'R35':null])]
      .some(v=>['E08','R35','substitution','slide','finger_substitution','finger_slide'].includes(v)))
      failures.push('L0_PRO_ONLY:'+contact.id);
  }
  const checks=validate(assigned,result.map,source.profile,groups,true);
  for(const item of checks.conflicts)failures.push(item.code);
  for(const group of groups){
    if(group.length===3&&middleFingers(group,source.profile).includes(2)&&
      !group[1].ids.some(id=>source.manual?.[id]!=null)&&result.map[group[1].id]!==2)
      failures.push('R29:'+group[1].id);
  }
  const scoped=policy(groups,assigned,source.profile);
  for(const c of assigned)if(scoped.domains.has(c.id)&&!scoped.domains.get(c.id).includes(result.map[c.id]))
    failures.push('R30:'+c.id);
  const byKey=new Map();
  for(const c of assigned){
    if(!byKey.has(c.key))byKey.set(c.key,[]);
    byKey.get(c.key).push(c);
  }
  for(const same of byKey.values()){
    same.sort((a,b)=>new E.Q(a.start).cmp(b.start));
    for(let i=1;i<same.length;i++)if(new E.Q(same[i-1].end).cmp(same[i].start)>0)
      failures.push('R55:'+same[i].id);
  }
  const contactsById=new Map(result.contacts.map(c=>[c.id,c]));
  const eventSet=new Set(assigned.flatMap(c=>c.ids));
  for(const partition of result.special){
    const shape=partition.contacts.map(id=>contactsById.get(id));
    const originals=partition.contacts.flatMap(id=>contactsById.get(id)?.ids??[]);
    if(shape.some(c=>!c)||!shape.every(c=>c.hand===shape[0].hand&&c.start===shape[0].start)||
      !isDeepStrictEqual([...originals].sort(),Object.keys(partition.assignments).sort())||
      originals.some(id=>eventSet.has(id)||result.assignments[id]?.finger!==partition.assignments[id]))
      failures.push('E05_MAPPING');
    for(const id of originals)eventSet.add(id);
    if(shape.every(Boolean)){
      const proof=certify(source,shape,{budget});
      proofs.push({rule:'E05',ids:partition.contacts,...proof});
      if(proof.status!=='infeasible')failures.push('E05_ORDINARY_NOT_EXCLUDED');
    }
    if(partition.ordinaryProof!=='no_compatible_assignment'||partition.diagnostic.schedule!==null)
      failures.push('E05_UNJUSTIFIED');
    const seen=new Set();
    const byEvent=new Map(shape.filter(Boolean).flatMap(c=>c.ids.map(id=>[id,c])));
    for(const pos of partition.diagnostic.positions){
      if(pos.events.length!==pos.midi.length||pos.fingers.length!==pos.midi.length||
        new Set(pos.fingers).size!==pos.fingers.length)failures.push('E05_POSITION');
      for(const [i,ids] of pos.events.entries())for(const id of ids){
        if(seen.has(id)||byEvent.get(id)?.key!==pos.midi[i]||
          partition.assignments[id]!==pos.fingers[i])failures.push('E05_POSITION_MAPPING');
        seen.add(id);
      }
    }
    if(seen.size!==byEvent.size)failures.push('E05_POSITION_MAPPING');
    for(const pos of partition.diagnostic.positions)for(let i=0;i<pos.midi.length;i++){
      for(let j=i+1;j<pos.midi.length;j++){
        const pair=[pos.fingers[i],pos.fingers[j]].sort((a,b)=>a-b).join('-');
        if(pos.midi[j]-pos.midi[i]>source.profile.practicalSpan[pair])failures.push('E05_POSITION');
      }
    }
  }
  for(const [id,a] of Object.entries(result.assignments))if(a.status==='assigned'&&!eventSet.has(id))
    failures.push('ASSIGNMENT_WITHOUT_CONTACT:'+id);
  const repeatedEdges=new Set();
  const fingerprint=(from,to)=>JSON.stringify([from,to]);
  for(const hand of ['L','R']){
    const layers=groupLayers(assigned.filter(c=>c.hand===hand));
    for(let i=1;i<layers.length;i++)for(const [a,b] of transitions(layers[i-1],layers[i],source.events)){
      const pinned=c=>c.ids.some(id=>source.manual?.[id]!=null);
      if(a.key!==b.key&&result.map[a.id]===result.map[b.id]&&!(pinned(a)&&pinned(b)))
        repeatedEdges.add(fingerprint(a.id,b.id));
    }
  }
  for(const exception of result.exceptions){
    const {from,to}=exception;
    const a=lookup.get(from),b=lookup.get(to);
    if(exception.id!=='E07'||!a||!b||!repeatedEdges.delete(fingerprint(from,to))||a.hand!==b.hand||a.key===b.key||
      new E.Q(a.start).cmp(b.start)>=0||result.map[from]!==result.map[to]){
      failures.push('E07_UNJUSTIFIED');
      continue;
    }
    const proof=certify(source,assigned.filter(c=>c.hand===a.hand),{avoid:{from,to},budget});
    proofs.push({rule:'E07',from,to,...proof});
    if(proof.status!=='infeasible')failures.push('E07_NOT_PROVEN:'+from+':'+to);
  }
  for(const edge of repeatedEdges)failures.push('E07_MISSING:'+edge);
  return {ok:failures.length===0,failures,proofs,physical:'unknown',sounding:'unknown'};
}
module.exports={verify};
