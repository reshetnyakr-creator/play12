const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8'),source=read('../main/main.js');
const body=source.slice(source.indexOf('function preparePlaybackDOM('),source.indexOf('\nconst header=initializeHeader'));
function fixture(absent=false){
 const nodes=new Map();for(const id of [...body.matchAll(/'([^']+)'/g)].map(m=>m[1]))nodes.set(id,{id});
 const chooser={hidden:true,children:[{hidden:false},{hidden:true}],onclick:()=>42};
 if(absent)nodes.delete('zero-chooser');else nodes.set('zero-chooser',chooser);
 const root={getElementById:id=>nodes.get(id)||null,body:{append(n){n.parentElement=this;}}};
 const center={querySelector:()=>({remove(){}}),prepend(){}};
 const context={t:s=>s};vm.createContext(context);vm.runInContext(body,context);
 return {root,chooser,run:()=>context.preparePlaybackDOM(center,root)};
}
test('zero portal preserves both original stages, handlers and selection state',()=>{
 const f=fixture(),stages=f.chooser.children,listener=f.chooser.onclick;f.run();
 assert.equal(f.chooser.parentElement,f.root.body);assert.equal(f.chooser.children,stages);assert.equal(f.chooser.onclick,listener);assert.equal(f.chooser.hidden,true);
 stages[0].hidden=true;stages[1].hidden=false;f.chooser.hidden=false;f.run();
 assert.deepEqual(stages.map(n=>n.hidden),[true,false]);assert.equal(f.chooser.hidden,false);assert.equal(listener(),42);
});
test('missing zero chooser fails initialization explicitly',()=>assert.throws(fixture(true).run,/zero-chooser/));
test('zero card layer is viewport-fixed without restyling or duplicating its contents',()=>{
 const css=read('../main/main.css'),rule=css.match(/\.play12-main > #zero-chooser\s*\{([^}]+)\}/)[1];
 assert.match(rule,/position:\s*fixed/);assert.match(rule,/z-index:\s*1000/);assert.doesNotMatch(rule,/width|height|padding|font|background|overflow|transform/);
 const html=read('../renderer/playback.html');for(const id of ['zero-chooser','zero-instruction','zero-confirmation'])assert.equal(html.split('id="'+id+'"').length-1,1);
});
