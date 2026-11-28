'use strict';
const panels=new Map();
const statusLine=document.getElementById('status');
const ready=fetch('results.json').then(r=>r.json()).then(({time})=>{
  for(const c of time.cases){
    const section=document.createElement('section');
    section.innerHTML='<h2></h2><p></p><img hidden><div class="comparison"><figure><figcaption>Play12 · до</figcaption><div class="before"></div></figure><figure><figcaption>Play12 · после</figcaption><div class="after"></div></figure></div><table><thead><tr><th>Событие</th><th>MIDI</th><th>Рука</th><th>Нотное время / длина</th><th>Контакт до</th><th>Контакт после</th><th>Длительности</th><th>До</th><th>После</th></tr></thead><tbody></tbody></table>';
    section.querySelector('h2').textContent='Такт '+c.measure+' · MIDI '+c.midi;
    const target=c.members.find(n=>n.eventIds.includes(c.id));
    section.querySelector('p').textContent=target.after?'Назначен палец '+target.after+'. Освобождено контактов: '+c.releases.length+'.':
      'Одновременная атака остаётся недопустимой после проверки всех границ освобождения.';
    section.querySelector('img').alt='Time, оригинальная нотация такта '+c.measure;
    const q=v=>Number(new Play12Editor.Q(v));
    const start=Math.min(...c.members.map(n=>q(n.start)));
    const stop=Math.max(...c.members.flatMap(n=>n.musical.map(m=>q(m.start)+q(m.duration))));
    for(const n of c.members){
      const tr=section.querySelector('tbody').insertRow();
      for(const value of [n.id,n.midi,n.hand,n.musical.map(m=>m.start+' / '+m.duration).join(', '),
        n.start+'–'+n.end,n.start+'–'+n.releaseEnd,'',n.before??'—',n.after??'—'])
        tr.insertCell().textContent=value;
      const timeline=tr.cells[6];
      timeline.replaceChildren();
      const bar=(a,b,color)=>{
        const lane=document.createElement('div');
        const block=document.createElement('span');
        lane.className='lane';
        block.style.left=(100*(a-start)/(stop-start))+'%';
        block.style.width=(100*(b-a)/(stop-start))+'%';
        block.style.background=color;
        lane.append(block);
        timeline.append(lane);
      };
      for(const m of n.musical)bar(q(m.start),q(m.start)+q(m.duration),'#aab7c3');
      bar(q(n.start),q(n.end),'#b4abd5');
      bar(q(n.start),q(n.releaseEnd),'#e96e40');
    }
    if(c.measure==='38'){
      const p=document.createElement('p');
      const local=time.control.reference.releases.map(r=>'MIDI '+r.midi+' → '+r.end).join(', ');
      p.textContent='Контроль автора: 5–2–1 | 2–3–4. Границы освобождения: '+local+
        '. Автоматический план: '+time.control.automatic.join('–')+'.';
      section.querySelector('h2').after(p);
    }
    document.querySelector('main').append(section);
    panels.set(c.id,{c,section});
  }
  return time;
});

function draw(score,mode){
  const measures=score.score.parts[0].measures;
  const source=Play12Renderer.render(score,document.createElement('div'),{measureCount:measures.length,
    editorTimeline:true,zeroNote:score.play12.zero_pitch_class,unassignedDisplay:true,wrapCycles:true,cellHeight:18});
  for(const {c,section} of panels.values()){
    const allIds=new Set(measures.find(m=>String(m.number)===c.measure).events.map(e=>e.id));
    const clone=source.cloneNode(true);
    const groups=[...clone.querySelectorAll('[data-event-id]')].filter(n=>{
      if(allIds.has(n.dataset.eventId))return true;
      n.remove();
      return false;
    });
    const target=groups.find(n=>n.dataset.eventId===c.id);
    const expected=mode==='after'?c.members.find(n=>n.eventIds.includes(c.id)).after:null;
    if(!target||Number(target.dataset.midi)!==c.midi||target.dataset.finger!==String(expected??''))
      throw new Error('Не совпала целевая нота '+c.id);
    target.classList.add('target');
    const changed=new Set(c.members.filter(n=>n.before!=null&&n.before!==n.after).flatMap(n=>n.eventIds));
    for(const n of groups)if(changed.has(n.dataset.eventId))n.classList.add('changed');
    const rects=groups.map(n=>n.querySelector('rect'));
    const top=Math.min(...rects.map(r=>Number(r.getAttribute('y'))));
    const end=Math.max(...rects.map(r=>Number(r.getAttribute('y'))+Number(r.getAttribute('height'))));
    const width=source.viewBox.baseVal.width;
    clone.setAttribute('viewBox',[0,top-2,width,end-top+4].join(' '));
    clone.setAttribute('width',width);
    clone.setAttribute('height',end-top+4);
    section.querySelector('.'+mode).replaceChildren(clone);
  }
}

document.getElementById('source').onchange=async e=>{
  try {
    const time=await ready;
    const {score,run}=JSON.parse(await e.target.files[0].text());
    if(run.total!==time.total)throw new Error('Ожидается оригинальная выгрузка Time');
    const map={...run.assignments};
    // Stage 3.0.4 strict map and Stage 3.0.5/6 restorations are applied in the
    // local replay file. The original import provides score and MusicXML context.
    for(const {c} of panels.values())for(const n of c.members)for(const id of n.eventIds)map[id]=n.before;
    const {time:correction}=await (await fetch('visual-map.json')).json();
    Object.assign(map,correction);
    const notes=Play12Editor.events(score);
    for(const note of notes)note.method.finger=map[note.id]??null;
    draw(score,'before');
    for(const entry of time.changes)map[entry.id]=entry.after;
    for(const note of notes)note.method.finger=map[note.id]??null;
    draw(score,'after');
    statusLine.textContent='Сверено 9 пар Play12 до и после.';
  } catch(error){statusLine.textContent=error.message;throw error;}
};
document.getElementById('notation').onchange=async e=>{
  await ready;
  for(const file of e.target.files){
    const panel=panels.get(file.name.replace(/^time-/,'').replace(/\.svg$/,''));
    if(!panel)continue;
    const img=panel.section.querySelector('img');
    if(img.src)URL.revokeObjectURL(img.src);
    img.src=URL.createObjectURL(file);
    img.hidden=false;
  }
};
