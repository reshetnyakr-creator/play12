'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8794';
const out=process.env.PLAY12_TEST_OUTPUT_DIR||'/tmp/play12-main-board';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local server required');
fs.mkdirSync(out,{recursive:true});

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-zygote','--single-process','--disable-gpu']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[],results=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.addInitScript(()=>{
   const match=window.matchMedia.bind(window);
   window.matchMedia=query=>query==='(pointer: coarse)'&&innerWidth!==1440?{matches:true}:match(query);
   Object.defineProperty(navigator,'maxTouchPoints',{get:()=>innerWidth===1440?0:5});
   Object.defineProperty(screen,'width',{get:()=>innerWidth});
   Object.defineProperty(screen,'height',{get:()=>innerHeight});
   Object.defineProperty(screen.orientation,'type',{get:()=>innerWidth>innerHeight?'landscape-primary':'portrait-primary'});
  });
  for(const locale of ['ru','en']){
   const route=(locale==='ru'?'/ru':'')+'/MVP/';
   await page.setViewportSize({width:1440,height:900});
   await page.goto(base+route+'import/');
   await page.locator('#file').setInputFiles('MVP/tests/fixtures/piano-workspace.musicxml');
   await page.locator('#save').click();
   await page.waitForFunction(()=>window.play12MainController?.document);
   const url=page.url();
   for(const [width,height] of [[1440,900],[1180,820],[820,1180],[667,375],[375,667]]){
    await page.setViewportSize({width,height});
    await page.goto(url);
    await page.waitForFunction(()=>window.play12MainController?.document);
    const zone=page.locator('[data-zone-tab="2"]');
    if(await zone.isVisible())await zone.click();
    await page.waitForTimeout(400);
    const result=await page.evaluate(()=>{
     const board=document.querySelector('#practice-loop-board'),button=document.querySelector('#practice-board-mode');
     const rect=board.getBoundingClientRect();
     const style=n=>{const s=getComputedStyle(n);return [s.borderRadius,s.padding,s.gap];};
     return {width:rect.width,height:rect.height,styles:[style(board),style(button)],device:document.documentElement.dataset.deviceMode};
    });
    assert(result.width>0&&result.height>0);
    assert.deepEqual(result.styles.map(s=>s[0]),['24px','16px']);
    const id=locale+'-'+width+'x'+height;
    if(width===1440)await page.locator('#practice-loop-board').screenshot({path:`${out}/${id}-main.png`});
    results.push({id,...result});
    console.log(id,result);
   }
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(out+'/main-geometry.json',JSON.stringify({results,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
