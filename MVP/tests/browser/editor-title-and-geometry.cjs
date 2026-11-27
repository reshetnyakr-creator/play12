'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8771';
const out=process.env.PLAY12_TEST_OUTPUT_DIR||'/tmp/play12-editor-acceptance';
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--single-process','--no-zygote','--disable-gpu']});
  try{
    const p=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
    const errors=[];
    p.on('pageerror',e=>errors.push(e.stack));
    await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
    await p.goto(base+'/MVP/import/');
    await p.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
    await p.locator('#file').setInputFiles('MVP/tests/fixtures/piano-workspace.musicxml');
    await p.locator('#save').click();
    await p.waitForFunction(()=>window.play12MainController&&document.querySelector('.main-melody-name'));
    const row=p.locator('.main-melody[aria-current]');
    assert.equal(await row.locator('.main-icon-action').count(),3);
    assert.equal(await row.locator('.main-editable-name').count(),0);
    await row.getByRole('button',{name:'Edit'}).click();
    const editable=row.locator('.main-editable-name');
    await editable.waitFor();
    assert.equal(await editable.evaluate(el=>getComputedStyle(el).textDecorationStyle),'dotted');
    await p.screenshot({path:out+'/editable-title.png'});
    await editable.click();
    const field=row.getByRole('textbox');
    await field.fill('cancel by keyboard');
    await field.press('Escape');
    await editable.click();
    await field.fill('cancel by touch');
    await p.screenshot({path:out+'/inline-title-controls.png'});
    await row.getByRole('button',{name:'Cancel'}).click();
    await editable.click();
    await field.fill('Stage 2.3.3 — renamed');
    await field.press('Enter');
    await row.getByRole('button',{name:/Stage 2.3.3 — renamed/}).waitFor();
    const id=await p.evaluate(()=>play12MainController.document.id);
    await p.locator('#main-edit-tools > button').last().click();
    await p.locator('#main-edit-tools').waitFor({state:'hidden'});
    assert.equal(await row.locator('.main-editable-name').count(),0);
    await p.reload();
    await row.getByRole('button',{name:/Stage 2.3.3 — renamed/}).waitFor();
    await p.getByText('Backup',{exact:true}).click();
    const downloading=p.waitForEvent('download');
    await p.getByRole('button',{name:/Download backup/}).click();
    const download=await downloading;
    const backup=out+'/rename-backup.json';
    await download.saveAs(backup);
    assert.equal(JSON.parse(fs.readFileSync(backup)).documents.find(d=>d.id===id).title,'Stage 2.3.3 — renamed');
    // Use a fresh origin for the restore. GitHub Pages backup merge preserves existing records.
    const clean=base.replace('127.0.0.1','localhost');
    await p.unroute('**/*');
    await p.route('**/*',r=>[base,clean].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
    await p.goto(clean+'/MVP/main/');
    await p.getByText('Backup',{exact:true}).click();
    await p.locator('input[accept=".json"]').setInputFiles(backup);
    await p.getByRole('button',{name:/Stage 2.3.3 — renamed/}).waitFor();
    await p.goto(clean+'/MVP/main/?composition='+id+'&mode=edit');
    await p.locator('#main-edit-tools').waitFor();
    const before=await p.evaluate(()=>{
      const c=play12MainController;
      play12Main.select(c.playback.events.find(note=>note.hand==='R').id);
      return JSON.stringify(c.document.manual);
    });
    const manual=()=>p.evaluate(()=>JSON.stringify(play12MainController.document.manual));
    for(let i=0;i<5;i++){
      await p.locator('#main-fingers button').nth(i).click();
      if(await manual()!==before)break;
    }
    const edited=await manual();
    assert.notEqual(edited,before);
    await row.locator('.main-editable-name').click();
    await row.getByRole('textbox').fill('Stage 2.3.3 — draft preserved');
    await row.locator('button[type=submit]').click();
    await row.locator('.main-editable-name').filter({hasText:'draft preserved'}).waitFor();
    assert.equal(await manual(),edited);
    assert.equal(await p.locator('#main-save').isEnabled(),true);
    await p.locator('#main-undo').click();
    assert.equal(await manual(),before);
    await p.locator('#main-redo').click();
    assert.equal(await manual(),edited);
    await p.locator('#main-save').click();
    await p.waitForFunction(async id=>JSON.stringify((await Play12Editor.Store.get(id)).manual)===JSON.stringify(play12MainController.document.manual),id);
    await p.locator('#main-edit-tools > button').last().click();
    await p.locator('#main-edit-tools').waitFor({state:'hidden'});
    await p.reload();
    await p.waitForFunction(()=>window.play12MainController);
    assert.equal(await manual(),edited);
    console.log('Fingering edit, Undo, Redo, Save changes and Done passed');
    await p.addInitScript(()=>{
      const size=()=>sessionStorage.getItem('editor-device');
      const original=matchMedia.bind(window);
      window.matchMedia=query=>query==='(pointer: coarse)'&&size()!=='desktop'?{matches:true}:original(query);
      Object.defineProperty(navigator,'maxTouchPoints',{get:()=>size()==='desktop'?0:5});
      Object.defineProperty(screen,'width',{get:()=>innerWidth});
      Object.defineProperty(screen,'height',{get:()=>innerHeight});
      Object.defineProperty(screen.orientation,'type',{get:()=>innerWidth>innerHeight?'landscape-primary':'portrait-primary'});
    });
    for(const ru of [false,true]){
      for(const [device,width,height] of [['desktop',1440,900],['ipad-portrait',820,1180],['ipad-landscape',1180,820],['iphone-portrait',375,667],['iphone-landscape',667,375]]){
        await p.setViewportSize({width,height});
        await p.evaluate(device=>sessionStorage.setItem('editor-device',device),device);
        await p.goto(clean+(ru?'/ru':'')+'/MVP/main/?composition='+id+'&mode=edit');
        const toolbar=p.locator('#main-edit-tools');
        await toolbar.waitFor();
        await p.waitForFunction(()=>document.querySelector('.training-three-zones')?.style.getPropertyValue('--main-editor-width'));
        const geometry=await p.evaluate(()=>{
          const board=document.querySelector('#main-edit-tools').getBoundingClientRect();
          const field=document.querySelector('#playback-stage').getBoundingClientRect();
          return {board:board.toJSON(),field:field.toJSON(),overflow:document.documentElement.scrollWidth-innerWidth};
        });
        assert.equal(await toolbar.locator(':scope > button').count(),4);
        assert.equal(await toolbar.locator('input').count(),0);
        assert(geometry.board.left>=geometry.field.left-1&&geometry.board.right<=geometry.field.right+1&&geometry.overflow<=1,JSON.stringify(geometry));
        assert(Math.abs(geometry.board.left+geometry.board.right-geometry.field.left-geometry.field.right)<2,JSON.stringify(geometry));
        await p.screenshot({path:out+'/'+(ru?'ru':'en')+'-'+device+'.png'});
        console.log(ru?'ru':'en',device,geometry.board.width,geometry.field.width);
      }
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
