const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');

class Classes{constructor(){this.values=new Set();}add(...v){v.forEach(x=>this.values.add(x));}remove(...v){v.forEach(x=>this.values.delete(x));}toggle(v,on){on?this.values.add(v):this.values.delete(v);}contains(v){return this.values.has(v);}}
class Node{
  constructor(tag='g'){this.tag=tag;this.attrs={};this.children=[];this.dataset={};this.classList=new Classes();this.style={setProperty(){}};this.parentElement=null;this.clientWidth=1200;this.clientHeight=800;}
  setAttribute(k,v){this.attrs[k]=String(v);}setAttributeNS(_,k,v){this.setAttribute(k,v);}appendChild(n){n.parentElement=this;this.children.push(n);return n;}
  replaceChildren(...nodes){this.children=[];nodes.forEach(n=>this.appendChild(n));}addEventListener(){}getClientRects(){return[{}];}
  querySelectorAll(selector){const out=[];const visit=n=>{for(const child of n.children){if(selector==='path'&&child.tag==='path')out.push(child);visit(child);}};visit(this);return out;}
  querySelector(){return null;}closest(){return null;}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);}
  replaceWith(n){const i=this.parentElement.children.indexOf(this);this.parentElement.children[i]=n;n.parentElement=this.parentElement;this.parentElement=null;}
}
class PathNode extends Node{constructor(index){super('path');this.index=index;}getBBox(){return{x:this.index*36.616,y:128,width:36.616,height:436};}getCTM(){return{a:1,b:0,c:0,d:1,e:0,f:0};}}
function keyboard(){const svg=new Node('svg');for(let i=0;i<88;i++)svg.appendChild(new PathNode(i));return svg;}
class Point{constructor(x,y){this.x=x;this.y=y;}matrixTransform(m){return{x:this.x*m.a+this.y*m.c+m.e,y:this.x*m.b+this.y*m.d+m.f};}}
function setup(){
  const document={createElementNS:(_,tag)=>new Node(tag),importNode:node=>node};
  const window={innerWidth:1400,addEventListener(){},document};
  const sandbox={window,document,DOMParser:class{parseFromString(){return{documentElement:keyboard()};}},DOMPoint:Point,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>(fn(),1),console};
  vm.createContext(sandbox);vm.runInContext(readFileSync(path.join(__dirname,'../renderer/piano-view.js'),'utf8'),sandbox);
  const parent=new Node('div'),mount=new Node('div');parent.classList.add('mvp-piano-host');parent.appendChild(mount);
  const cardTheme={id:'test',pianoSvgText:'<svg/>',pianoUrl:'piano.svg',cycleNames:['red','orange','yellow','green','blue','purple','pink'],stripUrls:{red:'r',orange:'o',yellow:'y',green:'g',blue:'b',purple:'p',pink:'p'},stripWidth:439.4,stripHeight:128};
  const piano=window.Play12PianoView.render({mount,zeroMidi:24,colors:['#f00','#f80','#ff0','#0f0','#08f','#80f','#f0f'],cardTheme,minMidi:21,maxMidi:108});
  return{piano,mount,window};
}

for(const [name,left,right] of [['88-key',21,108],['61-key',36,96],['49-key',36,84],['unusual',41,93],['non-C/non-B edges',41,98]])test(name+' renders the exact physical range without stretching',()=>{
  const {piano,mount}=setup();piano.setRange(left,right);
  assert.equal(piano.keys.size,right-left+1);assert.equal([...piano.keys.keys()][0],left);assert.equal([...piano.keys.keys()].at(-1),right);
  assert.equal(Number(mount.dataset.minMidi),left);assert.equal(Number(mount.dataset.maxMidi),right);
  const visualWidth=parseFloat(mount.style.width),perKey=visualWidth/(right-left+1);assert(Math.abs(perKey-visualWidth/piano.keys.size)<1e-9);
  assert.equal(piano.svg.attrs.viewBox.split(' ')[0],mount.dataset.cropLeft);
  assert.equal(Number(piano.cardRegion.attrs.x),Number(mount.dataset.cropLeft));
  assert.equal(Number(piano.cardRegion.attrs.width),Number(piano.cardClipRect.attrs.width));
});

test('range changes retain global MIDI card mapping and exact mouse targets',()=>{
  const {piano,window}=setup();const full=window.Play12PianoView.mappingForMidi(41,24,['r','o','y','g','b','p','k']);
  piano.setRange(41,93);const cropped=window.Play12PianoView.mappingForMidi(41,piano.zeroMidi,['r','o','y','g','b','p','k']);
  assert.deepEqual(cropped,full);assert.equal(piano.keys.has(40),false);assert.equal(piano.keys.has(41),true);assert.equal(piano.keys.has(94),false);
});

test('shorter instruments keep the full-piano key scale and a shorter centred mount',()=>{
  const full=setup(),short=setup();short.piano.setRange(36,96);
  const fullPerKey=parseFloat(full.mount.style.width)/88,shortPerKey=parseFloat(short.mount.style.width)/61;
  assert(Math.abs(fullPerKey-shortPerKey)<.02);assert(parseFloat(short.mount.style.width)<parseFloat(full.mount.style.width));
});

test('zero remains global and valid at either cropped edge',()=>{
  const {piano}=setup();piano.setRange(36,84);piano.setZeroMidi(36);assert.equal(piano.zeroMidi,36);piano.setZeroMidi(84);assert.equal(piano.zeroMidi,84);assert.equal(piano.keys.size,49);
});

test('card verification targets come from rendered symbol and cycle color for every zero',()=>{
  const {piano}=setup();piano.setRange(21,108);
  for(let zero=21;zero<=32;zero++){
    piano.setZeroMidi(zero);
    const yellow=piano.midiForCard('1',2),green=piano.midiForCard('2',3);
    assert.equal(piano.keys.get(yellow).dataset.play12Symbol,'1');assert.equal(piano.keys.get(yellow).dataset.play12Color,'#ff0');
    assert.equal(piano.keys.get(green).dataset.play12Symbol,'2');assert.equal(piano.keys.get(green).dataset.play12Color,'#0f0');
  }
});
