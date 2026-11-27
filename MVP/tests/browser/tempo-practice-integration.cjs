'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8340';
const output=process.env.PLAY12_TEST_OUTPUT_DIR;
const devices=[['desktop',1440,900],['ipad-portrait',820,1180],['ipad-landscape',1180,820],['iphone-portrait',375,667],['iphone-landscape',667,375]];
if(output)fs.mkdirSync(output,{recursive:true});
const piano=fs.readFileSync('MVP/tests/fixtures/piano-workspace.musicxml','utf8').replace('tempo="96"','tempo="90"')
  .replace(/(<measure number="[23456]">)/g,(mark)=>mark+'<direction><sound tempo="'+[150,110,70,40,90][Number(mark.match(/\d/)[0])-2]+'"/></direction>');
async function run(){
  const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-zygote','--single-process','--disable-gpu']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await page.addInitScript(()=>{
      const match=window.matchMedia.bind(window);
      const device=()=>sessionStorage.getItem('stage23-test-device');
      window.matchMedia=query=>query==='(pointer: coarse)'&&device()&&device()!=='desktop'?{matches:true}:match(query);
      Object.defineProperty(navigator,'maxTouchPoints',{get:()=>device()==='desktop'?0:5});
      Object.defineProperty(screen,'width',{get:()=>innerWidth});
      Object.defineProperty(screen,'height',{get:()=>innerHeight});
      Object.defineProperty(screen.orientation,'type',{get:()=>innerWidth>innerHeight?'landscape-primary':'portrait-primary'});
    });
    const cdp=await page.context().newCDPSession(page);
    const button=id=>page.locator('#'+id);
    const tempo=button('tempo-navigator');
    const [up,value,down]=[0,1,2].map(n=>tempo.locator('button').nth(n));
    const getBpm=()=>page.evaluate(()=>play12Playback.clock.bpm);
    const state=()=>value.getAttribute('aria-pressed');
    const color=()=>value.evaluate(n=>getComputedStyle(n).backgroundColor);
    const shot=async name=>{if(output)await page.screenshot({path:output+'/'+name+'.png',animations:name==='tempo-beat'?'allow':'disabled'});};
    async function waitMain(){
      await page.waitForFunction(()=>window.play12MainController&&document.querySelector('#tempo-navigator'));
    }

    await page.goto(base+'/MVP/import/');
    await page.evaluate(()=>sessionStorage.setItem('stage23-test-device','desktop'));
    await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
    await button('file').setInputFiles({name:'tempo-test.musicxml',mimeType:'application/xml',buffer:Buffer.from(piano)});
    await button('save').click();
    await waitMain();
    const id=await page.evaluate(()=>play12MainController.document.id);
    assert.equal(await getBpm(),90);
    assert.equal(await button('metronome-board').isVisible(),false);
    assert.equal(await button('tempo-navigator-dialog').count(),0);
    assert.equal(await color(),'rgb(255, 255, 255)');
    await shot('tempo-off');
    await up.click();assert.equal(await getBpm(),91);
    await down.click();assert.equal(await getBpm(),90);
    await value.click();
    await page.waitForFunction(()=>document.querySelector('#tempo-metronome').getAttribute('aria-pressed')==='true');
    assert.equal(await color(),'rgb(206, 249, 50)');
    await shot('tempo-paused');
    await up.click();
    await value.dblclick();
    assert.equal(await getBpm(),90);
    assert.equal(await state(),'true');
    const count=await page.evaluate(()=>play12Playback.metronomeBeatCounter);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(()=>play12Playback.metronomeBeatCounter),count);
    await button('play').click();
    await page.waitForFunction(()=>document.querySelector('#tempo-metronome').getAnimations().length>0);
    await shot('tempo-beat');
    await page.waitForFunction(()=>play12Playback.metronomeBeatCounter>2);
    await up.click();
    assert.equal(await getBpm(),91);
    await button('pause').click();
    await page.waitForFunction(()=>!play12Playback.clock.running);
    assert.equal(await state(),'true');
    assert.equal(await color(),'rgb(206, 249, 50)');
    await button('restart').click();
    assert.equal(await state(),'true');
    const start=await value.boundingBox();
    await page.mouse.move(start.x+start.width/2,start.y+start.height/2);
    await page.mouse.down();
    await page.mouse.move(start.x+start.width/2,start.y+start.height/2-55,{steps:5});
    await page.mouse.up();
    assert(await getBpm()>91);
    await page.waitForTimeout(350);
    assert.equal(await state(),'true');
    await value.click();
    await page.waitForFunction(()=>document.querySelector('#tempo-metronome').getAttribute('aria-pressed')==='false');
    await button('play').click();
    assert.equal(await state(),'false');
    await button('pause').click();
    await page.waitForFunction(()=>!play12Playback.clock.running);
    await value.dblclick();
    assert.equal(await getBpm(),90);
    assert.equal(await state(),'false');

    await value.click();
    await page.waitForFunction(()=>play12Playback.metronomeInput.checked);
    await button('practice-board-mode').click();
    await button('play').click();
    await page.waitForFunction(()=>play12Playback.waitingForInput);
    await page.waitForFunction(()=>document.querySelector('#tempo-metronome').getAnimations().length>0);
    await button('pause').click();
    await page.waitForFunction(()=>!play12Playback.clock.running&&!play12Playback.waitingForInput);
    await button('practice-board-mode').click();
    await button('round-loop-toggle').click();
    await button('round-precount-toggle').click();
    await button('play').click();
    await page.waitForFunction(()=>play12Playback.countIn);
    await page.waitForFunction(()=>document.querySelector('#tempo-metronome').getAnimations().length>0);
    await page.waitForFunction(()=>play12Playback.loopWrapCount>0,null,{timeout:25000});
    await button('pause').click();
    await page.waitForFunction(()=>!play12Playback.clock.running&&!play12Playback.countIn);
    assert.equal(await state(),'true');
    await button('round-loop-toggle').click();
    await button('round-precount-toggle').click();

    await page.evaluate(async id=>{
      const d=await Play12Editor.Store.get(id);
      for(let i=0;i<24;i++)await Play12Editor.Store.put({...d,id:crypto.randomUUID(),title:'Library regression '+i});
    },id);

    for(const ru of [false,true]){
      const locale=ru?'ru':'en';
      for(const [name,width,height] of devices){
        await page.evaluate(name=>sessionStorage.setItem('stage23-test-device',name),name);
        await page.setViewportSize({width,height});
        await page.goto(base+(ru?'/ru':'')+'/MVP/main/?composition='+id);
        await waitMain();
        await page.waitForFunction(()=>{
          const library=document.querySelector('.main-library-card');
          const stage=document.querySelector('#playback-stage');
          return document.querySelector('.training-music-slot')?.style.height&&Math.abs(library.getBoundingClientRect().bottom-document.querySelector('#playline').getBoundingClientRect().bottom)<3;
        });
        const geometry=await page.evaluate(()=>{
          const rect=selector=>document.querySelector(selector).getBoundingClientRect();
          const field=rect('#playback-stage');
          const left=rect('#tempo-navigator'),right=rect('#round-navigator'),board=rect('#practice-loop-board');
          const play=rect('#playline'),library=rect('.main-library-card');
          const score=rect('#play12-score'),profile=rect('.main-profile'),skill=rect('.training-skill-card');
          return {mode:document.documentElement.dataset.deviceMode,left:left.left,right:right.right,scoreLeft:score.left,
            scoreRight:score.right,tempoRight:left.right,roundLeft:right.left,fieldTop:field.top,
            libraryDifference:library.bottom-play.bottom,boardsDifference:board.bottom-play.bottom,
            horizontal:document.documentElement.scrollWidth-innerWidth,
            spacing:[field.left-library.right,board.left-field.right,board.top-skill.bottom],topDeltas:[field.top-profile.top,skill.top-profile.top],widthDeltas:[profile.width-library.width,skill.width-board.width],playingWidth:play.width,scale:window.play12Playback.cellHeight};
        });
        assert.equal(geometry.mode,name.replace('ipad','tablet').replace('iphone','phone'));
        assert(geometry.left>=0&&geometry.right<=width+1,JSON.stringify(geometry));
        assert(Math.abs(geometry.libraryDifference)<3,JSON.stringify(geometry));
        assert(geometry.horizontal<=1,JSON.stringify(geometry));
        assert(geometry.tempoRight<=geometry.scoreLeft+1&&geometry.roundLeft>=geometry.scoreRight-1,JSON.stringify(geometry));
        assert(Math.abs(geometry.boardsDifference)<3,JSON.stringify(geometry));
        if(name==='desktop'){
          assert(geometry.topDeltas.every(n=>Math.abs(n)<2),JSON.stringify(geometry));
          assert(geometry.widthDeltas.every(n=>Math.abs(n)<2),JSON.stringify(geometry));
          assert(geometry.spacing.every(n=>n>=0&&Math.abs(n-geometry.spacing[0])<2),JSON.stringify(geometry));
        }
        assert.equal(geometry.scale,32);
        assert.match(await up.getAttribute('aria-label'),ru?/Увеличить/:/Increase/);
        if(name==='iphone-portrait'&&!ru){
          const before=await getBpm();
          const box=await value.boundingBox();
          const point={x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2)};
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,y:point.y-35}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.waitForFunction(bpm=>play12Playback.clock.bpm>bpm,before);
          await page.waitForTimeout(120);
          const status=await state();
          const center=await value.boundingBox();
          const tap={x:Math.round(center.x+center.width/2),y:Math.round(center.y+center.height/2)};
          for(let i=0;i<2;i++){
            await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tap]});
            await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          }
          await page.waitForTimeout(350);
          assert.equal(await getBpm(),90);
          assert.equal(await state(),status);
        }
        if(name==='desktop'&&!ru){
          const list=page.locator('.main-melodies');
          await list.evaluate(n=>n.scrollTop=n.scrollHeight);
          assert(await list.evaluate(n=>n.scrollTop>0));
        }
        if(name==='iphone-landscape'){
          await tempo.scrollIntoViewIfNeeded();
          const current=await getBpm();
          await up.click();
          assert.equal(await getBpm(),current+1);
          await down.click();
          assert.equal(await getBpm(),current);
        }
        await shot('main-'+locale+'-'+name);
        if(name==='iphone-portrait'){
          await page.locator('[data-zone-tab="2"]').click();
          const board=button('practice-loop-board');
          await board.scrollIntoViewIfNeeded();
          assert(await board.isVisible());
          await shot('practice-'+locale+'-'+name);
        }
        console.log('MAIN',locale,name,JSON.stringify(geometry));
      }

      for(const [name,width,height] of devices){
        await page.evaluate(name=>sessionStorage.setItem('stage23-test-device',name),name);
        await page.setViewportSize({width,height});
        for(const guide of ['practice-info','metronome-tempo','metronome-on','round-loop-info']){
          const step=guide.startsWith('metronome')?4:guide.startsWith('round')?5:3;
          const path=(ru?'/ru':'')+'/MVP/tutorial/';
          await page.goto(base+path);
          await page.evaluate(({guide,step})=>localStorage.setItem('play12.onboarding.state.v1',JSON.stringify({
            onboardingStarted:true,onboardingStep:'TRY_IT_YOURSELF',inputMode:'demo',highestUnlockedStep:step,
            introducedPanels:{practice:true,metronome:true},playLearned:true,pauseLearned:true,listenFragmentCompleted:true,
            chooseZeroCompleted:true,cardsSetupCompleted:true,practiceGuideStage:guide,metronomeUnlocked:step>=4,roundUnlocked:step>=5
          })),{guide,step});
          await page.reload();
          await page.waitForFunction(()=>window.play12Onboarding&&window.play12Playback);
          await page.evaluate(()=>play12Onboarding.continueSession());
          const selector=guide==='practice-info'?'#practice-loop-board':guide==='metronome-tempo'?'#tempo-navigator':guide==='metronome-on'?'#tempo-metronome':'#round-loop-board';
          const checkHighlight=()=>page.waitForFunction(selector=>{
            const target=document.querySelector(selector)?.getBoundingClientRect();
            const overlay=document.querySelector('.mvp-coach-spotlight');
            const holes=[...overlay?.querySelectorAll('mask g rect')||[]];
            return target?.width>0&&overlay?.checkVisibility()&&holes.some(h=>
              Math.abs(Number(h.getAttribute('x'))+Number(h.getAttribute('width'))/2-(target.left+target.width/2))<5 &&
              Math.abs(Number(h.getAttribute('y'))+Number(h.getAttribute('height'))/2-(target.top+target.height/2))<5);
          },selector,{timeout:5000});
          await checkHighlight();
          assert.equal(await page.evaluate(()=>play12Onboarding.getState().practiceGuideStage),guide);
          if(guide==='metronome-tempo'&&name==='iphone-portrait'){
            const before=await getBpm();
            await up.click();
            assert.equal(await getBpm(),before+1);
            await page.waitForFunction(()=>play12Onboarding.getState().practiceGuideStage==='metronome-on');
          }
          await shot('spotlight-'+locale+'-'+name+'-'+guide);
          console.log('SPOTLIGHT',locale,name,guide);
        }
      }
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
