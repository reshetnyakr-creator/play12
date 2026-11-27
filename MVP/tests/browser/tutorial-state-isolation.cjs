'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8810';
const out=process.env.PLAY12_TEST_OUTPUT_DIR||'/tmp/play12-tutorial-state';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
fs.mkdirSync(out,{recursive:true});

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-zygote','--single-process','--disable-gpu']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/MVP/import/');
  await page.waitForFunction(()=>document.querySelector("#file")?.disabled===false);
  await page.locator('#file').setInputFiles('MVP/tests/fixtures/piano-workspace.musicxml');
  await page.locator('#save').click();
  await page.waitForFunction(()=>window.play12MainController?.document);
  const main=page.url();
  const click=id=>page.locator('#'+id).click();
  const snapshot=()=>page.evaluate(()=>{
   const p=play12Playback,c=p.clock;
   return {position:c.position,running:c.running,original:c.originalBpm,offset:c.tempoOffset(),metronome:p.metronomeInput.checked,
     practice:p.getPracticeSettings(),round:p.roundBoard.controlState()};
  });
  await page.locator('#tempo-navigator button').first().click();
  await click('tempo-metronome');
  await page.waitForFunction(()=>play12Playback.metronomeInput.checked);
  await click('practice-board-mode');
  await click('practice-left-hand');
  await page.locator('#round-navigator button').first().click();
  await click('round-loop-toggle');
  await click('round-to-plus');
  await click('round-precount-toggle');
  const mainBefore=await snapshot();
  assert(mainBefore.offset&&mainBefore.position&&mainBefore.metronome);
  assert(mainBefore.practice.practiceModeEnabled&&!mainBefore.practice.practiceLeftHandEnabled);
  assert(mainBefore.round.loop&&mainBefore.round.precount&&mainBefore.round.to>mainBefore.round.from);
  const mainStorage=()=>page.evaluate(()=>({
   local:Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.startsWith('play12.tutorial.')&&!k.startsWith('play12.onboarding.')&&k!=='play12.session.exists.v1')),
   session:Object.fromEntries(Object.entries(sessionStorage).filter(([k])=>k.startsWith('play12.main.')&&!k.includes('locale-state')))
  }));
  // Calibrating hardware is outside this test. A sentinel verifies that starting over
  // does not remove the calibration record, even when a device is unavailable.
  await page.evaluate(()=>localStorage.setItem('play12.midi-calibration.v1','{}'));
  await page.goto(base+'/MVP/tutorial/');
  await page.waitForFunction(()=>window.play12Onboarding&&window.play12Playback);
  const savedMain=await mainStorage();
  await click('onboarding-start');
  await click('onboarding-demo');
  const initial=await snapshot();
  assert.equal(initial.position,0);assert.equal(initial.running,false);assert.equal(initial.offset,0);assert.equal(initial.metronome,false);
  assert.deepEqual(initial.round,{currentRound:1,from:1,to:1,loop:false,precount:false});
  assert.equal(initial.practice.practiceModeEnabled,false);assert.equal(initial.practice.practiceLeftHandEnabled,true);
  assert.equal(initial.practice.practiceRightHandEnabled,true);assert.equal(initial.practice.oneSkillMode,false);
  await page.screenshot({path:out+'/tutorial-initial-en.png'});
  assert.deepEqual(await mainStorage(),savedMain);
  await page.goto(main);
  await page.waitForFunction(()=>window.play12MainController?.document && document.querySelector('.training-three-zones'));
  const reopened=await snapshot();
  assert.equal(reopened.offset,0);
  assert.equal(reopened.position,mainBefore.position);
  assert.deepEqual(reopened.round,mainBefore.round);
  assert.deepEqual(reopened.practice,mainBefore.practice);
  assert.equal(reopened.metronome,mainBefore.metronome);
  fs.writeFileSync(out+'/state-isolation.json',JSON.stringify({mainBefore,initial,reopened},null,2));
  console.log('Tutorial starts with defaults and Main transport preferences survive entry and exit');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
