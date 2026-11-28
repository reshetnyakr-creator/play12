'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function verify() {
  const [base, original, screenshot51, screenshot53] = process.argv.slice(2);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM,
    args: ['--no-sandbox', '--disable-gpu', '--single-process', '--in-process-gpu', '--disable-software-rasterizer']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1060, height: 1050 } });
    await page.goto(base + '/MVP/docs/research/stage-3-0-5-physical-contact-semantics/comparison.html');
    await page.locator('#source').setInputFiles(original);
    await page.waitForFunction(() => document.getElementById('status').textContent.length > 0);
    assert.match(await page.locator('#status').textContent(), /SVG Play12 — 20$/);
    for (const [bar, screenshot] of [[51, screenshot51], [53, screenshot53]]) {
      if (screenshot) {
        await page.getByLabel('Снимок такта ' + bar).setInputFiles(screenshot);
        await page.getByAltText('Нотная запись такта ' + bar).waitFor();
      }
    }
    const rows = page.locator('tbody tr');
    assert.equal(await rows.count(), 20);
    for (const label of await page.locator('tbody tr td:last-child').allTextContents()) assert.equal(label, '3');
    await rows.first().click();
    assert.equal(await page.locator('rect.inspect').count(), 1);
    console.log('20 оригинальных событий сверены в SVG Chromium. Интерактивное выделение работает.');
  } finally {
    await browser.close();
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
