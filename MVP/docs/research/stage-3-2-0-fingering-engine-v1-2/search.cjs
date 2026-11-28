'use strict';
const E=require('../../../editor/core');
const {Q}=E;
const cmp=(a,b)=>new Q(a).cmp(b);
const fingers=[1,2,3,4,5];
const black=key=>[1,3,6,8,10].includes(key%12);
function compareCost(a,b){
  const i=a.findIndex((value,index)=>value!==b[index]);
  return i<0?0:a[i]-b[i];
}
function positionChange(a,b,f,g){
  // Model a narrow position only on stepwise monophonic transitions.
  // No inference about an individual player's actual wrist is made.
  const delta=(b.key-a.key)*(a.hand==='L'?-1:1);
  const fingerDelta=g-f;
  return {reversed:delta*fingerDelta<0, nonadjacent:Math.abs(fingerDelta)!==1};
}

function groupLayers(contacts){
  const layers=[];
  for(const c of contacts.slice().sort((a,b)=>cmp(a.start,b.start)||a.key-b.key||a.id.localeCompare(b.id))){
    if(!layers.length||cmp(layers.at(-1)[0].start,c.start)!==0)layers.push([]);
    layers.at(-1).push(c);
  }
  return layers;
}

function transitions(previous,next,events){
  const voices=layer=>{
    const map=new Map();
    for(const c of layer)for(const voice of new Set(c.ids.map(id=>events[id]?.voice).filter(v=>v!=null))){
      if(!map.has(voice))map.set(voice,[]);
      map.get(voice).push(c);
    }
    return map;
  };
  if(previous.length===1&&next.length===1)return [[previous[0],next[0]]];
  const left=voices(previous), right=voices(next), result=new Map();
  for(const [voice,a] of left){
    const b=right.get(voice);
    if(a.length===1&&b?.length===1)result.set(JSON.stringify([a[0].id,b[0].id]),[a[0],b[0]]);
  }
  return [...result.values()];
}

function simultaneousPair(a,b,fa,fb,profile,chords){
  if(a.key===b.key||fa===fb)return false;
  const [low,high,f,g]=a.key<b.key?[a,b,fa,fb]:[b,a,fb,fa];
  const span=high.key-low.key;
  const directed=low.hand==='L'?f===5&&g===1:f===1&&g===5;
  if(profile.octaveFingers&&span===12&&!directed)return false;
  if(chords.get(low.id)&&chords.get(low.id)===chords.get(high.id)&&
    (low.hand==='L'?f<=g:f>=g))return false;
  const pair=f<g?f+'-'+g:g+'-'+f;
  return span<=profile.practicalSpan[pair]||directed&&span>profile.practicalSpan['1-5'];
}

function position(layer,map,p){
  return layer.reduce((sum,c)=>sum+E.keyX(c.key,p)-(c.hand==='R'?1:-1)*(map[c.id]-1)*100,0)/layer.length;
}

