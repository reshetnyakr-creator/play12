'use strict';
const {simultaneousPair}=require('./priority.cjs');

function positionFits(notes,fingers,profile){
  return notes.every((a,i)=>notes.slice(i+1).every((b,j)=>
    simultaneousPair(a,b,fingers[i],fingers[i+j+1],profile,new Map()) &&
    Math.abs(a.key-b.key)<=profile.practicalSpan[[fingers[i],fingers[i+j+1]].sort((a,b)=>a-b).join('-')]));
}

function specialPositions(notes,profile,locks={}){
  const keys=notes.slice().sort((a,b)=>a.key-b.key);
  if(keys.length!==3||new Set(keys.map(c=>c.key)).size!==3||keys.some(c=>c.hand!==keys[0].hand))return null;
  for(const middle of [2,3,4]){
    const fingers=keys[0].hand==='L'?[5,middle,1]:[1,middle,5];
    if(keys.some((c,i)=>c.ids.some(id=>locks[id]!=null&&locks[id]!==fingers[i])))continue;
    const options=[];
    for(let split=1;split<keys.length;split++){
      const groups=[keys.slice(0,split),keys.slice(split)];
      const mapped=[fingers.slice(0,split),fingers.slice(split)];
      if(groups.every((group,i)=>positionFits(group,mapped[i],profile)))options.push({groups,mapped});
    }
    if(positionFits(keys,fingers,profile))continue;
    // Keeping longer contiguous groups is preferred over extra shifts. The
    // partition describes occupancy only; no strike order or timing is emitted.
    const choice=options[0]??{groups:keys.map(c=>[c]),mapped:fingers.map(f=>[f])};
    return {status:'assigned',fingers,assignments:Object.fromEntries(keys.flatMap((c,i)=>c.ids.map(id=>[id,fingers[i]]))),
      diagnostic:{technique:'sequential_execution_with_hand_shift',hand:keys[0].hand,
        simultaneous:'rejected',physical:'unknown',sounding:'unknown',schedule:null,
        positions:choice.groups.map((group,i)=>({events:group.map(c=>c.ids),midi:group.map(c=>c.key),fingers:choice.mapped[i]}))}};
  }
  return null;
}
module.exports={positionFits,specialPositions};
