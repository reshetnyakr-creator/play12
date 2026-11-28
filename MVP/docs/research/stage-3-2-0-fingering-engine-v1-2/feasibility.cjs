'use strict';
const {Q}=require('../../../editor/core');
const {policy,middleFingers}=require('../stage-3-0-7-wide-chord-fingering/chord-experiment.cjs');

const compare=(a,b)=>new Q(a).cmp(b);
const fingerDomain=[1,2,3,4,5];

function pairAllowed(a,fa,b,fb,profile,groups){
  if(a.key===b.key||fa===fb)return false;
  const [low,high,f,g]=a.key<b.key?[a,b,fa,fb]:[b,a,fb,fa];
  const directed=low.hand==='L'?f===5&&g===1:f===1&&g===5;
  const distance=high.key-low.key;
  if(profile.octaveFingers&&distance===12&&!directed)return false;
  if(groups.has(low.id)&&groups.get(low.id)===groups.get(high.id)&&
    (low.hand==='L'?f<=g:f>=g))return false;
  const pair=[f,g].sort((x,y)=>x-y).join('-');
  return distance<=profile.practicalSpan[pair]||directed&&distance>profile.practicalSpan['1-5'];
}

// Feasibility only. There is no objective, candidate ranking or call into search.cjs.
function certify(source,contacts,{avoid,budget=3_000_000}={}){
  const {profile,manual={}}=source;
  const byId=new Map(contacts.map(c=>[c.id,c]));
  const groups=(source.chords??[]).filter(ids=>ids.every(id=>byId.has(id)))
    .map(ids=>ids.map(id=>byId.get(id)));
  const scoped=policy(groups,contacts,profile);
  for(const group of groups)if(group.length===3&&middleFingers(group,profile).includes(2)&&
    !group[1].ids.some(id=>manual[id]!=null))scoped.domains.set(group[1].id,[2]);
  const layers=[];
  for(const c of [...contacts].sort((a,b)=>compare(a.start,b.start)||a.id.localeCompare(b.id))){
    if(!layers.length||compare(layers.at(-1)[0].start,c.start)!==0)layers.push([]);
    layers.at(-1).push(c);
  }
  let frontier=[{}], active=[], visited=0;
  for(const layer of layers){
    const held=active.filter(c=>compare(c.end,layer[0].start)>0);
    const members=[...held,...layer];
    const next=new Map();
    for(const state of frontier){
      const map=Object.fromEntries(held.map(c=>[c.id,state[c.id]]));
      function enumerate(i){
        if(i===layer.length){
          const memory={...map};
          if(avoid&&state[avoid.from]!=null&&compare(byId.get(avoid.to).start,layer[0].start)>0)
            memory[avoid.from]=state[avoid.from];
          if(avoid&&map[avoid.to]!=null&&state[avoid.from]===map[avoid.to])return;
          const key=JSON.stringify(memory);
          if(!next.has(key))next.set(key,memory);
          return;
        }
        const note=layer[i];
        const domain=scoped.domains.get(note.id)??fingerDomain;
        for(const finger of domain){
          if(++visited>budget)return;
          if(note.ids.some(id=>manual[id]!=null&&manual[id]!==finger))continue;
          if(members.slice(0,held.length+i).some(c=>!pairAllowed(c,map[c.id],note,finger,profile,scoped.chords)))continue;
          map[note.id]=finger;
          enumerate(i+1);
          delete map[note.id];
          if(visited>budget)return;
        }
      }
      enumerate(0);
      if(visited>budget)return {status:'budget',visited};
    }
    if(!next.size)return {status:'infeasible',visited,blockedAt:layer[0].start};
    active=members;
    frontier=[...next.values()];
  }
  return {status:'feasible',visited};
}
module.exports={certify};
