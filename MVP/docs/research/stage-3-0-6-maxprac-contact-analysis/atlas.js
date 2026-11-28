'use strict';
const q = value => Number(new Play12Editor.Q(value));
const names = { time: 'Time', 'no-surprises': 'No Surprises' };
const types = {
  A: ['Широкая одновременная атака', 'Обе клавиши нужно нажать одновременно. Смена пальца или более ранний конец удержания не устраняют конфликт в момент атаки.'],
  B: ['Новая нота при занятой руке', 'Новая атака требует отодвинуть руку, когда палец ещё держит предшествующую клавишу. Сначала проверьте, что именно должно продолжать звучать.'],
  C: ['Удерживаемая цель под подвижным голосом', 'Бас уже нажат. Следующая атака той же рукой находится вне досягаемости при сохранённом басе. Проба отпускания оценивается отдельно от звучания.'],
  D: ['Конфликт и до, и после атаки', 'Рука приходит с занятой клавишей и затем должна дотянуться до другой. Изменения только одного интервала может не хватить.']
};
const panels = new Map();
const status = document.getElementById('status');
let replay;
let originals;
const scores = new Map();
const fetchJSON = async name => {
  const res = await fetch(name);
  if (!res.ok) throw new Error(name + ' недоступен');
  return res.json();
};

function table(section, row) {
  const wide = row.blockers.filter(b => b.excess_best_pair > 0);
  const contacts = [{ id: row.id, midi: row.midi, interval: row.contact, finger: '—', className: 'goal' },
    ...wide.map(b => ({ ...b, className: 'wide' }))].sort((a,b) => q(a.interval[0])-q(b.interval[0]));
  const low = Math.min(...contacts.map(c => q(c.interval[0])));
  const span = Math.max(...contacts.map(c => q(c.interval[1]))) - low;
  const body = section.querySelector('tbody');
  for (const c of contacts) {
    const tr = body.insertRow();
    tr.className = c.className;
    for (const text of [c.id, c.midi, c.finger, c.interval.join('–'), c.gap ?? '—',
      c.overlap_duration ?? '—']) tr.insertCell().textContent = text;
    const cell = tr.insertCell();
    cell.className = 'lane';
    const bar = document.createElement('span');
    bar.className = 'hold';
    bar.style.left = 100 * (q(c.interval[0])-low) / span + '%';
    bar.style.width = 100 * (q(c.interval[1])-q(c.interval[0])) / span + '%';
    cell.append(bar);
  }
}

function addPanel(row, example) {
  const section = document.createElement('section');
  section.innerHTML = '<h2></h2><p class="explanation"></p><p class="options"></p><div class="views">' +
    '<figure><figcaption>Оригинальная нотная запись</figcaption><img hidden></figure>' +
    '<figure><figcaption>Play12 · карта Stage 3.0.5</figcaption><div class="play"></div></figure></div>' +
    '<div class="scroll"><table><thead><tr><th>Событие</th><th>MIDI</th><th>Палец</th><th>Контакт</th>' +
    '<th>Расстояние</th><th>Пересечение</th><th>Время →</th></tr></thead><tbody></tbody></table></div>';
  section.querySelector('h2').textContent = names[row.composition] + ' · такт ' + row.measure + ' · ' + types[row.category][0];
  section.querySelector('.explanation').textContent = types[row.category][1];
  const d = row.diagnostics;
  const exchange = d.strict_exchange;
  const swap = exchange.status === 'feasible' ?
    'Включение цели с той же рукой и прежними удержаниями требует снять ' + exchange.lost.length + ' назначений.' :
    'Включение цели в исходные удержания не найдено.';
  const short = d.shorter_hold.status === 'feasible' ?
    'Сдвиг границы контакта даёт вычислительный вариант. Звучание и время движения требуют проверки.' :
    'Сдвиг конца более раннего контакта не устраняет широкую одновременную атаку.';
  const hand = d.alternate_physical_hand.status === 'feasible' ?
    'Проверка парных ограничений допускает явное исполнение другой рукой. Правило R39 требует согласования.' : '';
  section.querySelector('.options').textContent = [swap,short,hand].filter(Boolean).join(' ');
  section.querySelector('img').alt = names[row.composition] + ', такты ' + example.first + '–' + example.last;
  table(section,row);
  const id = row.composition + '-' + row.id;
  panels.set(id,{ section, row, example });
  document.querySelector('main').append(section);
}

