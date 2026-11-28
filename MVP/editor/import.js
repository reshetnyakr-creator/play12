(async()=>{'use strict';const t=window.Play12UI?.t||((s)=>s),uiError=window.Play12UI?.error||((s)=>s);const E=Play12Editor,$=id=>document.getElementById(id),journal={import:{status:'idle'},engine:{status:'idle'},saving:{status:'not_saved'}};let xml,doc,selection,handMap={},mode='engine',busy=false,config=await fetch('/MVP/editor/beginner.json?v=stage19').then(r=>r.json());const developer=new URLSearchParams(location.search).get('dev')==='1';$('dev').hidden=!developer;function message(s){$('status').textContent=s;$('diagnostics').textContent=JSON.stringify(journal,null,2);}function failure(e){journal.error=e.message;message(t('Не удалось завершить обработку: ')+uiError(e.message));}function choose(value){mode=value;for(const [id,v]of [['engine-source','engine'],['file-source','source']]){$(id).setAttribute('aria-pressed',String(v===value));$(id).classList.toggle('button-primary',v===value);}}
$('engine-source').onclick=()=>{if(!busy){doc=null;choose('engine');}};$('file-source').onclick=()=>{if(!busy){doc=null;choose('source');}};
const dialog=$('part-dialog');
const partList=$('part-list');
const copy=(ru,en)=>Play12UI.isEn()?en:ru;
function reset(){
  xml=doc=selection=null;
  $('file').value='';
  $('setup').hidden=$('save').hidden=true;
  $('warnings').textContent='';
  journal.import={status:'idle'};
  journal.engine={status:'idle'};
  journal.saving={status:'not_saved'};
  delete journal.error;delete journal.hands;
}
function ready(parts){
  selection=parts.map(p=>p.id);
  handMap={};
  const unresolved=[];
  for(const {id,node} of parts){
    const staffs=[...new Set(Array.from(node.querySelectorAll('note'),n=>n.querySelector('staff')?.textContent.trim()||'1'))];
    for(const staff of staffs){
      const clef=Array.from(node.querySelectorAll('clef')).find(c=>(c.getAttribute('number')||'1')===staff);
      const sign=clef?.querySelector('sign')?.textContent.trim();
      const key=id+':'+staff;
      if(staffs.includes('1')&&staffs.includes('2'))handMap[key]=staff==='1'?'R':staff==='2'?'L':null;
      else if(sign==='G'||sign==='F')handMap[key]=sign==='G'?'R':'L';
      else unresolved.push(key);
    }
  }
  journal.hands={map:handMap,unresolved,basis:'two-staff convention or explicit G/F clef'};
  $('choice').hidden=!parts.some(p=>p.node.querySelector('fingering'));
  $('setup').hidden=$('save').hidden=false;
  message('');
}
function loadScore(source,name,previousSelection){
  const parsed=E.parseMusicXML(source);
  const {parts,automatic}=Play12ImportParts.inspect(parsed);
  xml=source;
  $('title').textContent=parsed.querySelector('work-title')?.textContent.trim()||parsed.querySelector('movement-title')?.textContent.trim()||name;
  const ids=previousSelection||automatic;
  const selected=ids&&parts.filter(p=>ids.includes(p.id));
  journal.import={status:'parsed',file:name,parts:parts.map(({node,...part})=>part)};
  if(selected?.length){ready(selected);return;}

  const combine=$('combine-parts');
  const confirm=$('confirm-parts');
  const radios=[];
  partList.replaceChildren();
  for(const part of parts){
    const label=document.createElement('label');
    const input=document.createElement('input');
    input.type='radio';
    input.name='import-part';
    input.disabled=!part.notes;
    const name=part.name||part.id;
    const instrument=part.instrument||copy('Инструмент не определён','Unknown instrument');
    const notes=new Intl.NumberFormat(document.documentElement.lang).format(part.notes);
    label.append(input,document.createTextNode(` ${name} [${part.id}] · ${instrument} · ${notes} ${copy('нот','notes')}`));
    partList.append(label);
    radios.push({input,part});
  }
  combine.checked=false;
  combine.disabled=parts.filter(p=>p.notes).length<2;
  const picked=()=>radios.filter(({input})=>input.checked).map(({part})=>part);
  function update(){
    confirm.disabled=picked().length<(combine.checked?2:1);
    $('combine-warning').hidden=!combine.checked;
  }
  partList.onchange=update;
  combine.onchange=()=>{
    const checked=radios.find(({input})=>input.checked);
    for(const {input} of radios){
      input.type=combine.checked?'checkbox':'radio';
      if(!combine.checked)input.checked=input===checked?.input;
    }
    update();
  };
  confirm.onclick=()=>{dialog.close();ready(picked());};
  const cancel=()=>{dialog.close();reset();message('');$('file').parentElement.focus();};
  $('cancel-parts').onclick=cancel;
  dialog.oncancel=event=>{event.preventDefault();cancel();};
  update();
  message('');
  dialog.showModal();
}
$('file').onchange=async ev=>{
  const file=ev.target.files[0];
  if(!file||busy)return;
  busy=true;
  reset();
  choose('engine');
  message(t('Чтение файла…'));
  try{
    if(!/\.(xml|musicxml|mxl)$/i.test(file.name))throw Error(t('Выберите MusicXML или MXL'));
    loadScore(await Play12MXL.read(file),file.name);
  }catch(e){failure(e);}finally{busy=false;}
};
function explainEmpty(run){
  if(mode==='source')return copy('В выбранных партиях нет поддерживаемых обозначений пальцев.','The selected parts contain no supported fingering marks.');
  if(run.search_status==='budget_exhausted')return copy('Расчёт достиг лимита времени.','The search reached its time limit.');
  const reasons=Object.values(run.unassignedReasons||{});
  if(reasons.includes('MODEL_CONFLICT_UNRESOLVED_KEY'))return copy(
    'Совпадающие физические контакты не удалось однозначно распределить между пальцами.',
    'Overlapping physical contacts could not be assigned to fingers unambiguously.');
  if(reasons.length&&reasons.every(reason=>reason==='EXCLUDED'))return copy(
    'Структура нот или исполнительские обозначения не поддерживаются автоматическим назначением.',
    'The note structure or performance markings are unsupported by automatic fingering.');
  return copy('В рамках действующих правил движок не нашёл допустимой аппликатуры.','The engine found no fingering within the current rules.');
}
function calculate(score){
  return new Promise((resolve,reject)=>{
    const worker=new Worker('/MVP/editor/worker.js?v=stage302');
    const finish=(error,result)=>{
      clearTimeout(timer);
      worker.terminate();
      if(error)reject(error);
      else resolve(result);
    };
    const workerError=detail=>Error(copy('Внутренняя ошибка Fingering Engine. ','Internal Fingering Engine error. ')+detail);
    const timer=setTimeout(()=>finish(Error(t('Превышено время расчёта'))),25000);
    worker.onmessage=({data})=>data.error?finish(workerError(data.error)):finish(null,data.run);
    worker.onerror=e=>finish(workerError(e.message));
    worker.postMessage({score,config,locks:{},detailed:developer,partialRecovery:true});
  });
}
async function prepare(){
  if(journal.hands.unresolved.length)throw Error(copy('Не удалось определить руку для нотоносцев: ','Could not determine the hand for staves: ')+journal.hands.unresolved.join(', '));
  if(Object.values(handMap).some(v=>!v))throw Error(t('Укажите руку каждого нотоносца'));
  message(t('Расчёт аппликатуры…'));
  const score=E.importXML(xml,handMap,selection);
  const run=await calculate(score);
  journal.source=mode;
  const sourceHash=await E.hash(xml);
  score.editor.metricMap.sourceHash=sourceHash;
  doc={schema:'play12-editor-document/1',id:crypto.randomUUID(),title:$('title').textContent,source:xml,partIds:selection,sourceHash,score,run,runs:[run],mode,manual:{},history:[],cursor:0,revision:1};
  journal.engine=run;
  const notes=E.events(E.effective(doc)),assigned=notes.filter(e=>e.method.finger!=null).length;
  const count=assigned+t(' из ')+notes.length+t(' нот.');
  $('warnings').textContent=assigned<notes.length?t('Аппликатура неполная: ')+count:'';
  message(t('Произведение подготовлено. Назначено ')+count);
  if(!assigned&&notes.length){
    $('warnings').textContent+=' '+explainEmpty(run);
    message(copy('Нажмите «Сохранить в мои мелодии» ещё раз, чтобы сохранить без аппликатуры.',
      'Select “Save to My Melodies” again to save without fingering.'));
    return false;
  }
  return true;
}
$('save').onclick=async()=>{if(busy)return;busy=true;try{$('save').disabled=true;if(!doc&&!await prepare()){$('save').disabled=false;return;}message(t('Сохранение…'));doc.userId=Play12MainData.profile().userId;const existing=await Play12MainData.findImport(doc.sourceHash,doc.mode,selection,selection.length===journal.import.parts.length);if(existing&&!E.sameScoreTiming(existing.score,doc.score,true)){
  if(confirm(copy('Распознанное музыкальное время изменилось. Сохранить новую версию отдельной мелодией? Существующая версия и ручная аппликатура сохранятся.',
    'The imported musical timing has changed. Save the new version as a separate melody? The existing melody and manual fingering will be kept.'))){
    doc.parentId=existing.id;
    await E.Store.put(doc);
  }else doc=existing;
}else if(existing){
  const revision=existing.revision;
  const improvedModel=Boolean(doc.score.editor.fermataTimeline||doc.run.releaseShift?.length||doc.run.contacts?.some(c=>c.unisonGroups?.length||c.arpeggio))&&existing.run.version!==doc.run.version&&
    Object.entries(existing.run.assignments).every(([id,finger])=>finger==null||doc.run.assignments[id]!=null);
  if(!doc.run.recovery && existing.mode==='engine'&&(existing.run.search_status==='budget_exhausted'||improvedModel)&&
     !doc.run.validation.conflicts.length&&!existing.history?.length&&
     doc.run.assigned>existing.run.assigned&&!Object.keys(existing.manual||{}).length&&
     !localStorage.getItem('play12.main.draft:'+existing.id)){
    await E.Store.put({...existing,score:doc.score,run:doc.run,runs:[...(existing.runs||[existing.run]),doc.run],revision:revision+1},revision);
  }
  doc=await E.Store.get(existing.id);
}else await E.Store.put(doc);const saved=await E.Store.get(doc.id);if(!saved||saved.sourceHash!==doc.sourceHash)throw Error(t('Не удалось подтвердить запись в библиотеке'));journal.saving={status:'saved',id:doc.id};location.href=Play12Routes.path('main')+'?composition='+encodeURIComponent(doc.id);}catch(e){journal.saving={status:'error',message:e.message};failure(e);$('save').disabled=false;}finally{busy=false;}};
const importLanguageState='play12.import.locale-draft';Play12Routes.languages(document.querySelector('.language-switch'),'import');
for(const link of document.querySelectorAll('[data-play12-language]'))link.addEventListener('click',ev=>{if(busy){ev.preventDefault();message(Play12UI.isEn()?'Wait until processing finishes before changing language.':'Дождитесь окончания обработки перед сменой языка.');return;}if(xml || $('musicxml-text')?.value){try{sessionStorage.setItem(importLanguageState,JSON.stringify({xml,pendingText:$('musicxml-text')?.value||'',selection,mode,file:journal.import.file}));}catch(e){ev.preventDefault();failure(Error(Play12UI.isEn()?'The selected file could not be retained. Save it before changing language.':'Не удалось сохранить выбранный файл для смены языка. Сначала сохраните произведение.'));}}});
try{const saved=JSON.parse(sessionStorage.getItem(importLanguageState));sessionStorage.removeItem(importLanguageState);if(saved?.pendingText)$('musicxml-text').value=saved.pendingText;if(saved?.xml){loadScore(saved.xml,saved.file||'MusicXML',saved.selection);choose(saved.mode||'engine');}}catch(e){failure(e);}
const pasted=$('musicxml-text'),pasteButton=$('paste-musicxml'),importText=$('import-musicxml');
pasteButton.onclick=async()=>{try{if(!navigator.clipboard?.readText)throw Error('clipboard');pasted.value=await navigator.clipboard.readText();pasted.focus();}catch(_){message(t('Буфер обмена недоступен. Вставьте текст в поле вручную.'));pasted.focus();}};
importText.onclick=async()=>{if(busy)return;try{const text=pasted.value;if(!text.trim())throw Error(t('Вставьте текст MusicXML.'));if(new TextEncoder().encode(text).length>8*1024*1024)throw Error(t('Текст MusicXML превышает 8 МиБ.'));importText.disabled=true;await $('file').onchange({target:{files:[new File([text],'clipboard.musicxml',{type:'application/xml'})]}});}catch(e){failure(e);}finally{importText.disabled=false;}};
pasted.disabled=pasteButton.disabled=importText.disabled=false;
$('export').onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(journal,null,2)],{type:'application/json'}));a.href=url;a.download='play12-import-log.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};$('file').disabled=false;message('');})().catch(e=>{const u=window.Play12UI;document.getElementById('status').textContent=(u?.t||((s)=>s))('Ошибка загрузки: ')+(u?.error||((s)=>s))(e.message);});
