'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PLAY12_TEST_BASE_URL || 'http://127.0.0.1:8371';
const root = __dirname;
const sources = process.argv.slice(2);
const cases = fs.readdirSync(path.join(root,'fixtures')).filter(f=>f.endsWith('.musicxml')).sort();
const config = JSON.parse(fs.readFileSync('MVP/editor/beginner.json','utf8'));
const auditPath = name => path.join(root,'results',name);
const write = (name, data) => fs.writeFileSync(auditPath(name),JSON.stringify(data,null,2)+'\n');

async function run(){
  const browser = await chromium.launch({
    executablePath:process.env.PLAY12_TEST_CHROMIUM || '/usr/bin/chromium',
    args:['--no-sandbox','--disable-gpu','--no-zygote','--single-process']
  });
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await page.goto(base+'/ru/MVP/import/');
    await page.waitForFunction(()=>window.Play12Editor);
    await page.addScriptTag({url:base+'/MVP/renderer/play12-playback.js'});
    const matrix = [];
    if(!process.env.PLAY12_AUDIT_UI_ONLY) for(const file of [...cases.map(f=>path.join(root,'fixtures',f)),...sources]){
      const row = await page.evaluate(async ({name,bytes,config})=>{
        const E=window.Play12Editor;
        try{
          const xml=name.endsWith('.mxl')?await Play12MXL.read(new File([Uint8Array.from(bytes)],name)):new TextDecoder().decode(Uint8Array.from(bytes));
          const dom=E.parseMusicXML(xml);
          const hands={};
          for(const part of dom.documentElement.querySelectorAll('part')){
            const id=part.getAttribute('id');
            hands[id]='R';
            for(const staff of part.querySelectorAll('note > staff'))hands[id+':'+staff.textContent.trim()]=staff.textContent.trim()==='2'?'L':'R';
          }
          const score=E.importXML(xml,hands);
          const {editor}=score;
          const rounds=editor.fermataTimeline?.rounds??editor.rounds;
          const tempo=editor.fermataTimeline?.tempoMap??editor.tempoMap;
          const original=tempo[0].bpm;
          const clock=new Play12Playback.PlaybackClock({currentTime:0},Math.round(original),0,tempo,original);
          clock.setBpm(Math.round(original),true);
          const total=rounds.at(-1).end;
          const samples=rounds.map(r=>Math.abs(clock.advanceBySeconds(0,clock.secondsBetween(0,r.end))-r.end));
          const worker=new Worker('/MVP/editor/worker.js');
          const fingering=await new Promise(resolve=>{
            const timer=setTimeout(()=>{worker.terminate();resolve({error:'timeout after 25 s'});},25000);
            worker.onmessage=({data})=>{
              clearTimeout(timer);worker.terminate();
              resolve(data.error?{error:data.error}:{assigned:data.run.assigned,total:data.run.total,searchStatus:data.run.search_status,feasibility:data.run.feasibility});
            };
            worker.onerror=e=>{clearTimeout(timer);worker.terminate();resolve({error:e.message});};
            worker.postMessage({score,config,locks:{}});
          });
          return {name,rounds:rounds.map(({start,end,beats,beatType,beatQuarters,measureQuarters,beatsAt})=>({start,end,beats,beatType,beatQuarters,measureQuarters,beatsAt})),
            bpmDisplay:Math.round(original),tempo,clockSeconds:clock.secondsBetween(0,total),maxRoundTripErrorQ:Math.max(...samples),
            preCountFirst:Play12Playback.preCountPlan(rounds[0],rounds[0].start),
            noteCount:E.events(score).length,fingering,diagnostics:[...new Set(editor.diagnostics.map(d=>d.code))]};
        }catch(error){return {name,error:error.message};}
      },{name:path.basename(file),bytes:Array.from(fs.readFileSync(file)),config});
      matrix.push(row);
      console.log(row.name,row.error??`${row.rounds.length} rounds, ${row.clockSeconds.toFixed(6)} s, ${row.fingering.assigned??row.fingering.error} assigned`);
      write('browser-matrix.json',matrix);
    }
    if(process.env.PLAY12_AUDIT_CORE_ONLY)return;
    const casesForUi=process.env.PLAY12_AUDIT_MINUTE ? sources.filter(f=>/perfect/i.test(f)) : [...['M03','M06','M08','M17','M19','M25'].map(c=>path.join(root,'fixtures',c+'.musicxml')),...sources.filter(f=>/perfect/i.test(f))];
    const ui=[];
    for(const file of casesForUi){
      const name=/^M[0-9]/.test(path.basename(file))?path.basename(file,'.musicxml'):'Perfect';
      try {
        await page.goto(base+'/ru/MVP/import/');
        await page.waitForFunction(()=>document.querySelector('#file')?.disabled===false);
        await page.locator('#file').setInputFiles(file);
        await page.waitForFunction(()=>!document.querySelector("#save")?.hidden);
        await page.locator('#save').click();
        await page.waitForFunction(()=>window.play12Playback&&window.play12MainController?.document,null,{timeout:30000});
        const row=await page.evaluate(()=>{
          const p=play12Playback;
          window.auditClicks=[]; window.auditPulses=[]; window.auditNotes=[];
          const scheduleNote=p.audio.scheduleNote.bind(p.audio);
          p.audio.scheduleNote=(event,when,quarters,bpm,seconds)=>{auditNotes.push({when,quarters,seconds,start:event.start});return scheduleNote(event,when,quarters,bpm,seconds);};
          const flash=p.flashBeatLamp.bind(p);
          p.flashBeatLamp=(beat)=>{auditPulses.push(p.audioContext.currentTime);return flash(beat);};
          for(const a of [p.audio,p.metronomeAudio].filter(Boolean)){
            const actual=a.scheduleClick.bind(a);
            a.scheduleClick=(key,time,accent)=>{window.auditClicks.push({key,time,accent});return actual(key,time,accent);};
          }
          return {rounds:p.rounds.length,clockSeconds:p.clock.secondsBetween(0,p.rounds.at(-1).end),first:p.rounds[0],bpm:p.clock.bpm,effective:p.clock.effectiveBpmAt(0),countLabels:[...document.querySelectorAll('svg .play12-count-beat, svg .play12-count-primary')].map(n=>n.textContent).filter(x=>/^(РАЗ|ДВА|ТРИ|ЧЕ|ONE|TWO|THREE|FOUR|[5-9]|1[0-2])$/.test(x)).slice(0,36)};
        });
        await page.locator('#tempo-metronome').click();
        await page.locator('#play').click();
        await page.waitForFunction(()=>auditClicks.filter(e=>e.key.startsWith('steady-')).length>=3);
        if(process.env.PLAY12_AUDIT_MINUTE){
          await page.waitForFunction(()=>play12Playback.clock.position>=95,null,{timeout:75000});
          const measurement=await page.evaluate(()=>{
            const p=play12Playback, start=p.clock.quarterToAudioTime(0);
            const clicks=auditClicks.filter(c=>c.key.startsWith('steady-')).map(c=>c.time-start);
            const range=(list,end)=>list.filter(t=>t>=-1e-7&&t<end-1e-7).length;
            return {allClickEvents:auditClicks.map(c=>({...c,time:c.time-start})), clickTimesSeconds:clicks, pulsesSeconds:auditPulses.map(t=>t-start), firstBar:range(clicks,p.clock.secondsBetween(0,6)), firstMinute:range(clicks,60), expectedMinuteRate:p.clock.effectiveBpmAt(0)};
          });
          write('perfect-minute.json',measurement);
          console.log('Perfect first bar / first minute / systematic rate',measurement.firstBar,measurement.firstMinute,measurement.expectedMinuteRate);
          return;
        }
        row.playback=await page.evaluate(()=>({clicks:auditClicks.slice(),clock:play12Playback.clock.position,
          beatCounter:play12Playback.metronomeBeatCounter,visualPulseTimes:auditPulses.slice(),scheduledNotes:auditNotes.slice(),renderPosition:play12Playback.stage.dataset.scoreQuarter??null}));
        if(name==='Perfect')delete row.playback.scheduledNotes;
        await page.locator('#pause').click();
        await page.waitForFunction(()=>!play12Playback.clock.running);
        await page.locator('#restart').click();
        await page.locator('#practice-board-mode').click();
        await page.locator('#play').click();
        await page.waitForFunction(()=>play12Playback.waitingForInput);
        row.practice=await page.evaluate(()=>({waiting:Boolean(play12Playback.waitingForInput), expected:play12Playback.expectedPracticeEvent?.start,
          midi:play12Playback.expectedPracticeEvent?.required?.size??null, clicks:auditClicks.slice(-3)}));
        await page.locator('#pause').click();
        await page.waitForFunction(()=>!play12Playback.clock.running);
        await page.locator('#practice-board-mode').click();
        await page.locator('#restart').click();
        await page.locator('#round-loop-toggle').click();
        await page.locator('#round-precount-toggle').click();
        await page.locator('#play').click();
        await page.waitForFunction(()=>play12Playback.countIn);
        row.preCount=await page.evaluate(()=>({plan:play12Playback.countIn.plan,clicks:auditClicks.slice(-3)}));
        if(name==='M03'||name==='M06'||name==='M08'){
          await page.waitForFunction(()=>play12Playback.loopWrapCount>0,null,{timeout:25000});
          row.loopWrap=await page.evaluate(()=>play12Playback.loopWrapCount);
        }
        ui.push({name,...row});
        console.log('UI',name,'OK');
      }catch(error){if(process.env.PLAY12_AUDIT_MINUTE)throw error; const status=await page.locator("#status").textContent({timeout:800}).catch(()=>null); ui.push({name,error:error.message,status,url:page.url()}); console.log("UI",name,error.message,status);}
      write('browser-ui.json',{browser:browser.version(),ui,errors});
    }
    assert(cases.length>=30);
  }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
