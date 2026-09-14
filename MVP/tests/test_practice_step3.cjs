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
  createOscillator(){return {frequency:{value:0},connect(){return this;},start(){},stop(){},addEventListener(){}};}
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
test('Pause preserves chord matches and expected event; input while paused does not resume',async()=>{
  const {c}=make();configure(c,true,true);await c.play();const expected=c.waitingForInput;c.acceptPracticeInput(72);c.requestPause();
  assert.equal(c.expectedPracticeEvent,expected);assert(expected.matchedPitches.has(72));assert.equal(c.acceptPracticeInput(48),false);assert.equal(c.clock.running,false);
  await c.play();assert.equal(c.waitingForInput,expected);c.acceptPracticeInput(48);assert(c.clock.running);
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
function onboarding(saved=null) {
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
  c.stage.parentElement=node('home');controller.connectRuntime({playback:c,noteEvents:c,stage:c.stage});
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
