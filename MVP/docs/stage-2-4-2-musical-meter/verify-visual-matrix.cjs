'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8833';
const out=process.env.PLAY12_TEST_OUTPUT_DIR||'/tmp/play12-meter-visual';
fs.mkdirSync(out,{recursive:true});
const scenarios=['P01','P02','M06','M07','M08','M12','M11','M33','P04','M17','M19'];

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu','--single-process','--no-zygote']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.addInitScript(()=>{
   const match=window.matchMedia.bind(window);
   window.matchMedia=query=>query==='(pointer: coarse)'&&innerWidth<1200?{matches:true}:match(query);
   Object.defineProperty(navigator,'maxTouchPoints',{get:()=>innerWidth<1200?5:0});
   Object.defineProperty(screen,'width',{get:()=>innerWidth});
   Object.defineProperty(screen,'height',{get:()=>innerHeight});
   Object.defineProperty(screen.orientation,'type',{get:()=>innerWidth>innerHeight?'landscape-primary':'portrait-primary'});
  });
  const imported=new Map();
  for(const name of scenarios){
   await page.goto(base+'/MVP/import/');
   await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
   const xml=fs.readFileSync(path.join(__dirname,'fixtures',name+'.musicxml'),'utf8')
      .replace(/(<\/time>)/g,'$1<clef><sign>G</sign><line>2</line></clef>');
   await page.locator('#file').setInputFiles({name:name+'.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
   await page.locator('#save').click();
   await page.waitForFunction(()=>window.play12MainController?.document&&document.querySelector('#play12-score svg'));
   imported.set(name,new URL(page.url()).search);
   await page.screenshot({path:path.join(out,name+'-desktop-en.png')});
  }
  for(const locale of ['ru','en']){
   const prefix=(locale==='ru'?'/ru':'')+'/MVP/';
   for(const [width,height] of [[1440,900],[1180,820],[820,1180],[667,375],[375,667]]){
    await page.setViewportSize({width,height});
    await page.goto(base+prefix+'main/'+imported.get('M08'));
    await page.waitForFunction(()=>window.play12MainController?.document&&document.querySelector('#tempo-metronome')?.dataset.authorTempo);
    const data=await page.evaluate(()=>{
     const field=document.querySelector('#play12-score'),r=field.getBoundingClientRect();
     const texts=[...field.querySelectorAll('.play12-count')].map(x=>x.textContent);
     return {width:r.width,height:r.height,texts,bpm:document.querySelector('#tempo-metronome').firstChild.textContent};
    });
    assert(data.height>0&&data.width>0);
    assert.equal(data.bpm,'63');
    assert(data.texts.includes(locale==='ru'?'А':'A'));
    const id=`${locale}-${width}x${height}`;
    await page.screenshot({path:path.join(out,`M08-${id}.png`)});
    results.push({id,...data});
   }
   await page.setViewportSize({width:1440,height:900});
   await page.goto(base+prefix+'main/'+imported.get('M08'));
   await page.waitForFunction(()=>window.play12MainController?.document);
   await page.evaluate(()=>play12Playback.setUserBpm(79.5));
   assert.equal(await page.locator('#tempo-metronome').evaluate(x=>x.firstChild.textContent),'53');
   await page.screenshot({path:path.join(out,`M08-slow-${locale}.png`)});
   await page.locator('#practice-board-mode').click();
   await page.locator('#round-loop-toggle').click();
   await page.screenshot({path:path.join(out,`M08-practice-loop-${locale}.png`)});
   await page.goto(base+prefix+'tutorial/');
   await page.waitForFunction(()=>window.play12Onboarding&&window.play12Playback);
   await page.locator('#onboarding-start').click();
   await page.locator('#onboarding-demo').click();
   await page.locator('#play12-score svg').waitFor();
   await page.screenshot({path:path.join(out,`tutorial-${locale}.png`)});
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'matrix.json'),JSON.stringify(results,null,2)+'\n');
  console.log('Visual matrix',results.length,'device/locale configurations;',scenarios.length,'desktop cases');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
