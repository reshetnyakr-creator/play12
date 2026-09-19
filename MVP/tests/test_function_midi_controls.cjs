const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');

function setup(){
  const fields=new Map(),events=[],actions=[],overlay={visible:false,pressed:new Map()};
  const field=()=>({textContent:'',disabled:false,addEventListener(){},classList:{add(){},remove(){},toggle(){}}});
  const root={dataset:{},classList:{toggle(){}},querySelector(selector){if(!fields.has(selector))fields.set(selector,field());return fields.get(selector);}};
  const button=field(),pianoView={keys:new Map(Array.from({length:88},(_,i)=>[i+21,{}])),setCommandRouter(router){this.commandRouter=router;},showFunctionOverlay(){overlay.visible=true;return true;},hideFunctionOverlay(){overlay.visible=false;},setFunctionCommandPressed(midi,on){overlay.pressed.set(midi,on);}};
  const noteEvents={handleNoteOn(...args){events.push(['on',...args]);},handleNoteOff(...args){events.push(['off',...args]);},unlockAudio(){}};
  const store=new Map(),storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
  const window={localStorage:storage,dispatchEvent(){},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}}};
  const sandbox={window,navigator:{requestMIDIAccess(){}},CustomEvent:window.CustomEvent,console};vm.createContext(sandbox);
  vm.runInContext(readFileSync(path.join(__dirname,'../renderer/web-midi-diagnostic.js'),'utf8'),sandbox);
  const diagnostic=window.Play12MidiDiagnostic.create({root,enableButton:button,pianoView,noteEvents,storage,commandActions:{available:()=>true,run:a=>actions.push(a)}});
  const inputA={id:'A',name:'Keys',manufacturer:'Test'},inputB={id:'B',name:'Other',manufacturer:'Test'};
  const send=(input,note,velocity=100,channel=0,off=false)=>diagnostic.handleMessage({data:[(off?0x80:0x90)|channel,note,velocity]},input);
  return{diagnostic,events,actions,overlay,inputA,inputB,send,storage};
}

function calibrate(f){
  f.diagnostic.beginCalibration();f.send(f.inputA,48);f.send(f.inputA,108);f.diagnostic.confirmRange();f.send(f.inputA,108);
  assert.equal(f.diagnostic.getCalibration().verified,true);
}

test('calibration consumes notes and persists separate verified range',()=>{
  const f=setup();calibrate(f);assert.equal(f.events.length,0);assert.equal(f.diagnostic.getCalibration().keyCount,61);
  assert.match(f.storage.getItem('play12.midi-calibration.v1'),/"leftMidi":48/);
});

test('invalid and cross-device calibration are rejected',()=>{
  const f=setup();let last;f.diagnostic.addCalibrationListener(event=>last=event.type);f.diagnostic.beginCalibration();f.send(f.inputA,60);f.send(f.inputB,90);
  assert.equal(last,'invalid');assert.equal(f.diagnostic.getCalibration(),null);
});

test('Function and mapped command NoteOn/NoteOff are consumed',()=>{
  const f=setup();calibrate(f);f.send(f.inputA,108);assert.equal(f.overlay.visible,true);f.send(f.inputA,48);assert.deepEqual(f.actions,['metronome']);
  f.send(f.inputA,48,0,0);assert.equal(f.events.length,0);assert.equal(f.overlay.pressed.get(48),false);f.send(f.inputA,108,0,0);assert.equal(f.overlay.visible,false);
});

test('ordinary notes and other devices remain musical',()=>{
  const f=setup();calibrate(f);f.send(f.inputA,60);f.send(f.inputA,60,0);f.send(f.inputB,108);f.send(f.inputB,108,0);
  assert.deepEqual(f.events.map(event=>event[0]),['on','off','on','off']);assert.equal(f.actions.length,0);
});

test('Function on device A cannot command device B',()=>{
  const f=setup();calibrate(f);f.send(f.inputA,108);f.send(f.inputB,48);assert.equal(f.actions.length,0);assert.equal(f.events.at(-1)[0],'on');
});

test('velocity-zero NoteOn releases Function and commands symmetrically',()=>{
  const f=setup();calibrate(f);f.send(f.inputA,108);f.send(f.inputA,54);assert.deepEqual(f.actions,['play']);f.send(f.inputA,54,0);f.send(f.inputA,108,0);
  assert.equal(f.events.length,0);assert.equal(f.overlay.visible,false);
});

test('command NoteOff stays consumed when Function is released first',()=>{
  const f=setup();calibrate(f);f.send(f.inputA,108);f.send(f.inputA,48);f.send(f.inputA,108,0);f.send(f.inputA,48,0);
  assert.deepEqual(f.actions,['metronome']);assert.equal(f.events.length,0);
});

test('mouse and MIDI share one Function state in both directions',()=>{
  const f=setup();calibrate(f);
  f.overlay.visible=false;assert.equal(f.diagnostic.pianoView.commandRouter.noteOn(108,1),true);f.send(f.inputA,49);assert.deepEqual(f.actions,['previous-round']);f.send(f.inputA,49,0);f.diagnostic.pianoView.commandRouter.noteOff(108,1);
  f.send(f.inputA,108);assert.equal(f.diagnostic.pianoView.commandRouter.noteOn(54,2),true);assert.deepEqual(f.actions,['previous-round','play']);f.diagnostic.pianoView.commandRouter.noteOff(54,2);f.send(f.inputA,108,0);
  f.diagnostic.pianoView.commandRouter.noteOn(108,3);f.diagnostic.pianoView.commandRouter.noteOn(58,4);f.diagnostic.pianoView.commandRouter.noteOff(58,4);f.diagnostic.pianoView.commandRouter.noteOff(108,3);
  assert.deepEqual(f.actions,['previous-round','play','restart']);assert.equal(f.events.length,0);
});
