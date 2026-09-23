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
  const window = {AudioContext, dispatchEvent(){}, ...extra};
  const sandbox = {window, document:{handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}}, ResizeObserver: class {observe(){}}, requestAnimationFrame(){return 1;},cancelAnimationFrame(){},setTimeout(){},setInterval(){return 1;},clearInterval(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},console};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(renderer,'play12-playback.js'),'utf8'),sandbox);
  return {window,sandbox};
}
function make(events=[['R',72,0],['L',48,0],['L',50,1],['R',74,2]], zero=24, metronome=false) {
  const {window,sandbox}=load();
  const groups=events.map(([hand,midi,start],i)=>new Element({hand,midi:String(midi),eventId:String(i),globalStartQuarters:String(start),durationQuarters:'1',dynamic:'mf'}));
  const svg=new Element({totalQuarters:'8',stepQuarters:'1',cellHeight:'42',timelineOriginY:'0'}); svg.querySelectorAll=()=>groups;
  const options={svg,initialBpm:60,referenceZeroNote:24,runtimeZeroNote:zero,timelineOffset:0,rounds:[{start:0,end:8,beatQuarters:1,beats:4,measureQuarters:4}]};
  for(const name of ['stage','playline','playButton','pauseButton','restartButton','bpmInput','positionOutput','metronomeInput','countInInput','musicAudioInput','practiceModeInput','previousRoundButton','nextRoundButton','loopInput','loopGapInput','loopStartInput','loopEndInput','metronomeVolumeInput','pulse','progressHead','timecode']) options[name]=new Element();
  options.musicAudioInput.checked=true;
  if(metronome) Object.assign(options,{metronomeButton:new Element(),bpmMinus:new Element(),bpmPlus:new Element(),beatLamp:new Element(),originalTempo:60});
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
  const {c,window,sandbox}=make();const keydown=sandbox.document.handlers.keydown;const nodes=new Map();
  const node=id=>{if(!nodes.has(id)) {const e=new Element(); const classes=new Set();e.classList={add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},toggle(x,on){on ? classes.add(x):classes.delete(x);},contains(x){return classes.has(x);}};e.removeAttribute=name=>delete e[name];e.animate=()=>{};e.appendChild=child=>child.parentElement=e;e.insertBefore=e.appendChild;e.prepend=e.appendChild;nodes.set(id,e);}return nodes.get(id);};
  const root=node('root');root.querySelector=node;const progress=[1,2,3,4].map(n=>{const e=node(`progress${n}`);e.dataset.progressStep=String(n);return e;});
  const views=['WELCOME','MIDI_CONNECT','LISTEN_AND_CONTROL'].map(n=>{const e=node(n);e.dataset.onboardingView=n;return e;});
  root.querySelectorAll=q=>q==='[data-progress-step]'?progress:q==='[data-onboarding-view]'?views:[];
  const values=new Map(saved?[['play12.onboarding.state.v1',JSON.stringify(saved)]]:[]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),get length(){return values.size;},key:i=>[...values.keys()][i]};
  const listeners={};const timers=new Map();let timerId=0;
  window.addEventListener=(name,fn)=>(listeners[name] ||= []).push(fn);window.dispatchEvent=event=>(listeners[event.type]||[]).forEach(fn=>fn(event));
  window.setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;};
  Object.assign(sandbox,{document:{body:node('body'),documentElement:node('html'),addEventListener(){},getElementById:id=>id==='play12-onboarding'?root:node('#'+id)},URLSearchParams,location:{hostname:'127.0.0.1',search:''},Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type){this.type=type;}},clearTimeout:id=>timers.delete(id)});
  window.Play12Coach={create:()=>({show(){},stop(){}})};
  vm.runInContext(readFileSync(path.join(renderer,'play12-onboarding.js'),'utf8'),sandbox);
  const controller=window.Play12Onboarding.create({root,startButton:node('start'),continueButton:node('continue'),storage});
  c.stage.parentElement=node('home');controller.connectRuntime({playback:c,noteEvents:c,stage:c.stage,midiDiagnostic});
  return {controller,c,node,root,values,window,timers,keydown};
}
test('A/B: natural Listen → Zero → Step 3; no autoplay, delayed guide, actual controls advance',async()=>{
  const h=onboarding();h.controller.startNew();h.node('#onboarding-demo').handlers.click();
  assert.equal(h.controller.getState().midiVerified,false);
  // Drive the same snapshot listener used by the playback clock through the learned sequence.
  for(const snapshot of [{state:'playing',position:1,running:true},{state:'paused',position:2,running:false},{state:'playing',position:2,running:true},{state:'paused',position:8,running:false,ended:true}]) for(const listener of h.c.stateListeners) listener(snapshot);
  assert.equal(h.controller.getState().onboardingStep,'CHOOSE_ZERO');
  h.window.dispatchEvent({type:'play12:zero-confirmed'});
  assert.equal(h.controller.getState().onboardingStep,'CHOOSE_ZERO');assert.equal(h.controller.getState().zeroSetupStage,'cards');assert.equal(h.c.clock.running,false);assert.equal(h.c.practiceEnabled(),false);
  assert.equal(h.node('#practice-board').hidden,true);assert.match(h.node('#onboarding-listen-prompt').innerHTML,/Set up your Play12 cards/);
  h.node('#onboarding-skip').handlers.click();
  assert.equal(h.controller.getState().onboardingStep,'TRY_IT_YOURSELF');assert.equal(h.node('#practice-board').hidden,false);
  assert.match(h.node('#onboarding-listen-prompt').innerHTML,/Turn on Practice Mode/);
  h.node('#practice-board-mode').handlers.click();assert.match(h.node('#onboarding-listen-prompt').innerHTML,/Turn off Left Hand/);
  h.node('#practice-left-hand').handlers.click();assert.match(h.node('#onboarding-listen-prompt').innerHTML,/music will wait/);assert.equal(h.c.clock.running,false);
  assert(h.node('progress1').classList.contains('is-complete'));assert(h.node('progress2').classList.contains('is-complete'));assert(h.node('progress3').classList.contains('is-active'));assert(!h.node('progress4').classList.contains('is-active'));
  await h.c.play();assert.equal(h.node('#onboarding-listen-coach').hidden,true);
  h.c.acceptPracticeInput(72);h.c.audioContext.currentTime=2;h.c.tick();h.c.acceptPracticeInput(74);h.c.audioContext.currentTime=10;h.c.tick();
  assert.equal(h.controller.getState().onboardingStep,'TRY_IT_YOURSELF');assert.equal(h.controller.getState().practiceGuideStage,'metronome-on');
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
test('Skip advances implemented stages without zero/progress loss',()=>{
  const h=onboarding();h.values.set('play12.zero_note.midi','26');h.controller.startNew();
  const skip=()=>h.node('#onboarding-skip').handlers.click();skip();assert.equal(h.root.dataset.onboardingStep,'LISTEN_AND_CONTROL');
  skip();assert.equal(h.controller.getState().listenGuideStage,'pause');skip();assert.equal(h.controller.getState().listenGuideStage,'continue');skip();assert.equal(h.root.dataset.onboardingStep,'CHOOSE_ZERO');skip();assert.equal(h.controller.getState().zeroSetupStage,'cards');skip();assert.equal(h.root.dataset.onboardingStep,'TRY_IT_YOURSELF');
  for (const stage of ['enable','hand','explain','ready']) {assert.equal(h.controller.getState().practiceGuideStage,stage);skip();}
  for(const stage of ['playing','metronome-on','metronome-tempo','metronome-play','round-nav','round-loop','round-range','round-precount']) {assert.equal(h.controller.getState().practiceGuideStage,stage);skip();}
  h.node('#practice-board-mode').handlers.click();assert.equal(h.root.dataset.onboardingStep,'TRY_IT_YOURSELF');assert.equal(h.controller.getState().practiceGuideStage,'free');assert(h.c.practiceEnabled());
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
test('Skip every instruction preserves real settings, learned actions and default zero',()=>{
  const h=onboarding();h.controller.startNew();const skip=()=>h.node('#onboarding-skip').handlers.click();
  skip();skip();skip();skip();assert.equal(h.controller.getState().playLearned,false);assert.equal(h.controller.getState().pauseLearned,false);
  skip();assert.equal(h.controller.getState().chooseZeroCompleted,false);assert.equal(h.values.has('play12.zero_note.midi'),false);
  assert.equal(h.controller.getState().zeroSetupStage,'cards');skip();
  for(const stage of ['enable','hand','explain','ready']){
    assert.equal(h.controller.getState().practiceGuideStage,stage);const actual=JSON.stringify(h.c.getPracticeSettings());skip();assert.equal(JSON.stringify(h.c.getPracticeSettings()),actual);
  }
  assert.equal(h.controller.getState().practiceGuideStage,'playing');assert.equal(h.timers.size,0);
});
test('Card placement waits for Ready; other descriptive/action cards retain timeout behavior',()=>{
  const h=onboarding();h.controller.startNew();h.node('#onboarding-demo').handlers.click();h.window.dispatchEvent({type:'play12:zero-confirmed'});
  const expire=()=>{const entries=[...h.timers.values()];assert.equal(entries.length,1);entries[0].fn();};
  assert.equal(h.timers.size,0);assert.equal(h.controller.getState().zeroSetupStage,'cards');
  h.node('#cards-ready').handlers.click();assert.equal(h.controller.getState().zeroSetupStage,'verify-yellow');
  h.node('#onboarding-skip').handlers.click();assert.equal(h.controller.getState().practiceGuideStage,'enable');assert.equal(h.node('#practice-board').hidden,false);
  expire();assert.equal(h.controller.getState().practiceGuideStage,'enable');assert.equal(h.c.practiceEnabled(),false);
  h.node('#practice-board-mode').handlers.click();expire();assert.equal(h.c.practiceSettings.practiceLeftHandEnabled,true);assert.equal(h.controller.getState().practiceGuideStage,'hand');
  h.node('#practice-left-hand').handlers.click();expire();assert.equal(h.controller.getState().practiceGuideStage,'ready');expire();assert.equal(h.c.clock.running,false);
});
test('Restart onboarding and stage revisits cancel card timers and start a fresh instruction',()=>{
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',practiceGuideStage:'enable',highestUnlockedStep:3,inputMode:'demo'});h.controller.continueSession();
  const old=[...h.timers.keys()];h.node('progress1').handlers.click();assert(old.every(id=>!h.timers.has(id)));h.node('progress3').handlers.click();assert.equal(h.node('#onboarding-listen-coach').hidden,false);
  h.controller.startNew();assert.equal(h.timers.size,0);assert.equal(h.root.dataset.onboardingStep,'MIDI_CONNECT');
});
test('Manual zero during card setup resumes instruction without a stale timeout dead end',()=>{
  const h=onboarding();h.controller.startNew();h.node('#onboarding-demo').handlers.click();h.window.dispatchEvent({type:'play12:zero-confirmed'});
  h.window.dispatchEvent({type:'play12:zero-ui-open'});h.window.dispatchEvent({type:'play12:zero-confirmed'});
  assert.equal(h.controller.getState().zeroSetupStage,'cards');assert.equal(h.node('#onboarding-listen-coach').hidden,false);
  assert.equal(h.timers.size,0);assert.equal(h.controller.getState().zeroSetupStage,'cards');
  h.node('#cards-ready').handlers.click();assert.equal(h.controller.getState().zeroSetupStage,'verify-yellow');
  h.node('#onboarding-skip').handlers.click();assert.equal(h.controller.getState().practiceGuideStage,'enable');
});

test('P is blocked on pre-player screens and text input, with no Space transport fallback',async()=>{
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',practiceGuideStage:'playing',highestUnlockedStep:3,inputMode:'demo'});
  const press=(interactive=false)=>h.keydown({code:'KeyP',target:{closest:()=>interactive?{}:null},preventDefault(){},defaultPrevented:false});
  press();await Promise.resolve();assert.equal(h.c.clock.running,false);assert.equal(h.root.dataset.playbackShortcutsEnabled,'false');
  h.controller.startNew();press();await Promise.resolve();assert.equal(h.c.clock.running,false);
  h.node('#onboarding-midi-guide').handlers.click();press();await Promise.resolve();assert.equal(h.c.clock.running,false);
  h.node('#onboarding-demo').handlers.click();assert.equal(h.root.dataset.playbackShortcutsEnabled,'true');press(true);await Promise.resolve();assert.equal(h.c.clock.running,false);
  h.keydown({code:'Space',target:{closest:()=>null},preventDefault(){},defaultPrevented:false});await Promise.resolve();assert.equal(h.c.clock.running,false);
  press();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.c.clock.running,true);
});
test('Transport colors follow playing, paused, ready and ended instead of a fixed Play highlight',async()=>{
  const {c}=make();assert.equal(c.playButton['aria-pressed'],'false');assert.equal(c.pauseButton['aria-pressed'],'false');
  await c.play();assert.equal(c.playButton['aria-pressed'],'true');assert.equal(c.pauseButton['aria-pressed'],'false');
  c.pauseImmediate(2);assert.equal(c.playButton['aria-pressed'],'false');assert.equal(c.pauseButton['aria-pressed'],'true');
  c.restart();assert.equal(c.playButton['aria-pressed'],'false');assert.equal(c.pauseButton['aria-pressed'],'false');
  c.pauseImmediate(c.totalQuarters);assert.equal(c.playButton['aria-pressed'],'false');assert.equal(c.pauseButton['aria-pressed'],'false');
});
test('Manual Choose Zero confirm and Skip return to the exact Practice instruction and preferences',()=>{
  for(const guide of ['enable','hand','explain','ready','playing','free']) for(const confirmed of [false,true]){
    const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',practiceGuideStage:guide,highestUnlockedStep:3,practiceModeEnabled:true,practiceLeftHandEnabled:false,inputMode:'demo'});h.controller.continueSession();
    const prefs=JSON.stringify(h.c.getPracticeSettings());h.values.set('play12.zero_note.midi','26');
    h.window.dispatchEvent({type:'play12:zero-ui-open'});assert.equal(h.root.dataset.returnAfterZero,'practice');assert.equal(h.root.dataset.playbackShortcutsEnabled,'false');
    if(confirmed) h.window.dispatchEvent({type:'play12:zero-confirmed'});else h.node('#onboarding-skip').handlers.click();
    assert.equal(h.controller.getState().onboardingStep,'TRY_IT_YOURSELF');assert.equal(h.controller.getState().practiceGuideStage,guide);
    assert.equal(h.node('#practice-board').hidden,false);assert.equal(h.root.dataset.returnAfterZero,'');assert.equal(JSON.stringify(h.c.getPracticeSettings()),prefs);assert.equal(h.values.get('play12.zero_note.midi'),'26');
  }
});
test('Direct Step 3 and Continue initialize board; skipped Step 2 is completed without a fake selection',()=>{
  const h=onboarding({onboardingStep:'CHOOSE_ZERO',highestUnlockedStep:3,inputMode:'demo'});h.controller.continueSession();
  assert.equal(h.node('#practice-board').hidden,false);assert.equal(h.controller.getState().practiceGuideStage,'enable');
  for(const n of [1,2,3]) h.node('progress'+n).handlers.click();
  assert.equal(h.node('progress1').dataset.progressState,'completed');assert.equal(h.node('progress2').dataset.progressState,'completed');assert.equal(h.node('progress3').dataset.progressState,'active');assert.equal(h.node('progress4').dataset.progressState,'locked');
  assert.equal(h.controller.getState().chooseZeroCompleted,false);assert(!h.values.has('play12.zero_note.midi'));
});

test('Metronome advances during Practice wait, survives gate release, Pause and Restart',async()=>{
  const {c}=make(undefined,24,true);configure(c);c.setMetronome(true);await c.play();
  assert(c.waitingForInput);const before=c.metronomeBeatCounter;
  c.audioContext.currentTime=3;c.scheduleMetronome();c.tick();
  assert(c.waitingForInput);assert(c.metronomeBeatCounter>before);
  const after=c.metronomeBeatCounter;c.acceptPracticeInput(72);assert.equal(c.metronomeBeatCounter,after);
  c.requestPause();c.restart();assert(c.metronomeInput.checked);assert.equal(c.clock.bpm,60);
  c.audioContext.currentTime=4;c.scheduleMetronome();assert(c.metronomeBeatCounter>after);
  c.setMetronome(false);const stopped=c.metronomeBeatCounter;c.audioContext.currentTime=6;c.scheduleMetronome();assert.equal(c.metronomeBeatCounter,stopped);
});
test('BPM clamps, +/- 10, invalid restores; shared tempo scales clock and next metronome beat',async()=>{
  const {c}=make(undefined,24,true);c.setMetronome(true);
  c.bpmPlus.handlers.click();assert.equal(c.clock.bpm,70);c.bpmMinus.handlers.click();assert.equal(c.clock.bpm,60);
  for(const [raw,expected] of [['2',30],['999',240],['',240],['bad',240],['96',96]]){c.bpmInput.value=raw;c.changeBpm();assert.equal(c.clock.bpm,expected);assert.equal(c.bpmInput.value,String(expected));}
  c.bpmInput.value='60';c.changeBpm();c.clock.start(0);c.audioContext.currentTime=1;assert.equal(c.clock.position,1);
  c.bpmInput.value='120';c.changeBpm();c.audioContext.currentTime=2;assert.equal(c.clock.position,3);
  const beatTime=c.nextMetronomeBeat;c.audioContext.currentTime=beatTime-.05;c.scheduleMetronome();assert.equal(c.nextMetronomeBeat,beatTime+.5);
  assert.equal(c.metronomeAudio.pendingBeatVisuals.at(-1).when,beatTime);
  assert.equal(c.metronomeAudio.pendingBeatVisuals.at(-1).accent,false);
});
test('Metronome tutorial Skip changes no settings; tempo timeout advances without forcing BPM',()=>{
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',practiceGuideStage:'metronome-on',metronomeUnlocked:true,inputMode:'demo'});
  h.controller.continueSession();assert.equal(h.node('#metronome-board').hidden,false);
  h.node('#onboarding-skip').handlers.click();assert.equal(h.controller.getState().practiceGuideStage,'metronome-tempo');assert.equal(h.c.metronomeInput.checked,false);
  const timer=[...h.timers.values()].find(x=>x.delay===12000);timer.fn();
  assert.equal(h.controller.getState().practiceGuideStage,'metronome-play');assert.equal(h.c.clock.bpm,60);
  h.node('#onboarding-skip').handlers.click();assert.equal(h.controller.getState().practiceGuideStage,'round-nav');
});
test('Metronome and tempo interactions advance the instructions immediately',()=>{
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',practiceGuideStage:'metronome-on',metronomeUnlocked:true,inputMode:'demo'});
  h.controller.continueSession();h.window.dispatchEvent({type:'play12:metronome-change',detail:{enabled:true}});
  assert.equal(h.controller.getState().practiceGuideStage,'metronome-tempo');
  h.window.dispatchEvent({type:'play12:tempo-change'});assert.equal(h.controller.getState().practiceGuideStage,'metronome-play');
});
test('Tempo change retimes remaining robot Note Off without a second attack or gate duration stretch',async()=>{
  const {c,scheduled}=make([['L',48,0],['R',72,0]],24,true);configure(c);await c.play();
  const initial=c.robotEvents.get('0').endsAt;assert.equal(initial,1);
  c.audioContext.currentTime=.25;c.bpmInput.value='120';c.changeBpm();
  assert.equal(c.robotEvents.get('0').endsAt,.625);assert.equal(scheduled.filter(x=>x.id==='0').length,1);
  c.audioContext.currentTime=2;c.tick();assert(c.waitingForInput);assert.equal(c.robotEvents.get('0').status,'completed');
});
test('Ordinary playback keeps sounding note and rescales its remaining duration on tempo change',()=>{
  const {c}=make(undefined,24,true);
  Object.getPrototypeOf(c.audio).scheduleNote.call(c.audio,{id:'sustain',start:0,midi:60,dynamic:'mf'},0,4,60);
  const voice=c.audio.voices.get('sustain@0');c.audioContext.currentTime=1;c.bpmInput.value='120';c.changeBpm();
  assert.equal(c.audio.voices.get('sustain@0'),voice);assert.equal(voice.endsAt,2.5);assert.equal(voice.oscillators[0].stopAt,2.525);
});
test('Stage board mapping hides introduced BPM on earlier steps and restores settings',()=>{
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',practiceGuideStage:'free',metronomeUnlocked:true,chooseZeroCompleted:true,highestUnlockedStep:3,inputMode:'demo'});
  h.controller.continueSession();assert.equal(h.node('#metronome-board').hidden,false);
  h.node('progress1').handlers.click();assert.equal(h.node('#metronome-board').hidden,true);assert.equal(h.node('#practice-board').hidden,true);
  h.node('progress2').handlers.click();assert.equal(h.node('#metronome-board').hidden,true);assert.equal(h.node('#practice-board').hidden,true);assert.equal(h.node('#onboarding-choose-zero').hidden,false);
  h.node('progress3').handlers.click();assert.equal(h.node('#metronome-board').hidden,false);assert.equal(h.controller.getState().metronomeUnlocked,true);
});
test('Metronome timing accepts exact -150/+200 boundaries and rejects outside; later beat retries',async()=>{
  for(const [delta,accepted] of [[-.150,true],[.200,true],[-.151,false],[.201,false]]){
    const {c}=make([['R',72,1]],24,true);configure(c);c.setMetronome(true);await c.play();
    const due=c.expectedPracticeEvent.expectedAudioTime;c.audioContext.currentTime=due+delta;
    assert.equal(c.acceptPracticeInput(72),accepted,`delta ${delta}`);
  }
  const {c}=make([['R',72,0],['R',74,2]],24,true);configure(c);c.setMetronome(true);await c.play();
  const due=c.waitingForInput.expectedAudioTime;
  c.audioContext.currentTime=due+.3;assert.equal(c.acceptPracticeInput(72),false);assert(c.waitingForInput);
  c.scheduleMetronome();const phase=c.metronomePhaseTime,counter=c.metronomeBeatCounter;
  c.audioContext.currentTime=due+2+.1;assert.equal(c.acceptPracticeInput(71),false);assert.equal(c.acceptPracticeInput(72),true);
  assert.equal(c.clock.anchorAudioTime,due+2);assert.equal(c.metronomePhaseTime,phase);assert.equal(c.metronomeBeatCounter,counter);
  assert.equal(c.expectedPracticeEvent.expectedAudioTime,due+4);
});
test('Rhythmic chords require same timing window and independent 150ms spread',async()=>{
  const {c}=make([['R',72,0],['L',48,0]],24,true);configure(c,true,true);c.setMetronome(true);await c.play();
  const due=c.waitingForInput.expectedAudioTime;
  c.audioContext.currentTime=due-.1;assert.equal(c.acceptPracticeInput(72),true);
  c.audioContext.currentTime=due+.1;assert.equal(c.acceptPracticeInput(48),true);assert(c.waitingForInput,'200ms spread must not complete');
  c.audioContext.currentTime=due+.11;c.acceptPracticeInput(72);assert.equal(c.waitingForInput,null);
  c.restart();await c.play();const next=c.waitingForInput.expectedAudioTime;
  c.audioContext.currentTime=next+.19;c.acceptPracticeInput(72);
  c.audioContext.currentTime=next+.21;assert.equal(c.acceptPracticeInput(48),false);assert.equal(c.waitingForInput.matchedPitches.size,0);
  c.audioContext.currentTime=next+1;c.acceptPracticeInput(48);assert(c.waitingForInput);
  c.audioContext.currentTime=next+1+.15;c.acceptPracticeInput(72);assert.equal(c.waitingForInput,null);
});
test('Restart drops stale rhythm window and partial chord; tempo preserves beat phase spacing',async()=>{
  const {c}=make([['R',72,0],['L',48,0]],24,true);configure(c,true,true);c.setMetronome(true);await c.play();
  const old=c.waitingForInput;c.audioContext.currentTime=old.expectedAudioTime;c.acceptPracticeInput(72);
  c.audioContext.currentTime+=.3;c.restart();assert.equal(old.matchedPitches.size,0);assert.equal(old.expectedAudioTime,null);
  await c.play();assert(c.waitingForInput.expectedAudioTime>c.audioContext.currentTime);
  c.bpmInput.value='120';c.changeBpm();assert.equal(c.clock.bpm,120);
  const due=c.waitingForInput.expectedAudioTime;c.audioContext.currentTime=due+.25;assert.equal(c.acceptPracticeInput(72),false);
  c.audioContext.currentTime=due+.5;c.acceptPracticeInput(72);c.acceptPracticeInput(48);assert.equal(c.waitingForInput,null);
});
test('Ordinary playback and Practice OFF resume on existing metronome grid; click gain doubles only click',async()=>{
  const {c}=make(undefined,24,true);c.setMetronome(true);c.audioContext.currentTime=.3;await c.play();
  const phase=c.metronomePhaseTime;assert(Math.abs((c.clock.anchorAudioTime-phase)-Math.round(c.clock.anchorAudioTime-phase))<1e-8);
  assert.equal(c.metronomeAudio.metronomeGain.gain.value,1.5);assert.equal(c.audio.master.gain.value,.18);
  configure(c);c.audioContext.currentTime=c.expectedPracticeEvent.expectedAudioTime;c.enterPracticeWait();
  c.audioContext.currentTime+=.3;c.setPracticeSettings({practiceModeEnabled:false});assert(c.clock.running);assert(Math.abs((c.clock.anchorAudioTime-phase)-Math.round(c.clock.anchorAudioTime-phase))<1e-8);
  // Even the loudest accented click has ample digital headroom.
  assert(.34*1.65*2*.18<1);
});

test('Overlapping windows at fast BPM still accept a valid late contact',()=>{
  const {window}=load();
  const result=window.Play12Playback.practiceBeatWindow(0,.18,172);
  assert.equal(result.accepted,true);assert.equal(result.when,0);assert.equal(result.deltaMs,180);
});

test('A fast-tempo chord retains its first valid overlapping window',async()=>{
  const {c}=make([['R',72,0],['L',48,0]],24,true);configure(c,true,true);c.bpmInput.value='172';c.changeBpm();c.setMetronome(true);await c.play();
  const due=c.waitingForInput.expectedAudioTime;c.audioContext.currentTime=due+.14;c.acceptPracticeInput(72);
  c.audioContext.currentTime=due+.20;c.acceptPracticeInput(48);assert.equal(c.waitingForInput,null);
});
test('Pre-count follows measure signature, strong start, pickup and partial measure entry',()=>{
  const {window}=load(),plan=window.Play12Playback.preCountPlan;
  const round={start:0,measureStart:0,measureQuarters:3,beatQuarters:1,implicit:false};
  assert.equal(plan(round,0).quarters,6);assert.equal(plan(round,0).beats,6);
  assert.equal(plan({...round,implicit:true},0).quarters,3);
  assert.equal(plan({...round,measureStart:-2,implicit:true},0).quarters,5);
  assert.equal(plan(round,1).quarters,4);
  assert.equal(plan({...round,measureQuarters:3,beatQuarters:.5},0).beats,12);
});
function twoRounds(c){c.rounds=[{start:0,end:4,beats:4,beatQuarters:1,measureQuarters:4,measureStart:0},{start:4,end:8,beats:4,beatQuarters:1,measureQuarters:4,measureStart:4}];c.loopStartInput.value='0';c.loopEndInput.value='0';c.loopInput.checked=true;}
test('Loop with Pre-count repeats preparation at exact boundary; OFF is continuous',async()=>{
  const {c,scheduled}=make([['R',72,0],['R',74,4]],24,true);twoRounds(c);c.setMetronome(true);c.countInInput.checked=true;await c.play();
  assert.equal(c.countIn.plan.measures,2);const first=c.countIn.endsAt;c.audioContext.currentTime=first;c.tick();assert(c.clock.running);
  assert(!scheduled.some(e=>e.start===4),'outside To never scheduled');
  c.audioContext.currentTime=first+4.02;c.tick();assert(c.countIn);assert.equal(c.countIn.startedAt,first+4);assert.equal(c.loopWrapCount,1);
  assert.equal(c.countIn.endsAt,first+12);assert(c.metronomeInput.checked);
  c.countInInput.checked=false;c.pauseImmediate(0);await c.play();const boundary=c.clock.quarterToAudioTime(4);c.audioContext.currentTime=boundary+.02;c.tick();assert.equal(c.countIn,null);assert.equal(c.clock.anchorQuarter,0);assert.equal(c.clock.anchorAudioTime,boundary);
});
test('Practice loop excludes outside robot notes and prepares fresh unresolved events each repeat',async()=>{
  const {c,scheduled}=make([['R',72,0],['L',48,0],['L',50,4]],24,true);twoRounds(c);configure(c);c.setMetronome(true);await c.play();
  c.audioContext.currentTime=c.waitingForInput.expectedAudioTime;c.acceptPracticeInput(72);c.audioContext.currentTime=c.clock.quarterToAudioTime(4);c.tick();
  assert.equal(c.expectedPracticeEvent.start,0);assert.equal(c.expectedPracticeEvent.completed,false);assert(!scheduled.some(e=>e.midi===50));
  assert.equal(c.expectedPracticeEvent.matchedPitches.size,0);
});
test('Restart returns to From and begins clean pre-count while retaining tempo/settings',async()=>{
  const {c}=make([['R',72,4]],24,true);twoRounds(c);c.loopStartInput.value='1';c.loopEndInput.value='1';configure(c);c.setMetronome(true);c.countInInput.checked=true;c.restart();await new Promise(r=>setImmediate(r));
  assert.equal(c.countIn.selected,4);assert.equal(c.countIn.plan.measures,2);assert.equal(c.clock.bpm,60);assert(c.metronomeInput.checked);assert.equal(c.expectedPracticeEvent.start,4);
});
test('Round tutorial actions advance immediately; Skip changes no loop/pre-count values',()=>{
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',practiceGuideStage:'round-nav',roundUnlocked:true,metronomeUnlocked:true,highestUnlockedStep:3,inputMode:'demo'});h.controller.continueSession();
  assert.equal(h.node('#round-loop-board').hidden,false);
  h.window.dispatchEvent({type:'play12:round-control',detail:{action:'navigate'}});assert.equal(h.controller.getState().practiceGuideStage,'round-loop');
  h.node('#onboarding-skip').handlers.click();assert.equal(h.controller.getState().practiceGuideStage,'round-range');assert.equal(h.c.loopInput.checked,false);
  h.node('#onboarding-skip').handlers.click();assert.equal(h.controller.getState().practiceGuideStage,'round-precount');assert.equal(h.c.countInInput.checked,false);
  h.node('#onboarding-skip').handlers.click();assert.equal(h.controller.getState().practiceGuideStage,'free');
  h.node('progress1').handlers.click();assert.equal(h.node('#round-loop-board').hidden,true);h.node('progress3').handlers.click();assert.equal(h.node('#round-loop-board').hidden,false);
});
test('Miniature uses the same per-hand repetition detector colors as notation',()=>{
  const {window,sandbox}=load();
  for(const file of ['play12-repetitions.js','play12-round-board.js'])vm.runInContext(readFileSync(path.join(renderer,file),'utf8'),sandbox);
  const score=JSON.parse(readFileSync(path.join(__dirname,'../examples/when_the_saints_manual.play12.json'))),repetitions=window.Play12Repetitions.detect(score);
  assert.equal(score.score.parts[0].measures.length,9);
  for(const segment of repetitions.segments)for(const o of segment.occurrences)for(let n=o.measure_start;n<=o.measure_end;n++)assert.equal(window.Play12RoundBoard.ribbonFor(repetitions,segment.hand,n),segment.display_color);
});

test('Skip during unfinished Practice pass immediately unlocks Metronome and clears waits without changing controls',async()=>{
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',practiceGuideStage:'ready',practiceModeEnabled:true,practiceLeftHandEnabled:false,practiceRightHandEnabled:true,inputMode:'demo',highestUnlockedStep:3});h.controller.continueSession();
  await h.c.play();assert.equal(h.controller.getState().practiceGuideStage,'playing');assert(h.c.waitingForInput);
  const settings=JSON.stringify(h.c.getPracticeSettings()),bpm=h.c.clock.bpm;h.node('#onboarding-skip').handlers.click();
  assert.equal(h.controller.getState().practiceGuideStage,'metronome-on');assert.equal(h.node('#metronome-board').hidden,false);assert.equal(h.c.waitingForInput,null);assert.equal(h.c.clock.running,false);assert.equal(JSON.stringify(h.c.getPracticeSettings()),settings);assert.equal(h.c.clock.bpm,bpm);
});
test('Skip during unfinished Metronome pass unlocks Round guidance',async()=>{
  const h=onboarding({onboardingStep:'TRY_IT_YOURSELF',practiceGuideStage:'metronome-play',metronomeUnlocked:true,inputMode:'demo',highestUnlockedStep:3});h.controller.continueSession();await h.c.play();
  assert.equal(h.controller.getState().practiceGuideStage,'metronome-playing');h.node('#onboarding-skip').handlers.click();assert.equal(h.controller.getState().practiceGuideStage,'round-nav');assert.equal(h.node('#round-loop-board').hidden,false);assert.equal(h.c.clock.running,false);
});

test('Runtime PC clones the actual Round grid and Count without musical events, then cleans up',()=>{
  const {window,sandbox}=load();
  class Node{constructor(tag){this.tag=tag;this.attrs={};this.children=[];}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}appendChild(n){this.children.push(n);n.parent=this;}remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}cloneNode(){const n=new Node(this.tag);n.attrs={...this.attrs};n.textContent=this.textContent;return n;}}
  sandbox.document.createElementNS=(_,tag)=>new Node(tag);vm.runInContext(readFileSync(path.join(renderer,'play12-precount-view.js'),'utf8'),sandbox);
  const svg=new Node('svg');svg.style={overflow:'hidden'};svg.viewBox={baseVal:{x:-13.25,y:-1.25,width:258.5}};const note=new Node('g');note.setAttribute('data-event-id','original');svg.appendChild(note);
  const grid=[];for(let beat=0;beat<4;beat++){
    for(let lane=0;lane<11;lane++){const n=new Node('rect');Object.assign(n.attrs,{x:String(lane*20),y:String(716+beat*32),width:'20',height:'32',class:lane===5?'play12-count-space':'play12-cell',fill:'#CEF932'});grid.push(n);}
    const n=new Node('text');Object.assign(n.attrs,{x:'116',y:String(736+beat*32),class:'play12-count play12-count-beat'});n.textContent=['FOUR','THREE','TWO','ONE'][beat];grid.push(n);
  }
  for(const x of [0,132]){const n=new Node('rect');Object.assign(n.attrs,{x:String(x),y:'716',width:'100',height:'128',fill:'none',stroke:'#6B7280'});grid.push(n);}
  for(const n of grid)svg.appendChild(n);svg.querySelectorAll=()=>grid;const original=JSON.stringify(svg.children.map(n=>n.attrs));
  const view=window.Play12PreCountView.create({svg,selected:8,plan:{quarters:8},signature:{measureStart:8,measureQuarters:4,beatQuarters:1},stepQuarters:1,cellHeight:32,originY:1101.25,timelineOffset:0});
  const layer=svg.children.at(-1);assert.equal(layer.children.length,2);
  for(const round of layer.children){assert.equal(round.attrs.height,'128');const clones=round.children.slice(1,-1);assert.equal(clones.length,grid.length);for(let i=0;i<clones.length;i++){const actual={...clones[i].attrs},expected={...grid[i].attrs};delete actual.y;delete expected.y;assert.deepEqual(actual,expected);assert.equal(clones[i].textContent,grid[i].textContent);assert(!clones[i].attrs['data-event-id']);}}
  assert.equal(svg.style.overflow,'visible');view.clear();assert.equal(JSON.stringify(svg.children.map(n=>n.attrs)),original);assert.equal(svg.style.overflow,'hidden');
});
