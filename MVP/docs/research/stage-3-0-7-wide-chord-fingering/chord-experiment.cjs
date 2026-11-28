'use strict';
const E = require('../../../editor/core');
const {Q} = E;
const cmp = (a,b) => new Q(a).cmp(b);
const overlaps = (a,b) => cmp(a.start,b.end)<0 && cmp(b.start,a.end)<0;
const related = (a,b) => (a.hand===b.hand || a.key===b.key) && overlaps(a,b);

function components(contacts, target) {
  const group = new Set([target]);
  for(const contact of group)
    for(const next of contacts)
      if(!group.has(next)&&related(contact,next))group.add(next);
  return [...group];
}

function findChords(score, contacts, profile) {
  if(profile.id!=='beginner'||!Number.isFinite(profile.practicalSpan?.['1-5']))return [];
  const attacks=new Map();
  const byEvent=new Map(contacts.flatMap(c=>c.ids.map(id=>[id,c])));
  for(const event of E.events(score)){
    if(!event.hand || !event.pitch || event.grace || event.editor_onset_q==null || event.ties?.includes('stop'))continue;
    const key=JSON.stringify([event.hand,new Q(event.editor_onset_q).toString()]);
    if(!attacks.has(key))attacks.set(key,[]);
    attacks.get(key).push(event);
  }
  const chords=[];
  for(const layer of attacks.values()){
    const mapped=layer.map(event=>byEvent.get(event.id));
    if(mapped.some((c,i)=>!c || c.hand!==layer[i].hand || c.key!==layer[i].pitch.midi ||
      cmp(layer[i].editor_onset_q,c.start)!==0))continue;
    const chord=[...new Set(mapped)].sort((a,b)=>a.key-b.key);
    if(chord.length<3 || new Set(chord.map(c=>c.key)).size!==chord.length)continue;
    if(chord.at(-1).key-chord[0].key>profile.practicalSpan['1-5'])chords.push(chord);
  }
  return chords;
}

function policy(chords, contacts) {
  const members=new Map(), domains=new Map(), required=new Set();
  for(const chord of chords){
    if(!chord.every(c=>contacts.includes(c)))continue;
    const outer=chord[0].hand==='L'?[5,1]:[1,5];
    for(const [i,c] of chord.entries()){
      members.set(c.id,chord);
      domains.set(c.id,i===0?[outer[0]]:i===chord.length-1?[outer[1]]:[2,3,4]);
      required.add(c.id);
    }
  }
  return {chords:members,domains,required};
}

function groupValid(chord, map) {
  const fingers=chord.map(c=>map[c.id]);
  return fingers[0]===(chord[0].hand==='L'?5:1) && fingers.at(-1)===(chord[0].hand==='L'?1:5) &&
    fingers.every((f,i)=>Number.isInteger(f)&&(!i||(chord[0].hand==='L'?f<fingers[i-1]:f>fingers[i-1])));
}

function chordEvidence(chord,map,profile) {
  const pairs=[];
  for(const [i,low] of chord.entries())for(const high of chord.slice(i+1)){
    const fingers=[map[low.id],map[high.id]];
    const key=fingers.slice().sort((a,b)=>a-b).join('-');
    const distance=high.key-low.key;
    const comfortLimit=profile.comfortSpan[key], practicalLimit=profile.practicalSpan[key];
    pairs.push({ids:[low.id,high.id],fingers,distance,comfortLimit,practicalLimit,
      comfortExcess:Math.max(0,distance-comfortLimit),practicalExcess:Math.max(0,distance-practicalLimit),
      wideChordException:distance>practicalLimit});
  }
  return {hand:chord[0].hand,start:chord[0].start,eventIds:chord.map(c=>c.ids),
    midi:chord.map(c=>c.key),fingers:chord.map(c=>map[c.id]),
    outerDistance:chord.at(-1).key-chord[0].key,wideChordException:pairs.some(p=>p.wideChordException),
    physical:'unknown',pairs};
}

