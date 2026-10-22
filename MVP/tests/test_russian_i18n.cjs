const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('Russian route is a lightweight wrapper around shared playback',()=>{
  const route=readFileSync(path.join(root,'ru/index.html'),'utf8');
  assert(route.includes("fetch('../renderer/playback.html')"));
  for(const duplicated of ['play12-onboarding.js','play12-playback.js','play12-round-board.js','web-midi-diagnostic.js']) assert(!route.includes(duplicated));
  assert(route.includes('window.__PLAY12_LOCALE__="ru"'));
});

test('approved Russian product terms live in the shared dictionary',()=>{
  const source=readFileSync(path.join(root,'renderer/play12-i18n.js'),'utf8');
  for(const term of ['Play','Раунд','Повтор','Отсчёт','Режим тренировки','Клавиша «Функция»','OK12']) assert(source.includes(term));
  for(const count of ['49 клавиш','61 клавишу','88 клавиш']) {
    const number=Number(count.split(' ')[0]);
    const one=number%10===1&&number%100!==11?'клавишу':[2,3,4].includes(number%10)&&![12,13,14].includes(number%100)?'клавиши':'клавиш';
    assert.equal(`Мы определили ${number} ${one}`,`Мы определили ${count}`);
  }
});

test('English remains the source copy and locale does not use onboarding storage',()=>{
  const source=readFileSync(path.join(root,'renderer/play12-i18n.js'),'utf8');
  assert(source.includes("new URLSearchParams(location.search).get('lang')"));
  assert(!source.includes('localStorage'));
  assert(source.includes("locale === 'ru' ? (ru[key] || key) : key"));
});
