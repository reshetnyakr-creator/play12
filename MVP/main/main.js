/* Main workspace: one production renderer and playback instance, two interaction modes. */
(async function(){'use strict';const t=window.Play12UI?.t||((s)=>s),uiError=window.Play12UI?.error||((s)=>s);const E=Play12Editor,D=Play12MainData,$=id=>document.getElementById(id);let controller,doc,revision,dirty=false,editing=false,selected=null,saving=false,shell=null,toastTimer=0;const dev=new URLSearchParams(location.search).get('dev')==='1';
const editorAdapter=Play12EditingAdapter.create({editor:E,getDocument:()=>doc});
function element(tag,text,attrs={}){const n=document.createElement(tag);if(text)n.textContent=text;for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
const button=(text,fn)=>{const b=element('button',text,{type:'button'});b.onclick=()=>Promise.resolve().then(fn).catch(error);return b;};
function error(e){$('main-status').textContent=uiError(e.message||String(e));$('main-status').setAttribute('role','alert');}
function download(name,value){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=element('a',null,{href:u,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function position(){return controller?.playback.clock.position||0;}
function remember(){if(!doc)return;sessionStorage.setItem('play12.main.position:'+doc.id,String(position()));if(controller)sessionStorage.setItem('play12.main.locale-state:'+doc.id,JSON.stringify({practice:controller.playback.getPracticeSettings(),metronome:controller.playback.metronomeInput.checked,music:controller.playback.musicAudioInput.checked,selected}));}
function leave(){if(dirty&&!confirm(t('Есть несохранённые изменения. Выйти без сохранения?')))return false;remember();return true;}
function open(id,mode='train'){if(!leave())return;D.activate(id,true);location.href=Play12Routes.path('main')+'?composition='+encodeURIComponent(id)+(mode==='edit'?'&mode=edit':'');}
await new Promise(resolve=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',resolve,{once:true}):resolve());
document.body.classList.add('play12-main');document.title=t('Play12 — Мои мелодии');
function initializeHeader(root){
const requireNode=(parent,selector)=>{const node=parent.querySelector(selector);if(!node)throw Error(t('Отсутствует обязательный элемент шапки: ')+selector);return node;};
const header=requireNode(root,'.mvp-site-header'),logo=requireNode(header,'.mvp-logo-link'),image=requireNode(header,'img'),nav=requireNode(header,'nav'),manual=requireNode(nav,'a[href$="/manual.html"]'),manifesto=requireNode(nav,'a[href$="/manifesto.html"]'),language=requireNode(header,'.mvp-language-switch');
logo.href=Play12Routes.locale()==='ru'?'/ru/':'/';image.src='/P12%20logo.png';manual.href=Play12Routes.locale()==='ru'?'/ru/manual.html':'/manual.html';manifesto.href=Play12Routes.locale()==='ru'?'/ru/manifesto.html':'/manifesto.html';manual.textContent=t('Руководство');manifesto.textContent=t('Манифест');Play12Routes.languages(language,'main');for(const a of language.querySelectorAll('a'))a.addEventListener('click',async ev=>{ev.preventDefault();ev.stopPropagation();if(saving)return;try{if(dirty)await save();remember();const q=new URLSearchParams(location.search);if(doc){q.set('composition',doc.id);if(editing)q.set('mode','edit');else q.delete('mode');sessionStorage.setItem('play12.main.locale-state:'+doc.id,JSON.stringify({practice:controller.playback.getPracticeSettings(),metronome:controller.playback.metronomeInput.checked,music:controller.playback.musicAudioInput.checked,selected}));}location.href=Play12Routes.url('main',a.lang,'?'+q,location.hash);}catch(e){error(e);}});root.body.prepend(header);return header;
}
function preparePlaybackDOM(center,root){
const heading=center.querySelector('.playback-header'),position=root.getElementById('position');
if(!heading||!position)throw Error(t('Отсутствует обязательный элемент Playback: position / playback-header'));
// Playback writes timing and practice status to this output throughout its lifetime.
position.hidden=true;center.prepend(position);heading.remove();
const required=['playback-stage','play12-score','piano-view','position','bpm','bpm-minus','bpm-plus','metronome-board','metronome-toggle','metronome','metronome-volume','metronome-beat-lamp','count-in','music-audio','practice-mode','choose-zero','grid-resolution','play','pause','restart','loop','loop-gap','loop-start','loop-end','previous-round','next-round','round-loop-board','midi-diagnostic','enable-midi'];
const missing=required.filter(id=>!root.getElementById(id));if(missing.length)throw Error(t('Отсутствуют обязательные элементы Playback: ')+missing.join(', '));
// Preserve both existing zero-selection stages and their listeners, outside the
// transformed/clipped score ancestors. A higher z-index inside them cannot help.
const zeroChooser=root.getElementById('zero-chooser');
if(!zeroChooser)throw Error(t('Отсутствует обязательный элемент Playback: zero-chooser'));
root.body.append(zeroChooser);
return required;
}
const header=initializeHeader(document);document.getElementById('onboarding-skip')?.remove();
const layout=element('div',null,{class:'main-layout main-layout-unloaded'}),left=element('aside',null,{class:'main-library','aria-label':t('Профиль и мои мелодии')}),center=document.querySelector('main.playback-page'),right=element('aside',null,{class:'main-skill','aria-label':'Skill Bank'});layout.append(left,center,right);header.after(layout);right.append(element('h2','Skill Bank'),element('p',t('Скоро')));const footer=element('section',null,{class:'main-footer','aria-label':t('Управление тренировкой и клавиатура')}),controlRow=element('div',null,{class:'mvp-control-row'}),pianoHost=element('div',null,{class:'mvp-piano-host'});footer.append(controlRow,pianoHost);layout.append(footer);const fieldHost=element('div',null,{class:'mvp-playback-host'});center.append(fieldHost);preparePlaybackDOM(center,document);
const profile=D.profile(),profileCard=element('section',null,{class:'main-profile'}),plant=element('button','♧',{type:'button',disabled:'','aria-label':t('Оранжерея — скоро'),title:t('Оранжерея — скоро'),class:'main-plant'}),identity=element('div'),displayName=element('strong',profile.displayName),time=element('small',t('Время занятий: ')+Math.floor((D.workspace().practiceMs||0)/60000)+t(' мин'),{id:'main-practice-time'}),form=element('form'),name=element('input',null,{value:profile.displayName,maxlength:'80','aria-label':t('Имя пользователя'),required:''});form.hidden=true;form.append(name,element('button',t('Сохранить'),{type:'submit'}));form.onsubmit=ev=>{ev.preventDefault();try{displayName.textContent=D.profile(name.value).displayName;form.hidden=true;}catch(e){error(e);}};identity.append(displayName,button(t('Изменить имя'),()=>{form.hidden=!form.hidden;if(!form.hidden)name.focus();}),time,element('small',t('Оранжерея — скоро')),form);plant.innerHTML='<svg viewBox="0 0 60 80" aria-hidden="true"><path d="M29 53V21" stroke="#6e8b62" stroke-width="2" fill="none"/><path d="M29 38C9 40 7 21 13 18C29 19 33 26 29 38M30 29C47 31 54 15 48 10C33 11 27 19 30 29" fill="#8fae7d"/><path d="M18 52h25l-4 20H22z" fill="#cab7d9"/><path d="M16 51h29v6H16z" fill="#b8a0cc"/></svg>';profileCard.append(plant,identity);left.append(profileCard);const libraryCard=element('section',null,{class:'main-library-card'}),heading=element('div',null,{class:'main-library-heading'});heading.append(element('h2',t('Мои мелодии')),element('a','+',{href:Play12Routes.path('import'),class:'main-add-melody','aria-label':t('+ Добавить мелодию')}));const rows=element('div',null,{class:'main-melodies'});libraryCard.append(heading,rows);left.append(libraryCard);
function action(label,icon,fn){const b=button(icon,fn);b.title=label;b.setAttribute('aria-label',label);b.className='main-icon-action';const paths={ [t('Тренироваться')]:'<rect x="2" y="5" width="20" height="14" rx="1"/><path d="M6 5v9h3V5m6 0v9h3V5M7 14v5m5-14v14m5-5v5"/>',[t('Редактировать')]:'<path d="m4 16-1 5 5-1L21 7l-4-4zM14 6l4 4"/>',[t('Удалить')]:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'};b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+paths[label]+'</svg>';b.append(element('span',label,{class:'main-action-label'}));return b;}

const status=element('p','', {id:'main-status',role:'status','aria-live':'polite'}),tools=element('section',null,{class:'main-tools','aria-label':t('Управление мелодией')});center.prepend(tools,status);const empty=element('p',t('Добавьте мелодию или выберите её в списке.'),{class:'main-empty'});center.prepend(empty);$('playback-stage').hidden=true;
const backup=element('details'),backupFile=element('input',null,{type:'file',accept:'.json','aria-label':t('Восстановить резервную копию')});backup.append(element('summary',t('Резервная копия')),button(t('Скачать копию'),async()=>download('play12-backup.json',await D.backup())),backupFile);backupFile.onchange=async()=>{try{const count=await D.restore(JSON.parse(await backupFile.files[0].text()));await library();status.textContent=t('Восстановлено мелодий: ')+count+t('. Существующие записи сохранены.');}catch(e){error(e);}};libraryCard.append(backup);
const developer=element('details');developer.hidden=!dev;developer.append(element('summary',t('Диагностика')),button(t('Экспорт JSON'),()=>download('play12-main-diagnostics.json',{profile:D.profile(),document:doc,draft:doc&&localStorage.getItem('play12.main.draft:'+doc.id),effective:doc&&E.effective(doc),position:position(),dirty,mode:editing?'edit':'train'})));center.append(developer);const toast=element('div','',{class:'main-toast',role:'status','aria-live':'polite'});toast.hidden=true;document.body.append(toast);
function melodyTitle(d){const b=button(d.title,()=>d.id===doc?.id?(D.activate(d.id,true),library()):open(d.id));b.className='main-melody-title';b.setAttribute('aria-label',t('Открыть мелодию «')+d.title+t('»'));return b;}
let libraryVersion=0;async function library(){const version=++libraryVersion;const docs=D.ordered(await D.list());if(version!==libraryVersion)return;rows.replaceChildren();for(const d of docs){const row=element('article',null,{class:'main-melody'});if(d.id===(doc?.id||D.workspace().activeId))row.setAttribute('aria-current','true');row.append(element('span','♫',{class:'main-music-icon','aria-hidden':'true'}),melodyTitle(d),action(t('Тренироваться'),'▥',()=>d.id===doc?.id?(D.activate(d.id,true),library(),mode(false)):open(d.id)),action(t('Редактировать'),'✎',()=>d.id===doc?.id?(D.activate(d.id,true),library(),mode(true)):open(d.id,'edit')),action(t('Удалить'),'♜',async()=>{if(!confirm(t('Удалить мелодию «')+d.title+t('»?')))return;if(d.id===doc?.id&&!leave())return;await D.remove(d.id);D.forget(d.id);localStorage.removeItem('play12.main.draft:'+d.id);sessionStorage.removeItem('play12.main.position:'+d.id);if(d.id===doc?.id||new URLSearchParams(location.search).get('composition')===d.id){controller?.playback.pauseImmediate();dirty=false;location.href=Play12Routes.path('main');}else await library();}));if(d.id===doc?.id){const chosen=row.querySelector('[aria-label="'+(editing?t('Редактировать'):t('Тренироваться'))+'"]');chosen.classList.add('is-mode-active');chosen.setAttribute('aria-pressed','true');}rows.append(row);}if(!docs.length)rows.append(element('p',t('Пока нет мелодий.')));}
function cache(){dirty=true;try{localStorage.setItem('play12.main.draft:'+doc.id,JSON.stringify({revision,changes:{title:doc.title,manual:doc.manual,history:doc.history,cursor:doc.cursor,revision:doc.revision,lastValidation:doc.lastValidation}}));}catch(e){error(Error(t('Черновик не сохранён: недостаточно места. Сохраните изменения перед выходом.')));}sync();}
function syncTitle(){
  const label=$('main-title-label'),input=$('main-title-input');
  if(!label||!input)return;
  label.textContent=doc.title;
  label.parentElement.title=doc.title;
  label.parentElement.setAttribute('aria-label',doc.title);
  label.disabled=!editing||saving;
  label.tabIndex=editing&&!saving?0:-1;
  if(!editing){input.hidden=true;label.hidden=false;}
}
function finishTitle(commit){
  const input=$('main-title-input'),label=$('main-title-label');
  if(!input||input.hidden)return true;
  const title=input.value.trim();
  if(commit&&!title){input.setCustomValidity(t('Введите название мелодии.'));input.reportValidity();input.focus();return false;}
  input.hidden=true;label.hidden=false;
  if(commit&&title!==doc.title){doc.title=title;doc.revision++;cache();shell?.resize();}
  sync();label.focus();
  return true;
}
function mountTitle(){
  const heading=element('h1');
  const label=element('button',doc.title,{id:'main-title-label',class:'main-title-text',type:'button'});
  const input=element('input',null,{id:'main-title-input',type:'text',maxlength:'120','aria-label':t('Название мелодии'),hidden:''});
  heading.append(label,input);
  label.addEventListener('click',()=>{if(!editing||saving)return;input.value=doc.title;input.setCustomValidity('');label.hidden=true;input.hidden=false;sync();input.focus();input.select();});
  input.addEventListener('input',()=>input.setCustomValidity(''));
  input.addEventListener('keydown',event=>{
    if(event.isComposing||!['Enter','Escape'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();finishTitle(event.key==='Enter');
  });
  tools.append(heading);
}
function sync(){if(!doc)return;syncTitle();document.body.classList.toggle('is-editing',editing);$('main-edit-tools').hidden=!editing;$('main-save').disabled=saving||(!dirty&&$('main-title-input')?.hidden!==false);$('main-undo').disabled=!editing||doc.cursor===0;$('main-redo').disabled=!editing||doc.cursor===doc.history.length;for(const g of $('play12-score').querySelectorAll('g[data-event-id]')){g.classList.toggle('main-selected',g.dataset.eventId===selected&&editing);g.style.touchAction=editing?'none':'pan-x pan-y';};$('main-fingers').hidden=!selected||!editing;document.body.classList.toggle('training-nav-locked',!!selected&&editing);if(selected&&editing)positionFingers();}
let zeroFingeringJob=0, zeroFingeringWorker=null, stopWaitingForPause=null;
async function updateZeroFingering(){
  if(!doc||doc.mode!=='engine')return;
  const job=++zeroFingeringJob,current=doc,delta=controller.playback.transposeDelta;
  zeroFingeringWorker?.terminate();
  stopWaitingForPause?.();
  const apply=run=>{
    if(job!==zeroFingeringJob||current!==doc)return;
    if(controller.playback.clock.running){
      let unsubscribe;
      unsubscribe=controller.playback.addStateListener(({running})=>{
        if(!running){unsubscribe();stopWaitingForPause=null;apply(run);}
      });
      stopWaitingForPause=unsubscribe;
      return;
    }
    E.setRuntimeFingering(current,run);
    refresh();
  };
  if(!delta){apply(null);return;}
  try{
    const response=await fetch('/MVP/editor/beginner.json');
    if(!response.ok)throw Error('HTTP '+response.status);
    const config=await response.json(), manualSnapshot=JSON.stringify(current.manual);
    if(job!==zeroFingeringJob||current!==doc)return;
    const worker=new Worker('/MVP/editor/worker.js?v=stage16');
    zeroFingeringWorker=worker;
    const run=await new Promise((resolve,reject)=>{
      const close=()=>{clearTimeout(timer);worker.terminate();if(zeroFingeringWorker===worker)zeroFingeringWorker=null;};
      const timer=setTimeout(()=>{close();reject(Error(t('Превышено время расчёта')));},25000);
      worker.onmessage=({data})=>{close();data.error?reject(Error(data.error)):resolve(data.run);};
      worker.onerror=event=>{close();reject(Error(event.message));};
      worker.postMessage({score:current.score,config,locks:current.manual,transpose:delta});
    });
    if(manualSnapshot!==JSON.stringify(current.manual))return updateZeroFingering();
    if(run.validation.conflicts.length||run.search_status==='budget_exhausted')return;
    apply(run);
  }catch(failure){if(job===zeroFingeringJob)error(failure);}
}
window.addEventListener('play12:zero-confirmed',updateZeroFingering);
function showCoverage(){
  const notes=E.events(E.effective(doc));
  const missing=notes.filter(e=>e.method.finger==null).length;
  $('main-coverage').hidden=!missing;
  $('main-coverage').textContent=missing
    ? t('Аппликатура неполная. Назначено: ')+(notes.length-missing)+t(' из ')+notes.length+t(' нот. Без аппликатуры: ')+missing+'.'+' '+t('Пунктиром показаны ноты без аппликатуры.')
    : '';
}
function refresh(){controller.document=doc;controller.refresh(doc);bindDrag();showCoverage();sync();if(selected)paintFingers(fingerChanged&&dirty);}
async function save(){if(saving||!finishTitle(true)||!dirty)return;saving=true;clearTimeout(toastTimer);toast.hidden=true;sync();try{doc.userId=D.profile().userId;await E.Store.put(doc,revision);const stored=await E.Store.get(doc.id);if(!stored||stored.revision!==doc.revision||stored.title!==doc.title||JSON.stringify(stored.manual)!==JSON.stringify(doc.manual))throw Error(t('Не удалось подтвердить сохранение'));revision=doc.revision;dirty=false;localStorage.removeItem('play12.main.draft:'+doc.id);if(selected)paintFingers(false);await library();showSaved();}finally{saving=false;sync();}}
async function mode(value){if(!controller||saving)return;if(!value&&!finishTitle(true))return;if(!value&&dirty){if(!confirm(t('Сохранить изменения перед тренировкой?')))return;await save();}controller.playback.pauseImmediate(position());editing=value;selected=null;sync();library().catch(error);}
async function apply(finger){if(!editing||!selected)return;const trial=editorAdapter.change(selected,finger);if(!trial.accepted){status.textContent=t('Этот палец уже занят пересекающейся нотой. Назначение не изменено.');return;}cache();refresh();paintFingers(true);}
let fingerChanged=false;
function showSaved(){clearTimeout(toastTimer);toast.hidden=false;toast.textContent=t('Изменения сохранены');toastTimer=setTimeout(()=>{toast.hidden=true;toast.textContent='';},3000);}
function positionFingers(){const g=Array.from($('play12-score').querySelectorAll('g[data-event-id]')).find(n=>n.dataset.eventId===selected);if(!g){$('main-fingers').hidden=true;return;}const box=g.getBoundingClientRect(),panel=$('main-fingers');panel.style.left=Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,box.left+box.width/2-panel.offsetWidth/2))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-panel.offsetHeight-8,box.bottom+8))+'px';}
function paintFingers(changed=false){if(!selected)return;fingerChanged=changed;const n=editorAdapter.current(selected);$('main-selection').textContent=n?.hand==='L'?t('Левая рука'):t('Правая рука');for(const b of $('main-fingers').querySelectorAll('button')){const active=Number(b.textContent)===n?.method.finger;b.setAttribute('aria-pressed',String(active));b.classList.toggle('is-current-finger',active&&!changed);b.classList.toggle('is-new-finger',active&&changed);}positionFingers();}
function select(id){if(!editing)return;selected=id;sync();paintFingers(false);}

window.play12Main={select,closePicker(){selected=null;sync();}};window.addEventListener('resize',()=>{if(selected&&editing)positionFingers();});window.addEventListener('scroll',()=>{if(selected&&editing)positionFingers();},true);document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){selected=null;sync();}});
function bindDrag(){for(const g of $('play12-score').querySelectorAll('g[data-event-id]')){let start;if(g.dataset.mainDragBound)continue;g.dataset.mainDragBound='true';g.style.touchAction=editing?'none':'pan-x pan-y';g.addEventListener('pointerdown',ev=>{if(!editing||ev.button!==0)return;start={x:ev.clientX,y:ev.clientY};g.setPointerCapture(ev.pointerId);});g.addEventListener('pointercancel',()=>start=null);g.addEventListener('pointerup',ev=>{if(!start)return;const moved=Math.hypot(ev.clientX-start.x,ev.clientY-start.y)>8;start=null;if(!moved)return;try{const svg=g.ownerSVGElement,point=new DOMPoint(ev.clientX,ev.clientY).matrixTransform(svg.getScreenCTM().inverse()),cell=Play12Renderer.defaults.cellWidth,right=5*cell+cell*Play12Renderer.defaults.countColumnWidthRatio,n=E.events(doc.score).find(e=>e.id===g.dataset.eventId),finger=n.hand==='L'?5-Math.floor(point.x/cell):Math.floor((point.x-right)/cell)+1;if(!n.hand||finger<1||finger>5)throw Error(t('Перетащите ноту в колонку пальца той же руки.'));select(n.id);apply(finger).catch(error);}catch(e){error(e);}});}}
function ready(){if(controller)return;controller=window.play12MainController;if(!controller)return;doc=controller.document;revision=doc.revision;D.activate(doc.id);layout.classList.remove('main-layout-unloaded');empty.hidden=true;$('playback-stage').hidden=false;tools.replaceChildren();mountTitle();
center.insertBefore(element('p',null,{id:'main-coverage',role:'status',hidden:''}),fieldHost);showCoverage();
const editTools=element('div',null,{id:'main-edit-tools'}),undo=button(t('Отменить'),()=>{if(editorAdapter.undo()){cache();refresh();}}),redo=button(t('Повторить'),()=>{if(editorAdapter.redo()){cache();refresh();}}),saveButton=button(t('Сохранить изменения'),save);undo.id='main-undo';redo.id='main-redo';undo.title=t('Отменить');undo.setAttribute('aria-label',t('Отменить'));undo.textContent='↶';redo.title=t('Повторить');redo.setAttribute('aria-label',t('Повторить'));redo.textContent='↷';saveButton.id='main-save';editTools.append(undo,redo,saveButton,button(t('Готово'),()=>mode(false)));const fingers=element('div',null,{id:'main-fingers'});fingers.append(element('span','',{id:'main-selection'}));for(let i=1;i<=5;i++)fingers.append(button(String(i),()=>apply(i)));fingers.setAttribute('role','dialog');fingers.setAttribute('aria-label',t('Выбор пальца'));fingers.hidden=true;document.body.append(fingers);tools.append(editTools);
const raw=localStorage.getItem('play12.main.draft:'+doc.id);if(raw){try{const draft=JSON.parse(raw);if(draft.revision===revision&&confirm(t('Восстановить несохранённые изменения аппликатуры?'))){doc=draft.document??{...doc,...draft.changes};dirty=true;refresh();}else if(draft.revision!==revision)status.textContent=t('Есть черновик другой версии. Он сохранён в этом браузере; экспортируйте его в режиме разработчика.');}catch(e){error(e);}}
let localeState=null;try{localeState=JSON.parse(sessionStorage.getItem('play12.main.locale-state:'+doc.id));sessionStorage.removeItem('play12.main.locale-state:'+doc.id);}catch(_){}if(localeState?.practice){controller.playback.setPracticeSettings(localeState.practice);controller.playback.setMetronome(localeState.metronome===true,false);controller.playback.musicAudioInput.checked=localeState.music!==false;}
controller.playback.onScoreWindowChange=()=>{bindDrag();if(selected){const visible=[...$('play12-score').querySelectorAll('g[data-event-id]')].some(g=>g.dataset.eventId===selected);if(!visible)selected=null;sync();}};
const at=Number(sessionStorage.getItem('play12.main.position:'+doc.id));if(Number.isFinite(at)&&at>=0)controller.playback.seek(at);bindDrag();shell=Play12TrainingShell.create({runtime:{midiDiagnostic:window.play12MidiDiagnostic,stage:$('playback-stage'),pianoView:controller.playback.pianoView,playback:controller.playback},root:layout,playbackHost:fieldHost,controlRow,pianoHost,footer,zones:{left,center,right},controls:[$('metronome-board').parentElement,$('practice-board')]});
footer.prepend($('keyboard-range-warning'));$('onboarding-choose-zero').hidden=false;$('round-loop-board').hidden=false;shell.mount();mode(new URLSearchParams(location.search).get('mode')==='edit'||dirty);connectMidi();if(controller.playback.transposeDelta)updateZeroFingering();if(localeState?.selected&&editing)select(localeState.selected);library().catch(error);}

let lastAction=-Infinity,lastTick=performance.now();const activeInput=()=>{lastAction=performance.now();};for(const type of ['pointerdown','keydown'])document.addEventListener(type,activeInput,{passive:true});
const activityTimer=setInterval(()=>{const now=performance.now(),elapsed=now-lastTick;lastTick=now;if(doc&&!document.hidden&&elapsed<5000&&(controller?.playback.clock.running||now-lastAction<15000)){const state=D.addActivity(elapsed);$('main-practice-time').textContent=t('Время занятий: ')+Math.floor(state.practiceMs/60000)+t(' мин');}},1000);
window.addEventListener('pagehide',()=>{clearInterval(activityTimer);clearTimeout(toastTimer);shell?.dispose();zeroFingeringWorker?.terminate();stopWaitingForPause?.();},{once:true});
function midiPresentation(status){const unsupported=status==='unavailable'||status==='unsupported';return{text:status==='connected'?t('MIDI: подключено'):status==='requesting'?t('MIDI: подключение…'):unsupported?t('MIDI не поддерживается'):status==='permission-denied'?t('MIDI: не подключено — нет разрешения'):t('MIDI: не подключено'),title:status==='no-input'?t('MIDI-устройство не обнаружено'):status==='permission-denied'?t('Разрешите MIDI в настройках браузера'):unsupported?t('В этом браузере отсутствует Web MIDI API'):status==='error'?t('Ошибка подключения MIDI'):'',connected:status==='connected',unsupported,disabled:unsupported||status==='requesting'};}
function connectMidi(){const midi=window.play12MidiDiagnostic;if(!midi)return;if(!dev)$('midi-diagnostic').hidden=true;const panel=element('div',null,{class:'main-midi'}),label=element('span',t('MIDI: не подключено'),{class:'main-midi-status',role:'status','aria-live':'polite'});let calibrationHint='';
const render=()=>{const status=midi.currentStatus?.status||'no-input',view=midiPresentation(status);label.textContent=view.text+(view.connected&&calibrationHint?' · '+calibrationHint:'');label.title=view.title;label.setAttribute('data-midi-status',view.connected?'connected':status);connect.hidden=view.connected&&!['unusual','confirm','invalid','verify-retry'].includes(midi.calibrationMode);connect.disabled=view.disabled;connect.textContent=view.connected?({unusual:t('Использовать диапазон'),confirm:t('Подтвердить диапазон'),invalid:t('Повторить калибровку'),'verify-retry':t('Проверить ещё раз')}[midi.calibrationMode]||t('Подключить MIDI')):t('Подключить MIDI');if(!view.connected)calibrationHint='';};
const calibrateIfNeeded=()=>{const cal=midi.getCalibration();if(midi.currentStatus?.status==='connected'&&!midi.calibrationMode&&(!cal?.verified||!midi.inputHandlers.has(cal.inputId)))midi.beginCalibration();};
const connect=button(t('Подключить MIDI'),async()=>{if(midi.currentStatus?.status==='connected'){const commands={unusual:'useUnusualRange',confirm:'confirmRange',invalid:'retryCalibration','verify-retry':'retryFunctionVerification'};const command=commands[midi.calibrationMode];if(command)midi[command]();else calibrateIfNeeded();return;}controller.playback.unlockAudio();await midi.enable();calibrateIfNeeded();});panel.append(label,connect);footer.append(panel);
midi.addCalibrationListener(e=>{if(midi.currentStatus?.status!=='connected')return;calibrationHint=({'capture-left':t('Нажмите крайнюю левую клавишу'),'capture-right':t('Нажмите крайнюю правую клавишу'),unusual:t('Проверьте определённый диапазон'),confirm:t('Подтвердите диапазон клавиатуры'),'verify-function':t('Ещё раз нажмите крайнюю правую клавишу'),'verify-retry':t('Нажата другая клавиша'),invalid:t('Повторите калибровку'),complete:''})[e.type]||'';render();});midi.addStatusListener(()=>{render();calibrateIfNeeded();});render();controller.playback.addNoteListener(e=>{if(e.type==='note-on'&&e.velocity>0)activeInput();});if(navigator.permissions?.query)navigator.permissions.query({name:'midi',sysex:false}).then(p=>{if(p.state==='granted')midi.enable();}).catch(()=>{});}

window.addEventListener('play12:main-ready',ready);window.addEventListener('play12:load-error',ev=>{empty.textContent=ev.detail;error(Error(ev.detail));});if(window.play12MainController)ready();await library();
window.addEventListener('beforeunload',ev=>{remember();if(dirty){ev.preventDefault();ev.returnValue='';}});document.addEventListener('click',ev=>{const a=ev.target.closest('a[href]');if(a&&!a.hasAttribute('data-play12-language')&&dirty&&!leave())ev.preventDefault();});window.addEventListener('pagehide',remember);
})().catch(e=>{const n=document.getElementById('main-status')||document.body,u=window.Play12UI;n.textContent=(u?.t||((s)=>s))('Не удалось открыть рабочее пространство: ')+(u?.error||((s)=>s))(e.message);});
