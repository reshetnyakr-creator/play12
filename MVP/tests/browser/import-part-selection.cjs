'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8770';
const control=process.env.PLAY12_TEST_SMILE_MXL;
const solo=fs.readFileSync('MVP/tests/fixtures/piano-workspace.musicxml','utf8');
const mixed=(name='Piano',sound='keyboard.piano')=>`<score-partwise>
<part-list><score-part id="P1"><part-name>${name}</part-name>
${sound?`<score-instrument id="I1"><instrument-name>${name}</instrument-name><instrument-sound>${sound}</instrument-sound></score-instrument>`:''}
</score-part><score-part id="P2"><part-name>Part 2</part-name><score-instrument id="I2"><instrument-name>Violin</instrument-name><instrument-sound>strings.violin</instrument-sound></score-instrument><midi-instrument id="I2"><midi-program>41</midi-program></midi-instrument></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>2</divisions><staves>2</staves><clef><sign>G</sign></clef></attributes>
<forward><duration>2</duration></forward><direction><sound tempo="97"/></direction>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note></measure></part>
<part id="P2"><measure number="1"><attributes><divisions>1</divisions><clef><sign>G</sign></clef></attributes>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>3</voice></note></measure></part>
</score-partwise>`;
const payload=xml=>({name:'parts.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
async function run(){
  const browser=await chromium.launch({
    executablePath:process.env.PLAY12_TEST_CHROMIUM,
    args:['--single-process','--no-zygote','--disable-gpu']
  });
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
    const upload=async(file,ru=false)=>{
      await page.goto(base+(ru?'/ru':'')+'/MVP/import/?dev=1');
      await page.waitForFunction(()=>document.getElementById('file')?.disabled===false);
      await page.locator('#file').setInputFiles(file);
    };
    const journal=()=>page.locator('#diagnostics').textContent().then(JSON.parse);
    const dialog=page.locator('#part-dialog');
    const selected=page.locator('#part-list input');
    const confirm=page.locator('#confirm-parts');
    const save=page.locator('#save');

    await upload(payload(solo),true);
    await save.waitFor();
    assert.equal(await dialog.isVisible(),false);
    await upload(payload(mixed()));
    await save.waitFor();
    assert.equal(await dialog.isVisible(),false);
    assert.deepEqual(Object.keys((await journal()).hands.map),['P1:1']);

    await upload(payload(mixed('Unknown','')));
    await dialog.waitFor();
    assert.equal(await page.locator('#part-title').innerText(),'Select a part to import');
    assert.equal(await page.locator('#combine-parts').locator('..').innerText(),'Combine selected parts');
    assert.equal((await journal()).import.parts[0].staves,2);
    assert.equal((await journal()).import.parts[0].kind,'unknown');
    assert.match(await page.locator('#part-list label').first().innerText(),/Unknown instrument/);
    assert.equal(await confirm.isEnabled(),false);
    await page.locator('#cancel-parts').click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(await save.isVisible(),false);
    await page.locator('#file').setInputFiles(payload(mixed('Unknown','')));
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    assert.equal(await save.isVisible(),false);

    await page.locator('#file').setInputFiles(payload(mixed('Unknown','')));
    await dialog.waitFor();
    await selected.nth(1).check();
    await confirm.click();
    assert.deepEqual(Object.keys((await journal()).hands.map),['P2:1']);
    await save.click();
    await page.waitForFunction(()=>window.play12MainController);
    const saved=await page.evaluate(()=>play12MainController.document);
    assert.deepEqual(saved.partIds,['P2']);
    assert.equal(saved.source,mixed('Unknown',''));
    assert.deepEqual(saved.score.score.parts.map(p=>p.id),['P2']);
    assert.equal(saved.score.score.parts[0].measures[0].events[0].voice,'3');
    assert.equal(saved.score.editor.tempo,97);
    assert.deepEqual(saved.score.editor.tempoMap,[{at:0,bpm:120},{at:1,bpm:97}]);

    await upload(payload(solo));
    await save.click();
    await page.waitForFunction(()=>window.play12MainController);
    const nav=page.locator('#round-navigator');
    const up=nav.getByRole('button',{name:'Next round'});
    const down=nav.getByRole('button',{name:'Previous round'});
    const number=nav.locator('.round-navigator-number');
    for(const viewport of [{width:1440,height:900},{width:820,height:1180},{width:375,height:667}]){
      await page.setViewportSize(viewport);
      assert.equal(await up.innerText(),'▲');
      assert.equal(await down.innerText(),'▼');
      assert.equal(await down.isEnabled(),false);
      await up.click();
      assert.equal(await number.innerText(),'2');
      await down.click();
      assert.equal(await number.innerText(),'1');
      await number.click();
      const entry=page.locator('.round-navigator-dialog input');
      await entry.fill('8');
      await entry.press('Enter');
      assert.equal(await number.innerText(),'8');
      assert.equal(await up.isEnabled(),false);
      await number.click();
      await entry.fill('1');
      await entry.press('Enter');
    }

    if(control){
      await page.setViewportSize({width:375,height:667});
      await upload(control,true);
      await dialog.waitFor();
      assert.equal(await page.locator('#part-title').innerText(),'Выберите партию для импорта');
      assert.deepEqual((await journal()).import.parts.map(p=>[p.id,p.notes,p.measures]),[['P1',1594,219],['P2',1594,219]]);
      assert.match(await page.locator('#part-list label').nth(0).innerText(),/Piano \[P1\]/);
      assert.match(await page.locator('#part-list label').nth(1).innerText(),/Piano \[P2\]/);
      for(const ids of [['P1'],['P2'],['P1','P2']]){
        if(ids[0]!=='P1'||ids.length>1)await upload(control);
        await dialog.waitFor();
        if(ids.length===2){
          await page.locator('#combine-parts').check();
          await page.locator('#combine-warning').waitFor();
          await selected.nth(0).check();
          assert.equal(await confirm.isEnabled(),false);
        }
        await selected.nth(ids.includes('P2')?1:0).check();
        await confirm.click();
        if(ids[0]==='P1'&&ids.length===1){
          await page.locator('[data-play12-language="en"]').click();
          await save.waitFor();
          assert.deepEqual(Object.keys((await journal()).hands.map),['P1:1','P1:2']);
        }
        await save.click();
        if(ids.length===2){
          await page.waitForFunction(()=>document.querySelector('#warnings').textContent.includes('Overlapping physical contacts'));
          const {engine}=await journal();
          assert.equal(engine.assigned,0);
          assert.equal(engine.total,3188);
          assert.equal(engine.search_status,'partial');
          assert.equal(engine.unassignedReasons['absent'],undefined);
          await save.click();
        }
        await page.waitForFunction(()=>window.play12MainController,null,{timeout:35000});
        const result=await page.evaluate(()=>{
          const d=play12MainController.document;
          const {assigned,total,elapsed_ms,search_status,unassignedReasons,validation}=d.run;
          const reasons={};
          for(const reason of Object.values(unassignedReasons))reasons[reason]=(reasons[reason]||0)+1;
          return {ids:d.partIds,tempo:d.score.editor.tempo,tempoMap:d.score.editor.tempoMap,assigned,total,elapsed_ms,search_status,reasons,conflicts:validation.conflicts.length};
        });
        assert.deepEqual(result.ids,ids);
        assert.equal(result.tempo,158);
        assert.equal(result.tempoMap.length,4);
        assert.equal(result.assigned,ids.length===2?0:1594);
        assert.equal(result.total,ids.length*1594);
        console.log(JSON.stringify(result));
      }
      assert.equal(await page.evaluate(async()=> (await Play12Editor.Store.list()).filter(d=>d.score.editor.tempo===158).length),3);
    }
    assert.deepEqual(errors,[]);
    console.log('Part selection and round navigation passed in Chromium');
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
