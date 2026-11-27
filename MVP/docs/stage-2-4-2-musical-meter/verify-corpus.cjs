'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8834';
const baseline='80480363bcca37ee10fb8130a673cd729634c10c';

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu','--single-process','--no-zygote']});
 try{
  const page=await browser.newPage();
  await page.goto(base+'/MVP/import/');
  await page.waitForFunction(()=>window.Play12Editor);
  await page.evaluate(()=>window.stage242Editor=Play12Editor);
  await page.addScriptTag({content:execFileSync('git',['show',baseline+':MVP/editor/core.js'],{encoding:'utf8'})});
  await page.evaluate(()=>{window.baselineEditor=Play12Editor;window.Play12Editor=stage242Editor;});
  const results=[];
  for(const file of process.argv.slice(2)){
   const name=path.basename(file),buffer=fs.readFileSync(file).toString('base64');
   const result=await page.evaluate(async({name,buffer})=>{
    const bytes=Uint8Array.from(atob(buffer),c=>c.charCodeAt(0));
    const xml=name.endsWith('.mxl')?await Play12MXL.read(new File([bytes],name)):new TextDecoder().decode(bytes);
    const hands={};
    for(const part of stage242Editor.parseMusicXML(xml).documentElement.querySelectorAll('part')){
     const id=part.getAttribute('id');hands[id]='R';
     for(const staff of part.querySelectorAll('note > staff'))hands[id+':'+staff.textContent.trim()]=staff.textContent.trim()==='2'?'L':'R';
    }
    const old=baselineEditor.importXML(xml,hands);
    const score=stage242Editor.importXML(xml,hands);
    const key=e=>[e.id,e.editor_onset_q,e.duration_quarters,e.pitch?.midi,e.hand];
    const before=baselineEditor.events(old),after=stage242Editor.events(score);
    const contactsBefore=baselineEditor.contacts(old).contacts;
    const contactsAfter=stage242Editor.contacts(score).contacts;
    const config=await fetch('/MVP/editor/beginner.json').then(r=>r.json());
    const run=await new Promise(resolve=>{
     const worker=new Worker('/MVP/editor/worker.js?v=stage242');
     const timeout=setTimeout(()=>{worker.terminate();resolve({error:'timeout'});},25000);
     worker.onmessage=({data})=>{clearTimeout(timeout);worker.terminate();resolve(data.error?{error:data.error}:{assigned:data.run.assigned,total:data.run.total,status:data.run.search_status,elapsedMs:data.run.elapsed_ms});};
     worker.onerror=e=>{clearTimeout(timeout);worker.terminate();resolve({error:e.message});};
     worker.postMessage({score,config,locks:{}});
    });
    return {name,noteCount:after.length,stableEvents:JSON.stringify(before.map(key))===JSON.stringify(after.map(key)),
     stableContacts:JSON.stringify(contactsBefore.map(c=>[c.id,c.start,c.end,c.key]))===JSON.stringify(contactsAfter.map(c=>[c.id,c.start,c.end,c.key])),
     oldQ:old.editor.total_quarters,newQ:score.editor.total_quarters,run};
   },{name,buffer});
   assert(result.stableEvents,name);assert(!result.run.error,name);
   console.log(result);
   results.push(result);
  }
  assert.equal(results.length,7);
  fs.writeFileSync(path.join(__dirname,'corpus-results.json'),JSON.stringify(results,null,2)+'\n');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
