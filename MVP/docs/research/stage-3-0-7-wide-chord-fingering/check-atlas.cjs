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
    await page.goto(base+'/MVP/docs/research/stage-3-0-7-wide-chord-fingering/atlas.html');
    await page.locator('#source').setInputFiles(source);
    await page.locator('#notation').setInputFiles(fs.readdirSync(engraving).map(f=>path.join(engraving,f)));
    await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Сверено'));
    await page.waitForFunction(()=>[...document.querySelectorAll('main img')].filter(e=>e.naturalWidth).length===11);
    assert.equal(await page.locator('.before .target').count(),11);
    assert.equal(await page.locator('.after .target').count(),11);
    assert.equal(await page.locator('.after .target[data-finger="5"]').count(),2);
    assert.equal(await page.locator('.after .changed').count(),4);
    console.log('11 оригинальных тактов и 22 вида Play12 сверены через Chromium.');
  }finally{await browser.close();}
}
verify().catch(e=>{console.error(e);process.exitCode=1;});
