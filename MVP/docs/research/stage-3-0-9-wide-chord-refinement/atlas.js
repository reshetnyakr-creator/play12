'use strict';
const panels=[];
const ready=fetch('results.json').then(r=>r.json()).then(({time})=>{
  for(const v of time.views){
    const section=document.createElement('section');
    section.innerHTML='<h2></h2><p></p><img hidden><div class="comparison"><figure><figcaption>Play12 · до</figcaption><div class="before"></div></figure><figure><figcaption>Play12 · после</figcaption><div class="after"></div></figure></div><table><thead><tr><th>MIDI</th><th>Нотное время / длина</th><th>Контакт до</th><th>Контакт после</th><th>Длительность</th><th>Пальцы</th></tr></thead><tbody></tbody></table>';
    section.querySelector('h2').textContent='Такт '+v.measure;
    section.querySelector('img').alt='Time, исходная нотация такта '+v.measure;
    const cond=time.conditional.find(c=>c.measure===v.measure);
    section.querySelector('p').textContent=cond?
      'MIDI 48–59–60: 5–2–1, только последовательное исполнение со сменой позиции. Время атак не задано. Пара 5–2: 11 полутонов при MaxPrac 10.':
      'MIDI 36–43–52: 5–2–1. Интервалы 7, 9 и 16 полутонов. Только 1–5 превышает MaxPrac. Мелодическая группа: автоматически 1–2–2, контроль автора 2–3–4.';
    const q=value=>Number(new Play12Editor.Q(value));
    const start=Math.min(...v.notes.map(n=>q(n.start)));
    const stop=Math.max(...v.notes.flatMap(n=>n.musical.map(m=>q(m.start)+q(m.duration))));
    for(const n of v.notes){
      const tr=section.querySelector('tbody').insertRow();
      for(const value of [n.midi,n.musical.map(m=>m.start+' / '+m.duration).join(', '),
        n.before?n.start+'–'+n.endBefore:'—',
        n.conditional?'условно, время не задано':n.start+'–'+n.endAfter,'',
        (n.before??'—')+' → '+(n.after??'—')])tr.insertCell().textContent=value;
      function bar(a,b,color){
        const lane=document.createElement('div'), block=document.createElement('span');
        lane.className='lane';
        block.style.left=100*(a-start)/(stop-start)+'%';
        block.style.width=100*(b-a)/(stop-start)+'%';
        block.style.background=color;
        lane.append(block);
        tr.cells[4].append(lane);
      }
      for(const m of n.musical)bar(q(m.start),q(m.start)+q(m.duration),'#aab7c3');
      if(n.before)bar(q(n.start),q(n.endBefore),'#b4abd5');
      if(!n.conditional)bar(q(n.start),q(n.endAfter),'#e96e40');
    }
    panels.push({v,section});
    document.querySelector('main').append(section);
  }
});
function draw(score,mode){
  const measures=score.score.parts[0].measures;
  const source=Play12Renderer.render(score,document.createElement('div'),{measureCount:measures.length,
    editorTimeline:true,zeroNote:score.play12.zero_pitch_class,unassignedDisplay:true,wrapCycles:true,cellHeight:18});
  for(const {v,section} of panels){
    const ids=new Set(measures.find(m=>String(m.number)===v.measure).events.map(e=>e.id));
    const clone=source.cloneNode(true);
    const groups=[...clone.querySelectorAll('[data-event-id]')].filter(n=>{
      if(ids.has(n.dataset.eventId))return true;
      n.remove();return false;
    });
    const lookup=new Map(v.notes.flatMap(n=>n.ids.map(id=>[id,n])));
    for(const node of groups){
      const n=lookup.get(node.dataset.eventId);
      if(!n)continue;
      if(node.dataset.finger!==String(n[mode]??''))throw new Error('Аппликатура SVG не совпала у '+node.dataset.eventId);
      if(mode==='after'&&n.conditional)node.classList.add('target');
      if(n.before!=null&&n.before!==n.after)node.classList.add('changed');
    }
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
  const status=document.getElementById('status');
  try{
    await ready;
    const {score,run}=JSON.parse(await e.target.files[0].text());
    if(run.total!==541)throw new Error('Нужна исходная выгрузка Time');
    const notes=Play12Editor.events(score);
    const lookup=new Map(panels.flatMap(({v})=>v.notes.flatMap(n=>n.ids.map(id=>[id,n]))));
    for(const mode of ['before','after']){
      for(const n of notes)n.method.finger=lookup.has(n.id)?lookup.get(n.id)[mode]??null:run.assignments[n.id]??null;
      draw(score,mode);
    }
    status.textContent='Сверены 2 такта Play12 до и после.';
  }catch(error){status.textContent=error.message;throw error;}
};
document.getElementById('notation').onchange=async e=>{
  await ready;
  for(const file of e.target.files){
    const panel=panels.find(({v})=>file.name==='time-'+v.measure+'.svg');
    if(!panel)continue;
    const img=panel.section.querySelector('img');
    if(img.src)URL.revokeObjectURL(img.src);
    img.src=URL.createObjectURL(file);img.hidden=false;
  }
};
