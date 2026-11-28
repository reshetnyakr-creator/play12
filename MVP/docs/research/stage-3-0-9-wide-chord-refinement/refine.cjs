'use strict';
const E=require('../../../editor/core');
const {components,findChords,policy,middleFingers}=require('../stage-3-0-7-wide-chord-fingering/chord-experiment.cjs');
const {planTarget,movement}=require('../stage-3-0-8-contact-release-and-hand-shift/release-experiment.cjs');
const {Q}=E;
const cmp=(a,b)=>new Q(a).cmp(b);

function pairs(group,map,profile){
  return group.flatMap((low,i)=>group.slice(i+1).map(high=>{
    const fingers=[map[low.id],map[high.id]];
    const pair=fingers.slice().sort((a,b)=>a-b).join('-');
    const distance=high.key-low.key;
    const comfort=profile.comfortSpan[pair],practical=profile.practicalSpan[pair];
    return {ids:[low.id,high.id],fingers,distance,comfort,practical,
      aboveComfort:Math.max(0,distance-comfort),abovePractical:Math.max(0,distance-practical)};
  }));
}

function rescore(score,baseline,targetId,options={}){
  const target=baseline.contacts.find(c=>c.ids.includes(targetId));
  const group=findChords(score,baseline.contacts,baseline.profile).find(g=>g.includes(target));
  const config={...options,refinedChords:true};
  if(group?.length!==3)return planTarget(score,baseline,targetId,config);
  const domain=middleFingers(group,baseline.profile);
  const prescribed=options.referenceFingers?.[group[1].id];
  for(const f of domain.filter(f=>prescribed==null||prescribed===f)){
    const referenceFingers={...options.referenceFingers,[group[1].id]:f};
    const initial=planTarget(score,baseline,targetId,{...config,referenceFingers});
    if(initial.status==='budget')return initial;
    if(!initial.map)continue;
    if(options.referenceFingers || initial.status==='assigned_without_release')return initial;
    return improveSuffix(score,baseline,targetId,{...config,referenceFingers},group,initial);
  }
  return {status:'no_refined_assignment'};
}

function improveSuffix(score,baseline,targetId,options,group,initial){
  const local=components(baseline.contacts,group[0]);
  const suffix=local.filter(c=>c.hand===group[0].hand&&cmp(c.start,group[0].start)>0)
    .sort((a,b)=>cmp(a.start,b.start));
  if(!suffix.length || suffix.some((c,i)=>i&&cmp(suffix[i-1].end,c.start)>0))return initial;
  // Existing position and re-use costs, evaluated only on this detached melodic group.
  const cost=map=>movement(suffix,map,baseline.profile)+suffix.slice(1).reduce((sum,c,i)=>
    sum+(map[c.id]===map[suffix[i].id]&&c.key!==suffix[i].key?baseline.profile.weights.sameFingerMove:0),0);
  const repeats=map=>suffix.slice(1).filter((c,i)=>c.key!==suffix[i].key&&map[c.id]===map[suffix[i].id]).length;
  let best=initial;
  const alternatives=[];
  if(5**suffix.length>baseline.profile.search.maxCandidatesPerLayer)return initial;
  const prefix=options.referenceFingers;
  function enumerate(index,fingers){
    if(index===suffix.length){
      const trial=planTarget(score,baseline,targetId,{...options,referenceFingers:{...prefix,...fingers}});
      if(!trial.map)return;
      if(options.sequenceAudit)alternatives.push({fingers:suffix.map(c=>trial.map[c.id]),repeats:repeats(trial.map),
        cost:cost(trial.map),releases:trial.releases.length,shortening:trial.shortening.toString(),
        releasePlan:trial.releases.map(r=>({id:r.id,end:r.end}))});
      const order=(options.sequenceAudit?repeats(trial.map)-repeats(best.map):0) || cost(trial.map)-cost(best.map) || trial.releases.length-best.releases.length ||
        cmp(trial.shortening,best.shortening) || trial.changed-best.changed || trial.movement-best.movement;
      if(order<0)best=trial;
      return;
    }
    for(let f=1;f<=5;f++)enumerate(index+1,{...fingers,[suffix[index].id]:f});
  }
  enumerate(0,{});
  return options.sequenceAudit?{...best,alternatives}:best;
}

