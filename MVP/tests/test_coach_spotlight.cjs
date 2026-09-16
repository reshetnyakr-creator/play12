const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
class Element {
  constructor(id=''){this.id=id;this.children=[];this.attrs={};this.style={setProperty:(k,v)=>this.style[k]=v};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c)};this.rect={left:100,top:120,width:200,height:240};}
  setAttribute(k,v){this.attrs[k]=v;}
  appendChild(e){this.children.push(e);}
  replaceChildren(){this.children=[];}
  getBoundingClientRect(){return this.rect;}
}
function fixture(){
  const timers=new Map(),frames=new Map();let id=0;
  const window={innerWidth:1280,innerHeight:720,setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:i=>timers.delete(i),requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:i=>frames.delete(i)};
  const root=new Element();vm.runInNewContext(readFileSync(path.join(__dirname,'../renderer/play12-coach.js'),'utf8'),{window,document:{createElementNS:()=>new Element()}});
  return {coach:window.Play12Coach.create(root),root,timers,frames,window};
}
test('Spotlight ends at 5s, leaving card visible; padding follows actual resized targets',()=>{
  const h=fixture(),card=new Element('onboarding-listen-coach'),field=new Element(),piano=new Element();
  card.hidden=false;h.coach.show(card,[field,piano],piano,field);
  const overlay=h.root.children[0], mask=overlay.children[0].children[0],holes=mask.children[1];
  assert.equal(mask.attrs.x,0);assert.equal(mask.attrs.y,0);assert.equal(mask.attrs.width,1280);assert.equal(mask.attrs.height,720);
  assert.equal(overlay.attrs.preserveAspectRatio,'none');assert.equal(overlay.children[0].children[1].children[0].attrs.stdDeviation,16);
  assert.equal(holes.children[0].attrs.filter,'url(#play12-coach-feather)');
  assert.equal([...h.timers.values()][0].delay,5000);assert.equal(holes.children[0].attrs.x,84);assert.equal(holes.children[0].attrs.width,232);
  assert(piano.classes.has('is-coach-pulsing'));assert.equal(card.style['--mvp-coach-y'],'240px');
  field.rect={left:40,top:80,width:160,height:100};h.window.innerWidth=900;
  const [id,frame]=[...h.frames][0];h.frames.delete(id);frame();
  assert.equal(overlay.attrs.viewBox,'0 0 900 720');assert.equal(holes.children[0].attrs.x,24);assert.equal(card.style['--mvp-coach-y'],'130px');
  [...h.timers.values()][0].fn();assert.equal(overlay.style.display,'none');assert.equal(card.hidden,false);assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);assert(!piano.classes.has('is-coach-pulsing'));
});
test('New instruction cancels old timers; unrelated card cleanup cannot close new spotlight',()=>{
  const h=fixture(),a=new Element(),b=new Element();h.coach.show(a,[a]);const old=[...h.timers.keys()][0];
  h.coach.show(b,[b]);assert(!h.timers.has(old));assert.equal(h.timers.size,1);assert.equal(h.frames.size,1);
  h.coach.stop(a);assert.equal(h.root.children[0].style.display,'block');h.coach.stop(b);assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
});
