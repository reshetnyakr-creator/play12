'use strict';
const E=require('../../../editor/core');
const {policy,findChords,middleFingers}=require('../stage-3-0-7-wide-chord-fingering/chord-experiment.cjs');
const {specialPositions}=require('../stage-3-0-10-fingering-priority/positions.cjs');
const {solveHand,compareCost,groupLayers,position}=require('./search.cjs');
const {verify}=require('./verify.cjs');
const {certify}=require('./feasibility.cjs');
const {commonPosition}=require('./position-model.cjs');
const {describeGroups}=require('./groups.cjs');
const {releasePlan}=require('../stage-3-0-5-physical-contact-semantics/experiment.cjs');
const {proposeBeginner}=require('../../../editor/beginner-transition');
const {experiment}=require('../stage-3-0-5-physical-contact-semantics/experiment.cjs');
const defaultProfile=require('../../../editor/beginner.json');

function snapshot(score,{manual={},profile=defaultProfile,resetByMidi={}}={}){
  const projected=E.contacts(score,{locks:manual});
  const events=Object.fromEntries(E.events(score).map(e=>[e.id,e]));
  const baseline=proposeBeginner(score,profile,manual);
  // Keep previously approved release-shift contact plans separate from new finger decisions.
  const planned=baseline.releaseShift?.length?baseline.contacts:projected.contacts;
  const starts=new Set();
  const mightShare=planned.some(c=>{
    const signature=JSON.stringify([c.key,c.start,c.end]);
    if(starts.has(signature))return true;
    starts.add(signature);
    return false;
  });
  const shared=mightShare?experiment(score,{...baseline,contacts:planned},{locks:manual,resetByMidi}):null;
  const plan=shared??releasePlan(planned,resetByMidi,c=>!events[c.id]?.ties?.includes('stop'));
  const contacts=plan.actions;
  const phraseCandidates=[];
  const motifs=new Map();
  const voices=new Map();
  for(const event of Object.values(events)){
    const key=JSON.stringify([event.hand,event.staff,event.voice]);
    if(!voices.has(key))voices.set(key,[]);
    voices.get(key).push(event);
  }
  for(const voice of voices.values()){
    const ordered=voice.filter(e=>e.editor_onset_q!=null).sort((a,b)=>new E.Q(a.editor_onset_q).cmp(b.editor_onset_q));
    for(let i=0;i<ordered.length;i++){
      const a=ordered[i], b=ordered[i+1];
      if(b&&new E.Q(a.editor_onset_q).add(a.duration_quarters).cmp(b.editor_onset_q)<0)
        phraseCandidates.push({after:a.id,before:b.id,evidence:'notated_gap',status:'candidate'});
      const window=ordered.slice(i,i+3);
      if(window.length!==3||window.some(e=>e.pitch?.midi==null))continue;
      const key=JSON.stringify([a.hand,...window.slice(1).map((e,j)=>e.pitch.midi-window[j].pitch.midi),
        ...window.map(e=>e.duration_quarters)]);
      if(!motifs.has(key))motifs.set(key,[]);
      motifs.get(key).push(window.map(e=>e.id));
    }
  }
  const motifCandidates=[...motifs].filter(([,groups])=>groups.length>1)
    .map(([signature,occurrences])=>({signature,occurrences,status:'candidate'}));
  return {score,events,contacts,manual,profile,map:{},decorated:[],
    chords:findChords(score,contacts,profile).map(group=>group.map(c=>c.id)),
    phraseCandidates,motifCandidates,resets:plan.resets,diagnostics:projected.warnings};
}

