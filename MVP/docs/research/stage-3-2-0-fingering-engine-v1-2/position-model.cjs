'use strict';

const {keyX}=require('../../../editor/core');

// Difference constraints over the five finger coordinates and a fixed origin.
// Unplayed fingers are variables, not inferred independent pair positions.
function commonPosition(contacts, fingering, profile){
  if(!contacts.length)return null;
  const direction=contacts[0].hand==='L'?-1:1;
  const fixed=new Map(), layout=[];
  for(const c of contacts){
    const f=fingering[c.id], x=direction*c.key;
    if(!Number.isInteger(f)||f<1||f>5||c.hand!==contacts[0].hand)return null;
    if(fixed.has(f)&&fixed.get(f)!==x)return null;
    fixed.set(f,x);
    layout.push({id:c.id,finger:f,x:keyX(c.key,profile)});
  }
  const upper=Array.from({length:6},(_,i)=>Array.from({length:6},(_,j)=>i===j?0:Infinity));
  for(let a=1;a<=5;a++)for(let b=a+1;b<=5;b++){
    const limit=profile.comfortSpan[a+'-'+b];
    if(!Number.isFinite(limit)||limit<0)return null;
    upper[a][b]=limit;
    upper[b][a]=0;
  }
  for(const [f,x] of fixed){upper[0][f]=x;upper[f][0]=-x;}
  for(let k=0;k<6;k++)for(let i=0;i<6;i++)for(let j=0;j<6;j++)
    upper[i][j]=Math.min(upper[i][j],upper[i][k]+upper[k][j]);
  if(upper.some((row,i)=>row[i]<0))return null;
  return {fingerCoordinates:upper[0].slice(1).map(x=>direction*x),layout,
    basis:'directed_comfort_span',physical:'unknown'};
}

module.exports={commonPosition};
