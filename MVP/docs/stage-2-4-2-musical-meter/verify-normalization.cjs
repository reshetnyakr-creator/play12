'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PLAY12_TEST_BASE_URL||'http://127.0.0.1:8824';
const root=__dirname;

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAY12_TEST_CHROMIUM,args:['--no-sandbox','--disable-gpu','--single-process','--no-zygote']});
 try{
  const page=await browser.newPage();
  await page.goto(base+'/MVP/import/');
  await page.waitForFunction(()=>window.Play12Editor);
  const fixtures=fs.readdirSync(path.join(root,'fixtures')).sort().map(f=>path.join(root,'fixtures',f));
  const matrix=[];
  for(const file of [...fixtures,...process.argv.slice(2)]){
   const name=path.basename(file);
   const buffer=fs.readFileSync(file).toString('base64');
   const result=await page.evaluate(async ({name,buffer})=>{
    const bytes=Uint8Array.from(atob(buffer),c=>c.charCodeAt(0));
    const xml=name.endsWith('.mxl')?await Play12MXL.read(new File([bytes],name)):new TextDecoder().decode(bytes);
    const E=Play12Editor;
    const started=performance.now();
    const {editor}=E.importXML(xml);
    const parseMs=performance.now()-started;
    return {parseMs,totalQ:editor.total_quarters,rounds:editor.metricMap.rounds.length,
     counts:editor.metricMap.rounds.map(r=>r.counts.map(c=>[c.start,c.index,c.accent,c.subdivisions.map(s=>s.labelRU)])),
     tempo:editor.tempoMap.map(e=>[e.q,e.bpm]),marks:editor.metricMap.tempoMarks,
     fermatas:editor.fermataTimeline?.holds??[],diagnostics:[...new Set(editor.diagnostics.map(d=>d.code))].filter(d=>d!=='HAND_UNKNOWN')};
   },{name,buffer});
   matrix.push({name,...result});
  }
  const rows=Object.fromEntries(matrix.map(r=>[r.name.split('.')[0],r]));
  assert.equal(rows.M08.counts[0].length,4);
  assert.deepEqual(rows.M08.counts[0].map(c=>c[2]),['PRIMARY','WEAK','SECONDARY','WEAK']);
  assert.deepEqual(rows.M08.counts[0][0][3],[null,'И','А']);
  assert.equal(rows.M08.tempo[0][1],94.5);
  assert.deepEqual(rows.M11.counts[0].map(c=>c[2]),['PRIMARY','WEAK','SECONDARY','WEAK','WEAK']);
  assert.deepEqual(rows.M12.counts[0].map(c=>c[2]),['PRIMARY','WEAK','WEAK','SECONDARY','WEAK']);
  assert.equal(rows.M19.counts[0][0][1],3);
  assert.equal(rows.M20.totalQ,'5/1');
  assert.equal(rows.M25.fermatas.length,1);
  assert.equal(rows.M27.tempo[1][1],120);
  assert(rows.M29.diagnostics.includes('TEMPO_MARK_CONFLICT'));
  assert.equal(rows.M30.counts[0].length,0);
  assert(rows.M34.diagnostics.includes('METRIC_BEAM_GROUP_INFERRED'));
  assert.deepEqual(rows.M34.counts[0].flatMap(c=>c[2]==='SECONDARY'?[c[1]]:[]),[2,5]);
  const mReference=JSON.parse(fs.readFileSync(path.join(root,'reference.json'),'utf8'));
  const rational=value=>{const [n,d=1]=value.split('/').map(Number);return n/d;};
  for(const [name,expected] of Object.entries(mReference)){
    assert.equal(rational(rows[name].totalQ),rational(expected.totalQ),name+' score duration');
  }
  const reference=JSON.parse(fs.readFileSync(path.join(root,'play12-reference.json'),'utf8'));
  for(const [name,expected] of Object.entries(reference)){
    const counts=rows[name].counts[0];
    assert.equal(counts.length,expected.counts,name);
    assert.deepEqual(counts.flatMap(c=>c[2]==='SECONDARY'?[c[1]]:[]),expected.secondary,name);
    if(name!=='P05')assert.deepEqual(counts[0][3],expected.firstSteps,name);
  }
  assert.deepEqual(rows.P04.counts[0].map(c=>c[3].length),[1,2,3,1]);
  assert.deepEqual(rows.P05.counts[0][0][3],[null,'И','И','А']);
  assert.equal(rows.P18.counts[1].length,3);
  const perfect=matrix.find(r=>r.name.toLowerCase().includes('perfect'));
  if(perfect){
   assert.equal(perfect.rounds,69);
   assert.equal(perfect.totalQ,'414/1');
   assert.equal(perfect.tempo[0][1],94.5);
   assert(perfect.counts.every(r=>r.length===4));
  }
  // Public evidence contains timings, structural metadata and labels only.
  fs.writeFileSync(path.join(root,'normalization-results.json'),JSON.stringify(matrix.map(r=>({...r,counts:r.counts.slice(0,2)})),null,2)+'\n');
  console.log('Normalized',matrix.length,'inputs');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