function evaluate(input,{budget=3_000_000,proveRepeats=true}={}){
  const {score,events,profile}=input;
  if(profile?.id!=='beginner')throw Error('Only the beginner profile is supported');
  if(!Number.isSafeInteger(budget)||budget<0)throw Error('Invalid search budget');
  const manual=Object.freeze({...input.manual});
  const weights=Object.fromEntries(Object.entries(defaultProfile.weights).map(([key,fallback])=>
    [key,Number.isFinite(profile.weights?.[key])&&Math.abs(profile.weights[key])<=1e9?profile.weights[key]:fallback]));
  const configuration={...profile,weights};
  const contacts=input.contacts.map(c=>({...c,ids:[...c.ids]}));
  const blocked=contacts.filter(c=>[c.technique,...c.ids.flatMap(id=>[events[id]?.technique,
    events[id]?.substitution?'E08':null,events[id]?.slide?'R35':null])]
    .some(t=>['E08','R35','substitution','slide','finger_substitution','finger_slide'].includes(t)));
  const forbidden=new Set(blocked.map(c=>c.id));
  const reject=blocked.map(c=>({contact:c.id,reason:'L0_PRO_ONLY'}));
  const keys=new Map();
  for(const c of contacts){
    if(!keys.has(c.key))keys.set(c.key,[]);
    keys.get(c.key).push(c);
  }
  for(const group of keys.values()){
    const time=(a,b)=>new E.Q(a).cmp(b);
    group.sort((a,b)=>time(a.start,b.start));
    const active=[];
    for(const current of group){
      for(const previous of active.filter(c=>time(c.end,current.start)>0)){
        if(forbidden.has(previous.id)&&blocked.includes(previous))continue;
        for(const contact of [previous,current]){
          if(!forbidden.has(contact.id))reject.push({contact:contact.id,reason:'R55_KEY_ALREADY_DOWN'});
          forbidden.add(contact.id);
        }
      }
      if(!blocked.includes(current))active.push(current);
      while(active.length&&time(active[0].end,current.start)<=0)active.shift();
    }
  }
  const byId=new Map(contacts.map(c=>[c.id,c]));
  const special=[];
  const planned=contacts.filter(c=>!forbidden.has(c.id));
  const indicated=(input.decorated??[]).map(entry=>entry.eventIds.map(ids=>
    planned.find(c=>c.ids.includes(ids[0]))));
  const ordinaryByHand=['L','R'].map(hand=>planned.filter(c=>c.hand===hand));
  for(const hand of ordinaryByHand){
    let held=[];
    for(const layer of groupLayers(hand)){
      held=held.filter(c=>new E.Q(c.end).cmp(layer[0].start)>0);
      if(layer.length===3&&!held.length&&layer[2].key-layer[0].key>=12&&
        layer.every(c=>!c.arpeggio&&c.ids.length===1))indicated.push(layer);
      held.push(...layer);
    }
  }
  const accounted=new Set();
  for(const members of indicated){
    if(members.some(c=>!c||accounted.has(c.id)))continue;
    const partition=specialPositions(members,profile,manual);
    if(!partition||certify(input,members,{budget}).status!=='infeasible')continue;
    special.push({...partition,contacts:members.map(c=>c.id),ordinaryProof:'no_compatible_assignment'});
    for(const member of members)accounted.add(member.id);
  }
  const separate=new Set(special.flatMap(p=>p.contacts));
  const eligible=contacts.filter(c=>!forbidden.has(c.id)&&!separate.has(c.id));
  const chords=(input.chords??[]).map(ids=>ids.map(id=>byId.get(id)))
    .filter(group=>group.every(c=>eligible.includes(c)));
  const constraints=policy(chords,eligible,profile);
  for(const group of chords){
    if(group.length===3&&middleFingers(group,profile).includes(2)&&
      !group[1].ids.some(id=>manual[id]!=null))constraints.domains.set(group[1].id,[2]);
  }
  const map={}, attempts={}, exceptions=[], unresolved=[], witnesses={};
  for(const hand of ['L','R']){
    const local=eligible.filter(c=>c.hand===hand);
    const config={constraints,events,locks:manual,budget};
    const exact=solveHand(local,input.map??{},configuration,{...config,hardPosition:true,hardDifferent:true});
    let chosen=exact;
    if(exact.status==='infeasible')chosen=solveHand(local,input.map??{},configuration,config);
    attempts[hand]={status:chosen.status,visited:chosen.visited+ (chosen===exact?0:exact.visited),cost:chosen.cost,blockedAt:chosen.blockedAt,contacts:chosen.contacts};
    if(chosen.status!=='exact')continue;
    // Compare complete continuations before accepting a trade-off in the joint filter.
    if(exact.status==='infeasible'&&chosen.cost[0]&&chosen.cost[1]){
      const positionPath=solveHand(local,input.map??{},configuration,{...config,hardPosition:true});
      const differentPath=solveHand(local,input.map??{},configuration,{...config,hardDifferent:true});
      if(positionPath.status==='exact'&&differentPath.status==='exact'){
        witnesses[hand]={position:positionPath.map,different:differentPath.map};
        attempts[hand].status='joint_priority_conflict';
        continue;
      }
      if(positionPath.status==='budget'||differentPath.status==='budget'){
        attempts[hand].status='budget';
        continue;
      }
      if(positionPath.status==='exact')chosen=positionPath;
      if(differentPath.status==='exact')chosen=differentPath;
      attempts[hand].cost=chosen.cost;
      attempts[hand].visited+=positionPath.visited+differentPath.visited;
    }
    const localExceptions=[];
    for(const [a,b] of chosen.sequence){
      if(chosen.map[a.id]!==chosen.map[b.id])continue;
      const alternative=proveRepeats?solveHand(local,input.map??{},configuration,{...config,avoid:[a.id,b.id]}):{status:'unchecked'};
      if(alternative.status==='infeasible'){
        localExceptions.push({id:'E07',from:a.id,to:b.id,status:'infeasible'});
      }else{
        unresolved.push({from:a.id,to:b.id,hand,reason:alternative.status,alternatives:alternative.map});
      }
    }
    if(unresolved.some(item=>item.hand===hand)){
      witnesses[hand]={candidate:chosen.map};
      attempts[hand].status='unproven_repeat';
      continue;
    }
    Object.assign(map,chosen.map);
    exceptions.push(...localExceptions);
  }
  const assignments=Object.fromEntries(Object.keys(events).map(id=>[id,{
    finger:manual[id]??null,status:manual[id]!=null?'manual':'unassigned',movement:'unknown',sounding:'unknown'
  }]));
  for(const c of eligible)if(map[c.id]!=null)
    for(const id of c.ids)assignments[id]={finger:map[c.id],status:manual[id]!=null?'manual':'assigned',movement:'unknown',sounding:'unknown'};
  for(const p of special)for(const [id,finger] of Object.entries(p.assignments))
    assignments[id]={finger,status:manual[id]!=null?'manual':'assigned',movement:'unknown',sounding:'unknown'};
  const positions=['L','R'].flatMap(hand=>{
    let held=[];
    return groupLayers(eligible.filter(c=>c.hand===hand&&map[c.id]!=null)).map(layer=>{
      held=held.filter(c=>new E.Q(c.end).cmp(layer[0].start)>0);
      const retained=held.map(c=>c.id);
      held.push(...layer);
      return {at:layer[0].start,hand,ids:layer.map(c=>c.id),retained,
        center:position(layer,map,profile),geometry:'normalized_key_centres',
        comfort:commonPosition(held,map,profile),physical:'unknown'};
    });
  });
  const result={score:structuredClone(score),events:structuredClone(events),contacts,holds:contacts.map(({id,start,end})=>({id,start,end})),positions,
    executionGroups:describeGroups(eligible.filter(c=>map[c.id]!=null),events,positions),
    phraseCandidates:input.phraseCandidates??[],motifCandidates:input.motifCandidates??[],
    manual,map,assignments,attempts,special,exceptions,unresolved,witnesses,resets:input.resets??[],
    rejected:reject, releases:input.releases??[]};
  const verificationStart=performance.now();
  result.validation=verify(input,result,{budget});
  result.verificationMs=performance.now()-verificationStart;
  const byEvent=new Map(contacts.flatMap(c=>c.ids.map(id=>[id,c])));
  const positionByContact=new Map(positions.flatMap(p=>p.ids.map(id=>[id,p])));
  const alternativeCache=new Map();
  result.why=function why(id){
    if(!Object.hasOwn(assignments,id))return null;
    const contact=byEvent.get(id);
    const hand=contact?.hand??events[id].hand;
    const technique=special.find(p=>Object.hasOwn(p.assignments,id));
    const alternatives=[];
    if(contact&&map[contact.id]!=null){
      if(!alternativeCache.has(contact.id)){
        const local=eligible.filter(c=>c.hand===hand);
        const paths=[];
        for(const finger of [1,2,3,4,5]){
          if(finger===map[contact.id])continue;
          const trial=solveHand(local,input.map??{},configuration,{
            constraints,events,locks:manual,budget,force:{[contact.id]:finger}
          });
          paths.push({finger,status:trial.status,cost:trial.cost,
            reason:trial.status==='exact'?'compare_complete_path_with_selected':trial.status});
        }
        alternativeCache.set(contact.id,paths);
      }
      alternatives.push(...alternativeCache.get(contact.id));
    }
    return {assignment:assignments[id],contact:contact?.id??null,
      rules:technique?['R01','R07','R24','R29','R30']:['R01','R02','R04','R07','R22','R45'],
      position:positionByContact.get(contact?.id)??technique?.diagnostic.positions??null,
      rejected:result.rejected.filter(r=>r.contact===contact?.id),
      exceptions:exceptions.filter(r=>r.to===contact?.id||r.from===contact?.id),
      alternatives:[...alternatives,...unresolved.filter(r=>r.to===contact?.id||r.from===contact?.id)],
      search:attempts[hand]?.status??'unknown',physical:'unknown',sounding:'unknown'};
  };
  return result;
}

