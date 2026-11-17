const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('Russian canonical Tutorial uses the shared loader; old URL is a direct compatible redirect',()=>{
 const route=readFileSync(path.join(root,'../ru/MVP/tutorial/index.html'),'utf8'),legacy=readFileSync(path.join(root,'ru/index.html'),'utf8'),loader=readFileSync(path.join(root,'entry.js'),'utf8');assert(route.includes('/MVP/entry.js'));assert(route.includes('lang="ru"'));assert(legacy.includes('/ru/MVP/tutorial/'));assert(legacy.includes('location.search+location.hash'));assert(loader.includes('/MVP/renderer/playback.html'));
});

test('approved Russian product terms live in the shared dictionary',()=>{
  const source=readFileSync(path.join(root,'renderer/play12-i18n.js'),'utf8');
  for(const term of ['Play','Раунд','Повтор','Отсчёт','Практика','Левая рука','Правая рука','Один навык','Клавиша «Функция»','OK12']) assert(source.includes(term));
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

test('transient pause coach uses the shared dictionary in both locales',()=>{
  const dictionary=readFileSync(path.join(root,'renderer/play12-i18n.js'),'utf8');
  const onboarding=readFileSync(path.join(root,'renderer/play12-onboarding.js'),'utf8');
  assert(dictionary.includes("'Try pausing it':'Попробуй нажать «Пауза»'"));
  assert(onboarding.includes("showActionCoach(t('Try pausing it'), 'pause')"));
  assert(!onboarding.includes("showActionCoach('Try pausing it', 'pause')"));
});

test('homepages expose localized primary MVP CTAs and analytics goals',()=>{
  const en=readFileSync(path.resolve(root,'../index.html'),'utf8');
  const ru=readFileSync(path.resolve(root,'../ru/index.html'),'utf8');
  assert(en.includes('href="/MVP/menu/" data-metrika-goal="try_play12_en">Try Play12</a>'));
  assert(ru.includes('href="/ru/MVP/menu/" data-metrika-goal="try_play12_ru">Попробовать Play12</a>'));
  for(const page of [en,ru]) assert(page.includes('window.play12ReachGoal(ctaGoal)'));
});
