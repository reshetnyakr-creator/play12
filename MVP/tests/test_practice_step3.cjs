// Run with Node. Uses the production controller with a deterministic audio clock.
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const path = require('node:path');
const renderer = path.join(__dirname, '../renderer');
class Element {
  constructor(dataset = {}) { this.dataset = dataset; this.checked = false; this.value = '0'; this.disabled = false; this.hidden = false; this.handlers = {}; this.style = {setProperty(){}}; this.classList = {add(){},remove(){},toggle(){}}; }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  setAttribute(name,value) { this[name] = value; }
  getBoundingClientRect() {return {top:0,left:0,right:100,width:100,height:42};}
  querySelectorAll() {return [];}
  closest(){return null;}
}
class AudioContext {
  constructor(){this.currentTime=0;this.state='running';this.destination={};}
  resume(){return Promise.resolve();}
  createGain(){return {gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}},connect(){return this;}};}
  createOscillator(){const handlers=[];return {frequency:{value:0},connect(){return this;},start(at){this.startAt=at;},stop(at){this.stopAt=at;},addEventListener(event,fn){if(event==='ended')handlers.push(fn);},finish(){handlers.forEach(fn=>fn());}};}
}
function load(extra={}) {
  const window = {AudioContext, ...extra};
  const sandbox = {window, document:{addEventListener(){}}, ResizeObserver: class {observe(){}}, requestAnimationFrame(){return 1;},cancelAnimationFrame(){},setTimeout(){},console};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(renderer,'play12-playback.js'),'utf8'),sandbox);
  return {window,sandbox};
}
function make(events=[['R',72,0],['L',48,0],['L',50,1],['R',74,2]], zero=24) {
  const {window,sandbox}=load();
  const groups=events.map(([hand,midi,start],i)=>new Element({hand,midi:String(midi),eventId:String(i),globalStartQuarters:String(start),durationQuarters:'1',dynamic:'mf'}));
  const svg=new Element({totalQuarters:'8',stepQuarters:'1',cellHeight:'42',timelineOriginY:'0'}); svg.querySelectorAll=()=>groups;
  const options={svg,initialBpm:60,referenceZeroNote:24,runtimeZeroNote:zero,timelineOffset:0,rounds:[{start:0,end:8,beatQuarters:1,beats:4,measureQuarters:4}]};
  for(const name of ['stage','playline','playButton','pauseButton','restartButton','bpmInput','positionOutput','metronomeInput','countInInput','musicAudioInput','practiceModeInput','previousRoundButton','nextRoundButton','loopInput','loopGapInput','loopStartInput','loopEndInput','metronomeVolumeInput','pulse','progressHead','timecode']) options[name]=new Element();
  options.musicAudioInput.checked=true;
  const c=window.Play12Playback.start(options);
  const scheduled=[];
  c.audio.scheduleNote=(e,when,duration)=>scheduled.push({id:e.id,hand:e.hand,midi:e.midi,start:e.start,duration});
  const originalNoteOn=c.audio.noteOn.bind(c.audio);
  c.audio.noteOn=(key,midi,...args)=>{
    if(key.startsWith('robot:')) { const e=c.events.find(e=>`robot:${e.id}`===key); scheduled.push({...e}); }
    return originalNoteOn(key,midi,...args);
  };
  return {c,window,sandbox,scheduled};
}
function configure(c,left=false,right=true){c.setPracticeSettings({practiceModeEnabled:true,practiceLeftHandEnabled:left,practiceRightHandEnabled:right});}
test('RH user / LH robot; wrong note waits and correct mouse Note On resumes',async()=>{
  const {c,scheduled}=make();configure(c);await c.play();
  assert.equal(c.waitingForInput.start,0);assert.deepEqual(scheduled.map(e=>e.hand),['L']);
  c.handleNoteOn(71,100,'mouse',1);assert.equal(c.clock.running,false);
  c.handleNoteOn(72,100,'mouse',2);assert.equal(c.clock.running,true);assert.equal(c.expectedPracticeEvent.start,2);
  c.audioContext.currentTime=1;c.scheduleAhead();assert(scheduled.some(e=>e.hand==='L'&&e.start===1));assert(!scheduled.some(e=>e.hand==='R'));
});
test('LH-only filtering and robot RH at boundary',async()=>{
  const {c,scheduled}=make();configure(c,true,false);await c.play();
  assert(c.practiceEvents.every(e=>e.events.every(n=>n.hand==='L')));assert(scheduled.some(e=>e.hand==='R'));
  assert.equal(c.acceptPracticeInput(72),false);assert.equal(c.acceptPracticeInput(48),true);
});
test('Both hands require the full simultaneous pitch set',async()=>{
  const {c}=make();configure(c,true,true);await c.play();
  c.acceptPracticeInput(72);assert(c.waitingForInput);c.acceptPracticeInput(48);assert.equal(c.waitingForInput,null);
});
test('Cannot turn off the last active hand; no invented skill',()=>{
  const {c}=make();configure(c);assert.equal(c.setPracticeSettings({practiceRightHandEnabled:false}),false);
  assert.equal(c.getPracticeSettings().practiceRightHandEnabled,true);assert.equal(c.getPracticeSettings().activeSkillId,null);assert.equal(c.getPracticeSettings().oneSkillMode,false);
});
test('Pause clears partial chord but preserves expected event; paused input cannot resume',async()=>{
  const {c}=make();configure(c,true,true);await c.play();const expected=c.waitingForInput;c.acceptPracticeInput(72);c.requestPause();
  assert.equal(c.expectedPracticeEvent,expected);assert.equal(expected.matchedPitches.size,0);assert.equal(c.acceptPracticeInput(48),false);assert.equal(c.clock.running,false);
  await c.play();assert.equal(c.waitingForInput,expected);c.acceptPracticeInput(48);assert(c.waitingForInput);c.acceptPracticeInput(72);assert(c.clock.running);
});
test('Restart retains settings and resets expected event',async()=>{
  const {c}=make();configure(c);await c.play();c.acceptPracticeInput(72);c.restart();
  assert(c.practiceEnabled());assert.equal(c.practiceSettings.practiceLeftHandEnabled,false);assert.equal(c.clock.position,0);assert.equal(c.expectedPracticeEvent.start,0);assert.equal(c.expectedPracticeEvent.completed,false);assert.equal(c.clock.running,false);
});
test('Practice OFF from wait resumes ordinary playback, then ON rearms',async()=>{
  const {c,scheduled}=make();configure(c);await c.play();c.setPracticeSettings({practiceModeEnabled:false});
  assert.equal(c.waitingForInput,null);assert.equal(c.clock.ceiling,Infinity);assert(c.clock.running);assert(scheduled.some(e=>e.hand==='R'));
  c.setPracticeSettings({practiceModeEnabled:true});assert(c.waitingForInput);
});
test('Practice OFF while manually paused remains paused',async()=>{
  const {c}=make();configure(c);await c.play();c.requestPause();c.setPracticeSettings({practiceModeEnabled:false});assert.equal(c.clock.running,false);
});
test('Runtime zero uses effective pitch, including changing zero while waiting',async()=>{
  const {c}=make(undefined,26);configure(c);await c.play();assert.equal(c.acceptPracticeInput(72),false);assert.equal(c.acceptPracticeInput(74),true);
  c.restart();await c.play();c.setRuntimeZeroNote(25);assert.equal(c.acceptPracticeInput(74),false);assert.equal(c.acceptPracticeInput(73),true);
});
test('Physical MIDI message code path shares the same gate and Note Off',async()=>{
  const {c,window,sandbox}=make();configure(c);await c.play();
  vm.runInContext(readFileSync(path.join(renderer,'web-midi-diagnostic.js'),'utf8'),Object.assign(sandbox,{navigator:{requestMIDIAccess(){}}}));
  const fields={};const midi=window.Play12MidiDiagnostic.create({root:{querySelector:id=>fields[id] ||= new Element()},enableButton:new Element(),pianoView:{keys:new Map([[72,true],[71,true]])},noteEvents:c});
  const input={id:'test-controller',name:'Simulated input',manufacturer:'test'};
  midi.handleMessage({data:[0x90,71,100]},input);assert(c.waitingForInput);
  midi.handleMessage({data:[0x90,72,100]},input);assert(c.clock.running);
  midi.handleMessage({data:[0x90,72,0]},input);assert.equal(midi.activeMidiNotes.has(72),false);
});
test('No duration gate; early tolerance and repeated pitch events',async()=>{
  const {c}=make([['R',72,0],['R',72,1]]);configure(c);await c.play();c.acceptPracticeInput(72);
  assert.equal(c.acceptPracticeInput(72),false);c.audioContext.currentTime=.9;assert.equal(c.acceptPracticeInput(72),true);assert.equal(c.expectedPracticeEvent,null);
});
test('Natural end can replay a fresh Practice pass without Restart',async()=>{
  const {c}=make([['R',72,0]]);configure(c);await c.play();c.acceptPracticeInput(72);c.audioContext.currentTime=9;c.tick();assert.equal(c.clock.position,8);await c.play();assert(c.waitingForInput);assert.equal(c.waitingForInput.start,0);
});
test('Approved manual RH has no simultaneous note set; source remains 9 rounds',()=>{
  const doc=JSON.parse(readFileSync(path.join(__dirname,'../examples/when_the_saints_manual.play12.json')));
  const measures=doc.score.parts[0].measures;assert.equal(measures.length,9);
  for(const m of measures){const starts=m.events.filter(e=>e.kind==='note'&&e.hand==='R').map(e=>e.start_quarters);assert.equal(new Set(starts).size,starts.length);}
});
function onboarding(saved=null, midiDiagnostic=null) {
  const {c,window,sandbox}=make();const nodes=new Map();
  const node=id=>{if(!nodes.has(id)) {const e=new Element(); const classes=new Set();e.classList={add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},toggle(x,on){on ? classes.add(x):classes.delete(x);},contains(x){return classes.has(x);}};e.removeAttribute=name=>delete e[name];e.animate=()=>{};e.appendChild=child=>child.parentElement=e;e.insertBefore=e.appendChild;nodes.set(id,e);}return nodes.get(id);};
  const root=node('root');root.querySelector=node;const progress=[1,2,3,4].map(n=>{const e=node(`progress${n}`);e.dataset.progressStep=String(n);return e;});
  const views=['WELCOME','MIDI_CONNECT','LISTEN_AND_CONTROL'].map(n=>{const e=node(n);e.dataset.onboardingView=n;return e;});
  root.querySelectorAll=q=>q==='[data-progress-step]'?progress:q==='[data-onboarding-view]'?views:[];
  const values=new Map(saved?[['play12.onboarding.state.v1',JSON.stringify(saved)]]:[]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),get length(){return values.size;},key:i=>[...values.keys()][i]};
  const listeners={};const timers=new Map();let timerId=0;
  window.addEventListener=(name,fn)=>(listeners[name] ||= []).push(fn);window.dispatchEvent=event=>(listeners[event.type]||[]).forEach(fn=>fn(event));
  window.setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;};
  Object.assign(sandbox,{document:{body:node('body'),documentElement:node('html'),addEventListener(){},getElementById:node},URLSearchParams,location:{hostname:'127.0.0.1',search:''},Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type){this.type=type;}},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(readFileSync(path.join(renderer,'play12-onboarding.js'),'utf8'),sandbox);
  const controller=window.Play12Onboarding.create({root,startButton:node('start'),continueButton:node('continue'),storage});
  c.stage.parentElement=node('home');controller.connectRuntime({playback:c,noteEvents:c,stage:c.stage,midiDiagnostic});
  return {controller,c,node,root,values,window,timers};
}
test('A/B: natural Listen → Zero → Step 3; no autoplay, delayed guide, actual controls advance',async()=>{
  const h=onboarding();h.controller.startNew();h.node('#onboarding-demo').handlers.click();
  assert.equal(h.controller.getState().midiVerified,false);
  // Drive the same snapshot listener used by the playback clock through the learned sequence.
  for(const snapshot of [{state:'playing',position:1,running:true},{state:'paused',position:2,running:false},{state:'playing',position:2,running:true},{state:'paused',position:8,running:false,ended:true}]) for(const listener of h.c.stateListeners) listener(snapshot);
  assert.equal(h.controller.getState().onboardingStep,'CHOOSE_ZERO');
  h.window.dispatchEvent({type:'play12:zero-confirmed'});
  assert.equal(h.controller.getState().onboardingStep,'TRY_IT_YOURSELF');assert.equal(h.c.clock.running,false);assert.equal(h.c.practiceEnabled(),false);
  assert.equal(h.node('#practice-board').hidden,false);assert.equal(h.node('#onboarding-listen-coach').hidden,true);
  for(const timer of [...h.timers.values()]) timer.fn();
  assert.match(h.node('#onboarding-listen-prompt').innerHTML,/turn on Practice Mode/);
  h.node('#practice-board-mode').handlers.click();assert.match(h.node('#onboarding-listen-prompt').innerHTML,/Turn off Left Hand/);
  h.node('#practice-left-hand').handlers.click();assert.match(h.node('#onboarding-listen-prompt').innerHTML,/music will wait/);assert.equal(h.c.clock.running,false);
  assert(h.node('progress1').classList.contains('is-complete'));assert(h.node('progress2').classList.contains('is-complete'));assert(h.node('progress3').classList.contains('is-active'));assert(!h.node('progress4').classList.contains('is-active'));
  await h.c.play();assert.equal(h.node('#onboarding-listen-coach').hidden,true);
  h.c.acceptPracticeInput(72);h.c.audioContext.currentTime=2;h.c.tick();h.c.acceptPracticeInput(74);h.c.audioContext.currentTime=10;h.c.tick();
  assert.equal(h.controller.getState().onboardingStep,'TRY_IT_YOURSELF');assert.equal(h.controller.getState().practiceGuideStage,'complete');
});
test('Practice settings persist in existing key; Continue restores and Start re-teaches',()=>{
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',practiceGuideStage:'playing',practiceModeEnabled:true,practiceLeftHandEnabled:false,practiceRightHandEnabled:true,inputMode:'demo',chooseZeroCompleted:true});
  h.controller.continueSession();assert(h.c.practiceEnabled());assert.equal(h.c.practiceSettings.practiceLeftHandEnabled,false);
  h.node('#practice-left-hand').handlers.click();const saved=JSON.parse(h.values.get('play12.onboarding.state.v1'));assert.equal(saved.practiceLeftHandEnabled,true);
  assert.deepEqual([...h.values.keys()].sort(),['play12.onboarding.state.v1','play12.session.exists.v1']);
  h.controller.startNew();assert.equal(h.c.practiceEnabled(),false);assert.equal(h.c.practiceSettings.practiceLeftHandEnabled,true);assert.equal(h.c.practiceSettings.practiceRightHandEnabled,true);
});
test('Penultimate Y playback and Practice use orange Y for every runtime zero',async()=>{
  const doc=JSON.parse(readFileSync(path.join(__dirname,'../examples/when_the_saints_manual.play12.json')));
  const note=doc.score.parts[0].measures[7].events.find(e=>e.id==='manual.m7.e52');
  for(let zero=21;zero<=32;zero++){
    const {c,scheduled}=make([['L',note.pitch.midi,0],['L',55,0]],zero);
    await c.play();assert(scheduled.some(e=>e.midi===47+zero-24));
    c.restart();configure(c,true,false);await c.play();
    assert.equal(c.acceptPracticeInput(59+zero-24),false);
    assert.equal(c.acceptPracticeInput(47+zero-24),true);
    assert(c.waitingForInput);c.acceptPracticeInput(55+zero-24);assert(c.clock.running);
  }
});
test('Long robot notes keep one attack across two gates and Pause/Resume, for either hand',async()=>{
  for(const userHand of ['L','R']){
    const robotHand=userHand==='L'?'R':'L';
    const {c,scheduled}=make([[robotHand,72,0],[userHand,48,1],[userHand,50,2]]);
    c.events[0].duration=4;configure(c,userHand==='L',userHand==='R');await c.play();
    const voice=c.audio.voices.get('robot:0');assert(voice);assert.equal(scheduled.length,1);
    c.audioContext.currentTime=1;c.tick();assert(c.waitingForInput);assert.equal(c.audio.voices.get('robot:0'),voice);
    c.acceptPracticeInput(48);assert.equal(scheduled.length,1);
    c.requestPause();assert.equal(c.audio.voices.get('robot:0'),voice);await c.play();assert.equal(c.audio.voices.get('robot:0'),voice);
    c.audioContext.currentTime=2;c.tick();assert(c.waitingForInput);c.acceptPracticeInput(50);assert.equal(scheduled.length,1);
    c.audioContext.currentTime=4;c.scheduleAhead();assert.equal(c.robotEvents.get('0').status,'completed');voice.oscillators[0].finish();assert.equal(c.audio.voices.has('robot:0'),false);
    c.restart();assert.equal(c.robotEvents.size,0);await c.play();assert.equal(scheduled.length,2);
  }
});
test('Unlocked steps navigate without progress loss; Continue chooses 3 after revisiting 1/2',()=>{
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',chooseZeroCompleted:true,listenFragmentCompleted:true,practiceModeEnabled:true,practiceLeftHandEnabled:false,practiceRightHandEnabled:true,practiceGuideStage:'playing',inputMode:'demo'});
  h.values.set('play12.zero_note.midi','26');h.values.set('play12.zero_note.pitch_class','2');
  h.controller.continueSession();assert.equal(h.root.dataset.onboardingStep,'TRY_IT_YOURSELF');
  assert.equal(h.node('progress4')['aria-disabled'],'true');h.node('progress4').handlers.click();assert.equal(h.root.dataset.onboardingStep,'TRY_IT_YOURSELF');
  h.node('progress1').handlers.click();assert.equal(h.root.dataset.onboardingStep,'LISTEN_AND_CONTROL');assert.equal(h.c.practiceEnabled(),false);assert(h.controller.getState().chooseZeroCompleted);
  h.controller.continueSession();assert.equal(h.root.dataset.onboardingStep,'TRY_IT_YOURSELF');assert(h.c.practiceEnabled());assert.equal(h.c.practiceSettings.practiceLeftHandEnabled,false);
  h.node('progress2').handlers.click();assert.equal(h.root.dataset.onboardingStep,'CHOOSE_ZERO');h.node('progress3').handlers.click();assert.equal(h.root.dataset.onboardingStep,'TRY_IT_YOURSELF');
  assert.equal(h.values.get('play12.zero_note.midi'),'26');assert.equal(h.values.get('play12.zero_note.pitch_class'),'2');
});
test('Returning verified MIDI checks current availability and reconnects without tutorial',()=>{
  let listener, calls=0;
  const midi={currentStatus:{status:'no-input'},enable(){calls++;listener({status:'no-input'});},addStatusListener(fn){listener=fn;return ()=>{};}};
  const h=onboarding({onboardingStep:'LISTEN_AND_CONTROL',chooseZeroCompleted:true,listenFragmentCompleted:true,midiVerified:true,inputMode:'midi',practiceGuideStage:'playing'},midi);
  h.controller.continueSession();assert.equal(calls,1);assert.equal(h.root.dataset.onboardingStep,'TRY_IT_YOURSELF');assert(h.controller.getState().midiVerified);assert.equal(h.node('#returning-midi').hidden,false);
  listener({status:'connected'});assert.equal(h.node('#returning-midi').hidden,true);
  listener({status:'no-input'});assert.equal(h.node('#returning-midi').hidden,false);h.node('#returning-midi-retry').handlers.click();assert.equal(calls,2);assert.equal(h.root.dataset.onboardingStep,'TRY_IT_YOURSELF');
});
test('Geometry extends inner clip to fixed Playback at top/middle/bottom scroll and resize',()=>{
  const {c,sandbox}=make();
  sandbox.document.body={classList:{contains:()=>true}};sandbox.getComputedStyle=()=>({borderLeftWidth:'1'});
  const shell=new Element(), cell=new Element();cell.getAttribute=()=> '24';
  c.svg.isConnected=true;c.svg.parentElement=new Element();c.svg.querySelector=()=>cell;c.svg.querySelectorAll=()=>[cell];
  c.stage.closest=()=>true;c.stage.querySelector=()=>shell;
  c.pianoView={mount:new Element(),setActiveMidis(){}};c.pianoView.mount.isConnected=true;
  for(const top of [200,0,-450]) for(const boundary of [350,600]){
    c.stage.getBoundingClientRect=()=>({top,left:0,right:300,width:300});
    c.playline.getBoundingClientRect=()=>({top:boundary,left:0,right:300,width:300});
    c.layoutCoreGeometry();
    assert.equal(top+parseFloat(c.svg.parentElement.style.height),boundary+1);
    assert.equal(shell.style.height,c.svg.parentElement.style.height);assert.equal(c.svg.parentElement.style.overflow,'hidden');
  }
});
test('Returning MIDI unavailable browser stays in Practice without a failed API call',()=>{
  const midi={currentStatus:{status:'unavailable'},enable(){throw Error('Unavailable API must not be called');},addStatusListener(){return ()=>{};}};
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',chooseZeroCompleted:true,midiVerified:true,inputMode:'midi'},midi);
  h.controller.continueSession();assert.equal(h.root.dataset.onboardingStep,'TRY_IT_YOURSELF');assert.equal(h.node('#returning-midi').hidden,false);
});
test('Robot Note Off is scheduled on audio time and finishes during a long gate, without retrigger',async()=>{
  const {c,scheduled}=make([['R',72,0],['L',48,.25],['L',50,2]]);configure(c,true,false);
  let offs=0;const originalOff=c.audio.noteOff.bind(c.audio);c.audio.noteOff=(key,...args)=>{if(key==='robot:0')offs++;return originalOff(key,...args);};
  await c.play();const voice=c.audio.voices.get('robot:0');
  assert.equal(offs,1);assert.equal(voice.oscillators[0].stopAt,1.025);
  c.audioContext.currentTime=.25;c.tick();assert(c.waitingForInput);
  c.audioContext.currentTime=10;voice.oscillators.forEach(o=>o.finish());c.tick();
  assert.equal(c.clock.position,.25);assert.equal(c.robotEvents.get('0').status,'completed');assert.equal(c.audio.voices.has('robot:0'),false);
  c.acceptPracticeInput(48);assert(c.clock.running);assert.equal(offs,1);assert.equal(scheduled.filter(e=>e.id==='0').length,1);
});
test('Chord accepts up to 150 ms inclusive; expired partial set never carries forward',async()=>{
  for(const span of [.11,.15,.151,.7]){
    const {c}=make([['R',60,0],['R',64,0],['R',67,0]],26);configure(c);await c.play();
    c.handleNoteOn(62,100,'midi',1);c.audioContext.currentTime=.055;c.handleNoteOn(66,100,'mouse',2);c.audioContext.currentTime=span;c.handleNoteOn(69,100,'midi',3);
    assert.equal(c.clock.running,span<=.15);
    if(span>.15){assert.equal(c.waitingForInput.matchedPitches.size,1);c.audioContext.currentTime=span+.05;c.acceptPracticeInput(62);c.audioContext.currentTime=span+.1;c.acceptPracticeInput(66);assert(c.clock.running);}
  }
});
test('Chord expiry clears on tick; wrong note cannot extend window; Restart clears candidate',async()=>{
  const {c}=make([['R',60,0],['R',64,0]]);configure(c);await c.play();c.acceptPracticeInput(60);
  c.audioContext.currentTime=.1;c.acceptPracticeInput(70);c.audioContext.currentTime=.151;c.tick();assert.equal(c.waitingForInput.matchedPitches.size,0);assert.equal(c.waitingForInput.candidateStartedAt,null);
  c.acceptPracticeInput(64);assert(c.waitingForInput);c.restart();assert.equal(c.expectedPracticeEvent.matchedPitches.size,0);assert.equal(c.expectedPracticeEvent.candidateStartedAt,null);
});
test('Skip advances implemented stages without zero/progress loss, then leaves free Practice',()=>{
  const h=onboarding();h.values.set('play12.zero_note.midi','26');h.controller.startNew();
  const skip=()=>h.node('#onboarding-skip').handlers.click();skip();assert.equal(h.root.dataset.onboardingStep,'LISTEN_AND_CONTROL');
  skip();assert.equal(h.root.dataset.onboardingStep,'CHOOSE_ZERO');skip();assert.equal(h.root.dataset.onboardingStep,'TRY_IT_YOURSELF');
  h.node('#practice-board-mode').handlers.click();skip();assert.equal(h.root.dataset.onboardingStep,'TRY_IT_YOURSELF');assert.equal(h.controller.getState().practiceGuideStage,'free');assert(h.c.practiceEnabled());
  assert.equal(h.values.get('play12.zero_note.midi'),'26');assert.equal(h.node('#onboarding-listen-coach').hidden,true);assert.equal(h.timers.size,0);assert.equal(h.node('progress4')['aria-disabled'],'true');
});
test('Instruction timeout is 12s, one timer per hint, does not perform the action or reappear',()=>{
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',chooseZeroCompleted:true,practiceGuideStage:'enable',inputMode:'demo'});h.controller.continueSession();
  assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,12000);
  [...h.timers.values()][0].fn();assert.equal(h.node('#onboarding-listen-coach').hidden,true);assert.equal(h.c.practiceEnabled(),false);assert.equal(h.timers.size,0);
  h.c.emitState();assert.equal(h.node('#onboarding-listen-coach').hidden,true);assert.equal(h.timers.size,0);
  h.node('#practice-board-mode').handlers.click();assert.match(h.node('#onboarding-listen-prompt').innerHTML,/Left Hand/);assert.equal(h.timers.size,1);
  h.node('#practice-left-hand').handlers.click();assert.equal(h.timers.size,1);assert.match(h.node('#onboarding-listen-prompt').innerHTML,/music will wait/);
  h.node('progress2').handlers.click();assert.equal(h.timers.size,0);
});