function releaseCandidates(input,result){
  const candidates=[];
  for(const attempt of Object.values(result.attempts)){
    if(attempt.status!=='infeasible'||!attempt.contacts)continue;
    const boundary=attempt.blockedAt;
    const present=new Set(attempt.contacts.map(c=>c.id));
    for(const c of input.contacts){
      if(!present.has(c.id)||new E.Q(c.start).cmp(boundary)>=0||
        new E.Q(c.end).cmp(boundary)<=0||c.fermata||c.arpeggio||
        c.ids.some(id=>input.manual?.[id]!=null||input.events[id]?.ties?.length))continue;
      candidates.push({id:c.id,from:c.end,to:boundary,rule:'E03',movement:'unknown',sounding:'unknown'});
    }
  }
  // Try co-releases at the same boundary. Testing only single releases
  // would hide the jointly feasible continuation of the group.
  const byBoundary=new Map();
  for(const candidate of candidates){
    const key=candidate.to;
    if(!byBoundary.has(key))byBoundary.set(key,[]);
    byBoundary.get(key).push(candidate);
  }
  return [...byBoundary.values()].flatMap(group=>{
    let subsets=[[]];
    for(const entry of group)subsets=[...subsets,...subsets.map(set=>[...set,entry])];
    return subsets.slice(1);
  });
}

