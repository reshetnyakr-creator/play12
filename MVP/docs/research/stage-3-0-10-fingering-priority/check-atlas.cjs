'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function verify(){
  const [base,source,engraving,map]=process.argv.slice(2);
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM,
    args:['--no-sandbox','--disable-gpu','--single-process','--in-process-gpu','--disable-software-rasterizer']});
  try{
    const page=await browser.newPage();
    await page.goto(base+'/MVP/docs/research/stage-3-0-10-fingering-priority/atlas.html');
    await page.locator('#score').setInputFiles(source);
    await page.locator('#map').setInputFiles(map);
    await page.locator('#notation').setInputFiles(fs.readdirSync(engraving).map(f=>path.join(engraving,f)));
    await page.waitForFunction(()=>document.getElementById('status').textContent.length);
    assert.match(await page.locator('#status').textContent(), /Сверены/);
    await page.waitForFunction(()=>[...document.querySelectorAll('main img')].filter(e=>e.naturalWidth).length===3);
    for(const mode of ['before','after'])assert.equal(await page.locator('.'+mode+' svg').count(),3);
    assert.equal(await page.locator('#synthetic .chosen').count(),9);
    console.log('3 оригинальных такта, 6 видов Play12 и 3 синтетических трезвучия.');

  }finally{await browser.close();}
}
verify().catch(e=>{console.error(e);process.exitCode=1;});
