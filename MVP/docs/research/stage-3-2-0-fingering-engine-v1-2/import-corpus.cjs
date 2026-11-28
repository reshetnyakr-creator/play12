'use strict';
// Run with Playwright installed. The browser is only a DOM/XML and MXL reader.
const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const {snapshot,run}=require('./engine.cjs');

async function main(){
  const sources=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const browser=await chromium.launch({
    ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),
    args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage']
  });
  try{
    const page=await browser.newPage();
    for(const script of ['core.js','mxl.js'])await page.addScriptTag({path:path.resolve(__dirname,'../../../editor',script)});
    const summary={};
    for(const [name,entry] of Object.entries(sources)){
      const started=performance.now();
      const score=await page.evaluate(async ({filename,base64,handMap})=>{
        const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
        const file=new File([bytes],filename);
        return Play12Editor.importXML(await Play12MXL.read(file),handMap);
      },{filename:path.basename(entry.path),base64:fs.readFileSync(entry.path,'base64'),
        handMap:entry.handMap??{'P1:1':'R','P1:2':'L','P2':'L'}});
      const imported=performance.now();
      const prepared=snapshot(score);
      const preparedAt=performance.now();
      const result=run(prepared);
      const end=performance.now();
      summary[name]={total:Object.keys(result.events).length,
        assigned:Object.values(result.assignments).filter(a=>a.finger!=null).length,
        importMs:imported-started,preparationMs:preparedAt-imported,
        searchAndAssemblyMs:end-preparedAt-result.verificationMs,verificationMs:result.verificationMs,
        attempts:result.attempts,rejected:result.rejected,exceptions:result.exceptions.length,
        proofs:result.validation.proofs.length,failures:result.validation.failures,
        special:result.special.map(({contacts,fingers,diagnostic})=>({contacts,fingers,diagnostic}))};
      if(process.env.SCORE_OUTPUT_DIR)fs.writeFileSync(path.join(process.env.SCORE_OUTPUT_DIR,name+'.json'),JSON.stringify({score}));
    }
    console.log(JSON.stringify(summary,null,2));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
