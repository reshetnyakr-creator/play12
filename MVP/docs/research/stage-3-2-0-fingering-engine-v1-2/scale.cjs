'use strict';
const {performance}=require('node:perf_hooks');
const {run}=require('./engine.cjs');
const profile=require('../../../editor/beginner.json');
const rows=[];
for(const size of [100,1000,5000,10000]){
  const contacts=[],events={};
  for(let i=0;i<size;i++){
    const id='n'+i,key=[60,62,64,65,67,65,64,62][i%8];
    events[id]={id,key,hand:'R',voice:'1'};
    contacts.push({id,ids:[id],hand:'R',key,start:String(i),end:String(i+1)});
  }
  const before=performance.now();
  const result=run({score:{title:'repeated_synthetic_scale'},events,contacts,manual:{},profile});
  rows.push({size,ms:performance.now()-before,heapMiB:process.memoryUsage().heapUsed/1024**2,
    assigned:Object.values(result.assignments).filter(a=>a.finger!=null).length,
    visited:result.attempts.R.visited,status:result.attempts.R.status,verified:result.validation.ok});
}
console.log(JSON.stringify({node:process.version,rows},null,2));
