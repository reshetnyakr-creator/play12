// Real sequential course, without seeded progress or fabricated success events.
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8768',out=process.env.PLAY12_TEST_OUTPUT_DIR||'/tmp/play12-interaction-acceptance/course';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local server required');fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--single-process','--in-process-gpu','--disable-gpu','--disable-software-rasterizer']}),p=await b.newPage({viewport:{width:Number(process.env.PLAY12_TEST_WIDTH)||1440,height:Number(process.env.PLAY12_TEST_HEIGHT)||900}}),errors=[],checks=[];p.on('pageerror',e=>{errors.push(e.stack);console.error(e.stack);});await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await p.addInitScript(()=>{window.courseLoadErrors=[];window.addEventListener('play12:load-error',e=>courseLoadErrors.push(e.detail));});const cdp=await p.context().newCDPSession(p);const state=()=>p.evaluate(()=>play12Onboarding.getState()),guide=g=>p.waitForFunction(g=>play12Onboarding.getState().practiceGuideStage===g,g,{timeout:60000}),shot=async n=>{await p.waitForTimeout(220);await p.screenshot({path:`${out}/${n}.png`});};
const key=async midi=>{const l=p.locator(`.piano-key[data-midi="${midi}"]`),r=await l.boundingBox();await l.click({position:{x:r.width/2,y:r.height*.9}});};
const geometry=async()=>{const a=await p.evaluate(()=>({piano:document.getElementById('piano-view').getBoundingClientRect().toJSON(),w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollWidth}));assert(a.piano.x>=-1&&a.piano.right<=a.w+1&&a.piano.bottom<=a.h+1&&a.scroll<=a.w,JSON.stringify(a));return a;};
const skipMusic = process.env.PLAY12_TEST_SKIP_MUSIC === '1';
const isEnglish = process.env.PLAY12_TEST_LOCALE === 'en';
const skipButton = p.locator('#onboarding-skip');
const marks = p.locator('[data-round-marker].is-round-success');
const noMarks = async () => assert.equal(await marks.count(), 0);
const skipTask = async (name, next) => {
  assert.equal(await skipButton.innerText(), isEnglish ? 'Skip' : 'Пропустить');
  await shot('skip-' + name);
  await skipButton.click();
  await guide(next);
  await noMarks();
};
const visualMatrix = async name => {
  for (const [width, height] of [[1440,900],[1180,820],[820,1180],[667,375],[375,667]]) {
    await p.setViewportSize({width,height});
    await p.waitForTimeout(350);
    await geometry();
    assert(await p.locator('#play12-score svg').isVisible());
    if (name === 'practice-task') assert(await skipButton.isVisible());
    if (name === 'metronome') await noMarks();
    await shot(name + '-' + width + 'x' + height);
  }
  await p.setViewportSize({width:1440,height:900});
};
const perform=async next=>{
  await p.locator('#play').click();
  const deadline=Date.now()+120000;
  let capturedSuccess = false;
  while(Date.now()<deadline){
    if (next === 'metronome-info' && !capturedSuccess && await marks.count()) {
      await shot('03-valid-round');
      capturedSuccess = true;
    }
    const info=await p.evaluate(()=>{
      const c=play12Playback,stage=play12Onboarding.getState().practiceGuideStage;
      const e=c.waitingForInput||c.expectedPracticeEvent;
      if(!e||c.countIn||c.practicePaused||c.clock.running&&c.audioContext.currentTime<e.expectedAudioTime-.025)return {stage};
      const points=[...new Set(e.events.map(n=>n.midi))].map((midi,id)=>{
        const key=document.querySelector(`.piano-key[data-midi="${midi}"]`);
        const r=key.getBoundingClientRect();
        return {x:r.x+r.width/2,y:r.y+r.height*.9,id};
      });
      return {stage,points};
    });
    if(info.stage===next){
      if (next === 'metronome-info') assert(capturedSuccess || await marks.count() > 0);
      checks.push(`real on-screen piano -> ${next}`);return;}
    if(info.points?.length){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:info.points});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await p.waitForTimeout(20);
  }
  fs.writeFileSync(out+'/timeout-state.json',JSON.stringify(await p.evaluate(()=>({state:play12Onboarding.getState(),position:play12Playback.clock.position,stage:play12Playback.stage.dataset.state,text:document.body.innerText})),null,2));
  throw Error('Course did not advance to '+next);
};
await p.goto(base+(process.env.PLAY12_TEST_LOCALE==='en'?'/MVP/tutorial/':'/ru/MVP/tutorial/'));await p.waitForFunction(()=>window.play12Playback);assert.deepEqual(await p.evaluate(()=>courseLoadErrors),[]);await p.locator('#onboarding-start').click();await p.locator('#onboarding-demo').click();await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>play12Playback.clock.position),0);assert(await p.locator('#play12-score svg').isVisible());await geometry();await noMarks();await shot('01-listen');
if(process.env.PLAY12_TEST_RESIZE==='1'){
  await p.setViewportSize({width:690,height:820});
  await p.waitForFunction(()=>document.querySelector('.training-three-zones')?.classList.contains('is-three-narrow'));
  assert(await p.locator('#play12-score svg').isVisible());
  await shot('01-narrow-desktop');
  await p.setViewportSize({width:1440,height:900});
  await p.waitForFunction(()=>document.querySelector('.training-three-zones')?.classList.contains('is-three-wide'));
  assert.equal(await p.evaluate(()=>play12Playback.clock.position),0);
  checks.push('live resize Desktop -> narrow desktop -> Desktop preserved the lesson and start');
}
await p.keyboard.press('p');await p.waitForFunction(()=>play12Onboarding.getState().successes?.['listen-play']);assert(await p.locator('#round-ok12').isVisible());checks.push('native P -> actual musical start -> OK12');await p.waitForFunction(()=>play12Playback.clock.position>5);await p.locator('#pause').click();await p.waitForFunction(()=>play12Onboarding.getState().pauseLearned);await p.locator('#play').click();await p.waitForFunction(()=>play12Onboarding.getState().onboardingStep==='CHOOSE_ZERO',null,{timeout:45000});await noMarks();
assert.equal((await state()).zeroSetupStage,'intro');assert(!await p.locator('#zero-chooser').isVisible());await shot('02-zero-intro');await p.waitForFunction(()=>play12Onboarding.getState().zeroSetupStage==='button');await shot('02-zero-button');await p.locator('#onboarding-choose-zero').click();await shot('02-zero-keyboard');await key(60);await shot('02-zero-confirm');assert(await p.evaluate(()=>{const r=document.getElementById('use-zero').getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest('#use-zero');}));await p.locator('#use-zero').click();assert((await state()).successes['zero-confirmed']);await p.waitForTimeout(1000);await p.locator('#cards-ready').click();await key(await p.evaluate(()=>play12Playback.pianoView.midiForCard('1',2)));await key(await p.evaluate(()=>play12Playback.pianoView.midiForCard('2',3)));await guide('practice-info');await geometry();
const practice=async()=>p.evaluate(()=>play12Playback.getPracticeSettings());
assert.equal((await practice()).practiceModeEnabled,false);
assert.equal((await practice()).practiceLeftHandEnabled,true);
assert.equal((await practice()).practiceRightHandEnabled,true);
const initial=await p.evaluate(()=>({bpm:play12Playback.clock.bpm,original:play12Playback.clock.tempoOffset(),metro:play12Playback.metronomeInput.checked,loop:play12Playback.roundBoard.controlState()}));
assert.equal(initial.original,0);assert.equal(initial.metro,false);
assert.equal(initial.loop.loop,false);assert.equal(initial.loop.precount,false);
checks.push('Practice introduction displays Off with both hands On, Loop and Pre-count Off');
await shot('03-practice-whole');await p.reload();await p.waitForFunction(()=>window.play12Playback);await p.locator('#onboarding-continue').click();await p.waitForFunction(()=>document.querySelector('#play12-score svg')?.getBoundingClientRect().height>0);assert.deepEqual(await p.evaluate(()=>courseLoadErrors),[]);checks.push('real saved progress resumed after reload');await guide('enable');
await p.getByText(isEnglish ? 'Now turn on Practice.' : 'Теперь включи практику', {exact:true}).waitFor();
assert.equal(await p.locator('#practice-board-mode').innerText(), isEnglish ? 'Practice' : 'Практика');
await shot('03-practice-localized');
assert(await skipButton.isHidden());await p.locator('#practice-board-mode').click();await guide('hand');assert.equal((await practice()).practiceLeftHandEnabled,true);
await p.locator('#practice-right-hand').click();
assert.equal((await state()).practiceGuideStage,'hand');
await p.locator('#practice-right-hand').click();
await shot('03-hand-choice');
await p.locator('#practice-left-hand').click();await guide('ready');await shot('03-practice-play');
if (skipMusic) {
  await visualMatrix('practice-task');
  await skipTask('practice','metronome-info');
  await visualMatrix('metronome');
} else {
  await perform('metronome-info');
  assert((await state()).successes['practice-start']);
}
await shot('04-metronome-whole');await guide('metronome-tempo');await shot('04-bpm-information');await p.locator('#tempo-navigator button').first().click();await guide('metronome-on');await p.locator('#tempo-metronome').click();await guide('metronome-play');if (skipMusic) await skipTask('metronome','round-info');
else { await perform('round-info');assert.equal((await state()).metronomeStreak,5);checks.push('metronome completed after five accepted actions, before whole-song end'); }await shot('05-rounds-whole');await guide('round-go4');for(let i=0;i<8&&await p.locator('#round-navigator .round-navigator-number').innerText()!=='4';i++)await p.locator(Number(await p.locator('#round-navigator .round-navigator-number').innerText())>4?'#round-navigator button:last-child':'#round-navigator button:first-child').click();await guide('round-loop-info');await guide('round-loop');await p.locator('#round-loop-toggle').click();await guide('round-range');for (const [control,target] of [['from',2],['to',4]]){
  const display=p.locator('#round-'+control);
  for(let attempts=0;attempts<8;attempts++){
    const value=Number(await display.innerText());
    if(value===target)break;
    await p.locator('#round-'+control+(value>target?'-minus':'-plus')).click();
  }
}
await guide('round-precount-info');await guide('round-precount');await p.locator('#round-precount-toggle').click();await guide('round-practice');await shot('05-round-practice');if (skipMusic) await skipTask('rounds','final-instruction');
else { await perform('final-instruction');assert.equal((await state()).roundPasses,2);checks.push('two separately completed passes of rounds 2–4'); }await shot('06-final-instruction');await guide('final-practice');if (skipMusic) await skipTask('final','completed');
else await perform('completed');assert((await state()).onboardingCompleted);await shot('06-complete');const completed=await state();for(const id of ['practice-song','metronome-on','round-song','final-song'])assert.equal(Boolean(completed.successes[id]), !skipMusic || id === 'metronome-on');assert.deepEqual(errors,[]);fs.writeFileSync(out+'/course.json',JSON.stringify({checks,errors,completed,geometry:await geometry(),input:'native browser mouse, keyboard and emulated touch on screen piano; no hardware'},null,2));console.log(checks);await b.close();})().catch(e=>{console.error(e);process.exit(1)});