const ready = Promise.all([fetchJSON('register.json'),fetchJSON('examples.json')]).then(([rows, examples]) => {
  for (const example of examples) addPanel(rows.find(r => r.composition===example.composition && r.id===example.id), example);
});

function draw() {
  if (!replay || !originals) return;
  for (const [composition, original] of originals) {
    const { score } = original;
    const base = replay[composition].run;
    const fingerprints = Object.fromEntries(base.contacts.flatMap(c => c.ids.map(id => [id,base.contactAssignments[c.id]])));
    for (const e of Play12Editor.events(score)) e.method.finger = fingerprints[e.id] ?? null;
    const host = document.createElement('div');
    const bars = score.score.parts[0].measures;
    const sourceSVG = Play12Renderer.render(score,host,{ measureCount:bars.length, editorTimeline:true,
      zeroNote:score.play12.zero_pitch_class, unassignedDisplay:true, wrapCycles:true, cellHeight:18 });
    scores.set(composition,{svg:sourceSVG,bars,base});
  }
  for (const {section,row,example} of panels.values()) {
    const {svg,bars,base} = scores.get(row.composition);
    const range = new Set(bars.filter(m => Number(m.number)>=example.first && Number(m.number)<=example.last)
      .flatMap(m => m.events.map(e => e.id)));
    const clone = svg.cloneNode(true);
    const nodes = [...clone.querySelectorAll('[data-event-id]')];
    const relevant = nodes.filter(n => range.has(n.dataset.eventId));
    const target = relevant.find(n => n.dataset.eventId===row.id);
    if (!target || Number(target.dataset.midi)!==row.midi || target.dataset.finger ||
        base.contactAssignments[row.contact_id]) throw new Error('Исходные данные не совпали у '+row.id);
    target.classList.add('target');
    const blocked = new Set(row.blockers.filter(b=>b.excess_best_pair).flatMap(b=>b.events));
    for (const n of relevant) if (blocked.has(n.dataset.eventId)) n.classList.add('blocker');
    const rects = relevant.map(n=>n.querySelector('rect'));
    const low = Math.min(...rects.map(r=>Number(r.getAttribute('y'))));
    const high = Math.max(...rects.map(r=>Number(r.getAttribute('y'))+Number(r.getAttribute('height'))));
    const width = svg.viewBox.baseVal.width;
    clone.setAttribute('viewBox',[0,low-2,width,high-low+4].join(' '));
    clone.setAttribute('width',width);
    clone.setAttribute('height',high-low+4);
    for (const node of nodes) if (!range.has(node.dataset.eventId)) node.remove();
    section.querySelector('.play').replaceChildren(clone);
  }
  status.textContent = 'Сверено шесть фрагментов Play12.';
}

async function guarded(fn) {
  try { await ready; await fn(); }
  catch (error) { status.textContent = error.message; console.error(error); }
}
document.getElementById('replay').onchange = e => guarded(async () => {
  replay = JSON.parse(await e.target.files[0].text()); draw();
});
document.getElementById('imports').onchange = e => guarded(async () => {
  originals = new Map();
  for (const file of e.target.files) {
    const data = JSON.parse(await file.text());
    const name = data.run.total===541 ? 'time' : data.run.total===1101 ? 'no-surprises' : null;
    if (!name) throw new Error('Ожидалась оригинальная выгрузка Time или No Surprises');
    originals.set(name,data);
  }
  if (originals.size!==2) throw new Error('Выберите обе оригинальные выгрузки');
  draw();
});
document.getElementById('engraving').onchange = e => guarded(async () => {
  for (const file of e.target.files) {
    const panel = panels.get(file.name.replace(/\.svg$/,''));
    if (!panel) continue;
    const image = panel.section.querySelector('img');
    if (image.src) URL.revokeObjectURL(image.src);
    image.src = URL.createObjectURL(file);
    image.hidden = false;
  }
});
