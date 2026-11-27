'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8794';
const out=process.env.PLAY12_TEST_OUTPUT_DIR||'/tmp/play12-layout-consistency';
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
   if(!window.name)return;
   const {state,touch}=JSON.parse(window.name);
   if(state)localStorage.setItem('play12.onboarding.state.v1',JSON.stringify(state));
   const match=window.matchMedia.bind(window);
   window.matchMedia=query=>query==='(pointer: coarse)'&&touch?{matches:true}:match(query);
   Object.defineProperty(navigator,'maxTouchPoints',{get:()=>touch?5:0});
   Object.defineProperty(screen,'width',{get:()=>innerWidth});
   Object.defineProperty(screen,'height',{get:()=>innerHeight});
   Object.defineProperty(screen.orientation,'type',{get:()=>innerWidth>innerHeight?'landscape-primary':'portrait-primary'});
  });
  const seeds={
   'practice-info':{highestUnlockedStep:3},
   'metronome-tempo':{highestUnlockedStep:4,metronomeUnlocked:true},
   'round-loop-info':{highestUnlockedStep:5,metronomeUnlocked:true,roundUnlocked:true},
   'final-instruction':{highestUnlockedStep:6,metronomeUnlocked:true,roundUnlocked:true},
  };
  const snapshot=()=>page.evaluate(()=>{
   const selectors=['#practice-loop-board','#play12-score','#playline','#piano-view','#tempo-navigator','#round-navigator','.tutorial-progress-card ol'];
   const bounds=Object.fromEntries(selectors.map(s=>{
    const n=document.querySelector(s);
    return [s,n?.getBoundingClientRect().toJSON()??null];
   }));
   const board=document.querySelector('#practice-loop-board'), input=document.querySelector('#practice-board-mode');
   const style=n=>{const s=getComputedStyle(n);return [s.borderRadius,s.padding,s.gap];};
   const round=document.querySelector('#round-loop-board'),list=document.querySelector('.tutorial-progress-card ol');
   return {bounds,styles:[style(board),style(input)],round:{shown:!round.hidden,locked:round.inert},
    progress:list?{content:list.scrollHeight,visible:list.clientHeight,top:list.scrollTop,css:getComputedStyle(list).maxHeight,items:[...list.children].map(x=>x.getBoundingClientRect().height)}:null};
  });
  const unchanged=(a,b,fields)=>{for(const field of fields)for(const key of ['x','y','width','height'])
   assert(Math.abs(a.bounds[field][key]-b.bounds[field][key])<1,JSON.stringify({field,key,a:a.bounds[field],b:b.bounds[field]}));};
  await page.goto(base);
  for(const locale of (process.env.PLAY12_TEST_LOCALE?[process.env.PLAY12_TEST_LOCALE]:['ru','en'])){
   for(const [width,height] of [[1440,900],[1180,820],[820,1180],[667,375],[375,667]]){
    await page.setViewportSize({width,height});
    const route=(locale==='ru'?'/ru':'')+'/MVP/';
    const id=locale+'-'+width+'x'+height;
    const stages={};
    for(const [guide,state] of Object.entries(seeds)){
     await page.evaluate(data=>window.name=JSON.stringify(data),{touch:width!==1440,state:{
      ...state,onboardingStarted:true,onboardingStep:'TRY_IT_YOURSELF',inputMode:'demo',
      playLearned:true,pauseLearned:true,listenFragmentCompleted:true,chooseZeroCompleted:true,
      cardsSetupCompleted:true,practiceModeEnabled:guide!=='practice-info',practiceRightHandEnabled:true,practiceGuideStage:guide,introducedPanels:{practice:guide!=='practice-info',metronome:true,rounds:true}}});
     await page.goto(base+route+'tutorial/');
     await page.waitForFunction(()=>window.play12Playback&&window.play12Onboarding);
     await page.locator('#onboarding-continue').click();
     await page.waitForFunction(()=>document.querySelector('.mvp-coach-spotlight g rect')&&getComputedStyle(document.querySelector('.mvp-coach-spotlight')).visibility==='visible',null,{timeout:8000}).catch(async error=>{
      console.error(id,guide,await page.evaluate(()=>({state:play12Onboarding.getState(),card:document.getElementById('onboarding-listen-coach').outerHTML.slice(0,500)})));
      throw error;
     });
     await page.waitForTimeout(150);
     const current=stages[guide]=await snapshot();
     assert(current.round.shown);
     assert.equal(current.round.locked,!state.roundUnlocked);
     if(guide==='practice-info'||guide==='round-loop-info'||guide==='final-instruction')await page.screenshot({path:`${out}/${id}-${guide}.png`});
     if(guide==='final-instruction'){
      const card=await page.locator('#onboarding-listen-coach').boundingBox();
      assert(card&&card.x>=0&&card.y>=-1&&card.x+card.width<=width+1);
      if(width===1440){
       assert(Math.abs(card.x+card.width/2-width/2)<2);
       assert(Math.abs(card.y+card.height/2-height/2)<2);
       assert(current.progress.content<=current.progress.visible,JSON.stringify(current.progress));
      }
      await page.locator('#onboarding-listen-coach').waitFor({state:'hidden',timeout:18000});
      await page.waitForTimeout(80);
      stages.finalDismissed=await snapshot();
      unchanged(current,stages.finalDismissed,['#play12-score','#playline','#piano-view','#tempo-navigator','#round-navigator','#practice-loop-board']);
      if(width===1440){
       for(const [viewportHeight,overflow] of [[600,true],[900,false]]){
        await page.setViewportSize({width,height:viewportHeight});
        await page.waitForFunction(overflow=>{
         const list=document.querySelector('.tutorial-progress-card ol');
         return (list.scrollHeight>list.clientHeight)===overflow;
        },overflow);
        stages['progress-'+viewportHeight]=await snapshot();
        await page.screenshot({path:`${out}/${locale}-steps-${viewportHeight}.png`});
       }
      }
     }
    }
    for(const sample of Object.values(stages).filter(x=>x.round)){
     const actual=sample.bounds['#practice-loop-board'],early=stages['practice-info'].bounds['#practice-loop-board'];
     assert(Math.abs(actual.width-early.width)<1&&Math.abs(actual.height-early.height)<1,JSON.stringify({id,actual,early}));
     assert.deepEqual(sample.styles,stages['practice-info'].styles);
    }
    results.push({id,stages});
    fs.writeFileSync(out+'/geometry.json',JSON.stringify({results,errors},null,2));
    console.log(id);
   }
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
