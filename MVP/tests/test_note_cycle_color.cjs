const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class Element {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.style = {}; this.dataset = {}; this.classList = {add(){}}; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  querySelector() { return null; }
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
test('Penultimate Y uses orange B2, with LH finger 5 preserved',()=>{
  const note=notes.find(e=>e.id==='manual.m7.e52');
  assert.equal(note.pitch.midi,47);assert.equal(note.pitch.octave,2);
  assert.equal(note.play12_symbol.value,'Y');assert.equal(note.method.finger,5);assert.equal(note.source_fingering,5);
  assert.equal(color(note.id),'#FC7B00');
});
test('Display grid cycles subdivisions and returns to composition minimum',()=>{
  const next=window.Play12Playback.nextGridResolution;
  let grid='1/4';
  for(const expected of ['1/8','1/16','1/32','1/64','1/4']){grid=next(grid,'1/4');assert.equal(grid,expected);}
  assert.equal(next('1/64','1/8'),'1/8');
  assert.equal(next('1/64','1/16'),'1/16');
  assert.equal(next('1/64','invalid'),'1/4');
});
test('Renderer adds one left-side Round marker per runtime Round and includes it in combined width',()=>{
  const svg=render(),markers=svg.children.filter(e=>e.attrs['data-round-marker']);
  assert.equal(markers.length,9);assert.deepEqual(markers.map(e=>e.attrs['data-round-marker']),['1','2','3','4','5','6','7','8','9']);
  assert(markers.every(marker=>marker.children[0].tag==='circle'));
  assert.equal(Number(svg.dataset.roundMarkerDiameter),22);assert.equal(Number(svg.dataset.roundMarkerGap),10);
  assert.equal(Number(svg.style.width.replace('px','')),Number(svg.dataset.noteFieldWidth)+32);
  assert(markers.every(marker=>Number(marker.attrs.transform.match(/translate\(([-\d.]+)/)[1])<0));
});

test('imported 6/8 keeps all six beat labels at ×1 and ×2',()=>{
  const doc=structuredClone(score);
  const first=doc.score.parts[0].measures[0];
  first.attributes.time={beats:6,beat_type:8};
  first.events=[];
  first.editor_duration_q='3';
  doc.editor={rounds:[{start:0,end:3,measureStart:0,beats:6,beatQuarters:.5}]};
  for(const gridResolution of ['1/4','1/8']){
    const svg=window.Play12Renderer.render(doc,new Element('div'),{
      zeroNote:'C',measureCount:1,editorTimeline:true,gridResolution,
      countWords:{1:'ONE',2:'TWO',3:'THREE',4:'FOUR'}
    });
    assert.equal(svg.dataset.totalQuarters,'3');
    const beats=svg.children.filter(e=>e.attrs.class?.startsWith('play12-count ')&&!e.attrs.class.includes('-and'));
    assert.deepEqual(beats.map(e=>e.textContent),['ONE','TWO','THREE','FOUR','5','6']);
    assert(beats.every((e,i)=>i===0||+e.attrs.y < +beats[i-1].attrs.y));
  }
});

test('windowed renderer keeps global coordinates and bounds SVG nodes as the score grows',()=>{
  const render = (doc, windowed) => window.Play12Renderer[windowed?'renderWindowed':'render'](doc,new Element('div'),{
    zeroNote:'C',measureCount:doc.editor.rounds.length,editorTimeline:true,gridResolution:'1/4',
    wrapCycles:true,unassignedDisplay:true
  });
  const counts=[];
  for(const quantity of [100,500,1000,2500,10000,20000]){
    const doc=structuredClone(score),part=doc.score.parts[0],source=notes[0];
    part.measures=Array.from({length:quantity/4},(_,index)=>({
      index,attributes:{time:{beats:4,beat_type:4}},editor_duration_q:'4',
      events:Array.from({length:4},(_,i)=>({...source,id:String(index*4+i),start_quarters:String(i),
        editor_onset_q:String(index*4+i),duration_quarters:'1'}))
    }));
    doc.score.parts=[part];
    doc.editor={rounds:part.measures.map((_,i)=>({start:i*4,end:i*4+4,measureStart:i*4,beats:4,beatType:4,beatQuarters:1}))};
    const svg=render(doc,true);
    const initial=svg.children.length;
    assert(svg.ensureScoreWindow(quantity-8,5));
    const last=svg.children.find(n=>n.attrs['data-event-id']===String(quantity-1));
    assert.equal(last.attrs['data-global-start-quarters'],String(quantity-1));
    assert.equal(last.children[0].attrs.y,'0');
    assert(!svg.children.some(n=>n.attrs['data-event-id']==='0'));
    assert(svg.ensureScoreWindow(0,5));
    const first=svg.children.find(n=>n.attrs['data-event-id']==='0');
    assert.equal(first.children[0].attrs.y,String((quantity-1)*32));
    const ids=svg.children.map(n=>n.attrs['data-event-id']).filter(Boolean);
    assert.equal(new Set(ids).size,ids.length);
    counts.push(initial);
  }
  assert.equal(new Set(counts).size,1);
});
