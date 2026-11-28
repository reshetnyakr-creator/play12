'use strict';
const panels=new Map();
const ready=fetch('atlas-cases.json').then(r=>r.json()).then(cases=>{
  for(const c of cases){
    const section=document.createElement('section');
    section.innerHTML='<h2></h2><img hidden><div class="views"><figure><figcaption>Play12 · до</figcaption><div class="before"></div></figure><figure><figcaption>Play12 · после</figcaption><div class="after"></div></figure></div><table><thead><tr><th>MIDI</th><th>Палец до</th><th>Палец после</th></tr></thead><tbody></tbody></table>';
    section.querySelector('h2').textContent='Такт '+c.measure+' · '+c.title;
    section.querySelector('img').alt='Time, такт '+c.measure;
    document.querySelector('main').append(section);
    panels.set(c.measure,{c,section});
  }
});
for(const [keys,middle] of [[[36,43,52],2],[[36,41,52],3],[[36,38,52],4]]){
  const box=document.createElement('div');
  box.className='keys';
  for(let midi=keys[0];midi<=keys[2];midi++){
    const key=document.createElement('span');
    key.className='key';
    const i=keys.indexOf(midi);
    key.textContent=i<0?midi:midi+' / '+[5,middle,1][i];
    if(i>=0)key.classList.add('chosen');
    box.append(key);
  }
  document.getElementById('synthetic').append(box);
}
let score,map;
const status=document.getElementById('status');
async function draw(){
  if(!score||!map)return;
  const measures=score.score.parts[0].measures;
  const notes=Play12Editor.events(score);
  const byId=new Map(notes.map(n=>[n.id,n]));
  for(const mode of ['before','after']){
    for(const e of notes)e.method.finger=(mode==='before'?map.before[e.id]:map.assignments[e.id]?.finger)??null;
    const source=Play12Renderer.render(score,document.createElement('div'),{measureCount:measures.length,
      editorTimeline:true,zeroNote:score.play12.zero_pitch_class,unassignedDisplay:true,wrapCycles:true,cellHeight:18});
    for(const {c,section} of panels.values()){
      const ids=new Set(measures.find(m=>String(m.number)===c.measure).events.map(n=>n.id));
      const clone=source.cloneNode(true);
      const groups=[...clone.querySelectorAll('[data-event-id]')].filter(n=>{
        if(ids.has(n.dataset.eventId))return true;
        n.remove();return false;
      });
      for(const id of c.focus){
        const node=groups.find(n=>n.dataset.eventId===id);
        if(!node||node.dataset.finger!==String(byId.get(id).method.finger??''))
          throw new Error('Не совпала аппликатура '+id);
        node.classList.add('focus');
      }
      const rects=groups.map(n=>n.querySelector('rect'));
      const top=Math.min(...rects.map(r=>Number(r.getAttribute('y'))));
      const bottom=Math.max(...rects.map(r=>Number(r.getAttribute('y'))+Number(r.getAttribute('height'))));
      const width=source.viewBox.baseVal.width;
      clone.setAttribute('viewBox',[0,top-2,width,bottom-top+4].join(' '));
      clone.setAttribute('width',width);
      clone.setAttribute('height',bottom-top+4);
      section.querySelector('.'+mode).replaceChildren(clone);
      if(mode==='after'){
        const body=section.querySelector('tbody');body.replaceChildren();
        for(const id of c.focus){
          const row=body.insertRow();
          for(const s of [byId.get(id).pitch.midi,map.before[id]??'—',map.assignments[id]?.finger??'—'])
            row.insertCell().textContent=s;
        }
      }
    }
  }
  status.textContent='Сверены три такта до и после.';
}
async function file(event,save){
  try{await ready;save(JSON.parse(await event.target.files[0].text()));await draw();}
  catch(error){status.textContent=error.message;throw error;}
}
document.getElementById('score').onchange=e=>file(e,v=>{score=v.score;});
document.getElementById('map').onchange=e=>file(e,v=>{map=v;});
document.getElementById('notation').onchange=async e=>{
  await ready;
  for(const file of e.target.files){
    const panel=panels.get(file.name.replace(/^time-/,'').replace(/\.svg$/,''));
    if(!panel)continue;
    const img=panel.section.querySelector('img');
    if(img.src)URL.revokeObjectURL(img.src);
    img.src=URL.createObjectURL(file);img.hidden=false;
  }
};