function experiment(score, baseline, targets, {locks={},frozen=[]}={}) {
  const contacts=baseline.contacts, profile=baseline.profile;
  const locked={...locks};
  for(const id of frozen)if(baseline.assignments[id]!=null)locked[id]=baseline.assignments[id];
  const available=findChords(score,contacts,profile);
  const map={...baseline.contactAssignments};
  const original={...map};
  const activated=[];
  const trials=[];
  for(const id of targets){
    const target=contacts.find(c=>c.ids.includes(id));
    if(!target)throw new Error('No contact for '+id);
    const component=components(contacts,target);
    const trial={id,component:component.map(c=>c.id),attempts:[]};
    trials.push(trial);
    if(map[target.id]!=null){trial.status='already_recovered';continue;}
    const chord=available.find(group=>group.includes(target));
    if(chord?.length>5){trial.status='more_keys_than_fingers';continue;}
    const allowed=chord?[...activated,chord]:activated;
    const scoped=policy(allowed,component);
    const selected=component.filter(c=>map[c.id]!=null||c===target||scoped.required.has(c.id));
    const assigned=Object.fromEntries(selected.filter(c=>map[c.id]!=null).map(c=>[c.id,map[c.id]]));
    const assignments=Object.fromEntries(selected.flatMap(c=>c.ids.map(id=>[id,assigned[c.id]??null])));
    const run={...baseline,contacts:selected,contactAssignments:assigned,assignments,
      assigned:Object.values(assignments).filter(Boolean).length,total:Object.keys(assignments).length,elapsed_ms:0};
    scoped.required.add(target.id);
    for(const c of selected)if(c.ids.some(id=>locked[id]!=null)){
      const finger=map[c.id];
      if(finger!=null && scoped.domains.has(c.id) && !scoped.domains.get(c.id).includes(finger)){
        trial.status='protected_chord_finger';break;
      }
      if(finger!=null)scoped.domains.set(c.id,[finger]);
    }
    if(trial.status)continue;
    const scopes=chord?[chord,selected]:[selected];
    for(const scope of scopes){
      const reconsider=new Set(scope.map(c=>c.id));
      // A locked contact stays fixed, including when it belongs to the chord.
      const next=E.recoverPartial(score,run,locked,Date.now,{wideIntervals:true,reconsider,...scoped});
      const attempt={scope:scope===chord?'chord':'dependency_component',status:next.recovery?.status,
        states:next.recovery?.states,failureAt:next.recovery?.failureAt,rejected:next.recovery?.rejected};
      trial.attempts.push(attempt);
      if(attempt.status!=='complete'||!next.contactAssignments[target.id])continue;
      const candidate={...map,...next.contactAssignments};
      if(!allowed.every(g=>groupValid(g,candidate))){
        attempt.status='chord_shape_rejected';continue;
      }
      const validation=validate(contacts,candidate,profile,allowed);
      if(validation.conflicts.length||validation.warnings.length){
        attempt.status='validation_rejected';attempt.conflicts=[...validation.conflicts,...validation.warnings];continue;
      }
      for(const c of selected)if(map[c.id]!=null && candidate[c.id]!==map[c.id])
        (trial.changes??=[]).push({id:c.id,from:map[c.id],to:candidate[c.id]});
      Object.assign(map,candidate);
      if(chord)activated.push(chord);
      trial.status='assigned';
      break;
    }
    trial.status??='unassigned';
  }
  const validation=validate(contacts,map,profile,activated);
  return {map,original,trials,chords:activated.map(c=>chordEvidence(c,map,profile)),
    validation,assigned:contacts.reduce((n,c)=>n+(map[c.id]?c.ids.length:0),0)};
}

function validate(contacts,map,profile,chords) {
  const assigned=contacts.filter(c=>map[c.id]!=null);
  const scoped=policy(chords,contacts);
  return E.validate(assigned,map,{profile,experimentalWideIntervals:true,researchChords:scoped.chords});
}
module.exports={experiment,findChords,components,policy,groupValid,validate};