function solveHand(contacts,before,profile,{constraints,events={},locks={},excluded=new Set(),budget=3000000,avoid=null,hardPosition=false,hardDifferent=false,force={}}){
  const layers=groupLayers(contacts);
  let previous=[], held=[], states=new Map([['',{cost:[0,0,0,0,0,0,0,0],fingers:{},path:null}]]);
  const sequence=[];
  let visited=0;
  const pinned=c=>c.ids.some(id=>locks[id]!=null);
  for(const layer of layers){
    const continuing=held.filter(c=>cmp(c.end,layer[0].start)>0);
    const edges=transitions(previous,layer,events).filter(([a,b])=>a.key!==b.key&&
      !excluded.has(a.id)&&!excluded.has(b.id)&&!(pinned(a)&&pinned(b)));
    sequence.push(...edges);
    const next=new Map();
    for(const state of states.values()){
      const map=Object.fromEntries(continuing.map(c=>[c.id,state.fingers[c.id]]));
      const context=continuing.slice();
      function enumerate(index,expansions,excess,shape){
        if(index===layer.length){
          const repeated=edges.filter(([a,b])=>state.fingers[a.id]===map[b.id]);
          if(avoid&&repeated.some(([a,b])=>a.id===avoid[0]&&b.id===avoid[1]))return;
          if(hardDifferent&&repeated.length)return;
          const compact=previous.length===1&&layer.length===1&&continuing.length===0
            ?edges.filter(([a,b])=>Math.abs(a.key-b.key)<=2&&a.ids.some(id=>events[id]?.voice!=null&&
              b.ids.some(next=>events[next]?.voice===events[id].voice))):[];
          const movement=compact.map(([a,b])=>positionChange(a,b,state.fingers[a.id],map[b.id]));
          const reversal=movement.filter(m=>m.reversed).length;
          if(hardPosition&&reversal)return;
          const nonadjacent=movement.filter(m=>m.nonadjacent).length;
          const shortOnBlack=layer.filter(c=>!constraints.chords.has(c.id)&&!pinned(c)&&black(c.key)&&
            (map[c.id]===1||map[c.id]===5)).length;
          const shift=previous.length?Math.round(Math.abs(position(layer,map,profile)-position(previous,state.fingers,profile))):0;
          const local=[repeated.length,reversal,nonadjacent,shortOnBlack,expansions,excess,shift,
            shape+shift*profile.weights.positionShift+repeated.length*profile.weights.sameFingerMove];
          const cost=state.cost.map((v,i)=>v+local[i]);
          const key=context.map(c=>map[c.id]).join('');
          if(!next.has(key)||compareCost(cost,next.get(key).cost)<0)next.set(key,{
            cost,fingers:{...map},path:{prev:state.path,assigned:Object.fromEntries(layer.map(c=>[c.id,map[c.id]]))}
          });
          return;
        }
        const c=layer[index];
        const locked=[...new Set(c.ids.map(id=>locks[id]).filter(f=>f!=null))];
        const domain=constraints.domains.get(c.id)??fingers;
        for(const f of domain){
          if(++visited>budget)return;
          if(force[c.id]!=null&&force[c.id]!==f)continue;
          if(locked.length&&locked.some(g=>g!==f))continue;
          if(context.some(n=>!simultaneousPair(n,c,map[n.id],f,profile,constraints.chords)))continue;
          let plusCount=0, plusExcess=0, plusShape=0;
          for(const n of context){
            const g=map[n.id], pair=f<g?f+'-'+g:g+'-'+f;
            const span=Math.abs(n.key-c.key);
            const extra=Math.max(0,span-profile.comfortSpan[pair]);
            plusCount+=Number(extra>0);plusExcess+=extra;
            const dx=(E.keyX(c.key,profile)-E.keyX(n.key,profile))/100;
            plusShape+=Math.round(Math.abs(Math.abs(dx)-Math.abs(f-g))*10)*profile.weights.chordShape;
            if(dx*(f-g)*(c.hand==='L'?-1:1)<0)plusShape+=profile.weights.chordOrder;
          }
          if([1,3,6,8,10].includes(c.key%12))plusShape+=f===1?profile.weights.thumbBlack:f===5?profile.weights.pinkyBlack:0;
          map[c.id]=f;context.push(c);
          enumerate(index+1,expansions+plusCount,excess+plusExcess,shape+plusShape);
          context.pop();delete map[c.id];
          if(visited>budget)return;
        }
      }
      enumerate(0,0,0,0);
      if(visited>budget)return {status:'budget',visited};
    }
    if(!next.size)return {status:'infeasible',visited,blockedAt:layer[0].start,
      contacts:[...continuing,...layer].map(c=>({id:c.id,key:c.key,start:c.start,end:c.end}))};
    states=next; previous=layer; held=[...continuing,...layer];
  }
  const best=[...states.values()].reduce((a,b)=>compareCost(a.cost,b.cost)<=0?a:b);
  const path=[];for(let node=best.path;node;node=node.prev)path.push(node.assigned);
  const map=Object.assign({},...path.reverse());
  return {status:'exact',map,cost:best.cost,visited,sequence};
}


module.exports={solveHand,simultaneousPair,groupLayers,transitions,compareCost,position,positionChange};
