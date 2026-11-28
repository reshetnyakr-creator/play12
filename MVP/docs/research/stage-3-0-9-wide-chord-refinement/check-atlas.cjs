'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function verify(){
  const [base,source,engraving]=process.argv.slice(2);
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM,
    args:['--no-sandbox','--disable-gpu','--single-process','--in-process-gpu','--disable-software-rasterizer']});
  try{
    const page=await browser.newPage();
    await page.goto(base+'/MVP/docs/research/stage-3-0-9-wide-chord-refinement/atlas.html');
    await page.locator('#source').setInputFiles(source);
    await page.locator('#notation').setInputFiles(fs.readdirSync(engraving).map(f=>path.join(engraving,f)));
    await page.waitForFunction(()=>document.getElementById('status').textContent.length);
    assert.match(await page.locator('#status').textContent(), /Сверены/);
    await page.waitForFunction(()=>[...document.querySelectorAll('main img')].filter(e=>e.naturalWidth).length===2);
    for(const mode of ['before','after'])assert.equal(await page.locator('.'+mode+' svg').count(),2);
    assert.equal(await page.locator('.after .target').count(),3);
    assert.equal(await page.locator('.after .changed').count(),3);
    console.log('2 оригинальных такта, 4 вида Play12 и 3 условных пальца сверены.');

  }finally{await browser.close();}
}
verify().catch(e=>{console.error(e);process.exitCode=1;});