// Conditional assignments intentionally have no contact plan and are never
// included in the simultaneous-contact map or validated as physical attacks.
function conditional(score,baseline,targetId,options={}){
  const proof=planTarget(score,baseline,targetId,{...options,refinedChords:true});
  if(proof.status!=='no_compatible_release')return null;
  const target=baseline.contacts.find(c=>c.ids.includes(targetId));
  const events=E.events(score).filter(e=>e.hand===target.hand&&e.pitch&&!e.grace&&
    !e.ties?.includes('stop')&&e.editor_onset_q!=null&&cmp(e.editor_onset_q,target.start)===0);
  const group=[...new Set(events.map(e=>baseline.contacts.find(c=>c.ids.includes(e.id))))];
  if(group.length<3||group.length>5||group.some(c=>!c||c.hand!==target.hand||cmp(c.start,target.start)!==0)||
    !group.includes(target)||new Set(group.map(c=>c.key)).size!==group.length)return null;
  group.sort((a,b)=>a.key-b.key);
  const {locks={},frozen=[]}=options;
  const protectedFingers={...locks};
  for(const id of frozen)if(baseline.assignments[id]!=null)protectedFingers[id]=baseline.assignments[id];
  const ordinary=simultaneousProof(score,baseline,group,protectedFingers);
  if(ordinary!=='no_compatible_assignment')return null;
  const direction=target.hand==='L'?[5,4,3,2,1]:[1,2,3,4,5];
  const middle=[2,3,4].map(f=>target.hand==='L'?[5,f,1]:[1,f,5]);
  const combinations=[];
  function collect(index,left,chosen){
    if(!left){combinations.push(chosen);return;}
    for(let i=index;i<=direction.length-left;i++)collect(i+1,left-1,[...chosen,direction[i]]);
  }
  collect(0,group.length,[]);
  const candidates=(group.length===3?[...middle,...combinations]:combinations)
    .filter(fingers=>group.every((c,i)=>c.ids.every(id=>protectedFingers[id]==null||protectedFingers[id]===fingers[i])));
  if(!candidates.length)return null;
  // Preferred three-note form precedes alternatives. At the same priority
  // retain more existing fingers before choosing a different shape.
  const priority=f=>group.length===3&&f.every((x,i)=>x===middle[0][i])?0:1;
  const changes=f=>group.filter((c,i)=>baseline.contactAssignments[c.id]!=null&&baseline.contactAssignments[c.id]!==f[i]).length;
  candidates.sort((a,b)=>priority(a)-priority(b)||changes(a)-changes(b));
  const fingers=candidates[0];
  const map=Object.fromEntries(group.map((c,i)=>[c.id,fingers[i]]));
  return {category:'requires_sequential_execution',eventIds:group.map(c=>c.ids),hand:target.hand,start:target.start,
    midi:group.map(c=>c.key),fingers,pairs:pairs(group,map,baseline.profile),
    ordinaryProof:ordinary,reason:'simultaneous_assignment_infeasible',releaseRequired:'unknown',handShiftRequired:true,
    sequentialRequired:true,simultaneous:'rejected',physical:'unknown',sounding:'unknown',schedule:null,
    assignments:Object.fromEntries(group.flatMap((c,i)=>c.ids.map(id=>[id,fingers[i]])))};
}
function simultaneousProof(score,baseline,contacts,locks){
  const wide=findChords(score,contacts,baseline.profile);
  const scoped=policy(wide,contacts,baseline.profile);
  const identities=contacts.flatMap(c=>c.ids);
  const run={...baseline,contacts,contactAssignments:{},
    assignments:Object.fromEntries(identities.map(id=>[id,null])),
    assigned:0,total:identities.length,elapsed_ms:0};
  const result=E.recoverPartial(score,run,locks,Date.now,{wideIntervals:true,refinedChords:true,
    ...scoped,required:new Set(contacts.map(c=>c.id))});
  return result.recovery?.status;
}
module.exports={rescore,conditional,pairs,simultaneousProof};
