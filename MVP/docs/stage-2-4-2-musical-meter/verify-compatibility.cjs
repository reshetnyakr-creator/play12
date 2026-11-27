'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8828';

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu','--single-process','--no-zygote']});
 try{
  const page=await browser.newPage();
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/MVP/import/');
  await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
  await page.locator('#file').setInputFiles(path.join(__dirname,'fixtures/M08.musicxml'));
  await page.locator('#save').click();
  await page.waitForFunction(()=>window.play12MainController?.document);
  const result=await page.evaluate(async()=>{
   const E=Play12Editor,doc=E.clone(play12MainController.document);
   delete doc.score.editor.metricMap;
   for(const r of doc.score.editor.rounds){delete r.startQ;delete r.endQ;}
   const id=E.events(doc.score)[0].id;
   doc.manual[id]=3;
   doc.title='Saved manual edit';
   const before=JSON.stringify(doc);
   const effective=E.effective(doc);
   const unchanged=JSON.stringify(doc)===before;
   const noSource=E.clone(doc);delete noSource.source;
   const changed=E.clone(doc);changed.score.editor.rounds[0].end++;
   const preserve=E.effective(changed);
   const fallback=E.effective(noSource);
   await E.Store.put(doc);
   const persist=await E.Store.get(doc.id);
   const backup=await Play12MainData.backup();
   await Play12MainData.remove(doc.id);
   await Play12MainData.restore(backup);
   const restored=await E.Store.get(doc.id);
   return {unchanged,storedUnchanged:before===JSON.stringify(persist),restoredUnchanged:before===JSON.stringify(restored),
      count:effective.editor.metricMap?.rounds[0]?.counts.length,manual:E.events(effective)[0].method.finger,
      missingSourceFallback:!fallback.editor.metricMap,changedTimingFallback:!preserve.editor.metricMap,
      changedTimingKept:preserve.editor.rounds[0].end===changed.score.editor.rounds[0].end};
  });
  assert.deepEqual(result,{unchanged:true,storedUnchanged:true,restoredUnchanged:true,count:4,manual:3,missingSourceFallback:true,changedTimingFallback:true,changedTimingKept:true});
  await page.reload();
  await page.waitForFunction(()=>window.play12MainController?.document);
  assert.equal(await page.locator('#tempo-metronome').evaluate(b=>b.firstChild.textContent),'63');
  const oldId=await page.evaluate(async()=>{
   const E=Play12Editor,old=E.clone(play12MainController.document);
   old.score.editor.tempoMap[0].bpm=90;
   await E.Store.put(old);
   return old.id;
  });
  await page.goto(base+'/MVP/import/');
  await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
  await page.locator('#file').setInputFiles(path.join(__dirname,'fixtures/M08.musicxml'));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#save').click();
  await page.waitForFunction(id=>window.play12MainController?.document&&play12MainController.document.id!==id,oldId);
  result.reimportKeepsPrevious=await page.evaluate(async(id)=>{
   const old=await Play12Editor.Store.get(id),next=play12MainController.document;
   return old.score.editor.tempoMap[0].bpm===90&&old.title==='Saved manual edit'&&
    Object.values(old.manual).includes(3)&&next.parentId===id&&next.score.editor.tempoMap[0].bpm===94.5;
  },oldId);
  assert(result.reimportKeepsPrevious);
  fs.writeFileSync(path.join(__dirname,'compatibility-results.json'),JSON.stringify(result,null,2)+'\n');
  console.log('Existing document, manual fingering, Backup/Restore and fallback verified');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
