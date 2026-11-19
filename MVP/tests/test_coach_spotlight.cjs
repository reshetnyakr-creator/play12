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
function fixture(options={}){
  const timers=new Map(),frames=new Map();let id=0;
  const window={innerWidth:1280,innerHeight:720,setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:i=>timers.delete(i),requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:i=>frames.delete(i)};
  const root=new Element();vm.runInNewContext(readFileSync(path.join(__dirname,'../renderer/play12-coach.js'),'utf8'),{window,document:{createElementNS:(_,tag)=>{const n=new Element();if(tag==='svg')n.getBoundingClientRect=()=>({left:0,top:0,width:window.innerWidth,height:window.innerHeight});return n;}}});
  return {coach:window.Play12Coach.create(root,options),root,timers,frames,window};
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
test('Spotlight follows card nodes rebuilt asynchronously after a runtime zero change',()=>{
  const h=fixture(),card=new Element(),newStrip=new Element();let strips=[];
  h.coach.show(card,()=>strips);
  const holes=h.root.children[0].children[0].children[0].children[1];assert.equal(holes.children.length,0);
  strips=[newStrip,newStrip];const [id,frame]=[...h.frames][0];h.frames.delete(id);frame();
  assert.equal(holes.children.length,1);assert.equal(holes.children[0].attrs.x,84);
  h.coach.stop();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
});

test('Tutorial can use an unclipped viewport portal and reveal live mobile targets',()=>{
 const timers=new Map(),frames=new Map();let ticket=0,reveals=0;const body=new Element(),root=new Element(),window={innerWidth:390,innerHeight:844,setTimeout:(fn,delay)=>{timers.set(++ticket,{fn,delay});return ticket;},clearTimeout:i=>timers.delete(i),requestAnimationFrame:fn=>{frames.set(++ticket,fn);return ticket;},cancelAnimationFrame:i=>frames.delete(i)};
 vm.runInNewContext(readFileSync(path.join(__dirname,'../renderer/play12-coach.js'),'utf8'),{window,document:{body,createElementNS:(_,tag)=>{const n=new Element();if(tag==='svg')n.getBoundingClientRect=()=>({left:0,top:0,width:window.innerWidth,height:window.innerHeight});return n;}}});
 const card=new Element(),target=new Element(),coach=window.Play12Coach.create(root,{padding:3,feather:3,portal:true,reveal:n=>{assert.equal(n,target);reveals++;target.rect.left=12;}});
 coach.show(card,()=>[target]);assert.equal(root.children.length,0);assert.equal(body.children.length,1);assert.equal(reveals,1);
 const holes=body.children[0].children[0].children[0].children[1];assert.equal(holes.children[0].attrs.x,9);assert.equal(holes.children[0].attrs.width,206);assert.equal([...timers.values()][0].delay,5000);coach.stop();assert.equal(frames.size,0);
});

test('Spotlight uses the overlay coordinate system after visual viewport shifts',()=>{const h=fixture(),card=new Element(),target=new Element();h.root.children[0].getBoundingClientRect=()=>({left:20,top:40,width:1260,height:680});h.coach.show(card,[target]);const hole=h.root.children[0].children[0].children[0].children[1].children[0];assert.equal(hole.attrs.x,64);assert.equal(hole.attrs.y,64);h.coach.stop();});

test('Instructional card chooses a free viewport interval beside the highlighted control',()=>{const h=fixture({avoidTargets:true}),card=new Element('onboarding-listen-coach'),target=new Element();card.rect={left:100,top:120,width:200,height:80,right:300,bottom:200};target.rect={left:100,top:100,width:200,height:100,right:300,bottom:200};h.coach.show(card,[target],null,target);const y=parseFloat(card.style['--mvp-coach-y']);assert(y-40>=210||y+40<=90);assert(y-40>=8&&y+40<=712);h.coach.stop();});
test('A card without a free floating interval requests existing in-flow placement before showing',()=>{let docked=0;const h=fixture({avoidTargets:true,dock:()=>{docked++;return true;}}),card=new Element('onboarding-listen-coach'),target=new Element();card.rect={left:100,top:0,width:200,height:1000,right:300,bottom:1000};h.coach.show(card,[target],null,target);assert.equal(docked,1);assert.equal(card.style.visibility,'hidden');h.coach.stop();assert.equal(h.frames.size,0);});
