'use strict';

const {Q}=require('../../../editor/core');
const {groupLayers}=require('./search.cjs');
const cmp=(a,b)=>new Q(a).cmp(b);

function describeGroups(contacts,events,positions){
  const positionByAttack=new Map(positions.map(p=>[p.hand+':'+new Q(p.at).toString(),p]));
  return ['L','R'].flatMap(hand=>{
    const layers=groupLayers(contacts.filter(c=>c.hand===hand));
    const result=[];
    let held=[], group=null;
    for(const layer of layers){
      const at=layer[0].start;
      const continued=held.filter(c=>cmp(c.end,at)>0);
      const gap=held.length>0&&held.every(c=>cmp(c.end,at)<0);
      const position=positionByAttack.get(hand+':'+new Q(at).toString())??null;
      if(!group||gap){
        group={hand,start:at,end:at,entry:position,exit:position,attacks:[],turns:[],
          stepwise:[],arpeggios:[],voiceHolds:[],voiceLines:{},boundary:gap?'notated_contact_gap':'start'};
        result.push(group);
      }
      const voices=ids=>[...new Set(ids.flatMap(c=>c.ids.map(id=>events[id]?.voice)).filter(v=>v!=null))];
      const previous=group.attacks.at(-1);
      const key=layer.length===1?layer[0].key:null;
      const currentVoices=voices(layer);
      const priorStep=group.stepwise.at(-1);
      if(key!=null&&previous?.key!=null&&currentVoices.some(v=>previous.voices.includes(v))){
        const delta=key-previous.key;
        if(delta&&Math.abs(delta)<=2){
          group.stepwise.push({from:previous.at,to:at,direction:Math.sign(delta)});
          if(priorStep?.to===previous.at&&priorStep.direction!==Math.sign(delta))
            group.turns.push({at:previous.at,from:priorStep.direction,to:Math.sign(delta)});
        }
      }
      const labels=[...new Set(layer.map(c=>c.arpeggio?.group).filter(x=>x!=null))];
      if(labels.length)group.arpeggios.push({at,labels});
      if(continued.length)group.voiceHolds.push({at,notes:continued.map(c=>c.id),voices:voices(continued)});
      for(const c of layer)for(const voice of voices([c])){
        if(!Object.hasOwn(group.voiceLines,voice))Object.defineProperty(group.voiceLines,voice,
          {value:[],enumerable:true});
        group.voiceLines[voice].push({at,key:c.key,contact:c.id});
      }
      group.attacks.push({at,key,voices:currentVoices,contacts:layer.map(c=>c.id)});
      group.exit=position;
      held=[...continued,...layer];
      group.end=held.reduce((max,c)=>cmp(max,c.end)<0?c.end:max,at);
    }
    return result;
  });
}

module.exports={describeGroups};
