const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const [file,lang,labels,tutorial]of [['ru/MVP/menu/index.html','ru',['Играть','Обучение','Настройки'],'/MVP/ru/'],['MVP/menu/index.html','en',['Play','Tutorial','Settings'],'/MVP/']]){
 test(lang+' entry contains exactly three actions and no extra visible content or state mutation',()=>{
  const html=read(file),body=html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];assert.match(html,new RegExp('<html lang="'+lang+'"'));
  assert.equal((body.match(/<a\b/g)||[]).length,2);assert.equal((body.match(/<button\b/g)||[]).length,1);assert.doesNotMatch(body,/<h[1-6]|<p\b|<script|<header|<footer/);
  assert.deepEqual([...body.matchAll(/<(?:a|button)\b[^>]*>([^<]*)<\/(?:a|button)>/g)].map(m=>m[1]),labels);
  assert.deepEqual([...body.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),['/ru/MVP/main/',tutorial]);assert.match(body,/<button[^>]*disabled[^>]*title="[^"]+"/);
  assert.doesNotMatch(html,/localStorage|sessionStorage|startNew|resetLearningSetup|<script/);
 });
}
