const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8772';
const launch=()=>chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox','--disable-gpu','--single-process','--in-process-gpu','--disable-software-rasterizer']});
async function setup(browser){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 return page;
}
(async()=>{
 const [out,...sources]=process.argv.slice(2);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'302-backup-'));
 const report=[];
 try{
  for(const [index,file] of sources.entries()){
   const ru=index===0;
   const prefix=(ru?'/ru':'')+'/MVP/';
   const stash=path.join(temp,'backup.json');
   let expected, browser=await launch();
   try{
    const p=await setup(browser);
    await p.goto(base+prefix+'import/');
    await p.waitForFunction(()=>document.getElementById('file')?.disabled===false);
    await p.locator('#file').setInputFiles(file);
    await p.locator('#save').click();
    await p.waitForURL('**/main/?composition=*');
    await p.waitForFunction(()=>window.play12MainController?.document?.run?.recovery?.additional);
    const sample=await p.evaluate(()=>{
      const doc=play12MainController.document;
      for(const item of doc.run.recovery.contacts){
       for(let f=1;f<=5;f++){
        if(f===item.finger)continue;
        const trial=Play12Editor.edit(doc,item.id,f);
        if(trial.accepted){
         const c=doc.run.contacts.find(c=>c.id===item.id);
         return {id:item.id,at:Number(new Play12Editor.Q(c.start)),before:item.finger,after:f};
        }
       }
      }
    });
    assert(sample);
    await p.locator('.main-melody').getByRole('button',{name:ru?'Редактировать':'Edit',exact:true}).click();
    await p.evaluate(at=>play12Playback.pauseImmediate(at),sample.at);
    const note=p.locator(`g[data-event-id="${sample.id}"]`).first();
    assert.equal(await note.getAttribute('data-finger'),String(sample.before));
    await note.press('Enter');
    await p.locator('#main-fingers').getByRole('button',{name:String(sample.after),exact:true}).click();
    assert.equal(await note.getAttribute('data-finger'),String(sample.after));
    await p.locator('#main-undo').click();
    assert.equal(await note.getAttribute('data-finger'),String(sample.before));
    await p.locator('#main-redo').click();
    assert.equal(await note.getAttribute('data-finger'),String(sample.after));
    await p.locator('#main-save').click();
    await p.waitForFunction(s=>Play12Editor.Store.get(new URL(location.href).searchParams.get('composition')).then(d=>d.manual[s.id]===s.after),sample);
    await p.reload();
    await p.waitForFunction(s=>window.play12MainController?.document?.manual[s.id]===s.after,sample);
    expected=await p.evaluate(()=>({assignments:play12MainController.document.run.assignments,manual:play12MainController.document.manual}));
    await p.locator('details summary').filter({hasText:ru?'Резервная копия':'Backup'}).click();
    const pending=p.waitForEvent('download');
    await p.getByRole('button',{name:ru?'Скачать копию':'Download backup'}).click();
    await (await pending).saveAs(stash);
   }finally{await browser.close();}
   browser=await launch();
   try{
    const p=await setup(browser);
    await p.goto(base+prefix+'main/');
    await p.locator('input[type=file][accept=".json"]').setInputFiles(stash);
    await p.locator('.main-melody').waitFor();
    await p.locator('.main-melody').getByRole('button',{name:ru?'Тренироваться':'Practise',exact:true}).click();
    await p.waitForFunction(()=>window.play12MainController?.document?.run?.recovery?.additional);
    const actual=await p.evaluate(()=>({assignments:play12MainController.document.run.assignments,manual:play12MainController.document.manual}));
    assert.deepEqual(actual,expected);
   }finally{await browser.close();}
   report.push({locale:ru?'ru':'en',recoveredBlock:true,edit:true,undo:true,redo:true,reopened:true,backupRestored:true});
  }
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
