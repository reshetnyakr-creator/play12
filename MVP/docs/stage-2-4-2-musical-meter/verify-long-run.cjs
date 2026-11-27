'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8829';

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu','--single-process','--no-zygote']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/MVP/import/');
  await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
  await page.locator('#file').setInputFiles(process.argv[2]||path.join(__dirname,'fixtures/M08.musicxml'));
  await page.locator('#save').click();
  await page.waitForFunction(()=>window.play12MainController?.document);
  await page.evaluate(()=>{
   window.clicks=[];window.visuals=[];
   const p=play12Playback,m=p.metronomeAudio,click=m.scheduleClick.bind(m),flash=p.flashBeatLamp.bind(p);
   m.scheduleClick=(key,time,accent)=>{clicks.push({key,time,accent,scheduledAt:p.audioContext.currentTime});return click(key,time,accent);};
   p.flashBeatLamp=beat=>{visuals.push({key:beat.key,when:beat.when,observed:p.audioContext.currentTime});return flash(beat);};
  });
  const click=id=>page.locator('#'+id).click();
  await click('tempo-metronome');
  await page.waitForFunction(()=>play12Playback.metronomeInput.checked);
  await click('play');
  await page.waitForFunction(()=>play12Playback.audioContext.currentTime>=play12Playback.clock.anchorAudioTime+60.2,null,{timeout:75000});
  const first=await page.evaluate(()=>{
   const at=play12Playback.clock.anchorAudioTime;
   return {events:clicks.filter(c=>c.key.startsWith('metric-')&&c.time>=at-1e-6&&c.time<at+60-1e-6).map(c=>({...c,at:c.time-at})),visuals:visuals.slice(),anchor:at};
  });
  assert.equal(first.events.length,63);
  const deviations=first.events.map((event,index)=>event.at-index*60/63);
  const maxDeviation=Math.max(...deviations.map(Math.abs));
  const renderDelivery=first.visuals.filter(v=>first.events.some(c=>c.key===v.key)).map(v=>v.observed-v.when);
  assert(renderDelivery.length>=62);
  assert(maxDeviation<.025,JSON.stringify({maxDeviation,late:first.events.filter((event,i)=>Math.abs(deviations[i])>=.025)}));
  await click('pause');
  await page.waitForFunction(()=>!play12Playback.clock.running);
  const nav=page.locator('#round-navigator button');
  for(let i=0;i<20;i++)await nav.nth(i%2===0?0:2).click();
  await click('restart');
  await click('round-loop-toggle');
  await page.evaluate(()=>play12Playback.setUserBpm(450));
  await click('play');
  await page.waitForFunction(()=>play12Playback.loopWrapCount>=20,null,{timeout:35000});
  const loop=await page.evaluate(()=>{
   const last=play12Playback.loopWrapCount;
   const events=clicks.filter(c=>c.key.startsWith('metric-')&&c.time>=play12Playback.audioContext.currentTime-18);
   return {last,events};
  });
  assert(loop.last>=20);
  const byCycle=Map.groupBy(loop.events,event=>event.key.split('-')[1]);
  const complete=[...byCycle.values()].filter(events=>events.length===4);
  assert(complete.length>=20);
  assert.equal(new Set(loop.events.map(c=>c.key)).size,loop.events.length);
  for(const cycle of complete)for(let i=1;i<cycle.length;i++)assert(Math.abs(cycle[i].time-cycle[i-1].time-.2)<.025);
  const output={first,maxDeviation,lastDeviation:deviations.at(-1),maxVisualDelay:Math.max(...renderDelivery),loop,navigations:20};
  fs.writeFileSync(path.join(__dirname,'long-run-results.json'),JSON.stringify(output,null,2)+'\n');
  console.log('60 seconds, 63 clicks, max timing deviation',maxDeviation,'s; 20 navigations; 20 loop cycles');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