function applyRelease(input,release){
  return {...input,releases:[...(input.releases??[]),release],
    contacts:input.contacts.map(c=>c.id===release.id?{...c,end:release.to,releaseBasis:'E03'}:c)};
}

function run(input,options={}){
  const literal=evaluate(input,options);
  if(!Object.values(literal.attempts).some(a=>a.status==='infeasible'))return literal;
  // Best-first over contact edits. A branch is expanded only at its witnessed
  // first hard failure, and an exhausted search never authorizes a release.
  const limit=options.releaseBudget??160;
  const queue=[{input,result:literal}];
  const seen=new Set();
  let explored=0;
  let best=null;
  let incomplete=false;
  while(queue.length&&explored<limit){
    const current=queue.shift();
    const depth=current.input.releases?.length??0;
    if(Object.values(current.result.attempts).some(a=>a.status==='budget'))incomplete=true;
    if(Object.values(current.result.attempts).every(a=>a.status==='exact')&&current.result.validation.ok){
      const score=Object.values(current.result.attempts).reduce((sum,a)=>sum.map((n,i)=>n+a.cost[i]),
        Array(8).fill(0));
      const rank=[...score.slice(0,4),depth,...score.slice(4)];
      if(!best||compareCost(rank,best.rank)<0)best={...current,rank};
      continue;
    }
    for(const release of releaseCandidates(current.input,current.result)){
      if(explored>=limit){incomplete=true;break;}
      const revised=release.reduce(applyRelease,current.input);
      const key=JSON.stringify(revised.releases.map(r=>[r.id,r.to]).sort());
      if(seen.has(key))continue;
      seen.add(key);
      explored++;
      queue.push({input:revised,result:evaluate(revised,options)});
    }
  }
  if(incomplete||queue.length||!best){
    literal.releaseSearch={status:incomplete||queue.length?'budget':'no_plan',explored};
    return literal;
  }
  const affectedHands=new Set(best.result.releases.map(r=>input.contacts.find(c=>c.id===r.id).hand));
  const excluded=new Set([...best.result.special.flatMap(p=>p.contacts),...literal.rejected.map(r=>r.contact)]);
  const witnesses=[...affectedHands].map(hand=>({hand,...certify(input,
    input.contacts.filter(c=>c.hand===hand&&!excluded.has(c.id)),{budget:options.budget})}));
  if(witnesses.some(w=>w.status!=='infeasible')){
    literal.releaseSearch={status:'unproven_original_failure',explored,witnesses};
    return literal;
  }
  const necessity=[];
  for(const [index,release] of best.result.releases.entries()){
    const retained=best.result.releases.filter((_,i)=>i!==index);
    const trial=evaluate(retained.reduce(applyRelease,input),options);
    const attempts=Object.values(trial.attempts);
    const status=attempts.some(a=>a.status==='budget')?'budget':
      attempts.some(a=>a.status==='infeasible')?'infeasible':
      attempts.every(a=>a.status==='exact')&&trial.validation.ok?'exact':'unproven';
    const rank=status==='exact'?attempts.reduce((sum,a)=>sum.map((n,i)=>n+a.cost[i]),[0,0,0,0]):null;
    if(status==='budget'||status==='unproven'||rank&&compareCost(rank,best.rank.slice(0,4))<=0){
      literal.releaseSearch={status:'release_necessity_unproven',explored,release:release.id};
      return literal;
    }
    necessity.push({id:release.id,status,rank});
  }
  best.result.releaseSearch={status:'complete',explored,witnesses,necessity};
  return best.result;
}
module.exports={run,snapshot};
