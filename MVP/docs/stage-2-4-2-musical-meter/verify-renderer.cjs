'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8826';
const out=process.env.PLAY12_TEST_OUTPUT_DIR||__dirname;

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu','--single-process','--no-zygote']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/MVP/import/');
  await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
  await page.locator('#file').setInputFiles(path.join(__dirname,'fixtures/M08.musicxml'));
  await page.locator('#save').click();
  await page.waitForFunction(()=>window.play12MainController?.document);
  const query=new URL(page.url()).search;
  const evidence=[];
  for(const locale of ['en','ru']){
   await page.goto(base+(locale==='ru'?'/ru':'')+'/MVP/main/'+query);
   await page.waitForFunction(()=>window.play12MainController?.document);
   const result=await page.evaluate(()=>{
    const svg=document.querySelector('#play12-score svg');
    const labels=[...svg.querySelectorAll('.play12-count')].map(el=>({text:el.textContent,y:Number(el.getAttribute('y'))})).sort((a,b)=>b.y-a.y);
    const accent=[...svg.querySelectorAll('.play12-count-space[fill="#CEF932"]')].map(e=>e.getAttribute('fill-opacity'));
    return {labels:labels.slice(0,12).map(l=>l.text),accent:accent.slice(0,4)};
   });
   assert.deepEqual(result.labels,locale==='ru'?['РАЗ','И','А','ДВА','И','А','ТРИ','И','А','ЧЕ','И','А']:['ONE','AND','A','TWO','AND','A','THREE','AND','A','FOUR','AND','A']);
   assert.deepEqual(result.accent,['0.36','0.12','0.24','0.12']);
   await page.locator('#play12-score').screenshot({path:path.join(out,`synthetic-12-8-${locale}.png`)});
   evidence.push({locale,...result});
  }
  fs.writeFileSync(path.join(out,'renderer-results.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log('Synthetic 12/8 verified in RU and EN');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
