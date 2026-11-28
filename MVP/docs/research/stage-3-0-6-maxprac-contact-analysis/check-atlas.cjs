'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function verify() {
  const [base,replay,imports,engraving] = process.argv.slice(2);
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM,
    args:['--no-sandbox','--disable-gpu','--single-process','--in-process-gpu','--disable-software-rasterizer']});
  try {
    const page = await browser.newPage({ viewport:{width:1200,height:1000} });
    await page.goto(base+'/MVP/docs/research/stage-3-0-6-maxprac-contact-analysis/atlas.html');
    await page.locator('#replay').setInputFiles(replay);
    await page.locator('#imports').setInputFiles(fs.readdirSync(imports).filter(f=>f.endsWith('-0.json'))
      .map(f=>path.join(imports,f)));
    await page.locator('#engraving').setInputFiles(fs.readdirSync(engraving).filter(f=>f.endsWith('.svg'))
      .map(f=>path.join(engraving,f)));
    await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Сверено'));
    await page.waitForFunction(()=>[...document.querySelectorAll('main img')].filter(img=>img.naturalWidth>0).length===6);
    assert.equal(await page.locator('main section').count(),6);
    assert.equal(await page.locator('main svg .target').count(),6);
    assert.ok(await page.locator('main svg .blocker').count()>=6);
    console.log('Проверены 6 оригинальных нотных фрагментов, 6 SVG Play12 и выделение целей.');
  } finally { await browser.close(); }
}

verify().catch(error=>{console.error(error);process.exitCode=1;});
