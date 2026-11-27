'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8827';
const input=process.argv[2]||path.join(__dirname,'fixtures/M08.musicxml');
const perfect=/perfect/i.test(path.basename(input));
const expected=60/63;
const near=(a,b,tolerance=1e-7)=>assert(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu','--single-process','--no-zygote']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/ru/MVP/import/');
  await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
  await page.locator('#file').setInputFiles(input);
  await page.locator('#save').click();
  await page.waitForFunction(()=>window.play12MainController?.document&&document.querySelector('#tempo-metronome')?.dataset.authorTempo);
  const initial=await page.evaluate(()=>{
   const p=play12Playback,c=p.clock;
   window.record={clicks:[],visuals:[]};
   const m=p.metronomeAudio,click=m.scheduleClick.bind(m),flash=p.flashBeatLamp.bind(p);
   m.scheduleClick=(key,time,accent)=>{record.clicks.push({key,time,accent});return click(key,time,accent);};
   p.flashBeatLamp=beat=>{record.visuals.push({...beat,deliveredAt:p.audioContext.currentTime});return flash(beat);};
   return {display:document.querySelector('#tempo-metronome').firstChild.textContent,
    length:c.secondsBetween(0,p.totalQuarters),pulseQ:p.tempoDisplayUnit,marks:p.metricBeats.slice(0,5)};
  });
  assert.equal(initial.display,'63');assert.equal(initial.pulseQ,1.5);
  near(initial.length,(perfect?69:2)*4*expected);
  for(let i=0;i<10;i++)await page.locator('#tempo-navigator button').last().click();
  const slower=await page.evaluate(()=>play12Playback.clock.effectiveBpmAt(0));
  near(slower,79.5);
  await page.locator('#tempo-metronome').dblclick();
  await page.locator('#tempo-metronome').click();
  await page.waitForFunction(()=>play12Playback.metronomeInput.checked);
  await page.locator('#play').click();
  await page.waitForFunction(()=>record.visuals.filter(x=>x.key.startsWith('metric-')).length>=4);
  const first=await page.evaluate(()=>({
   ...record,anchor:play12Playback.clock.anchorAudioTime,
   position:play12Playback.clock.position
  }));
  const firstClicks=first.clicks.filter(x=>x.key.startsWith('metric-')).slice(0,4);
  assert.equal(firstClicks.length,4);near(firstClicks[0].time,first.anchor,.025);
  for(let i=1;i<4;i++)near(firstClicks[i].time-firstClicks[i-1].time,expected,.025);
  assert.deepEqual(firstClicks.map(c=>c.accent),[true,false,false,false]);
  await page.locator('#pause').click();
  await page.waitForFunction(()=>!play12Playback.clock.running);
  await page.locator('#restart').click();
  await page.locator('#round-loop-toggle').click();
  await page.locator('#round-precount-toggle').click();
  await page.locator('#play').click();
  await page.waitForFunction(()=>record.clicks.filter(x=>x.key.startsWith('metric-count-in-')).length>=8);
  const precount=await page.evaluate(()=>({
   plan:play12Playback.countIn.plan,clicks:record.clicks.filter(x=>x.key.startsWith('metric-count-in-')),
   ends:play12Playback.countIn.endsAt
  }));
  assert.equal(precount.plan.beats,8);assert.equal(precount.clicks.length,8);
  near(precount.ends-precount.clicks[0].time,8*expected);
  await page.waitForFunction(()=>play12Playback.loopWrapCount>0,null,{timeout:25000});
  const loop=await page.evaluate(()=>({wraps:play12Playback.loopWrapCount,selected:play12Playback.countIn?.selected,beats:play12Playback.countIn?.plan.beats}));
  assert.equal(loop.selected,0);assert.equal(loop.beats,8);
  assert.deepEqual(errors,[]);
  const out=process.env.PLAY12_TEST_OUTPUT_DIR||__dirname;
  fs.writeFileSync(path.join(out,`transport-${perfect?'perfect':'synthetic'}.json`),JSON.stringify({initial,slower,first,precount,loop},null,2)+'\n');
  console.log(`${perfect?'Perfect':'Synthetic'} 12/8: 63 BPM, four clicks per round, eight per two-cycle Pre-count`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
