'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../renderer/play12-round-navigator.js'),'utf8');

function fixture(total){
  class Node {
    constructor(){this.children=[];this.style={setProperty:(k,v)=>this.style[k]=v};this.dataset={};this.listeners={};
      this.offsetHeight=102;this.offsetWidth=348;this.classList={add(){}};}
    append(...nodes){this.children.push(...nodes);}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,fn){this.listeners[name]=fn;}
    getBoundingClientRect(){return{left:0,height:414,width:348};}
    setPointerCapture(){}
    setCustomValidity(value){this.validationMessage=value;}
    reportValidity(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
    focus(){}
    select(){this.selected=true;}
    send(type,extra={}){this.listeners[type]?.({type,preventDefault(){},...extra});}
  }
  const window=new Node(),doc={body:new Node(),createElement:()=>new Node(),getElementById:()=>null};
  const queue=new Map();let raf=0;
  Object.assign(window,{requestAnimationFrame(fn){queue.set(++raf,fn);return raf;},cancelAnimationFrame(id){queue.delete(id);},setTimeout(){}});
  const stage=new Node();
  stage.ownerDocument=doc;stage.offsetHeight=414;
  const rounds=Array.from({length:total},(_,i)=>({start:i*4,end:(i+1)*4}));
  const jumped=[],playback={stage,rounds,clock:{position:0},executionY:()=>414,seek(q){jumped.push(q);}};
  vm.runInNewContext(source,{window,ResizeObserver:class{observe(){}}});
  const api=window.Play12RoundNavigator,navigator=api.create(playback);
  return {api,navigator,doc,jumped,queue,window,buttons:navigator.root.children};
}

test('finds real round boundaries including a longer fermata round and final position',()=>{
  const {api}=fixture(1);
  const rounds=[{start:0},{start:4},{start:12.5}];
  assert.equal(api.indexAt(rounds,-1),0);
  assert.equal(api.indexAt(rounds,12.4),1);
  assert.equal(api.indexAt(rounds,12.5),2);
  assert.equal(api.indexAt(rounds,100),2);
});
test('single round stays fixed and both arrows are disabled',()=>{
  const {buttons,navigator,jumped}=fixture(1);
  assert.equal(buttons[1].textContent,'1');
  assert.equal(buttons[0].disabled,true);
  assert.equal(buttons[2].disabled,true);
  assert.equal(navigator.move(1),false);
  assert.deepEqual(jumped,[]);
});
test('entry selects the current number, validates limits and seeks exactly once',()=>{
  const {buttons,navigator,doc,jumped}=fixture(372);
  navigator.update(4);buttons[1].send('click');
  const form=doc.body.children[0].children[0],input=form.children[0].children[0];
  assert.equal(input.value,'2');assert.equal(input.selected,true);
  for(const invalid of ['0','373','2.5','2e2']){
    input.value=invalid;form.send('submit');assert.deepEqual(jumped,[]);
  }
  input.value='260';form.send('submit');
  assert.deepEqual(jumped,[1036]);
  assert.equal(buttons[1].textContent,'260');
});
test('drag coalesces rapid moves and commits the last pointer point without a click',()=>{
  const {navigator,jumped,queue,window,buttons,doc}=fixture(372);
  const root=navigator.root;
  root.send('pointerdown',{button:0,pointerId:1,clientY:300});
  window.send('pointermove',{pointerId:1,clientY:298});
  assert.equal(queue.size,0);
  window.send('pointermove',{pointerId:1,clientY:270});
  window.send('pointermove',{pointerId:1,clientY:100});
  assert.equal(queue.size,1);
  window.send('pointerup',{pointerId:1,clientY:-40});
  buttons[1].send('click');
  assert.equal(queue.size,0);
  assert.deepEqual(jumped,[1484]);
  assert.equal(doc.body.children[0].open,undefined);
});

test('upper arrow advances and lower arrow returns with correct labels and bounds',()=>{
  const {buttons,navigator,jumped}=fixture(3);
  const [up,,down]=buttons;
  assert.equal(up.textContent,'▲');
  assert.equal(up['aria-label'],'Next round');
  assert.equal(down.textContent,'▼');
  assert.equal(down['aria-label'],'Previous round');
  assert.equal(up.disabled,false);
  assert.equal(down.disabled,true);
  up.send('click');
  assert.deepEqual(jumped,[4]);
  assert.equal(down.disabled,false);
  down.send('click');
  assert.deepEqual(jumped,[4,0]);
  navigator.update(8);
  assert.equal(up.disabled,true);
  assert.equal(down.disabled,false);
});
