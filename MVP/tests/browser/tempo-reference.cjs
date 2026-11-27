'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8810';
const out=process.env.PLAY12_TEST_OUTPUT_DIR||'/tmp/play12-tempo-reference';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
fs.mkdirSync(out,{recursive:true});
const original=fs.readFileSync('MVP/tests/fixtures/piano-workspace.musicxml','utf8')
 .replace('tempo="96"','tempo="90"').replace('<measure number="2">','<measure number="2"><direction><sound tempo="150"/></direction>');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-zygote','--single-process','--disable-gpu']});
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
  const get=()=>page.evaluate(()=>{
   const p=play12Playback,clock=p.clock,button=document.querySelector('#tempo-metronome');
   const marker=document.querySelector('.tempo-author-reference'),rect=marker.getBoundingClientRect();
   const style=getComputedStyle(button);
   return {effective:clock.effectiveBpmAt(clock.position),offset:clock.tempoOffset(),source:clock.originalBpmAt(clock.position),
    original:button.dataset.authorTempo,ring:style.borderColor,fill:style.backgroundColor,marker:marker.textContent,
    metro:button.getAttribute('aria-pressed'),markerVisible:!marker.hidden,markerY:rect.y+rect.height/2};
  });
  await page.goto(base+'/MVP/import/');
  await page.waitForFunction(()=>document.querySelector("#file")?.disabled===false);
   await page.locator('#file').setInputFiles({name:'tempo-reference.musicxml',mimeType:'application/xml',buffer:Buffer.from(original)});
   await page.locator('#save').click();
   await page.waitForFunction(()=>window.play12MainController?.document);
   const composition=new URL(page.url()).search;
   const timeline=await page.evaluate(()=>({next:play12Playback.rounds[1].start,title:play12MainController.document.score.score.title}));
   await page.evaluate(({title})=>localStorage.setItem('play12.tempo.v1:'+title+':90','{"bpm":67,"original":false,"enabled":true}'),timeline);
  for(const locale of ['ru','en']){
   const route=(locale==='ru'?'/ru':'')+'/MVP/';
   const url=base+route+'main/'+composition;
   for(const [width,height] of [[1440,900],[1180,820],[820,1180],[667,375],[375,667]]){
    await page.setViewportSize({width,height});
    await page.goto(url);
    await page.waitForFunction(()=>window.play12MainController?.document && document.querySelector('#tempo-metronome')?.dataset.authorTempo);
    const name=locale+'-'+width+'x'+height;
    const initial=await get();
    assert.equal(initial.effective,90);assert.equal(initial.original,'true');assert.equal(initial.ring,'rgb(233, 110, 64)');assert.equal(initial.metro,'false');
    const shot=label=>page.screenshot({path:`${out}/${name}-${label}.png`});
    await shot('original');
    const number=page.locator('#tempo-metronome');
    await number.click();
    await page.waitForFunction(()=>document.querySelector('#tempo-metronome').getAttribute('aria-pressed')==='true');
    const green=await get();
    assert.equal(green.fill,'rgb(206, 249, 50)');assert.equal(green.ring,initial.ring);
    await shot('original-metronome');
    // Controller calls provide deterministic boundary and timeline checks across viewports.
    await page.evaluate(()=>play12Playback.setUserBpm(20));
    const lower=await get();
    assert.equal(lower.effective,20);assert.equal(lower.original,'false');
    await shot('lower');
    await page.evaluate(()=>play12Playback.setUserBpm(300));
    const upper=await get();
    assert.equal(upper.effective,300);assert.equal(upper.original,'false');
    assert(lower.markerVisible&&upper.markerVisible);
    assert(Math.abs(upper.markerY-lower.markerY)<1);
    await shot('upper');
    await page.evaluate(next=>{const p=play12Playback;p.setUserBpm(60);p.seek(next);},timeline.next);
    await page.waitForFunction(()=>document.querySelector('.tempo-author-reference').textContent==='150');
    const moved=await get();
    assert.equal(moved.effective,120);assert.equal(moved.offset,-30);assert.equal(moved.source,150);
    await shot('author-change');
    await number.dblclick();
    const restored=await get();
    assert.equal(restored.effective,150);assert.equal(restored.original,'true');assert.equal(restored.metro,'true');
    results.push({name,initial,lower,upper,moved,restored});
    await page.evaluate(()=>{play12Playback.seek(0);play12Playback.setMetronome(false);});
   }
  }
  await page.setViewportSize({width:1440,height:900});
  await page.goto(base+'/MVP/main/'+composition);
  await page.waitForFunction(()=>window.play12MainController?.document);
  await page.locator('#tempo-navigator button').first().click();
  assert.equal((await get()).offset,1);
  await page.locator('#play').click();
  await page.locator('#pause').click();
  await page.waitForFunction(()=>!play12Playback.clock.running);
  await page.locator('#restart').click();
  await page.locator('#practice-board-mode').click();
  await page.locator('#round-loop-toggle').click();
  assert.equal((await get()).offset,1);
  const firstId=await page.evaluate(()=>play12MainController.document.id);
  await page.goto(base+'/MVP/import/');
  await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
  const second=original.replace('tempo="90"','tempo="110"');
  await page.locator('#file').setInputFiles({name:'other-tempo.musicxml',mimeType:'application/xml',buffer:Buffer.from(second)});
  await page.locator('#save').click();
  await page.waitForFunction(id=>window.play12MainController?.document && play12MainController.document.id!==id,firstId);
  assert.equal((await get()).effective,110);
  assert.equal((await get()).offset,0);
  await page.locator(`[data-melody-id="${firstId}"] button`).first().click();
  await page.waitForFunction(id=>window.play12MainController?.document?.id===id,firstId);
  assert.equal((await get()).offset,0);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(out+'/tempo-reference.json',JSON.stringify({results,errors},null,2));
  console.log('Tempo Navigator passed',results.length,'configurations');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
