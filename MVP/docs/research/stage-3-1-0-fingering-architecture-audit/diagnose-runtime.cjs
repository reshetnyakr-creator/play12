const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root=require('node:path').resolve(__dirname,'../../..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();
  for(const script of ['core','contact-plan','beginner-transition']) await page.addScriptTag({path:root+'/editor/'+script+'.js'});
  const profile=require(root+'/editor/beginner.json');
  const [clocks,interstellar]=process.argv.slice(2);
  if (!clocks || !interstellar) throw Error('Supply local MusicXML paths for Clocks and Interstellar Suite.');
  const ownFixtures = {
    fiveFinger: ['C','D','E','F','G','F','E','D'],
    blackKeys: ['C','D','E','F#','G','F#','E','D']
  };
  const scores = {
    clocks: fs.readFileSync(clocks,'utf8'),
    interstellar: fs.readFileSync(interstellar,'utf8'),
    saints: fs.readFileSync(root+'/music/beginner/when_the_saints_play12_beginner.musicxml','utf8')
  };
  for (const [name, notes] of Object.entries(ownFixtures)) {
    const body = notes.map(n => '<note><pitch><step>'+n[0]+'</step>'+
      (n.length>1?'<alter>1</alter>':'')+'<octave>4</octave></pitch><duration>1</duration></note>').join('');
    scores[name]='<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'+
      '<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>8</beats>'+
      '<beat-type>4</beat-type></time></attributes>'+body+'</measure></part></score-partwise>';
  }
  for(const [name,xml] of Object.entries(scores)){
   console.log(JSON.stringify(await page.evaluate(({name,xml,profile})=>{
    const E=Play12Editor;
    const imported=E.importXML(xml,{'P1:1':'R','P1:2':'L','P2':'L'});
    const score=imported;
    const notes=E.events(score);
    const baseline=Play12BeginnerTransition.proposeBeginner(score,profile,{},false);
    const run=E.recoverPartial(score,baseline,{});
    const conflicts=run.validation?.conflicts;
    return {name,notes:notes.length,hands:[...new Set(notes.map(e=>e.hand))],baseline:Object.keys(baseline.assignments).length,assigned:Object.keys(run.assignments).length,search:run.search_status,conflicts:conflicts?.length??null,reasonCounts:Object.keys(run.reasons??{}).length,physical:run.validation?.physical??null,warnings:run.validation?.warnings?.length??null};
   },{name,xml,profile})));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
