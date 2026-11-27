'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base = process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8371';

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM||'/usr/bin/chromium',
    args:['--no-sandbox','--disable-gpu','--no-zygote','--single-process']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await page.goto(base+'/MVP/import/');
    await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
    await page.locator('#file').setInputFiles(process.argv[2] || path.join(__dirname,'fixtures/M08.musicxml'));
    await page.waitForFunction(()=>!document.querySelector('#save')?.hidden);
    await page.locator('#save').click();
    await page.waitForFunction(()=>window.play12Playback&&window.play12MainController?.document);
    const labels=await page.locator('svg .play12-count-beat,svg .play12-count-primary').allTextContents();
    assert.deepEqual(labels.slice(0,12),['ONE','TWO','THREE','FOUR','5','6','7','8','9','10','11','12']);
    if(process.env.PLAY12_AUDIT_SHOT_DIR&&!process.argv[2]){
      // Capture the centre workspace on the fixed viewport used by the experiment.
      await page.screenshot({path:path.join(process.env.PLAY12_AUDIT_SHOT_DIR,'count-current-en.png'),clip:{x:524,y:96,width:392,height:493}});
    }
    await page.locator('#practice-board-mode').click();
    await page.locator('#play').click();
    await page.waitForFunction(()=>play12Playback.waitingForInput);
    const input=await page.evaluate(()=>{
      const p=play12Playback;
      const expected=p.waitingForInput;
      const pitch=expected.events[0].midi;
      const incorrect=p.acceptPracticeInput(pitch===127?126:127);
      const afterWrong=p.waitingForInput===expected;
      const correct=p.acceptPracticeInput(pitch);
      return {start:expected.start,incorrect,afterWrong,correct,finished:expected.completed,practiceStatus:p.stage.dataset.lastPracticeInput};
    });
    assert.equal(input.incorrect,false);
    assert.equal(input.afterWrong,true);
    assert.equal(input.correct,true);
    assert.equal(input.finished,true);
    fs.writeFileSync(path.join(__dirname,'results','en-practice.json'),JSON.stringify({source:path.basename(process.argv[2]||'M08.musicxml'),labels,input},null,2)+'\n');
    console.log('EN count reproduced; incorrect pitch rejected; expected pitch completed Practice gate');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
