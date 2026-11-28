const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

async function check(page, file){
  await page.goto('http://127.0.0.1:8768/MVP/import/');
  await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
  await page.locator('#file').setInputFiles(file);
  await page.locator('#save').click();
  await page.waitForURL('**/main/?composition=*');
  await page.waitForFunction(()=>window.play12MainController?.document&&document.querySelector('.main-melody'));
  await page.locator('.main-melody button[aria-label="Edit"]').click();
  const analysis=await page.evaluate(()=>{
    const doc=play12MainController.document, E=Play12Editor;
    const noteById=new Map(E.events(doc.score).map(n=>[n.id,n]));
    const trial={};
    const examples=new Map();
    const contacts = new Map(doc.run.contacts.flatMap(c=>c.ids.map(id=>[id,c])));
    for(const [id,reason] of Object.entries(doc.run.unassignedReasons)){
      const contact = contacts.get(id);
      if(!contact) continue;
      const source=contact.ids[0];
      const accepted=[];
      const rejected={}, advisory={};
      for(let finger=1;finger<=5;finger++){
        try{
          const run=E.edit(doc,id,finger);
          if(run.accepted){accepted.push(finger);advisory[finger]=[...new Set(run.check.warnings.filter(w=>w.ids?.includes(contact.id)).map(w=>w.code))];}
          else rejected[finger]=run.check.conflicts.map(c=>c.code);
        }catch(error){rejected[finger]=[error.message];}
      }
      const key=[reason,accepted.length?'accept':'reject',contact.ids.length>1?'tie':'single',contact.hand,id==='P1.m40.e5'?'octave_sample':''].join(':');
      trial[id]={accepted,rejected,advisory,key};
      if(!examples.has(key))examples.set(key,{id:source,at:Number(new E.Q(noteById.get(source).editor_onset_q)),finger:accepted[0],ids:contact.ids,key});
    }
    const cases = {null:{finger:null},undefined:{finger:undefined},missing:{},zero:{finger:0},outside:{finger:6},diagnostic:{finger:null,status:'unassigned'}};
    const rendering = Object.fromEntries(Object.entries(cases).map(([name,method])=>[name,Play12Renderer.resolveDisplayFingering(doc.score,{method},{unassignedDisplay:true})]));
    return {trial,examples:[...examples.values()],rendering};
  });
  const ui=[];
  let saved;
  for(const item of analysis.examples){
    const row={...item};
    try{
      await page.evaluate(at=>play12Playback.pauseImmediate(at),item.at);
      const note=page.locator(`g[data-event-id="${item.id}"]`).first();
      const x=()=>note.locator('rect').first().getAttribute('x');
      row.xBefore=await x();
      await note.press('Enter',{timeout:2000});
      const picker=page.locator('#main-fingers');
      await picker.waitFor({timeout:2000});
      assert.equal(await picker.locator('button').count(),5);
      await picker.getByRole('button',{name:String(item.finger||1),exact:true}).click();
      const result=()=>note.getAttribute('data-finger');
      if(item.finger){
        assert.equal(await result(),String(item.finger));
        row.xAfter=await x();
        assert.notEqual(row.xBefore,row.xAfter);
        await page.locator('#main-undo').click();
        assert.equal(await result(),'');
        await page.locator('#main-redo').click();
        assert.equal(await result(),String(item.finger));
        await page.locator('#main-undo').click();
        saved=item;
      }else assert.equal(await result(),'');
      await page.keyboard.press('Escape');
      row.result='PASS';
    }catch(error){row.result='PARTIAL'; row.error=error.message.split('\n')[0];}
    ui.push(row);
  }
  let persisted=null;
  if(saved){
    await page.evaluate(item=>{
      play12Playback.pauseImmediate(item.at);
    },saved);
    await page.locator(`g[data-event-id="${saved.id}"]`).first().press('Enter');
    await page.locator('#main-fingers').getByRole('button',{name:String(saved.finger),exact:true}).click();
    await page.locator('#main-save').click();
    await page.waitForFunction(item=>Play12Editor.Store.get(new URL(location.href).searchParams.get('composition')).then(doc=>item.ids.every(id=>doc.manual[id]===item.finger)),saved);
    await page.reload();
    await page.waitForFunction(()=>window.play12MainController?.document);
    persisted=await page.evaluate(item=>item.ids.every(id=>play12MainController.document.manual[id]===item.finger),saved);
    assert(persisted);
  }
  return {notes:analysis.trial,rendering:analysis.rendering,ui,persisted};
}

(async()=>{
  const [output,...files]=process.argv.slice(2),results={};
  for(const file of files){
    const b=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox','--disable-gpu','--single-process','--in-process-gpu','--disable-software-rasterizer']});
    try{
      const page=await b.newPage({viewport:{width:1440,height:900}});
      await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8768/')?r.continue():r.abort());
      results[file.includes('surprises')?'no-surprises':'time']=await check(page,file);
    } finally {await b.close();}
  }
  fs.writeFileSync(output,JSON.stringify(results,null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
