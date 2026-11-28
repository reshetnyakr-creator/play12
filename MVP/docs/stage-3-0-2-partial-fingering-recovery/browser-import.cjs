const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
(async()=>{
 const [base,output,repeats,...files]=process.argv.slice(2);
 fs.mkdirSync(output,{recursive:true});
 for(const file of files)for(let i=0;i<Number(repeats);i++){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox','--disable-gpu','--single-process','--in-process-gpu','--disable-software-rasterizer']});
   const page=await browser.newPage({viewport:{width:1440,height:900}});
   try {
    await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
    await page.goto(base+(process.env.PLAY12_LOCALE==='ru'?'/ru':'')+'/MVP/import/?dev=1');
    const field=page.locator('#file');
    await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
    await field.setInputFiles(file);
    await page.locator('#save').waitFor({timeout:10000});
    await page.locator('#save').click();
    await page.waitForURL('**/main/?composition=*',{timeout:45000});
    await page.waitForFunction(()=>window.play12MainController?.document&&window.play12Playback?.svg?.querySelector('[data-event-id]'),null,{timeout:45000});
    const data=await page.evaluate(async first=>{
      const id=new URL(location.href).searchParams.get('composition');
      const doc=await Play12Editor.Store.get(id), p=window.play12Playback;
      const out={score:doc.score,run:doc.run,sourceHash:doc.sourceHash,display:[],xml:{notes:0,pitched:0,ties:0,pedal:0},manual:null};
      const xml=Play12Editor.parseMusicXML(doc.source);
      out.xml={notes:xml.querySelectorAll('part > measure > note').length,pitched:xml.querySelectorAll('part > measure > note > pitch').length,ties:xml.querySelectorAll('note > tie').length,pedal:xml.querySelectorAll('pedal,sound[damper-pedal]').length};
      if(first) for(let index=0;index<p.rounds.length;index++){
       p.pauseImmediate(p.rounds[index].start);
       for(const n of p.svg.querySelectorAll('[data-event-id]')){
        if(doc.run.assignments[n.dataset.eventId]!=null)continue;
        const rect=n.querySelector('rect');
        if(rect)out.display.push({id:n.dataset.eventId,window:index+1,x:+rect.getAttribute('x'),y:+rect.getAttribute('y'),width:+rect.getAttribute('width'),dash:rect.getAttribute('stroke-dasharray'),finger:n.dataset.finger,hand:n.dataset.hand,midi:+n.dataset.midi});
       }
      }
      return out;
    },i===0);
    const key=path.basename(file).replace(/[^\w.-]/g,'_');
    fs.writeFileSync(path.join(output,key+'-'+i+'.json'),JSON.stringify(data));
    console.log(key,i,data.run.assigned,data.run.total,data.run.elapsed_ms,data.run.search_status);
   } finally {await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
