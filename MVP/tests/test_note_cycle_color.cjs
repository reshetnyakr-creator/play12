const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class Element {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.style = {}; this.dataset = {}; this.classList = {add(){}}; }
  setAttribute(k,v) { this.attrs[k] = String(v); }
  appendChild(e) { this.children.push(e); }
  replaceChildren(...children) { this.children = children; }
  addEventListener() {}
}
const window = {document:{createElementNS:(_,tag)=>new Element(tag)}};
const context = vm.createContext({window});
for (const file of ['play12-renderer.js','piano-view.js','play12-playback.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer',file),'utf8'),context);
const score = JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/when_the_saints_manual.play12.json')));
const notes = score.score.parts[0].measures.flatMap(m=>m.events).filter(e=>e.kind==='note');
function render(){return window.Play12Renderer.render(score,new Element('div'),{zeroNote:'C',measureCount:9,gridResolution:'1/4',dynamicsOpacity:{mf:1}});}
const blocks = render().children.filter(e=>e.attrs['data-event-id']);
function color(id){return blocks.find(e=>e.attrs['data-event-id']===id).children.find(e=>e.tag==='rect').attrs.fill.toUpperCase();}
test('Second LH chord is yellow / yellow / green, with original physical MIDI',()=>{
  assert.equal(color('manual.m1.e7'),'#FBD12C');
  assert.equal(color('manual.m1.e8'),'#FBD12C');
  assert.equal(color('manual.m1.e9'),'#009640');
  assert.equal(blocks.find(e=>e.attrs['data-event-id']==='manual.m1.e8').attrs['data-midi'],'57');
  assert.equal(blocks.find(e=>e.attrs['data-event-id']==='manual.m1.e9').attrs['data-midi'],'60');
});
test('All rendered LH/RH notes agree with Piano View at all 12 runtime zero pitch classes',()=>{
  const colors=window.Play12Renderer.defaults.colors;
  for(let pitchClass=0;pitchClass<12;pitchClass++){
    const runtimeZero=window.Play12PianoView.layoutZeroForMidi(pitchClass,21);
    for(const note of notes){
      const effective=window.Play12Playback.effectiveMidiPitch(note.pitch.midi,score.play12.reference_zero_midi,runtimeZero);
      const mapping=window.Play12PianoView.mappingForMidi(effective,runtimeZero,colors);
      assert.equal(color(note.id),mapping.color.toUpperCase(),`${note.id}, zero=${runtimeZero}`);
      assert.equal(mapping.symbol,note.play12_symbol.value);
    }
  }
});
