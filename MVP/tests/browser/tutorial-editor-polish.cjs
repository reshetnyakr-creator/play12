'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PLAY12_TEST_BASE_URL || 'http://127.0.0.1:8768';
const output = process.env.PLAY12_TEST_OUTPUT_DIR || '/tmp/play12-polish';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local test server required');
fs.mkdirSync(output, {recursive:true});
const sizes = [[1440,900],[820,1180],[1180,820],[375,667],[667,375]];
const coach = '#onboarding-listen-coach';
const state = {
  onboardingStarted:true, onboardingStep:'TRY_IT_YOURSELF', inputMode:'demo',
  highestUnlockedStep:6, playLearned:true, pauseLearned:true, listenFragmentCompleted:true,
  chooseZeroCompleted:true, cardsSetupCompleted:true, metronomeUnlocked:true, roundUnlocked:true,
  practiceModeEnabled:true, practiceRightHandEnabled:true, introducedPanels:{practice:true,metronome:true,rounds:true}
};

async function main(){
  const browser = await chromium.launch({
    executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-zygote','--single-process','--disable-gpu']
  });
  const page = await browser.newPage();
  const errors = [], results = [];
  page.on('pageerror', error => errors.push(error.stack));
  await page.route('**/*', route => new URL(route.request().url()).origin===base ? route.continue() : route.abort());
  await page.addInitScript(()=>{
    if (!window.name) return;
    const {seed,touch} = JSON.parse(window.name);
    if (seed) localStorage.setItem('play12.onboarding.state.v1',JSON.stringify(seed));
    const match = window.matchMedia.bind(window);
    window.matchMedia = query => query==='(pointer: coarse)'&&touch ? {matches:true} : match(query);
    Object.defineProperty(navigator,'maxTouchPoints',{get:()=>touch ? 5 : 0});
    Object.defineProperty(screen,'width',{get:()=>innerWidth});
    Object.defineProperty(screen,'height',{get:()=>innerHeight});
    Object.defineProperty(screen.orientation,'type',{get:()=>innerWidth>innerHeight?'landscape-primary':'portrait-primary'});
  });
  await page.goto(base);
  async function open(path,seed,touch){
    await page.evaluate(data => window.name=JSON.stringify(data),{seed,touch});
    await page.goto(base+path);
    await page.waitForFunction(()=>window.play12Onboarding);
    await page.locator('#onboarding-continue').click();
    try{await page.locator(coach).waitFor({timeout:8000});}
    catch(error){
      await page.screenshot({path:output+'/failure.png'});
      console.error(await page.evaluate(()=>{
        const selectors=['#onboarding-listen-coach','#play12-score','#playback-stage','#piano-view','.tutorial-training-layout','.training-zone-center'];
        return Object.fromEntries(selectors.map(s=>{
          const n=document.querySelector(s);
          return [s,{rect:n?.getBoundingClientRect().toJSON(),scroll:n?.scrollTop,display:n&&getComputedStyle(n).display,visibility:n&&getComputedStyle(n).visibility}];
        }));
      }));
      throw error;
    }
    await page.waitForFunction(()=>document.querySelectorAll('#play12-coach-mask g rect').length>0);
  }
  const bounds = selector => page.locator(selector).boundingBox();
  const matchesHole = selector => page.evaluate(selector=>{
    const r=document.querySelector(selector).getBoundingClientRect();
    const origin=document.querySelector('.mvp-coach-spotlight').getBoundingClientRect();
    return [...document.querySelectorAll('#play12-coach-mask g rect')].some(hole=>{
      const measured=['x','y','width','height'].map(k=>+hole.getAttribute(k));
      const expected=[r.x-origin.x-3,r.y-origin.y-3,r.width+6,r.height+6];
      return measured.every((n,i)=>Math.abs(n-expected[i])<2);
    });
  },selector);
  async function center(){
    await page.waitForFunction(()=>{
      const coach=document.getElementById('onboarding-listen-coach');
      const card=coach.getBoundingClientRect();
      if(coach.classList.contains('tutorial-coach-side')&&innerHeight<400){
        const field=document.getElementById('play12-score').getBoundingClientRect();
        return card.left>=0&&card.right<=innerWidth&&coach.scrollHeight<=coach.clientHeight+1
          &&(card.right<field.left||card.left>field.right);
      }
      return Math.abs(card.x+card.width/2-innerWidth/2)<2;
    });
    for(let attempt=0;attempt<20;attempt++){
      if(await matchesHole('#play12-score')&&await matchesHole('#piano-view'))return;
      await page.waitForTimeout(50);
    }
    assert.fail('Final instruction Spotlight did not settle on both targets');
  }
  try{
    for(const locale of ['ru','en']){
      const path=(locale==='ru'?'/ru':'')+'/MVP/tutorial/';
      for(const [width,height] of sizes){
        if(process.env.PLAY12_TEST_SIZE&&process.env.PLAY12_TEST_SIZE!==String(width))continue;
        await page.setViewportSize({width,height});
        const touch=width!==1440, prefix=`${output}/${locale}-${width}x${height}`;
        for(const color of ['yellow','green']){
          await open(path,{...state,onboardingStep:'CHOOSE_ZERO',cardsSetupCompleted:false,zeroSetupStage:'verify-'+color},touch);
          assert(await matchesHole('.piano-visible-card-region'));
          assert(await matchesHole('#piano-view'));
          if(color==='yellow')await page.screenshot({path:prefix+'-cards.png'});
        }
        await open(path,{...state,highestUnlockedStep:4,roundUnlocked:false,practiceGuideStage:'metronome-tempo'},touch);
        assert.match(await page.locator(coach).innerText(),locale==='ru'?/Вверх — быстрее, вниз — медленнее\./:/Up to play faster, down to play slower\./);
        assert(await matchesHole('#tempo-navigator'));
        assert.equal(await page.locator('#tempo-navigator button').count(),3);
        assert.equal(await page.locator('.tutorial-center .main-title-board').count(),0);
        assert.equal(await page.locator('.tutorial-identity #onboarding-song-title').count(),1);
        if(!touch){
          const field=await bounds('#playback-stage'), identity=await bounds('.tutorial-identity');
          assert(Math.abs(field.y-identity.y)<2,JSON.stringify({field,identity}));
          const nav=await bounds('#tempo-metronome');
          await page.mouse.move(nav.x+nav.width/2,nav.y+nav.height/2);
          await page.mouse.down();
          await page.mouse.move(nav.x+nav.width/2,nav.y+nav.height/2-30,{steps:4});
          await page.mouse.up();
          await page.waitForTimeout(100);
          assert((await bounds('#tempo-metronome')).y<nav.y);
          assert(await matchesHole('#tempo-navigator'));
        }
        await page.screenshot({path:prefix+'-tempo.png'});
        await open(path,{...state,highestUnlockedStep:5,practiceGuideStage:'round-loop-info'},touch);
        assert.match(await page.locator(coach).innerText(),locale==='ru'?/«От» и «До»/:/From and To/);
        await page.screenshot({path:prefix+'-range.png'});
        await open(path,{...state,practiceGuideStage:'final-instruction'},touch);
        await center();
        await page.screenshot({path:prefix+'-final.png'});
        if(!touch){
          await page.setViewportSize({width:1280,height:800});
          await center();
        }
        results.push({locale,width,height,cards:true,tempo:true,range:true,final:true});
        console.log(results.at(-1));
      }
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(output+'/matrix.json',JSON.stringify(results,null,2));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
