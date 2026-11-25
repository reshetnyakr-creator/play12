(function(G){'use strict';
const VERSION='0.1.4',clone=x=>JSON.parse(JSON.stringify(x));
class Q{constructor(n,d=1n){if(n instanceof Q){this.n=n.n;this.d=n.d;return;}if(typeof n==='string'){if(n.includes('/')){const a=n.split('/');if(a.length!==2)throw Error('Invalid fraction');n=BigInt(a[0]);d=BigInt(a[1]);}else if(n.includes('.')){const a=n.split('.');d=10n**BigInt(a[1].length);n=BigInt(a[0]+a[1]);}else n=BigInt(n);}this.n=BigInt(n);this.d=BigInt(d);if(!this.d)throw Error('Zero denominator');if(this.d<0n){this.n=-this.n;this.d=-this.d;}let a=this.n<0n?-this.n:this.n,b=this.d;while(b){[a,b]=[b,a%b];}this.n/=a||1n;this.d/=a||1n;}add(b){b=new Q(b);return new Q(this.n*b.d+b.n*this.d,this.d*b.d);}sub(b){b=new Q(b);return new Q(this.n*b.d-b.n*this.d,this.d*b.d);}cmp(b){b=new Q(b);const v=this.n*b.d-b.n*this.d;return v<0n?-1:v>0n?1:0;}toString(){return this.n+'/'+this.d;}valueOf(){return Number(this.n)/Number(this.d);}}
const num=x=>Number(new Q(x)),max=(a,b)=>new Q(a).cmp(b)>=0?new Q(a):new Q(b),children=(n,t)=>Array.from(n.children||[]).filter(x=>x.localName===t),one=(n,t)=>children(n,t)[0],txt=(n,t,def='')=>one(n,t)?.textContent.trim()??def;
const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof x==='string'?x:JSON.stringify(x))))).map(x=>x.toString(16).padStart(2,'0')).join('');
// Store pedal markings as instrument-part events. Staff and voice locate the
// notation only. The performance sidecar can consume the exact score times.
function pedalEvents(node, position, divisions, order) {
  const direction = node.localName === 'direction';
  const sound = direction ? one(node, 'sound') : node;
  const graphicalOffset = direction ? one(node, 'offset') : null;
  const soundOffset = sound && one(sound, 'offset');
  const at = offset => position.add(new Q(offset?.textContent.trim() || '0', BigInt(divisions))).toString();
  const result = [];
  for (const typeNode of direction ? children(node, 'direction-type') : []) {
    for (const mark of children(typeNode, 'pedal')) {
      result.push({
        source: 'notation', type: mark.getAttribute('type'), number: mark.getAttribute('number') || '1',
        at: at(graphicalOffset), order: order + result.length,
        staff: txt(node, 'staff', null), voice: txt(node, 'voice', null),
        playbackOffset: at(graphicalOffset?.getAttribute('sound') === 'yes' ? graphicalOffset : null)
      });
    }
  }
  for (const kind of ['damper', 'sostenuto', 'soft']) {
    const value = sound?.getAttribute(kind + '-pedal');
    if (value == null) continue;
    const offset = soundOffset || (graphicalOffset?.getAttribute('sound') === 'yes' ? graphicalOffset : null);
    result.push({source: 'sound', kind, value, at: at(offset), order: order + result.length});
  }
  return result;
}
const ARPEGGIO_SPREAD_QUARTERS = '1/8';

function realizeArpeggios(part, diagnostics) {
  const groups = new Map();
  for (const measure of part.measures) for (const event of measure.events) {
    const marks = event.arpeggioMarks;
    const arpeggiate = marks?.filter(mark=>mark.type==='arpeggiate');
    if (!arpeggiate?.length) continue;
    const number=arpeggiate[0].number;
    // Numbered marks can identify a cross-staff group. Without a common
    // explicit number, follow the notated voice and staff independently.
    const id=JSON.stringify([part.id,event.editor_onset_q,number??[event.staff,event.voice,event.hand]]);
    if (!groups.has(id)) groups.set(id,[]);
    groups.get(id).push({event,arpeggiate});
  }
  for (const [id,members] of groups) {
    const direction=new Set(members.flatMap(m=>m.arpeggiate.map(a=>a.direction).filter(Boolean)));
    const pitches=new Map();
    const events=members.map(m=>m.event);
    const reject=reason=>diagnostics.push({code:'ARPEGGIO_UNRESOLVED',reason,ids:events.map(e=>e.id)});
    if (direction.size>1 || [...direction].some(d=>d!=='up'&&d!=='down') ||
        members.some(({event,arpeggiate})=>!event.arpeggioEligible||!event.hand||event.ties.includes('stop')||
          event.arpeggioMarks.length!==1||arpeggiate.length!==1||
          (arpeggiate[0].number!=null&&!/^([1-9]|1[0-6])$/.test(arpeggiate[0].number)))) {
      reject('CONFLICTING_MARKS_OR_UNSUPPORTED_NOTE');
      continue;
    }
    for (const e of events) {
      if(!pitches.has(e.pitch.midi))pitches.set(e.pitch.midi,[]);
      pitches.get(e.pitch.midi).push(e);
    }
    if(pitches.size<2||[...pitches.values()].some(notes=>!compatibleArpeggioKey(notes))) {
      reject('INCOMPATIBLE_PHYSICAL_ATTACKS');
      continue;
    }
    const order=[...pitches.keys()].sort((a,b)=>direction.has('down')?b-a:a-b);
    const spread=new Q(ARPEGGIO_SPREAD_QUARTERS);
    const shortest=events.reduce((min,e)=>new Q(e.duration_quarters).cmp(min)<0?new Q(e.duration_quarters):min,
      new Q(events[0].duration_quarters));
    const width=shortest.cmp(spread)<=0?new Q(shortest.n,shortest.d*2n):spread;
    for(const [i,key] of order.entries()){
      const shift=new Q(width.n*BigInt(i),width.d*BigInt(order.length-1));
      for(const e of pitches.get(key)){
        const onset=new Q(e.editor_onset_q);
        e.arpeggioPerformance={group:id,direction:direction.has('down')?'down':'up',index:i,count:order.length,
          attack:onset.add(shift).toString(),offset:shift.toString(),
          end:onset.add(e.duration_quarters).toString()};
        e.editor_supported=true;
      }
    }
  }
}

function preserveUnresolvedArpeggioTies(part) {
  const events=part.measures.flatMap(m=>m.events).filter(e=>e.kind==='note');
  if(!events.some(e=>!e.arpeggioPerformance&&e.arpeggioMarks?.some(m=>m.type==='arpeggiate')&&e.ties.includes('start')))return;
  const pending=new Map();
  for(const e of events.sort((a,b)=>new Q(a.editor_onset_q).cmp(b.editor_onset_q))){
    const key=JSON.stringify([e.hand,e.voice,e.pitch.midi]);
    const previous=pending.get(key);
    const end=new Q(e.editor_onset_q).add(e.duration_quarters).toString();
    if(previous&&e.ties.includes('stop')&&previous.unresolvedArpeggioEnd===e.editor_onset_q){
      e.unresolvedArpeggioContinuation=previous.id;
      e.editor_supported=false;
      previous.unresolvedArpeggioEnd=end;
      if(!e.ties.includes('start'))pending.delete(key);
    }else if(!e.arpeggioPerformance&&e.arpeggioMarks?.some(m=>m.type==='arpeggiate')&&e.ties.includes('start')){
      e.unresolvedArpeggioEnd=end;
      pending.set(key,e);
    }else pending.delete(key);
  }
}

function compatibleArpeggioKey(notes) {
  if(notes.length===1)return true;
  const mark=e=>JSON.stringify([e.hand,e.duration_quarters,[...e.ties].sort(),[...e.articulations].sort()]);
  const supplied=new Set(notes.map(e=>e.source_fingering).filter(f=>f!=null));
  return new Set(notes.map(e=>e.voice)).size===notes.length &&
    supplied.size<=1 && notes.every(e=>!e.unisonSpecial&&!e.unisonTiming?.some(v=>v!=null)&&mark(e)===mark(notes[0]));
}

function importXML(xml,handMap={}){if(/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(xml))throw Error('Определения сущностей не поддерживаются.');const parseSource=xml.replace(/<!DOCTYPE[^>]*>/gi,'');const dom=new G.DOMParser().parseFromString(parseSource,'application/xml');if(dom.querySelector('parsererror')||dom.documentElement.localName!=='score-partwise')throw Error('Нужен корректный MusicXML score-partwise.');const diagnostics=[],parts=[],notes=[],rounds=[],tempoEntries=new Map();let title=dom.querySelector('work-title')?.textContent.trim()||dom.querySelector('movement-title')?.textContent.trim()||'Без названия';let tempo=120,tempoSeen=false;const names={C:0,D:2,E:4,F:5,G:7,A:9,B:11};let total=new Q(0);
for(const [pi,part]of children(dom.documentElement,'part').entries()){let divisions=1,beats=4,beatType=4,offset=new Q(0),transpose=0;const measures=[],pedals=[];const sourceMeasures=children(part,'measure');for(const [mi,m]of sourceMeasures.entries()){let cursor=new Q(0),extent=new Q(0),last=new Q(0),unsupported=false;const events=[],attrs=one(m,'attributes');if(attrs){divisions=Number(txt(attrs,'divisions',String(divisions)));if(!Number.isSafeInteger(divisions)||divisions<=0)throw Error('Некорректные divisions');const time=one(attrs,'time');if(time){beats=Number(txt(time,'beats'));beatType=Number(txt(time,'beat-type'));if(!Number.isInteger(beats)||!Number.isInteger(beatType)||beats<=0||beatType<=0)throw Error('Составной/неопределённый размер пока не поддержан.');}if(one(attrs,'transpose')){const tr=one(attrs,'transpose');transpose=Number(txt(tr,'chromatic','0'))+12*Number(txt(tr,'octave-change','0'));}}
for(const node of Array.from(m.children)){if(node.localName==='backup'||node.localName==='forward'){const delta=new Q(txt(node,'duration','0'),BigInt(divisions));cursor=node.localName==='backup'?cursor.sub(delta):cursor.add(delta);if(cursor.cmp(0)<0)throw Error('MusicXML backup выходит за начало такта');continue;}if(node.localName==='sound'){pedals.push(...pedalEvents(node,offset.add(cursor),divisions,pedals.length));continue;}
if(node.localName==='direction'){pedals.push(...pedalEvents(node,offset.add(cursor),divisions,pedals.length));const sound=one(node,'sound');const met=node.querySelector('per-minute');const bpm=Number(sound?.getAttribute('tempo')||met?.textContent);if(bpm>0){if(pi===0){const directionOffset=one(node,'offset');const timingOffset=(sound&&one(sound,'offset'))||(directionOffset?.getAttribute('sound')==='yes'?directionOffset:null);const at=Number(offset.add(cursor).add(new Q(timingOffset?.textContent.trim()||'0',BigInt(divisions))));tempoEntries.set(at,bpm);}if(tempoSeen&&tempo!==bpm)diagnostics.push({code:'TEMPO_CHANGE_UNSUPPORTED',measure:mi+1,message:'Смена темпа сохранена в исходнике; проигрывание пока использует первый темп.'});if(!tempoSeen){tempo=bpm;tempoSeen=true;}}if(node.querySelector('pedal'))diagnostics.push({code:'PEDAL_RELEASE_UNKNOWN',measure:mi+1,message:'Педаль не определяет время снятия пальца.'});}
if(node.localName!=='note')continue;const rest=!!one(node,'rest'),grace=!!one(node,'grace'),chord=!!one(node,'chord'),pitch=one(node,'pitch'),duration=new Q(txt(node,'duration','0'),BigInt(divisions));if(duration.cmp(0)<0)throw Error('Отрицательная длительность');const start=chord?last:cursor;if(!chord){last=start;cursor=cursor.add(duration);}extent=max(extent,start.add(duration));const staff=Number(txt(node,'staff','1')),voice=txt(node,'voice','1'),pid=part.getAttribute('id')||'P'+pi;const hand=handMap[pid+':'+staff]||handMap[pid]||null;const id=pid+'.m'+mi+'.e'+events.length;const step=pitch?txt(pitch,'step'):null,alter=pitch?Number(txt(pitch,'alter','0')):0,octave=pitch?Number(txt(pitch,'octave')):0,midi=pitch?(octave+1)*12+names[step]+alter+transpose:null;const fnode=node.querySelector('notations technical fingering'),fraw=fnode?.textContent?.trim(),f=fraw&&/^[1-5]$/.test(fraw)?Number(fraw):null;const ties=children(node,'tie').map(x=>x.getAttribute('type'));let supported=!grace&&duration.cmp(0)>0&&(rest||Number.isInteger(midi)&&midi>=0&&midi<=127);if(node.querySelector('trill-mark, tremolo, fermata')||!rest&&!pitch){supported=false;unsupported=true;}if(fraw&&!f)diagnostics.push({code:'SOURCE_FINGERING_COMPLEX',event:id,message:'Сложное обозначение пальцев сохранено в MusicXML.'});const arpeggioMarks=children(node,'notations').flatMap(n=>Array.from(n.children).filter(m=>['arpeggiate','non-arpeggiate'].includes(m.localName)).map(m=>({type:m.localName,number:m.getAttribute('number'),direction:m.getAttribute('direction'),boundary:m.getAttribute('type')})));
const hasArpeggio=arpeggioMarks.some(m=>m.type==='arpeggiate');
const event={id,kind:rest?'rest':'note',staff,voice,hand,start_quarters:start.toString(),duration_quarters:duration.toString(),chord,grace,source_fingering:f,method:{finger:null,fingering_source:null,fingering_confidence:null,fingering_history:[]},ties,...(arpeggioMarks.length?{arpeggioMarks,arpeggioEligible:supported}:{}),fermata:Boolean(node.querySelector('fermata')),stem:txt(node,'stem',null),unisonSpecial:Boolean(fraw&&!f||fnode?.getAttribute('alternate')==='yes'||fnode?.getAttribute('substitution')==='yes'||node.querySelector('cue, play, listen, notations technical harmonic, notations glissando, notations slide, notations ornaments'))||children(node,'notations').some(notation=>Array.from(notation.children).some(mark=>!['tied','articulations','technical','slur','arpeggiate'].includes(mark.localName))||children(notation,'technical').some(tech=>Array.from(tech.children).some(mark=>mark.localName!=='fingering'))),unisonTiming:['attack','release','end-dynamics'].map(name=>node.getAttribute(name)),articulations:children(node,'notations').flatMap(n=>children(n,'articulations').flatMap(a=>Array.from(a.children,x=>x.localName))),editor_onset_q:offset.add(start).toString(),editor_supported:supported&&!hasArpeggio};if(!rest){if(!pitch){event.kind='unpitched';event.unpitched=one(node,'unpitched')?.textContent||null;event.pitch=null;diagnostics.push({code:'UNPITCHED_UNSUPPORTED',event:id,message:'Нота без определённой высоты сохранена, но не преобразована в клавишу.'});}else event.pitch={step,alter,octave,midi};event.play12_symbol={value:'0123456789XY'[((midi||0)%12+12)%12],origin:'conversion'};notes.push(event);}events.push(event);}
if(m.querySelector('repeat,ending,segno,coda')||m.querySelector('sound[da-capo],sound[dacapo],sound[dalsegno]')){diagnostics.push({code:'TRAVERSAL_UNSUPPORTED',measure:mi+1,message:'Повторы/переходы не раскрыты: показан записанный порядок.'});}
if(unsupported)diagnostics.push({code:'REALIZATION_MISSING',measure:mi+1,message:'Специальный приём требует исполнительского расписания; участок не назначен автоматически.'});const nominal=new Q(BigInt(beats*4),BigInt(beatType)),length=m.getAttribute('implicit')==='yes'?extent:max(nominal,extent);if(!length.n)throw Error('Пустой такт без длительности');const measure={index:mi,number:m.getAttribute('number')||String(mi+1),implicit:m.getAttribute('implicit')==='yes',attributes:{divisions,time:{beats,beat_type:beatType}},events,editor_duration_q:length.toString(),tempo_marks:mi===0?[{start_quarters:'0/1',bpm:tempo}]:[]};measures.push(measure);if(pi===0)rounds.push({index:mi,start:num(offset),end:num(offset.add(length)),measureStart:num(offset),beats,beatType,beatQuarters:4/beatType,measureQuarters:num(length)});offset=offset.add(length);}total=max(total,offset);parts.push({id:part.getAttribute('id'),name:dom.querySelector('score-part[id="'+part.getAttribute('id')+'"] part-name')?.textContent||part.getAttribute('id'),measures,pedals:pedals.sort((a,b)=>new Q(a.at).cmp(b.at)||a.order-b.order)});}
for(const part of parts){realizeArpeggios(part,diagnostics);preserveUnresolvedArpeggioTies(part);}
if(!notes.length)throw Error('В файле нет нот.');for(const e of notes)if(!e.hand)diagnostics.push({code:'HAND_UNKNOWN',event:e.id,message:'Укажите руку для партии/нотоносца.'});const reference=21;for(const e of notes)if(e.pitch)e.play12_symbol.value='0123456789XY'[((e.pitch.midi-9)%12+12)%12]||'?';const score={format:'play12-json',version:'0.1',source:{type:'musicxml',title},play12:{zero_pitch_class:'A',reference_zero_midi:reference,symbols:'0123456789XY',pitch_class_mapping:Object.fromEntries(Array.from('0123456789XY').map((x,i)=>[String((i+9)%12),x]))},score:{title,creators:[],parts},editor:{schema:'play12-editor/1',sharedUnison:true,total_quarters:total.toString(),rounds,tempo,tempoMap:[...new Map([[0,120],...tempoEntries])].sort(([a],[b])=>a-b).map(([at,bpm])=>({at,bpm})),diagnostics}};return score;}
const events=score=>score.score.parts.flatMap(p=>p.measures.flatMap(m=>m.events)).filter(e=>e.kind==='note');
// Manual assignment needs a pitched key and a hand, even when a technique blocks automatic realization.
function isManuallyAssignable(e){return (e.hand === "L" || e.hand === "R") && !e.grace && Number.isInteger(e.pitch?.midi) && e.pitch.midi >= 0 && e.pitch.midi <= 127 && new Q(e.duration_quarters).cmp(0) > 0;}
function contacts(score,{manual=false,locks={}}={}){const out=[],open=new Map(),warnings=[];
const timed = [], byId = new Map();
for(const part of score.score.parts) for(const measure of part.measures) for(const event of measure.events) {
  if(event.kind==='note'){const item={event,part,at:new Q(event.editor_onset_q),order:timed.length};timed.push(item);byId.set(event.id,item);}
}
timed.sort((a,b)=>a.at.cmp(b.at)||a.event.id.localeCompare(b.event.id));
for(const {event:e,part,at} of timed){if(!e.hand)continue;const key=[e.hand,e.voice,e.pitch.midi,part.id].join(':');const stop=e.ties?.includes('stop'),start=e.ties?.includes('start');let c=stop?open.get(key):null;
if(!e.editor_supported&&!(manual&&isManuallyAssignable(e))){
  if(c?.arpeggio&&e.fermata&&new Q(c.end).cmp(at)===0){
    c.sustainedIds=[...(c.sustainedIds||[]),e.id];
    c.end=at.add(e.duration_quarters).toString();
    if(!start)open.delete(key);
  }
  continue;
}
if(c&&new Q(c.end).cmp(e.editor_onset_q)===0){c.ids.push(e.id);c.end=new Q(e.editor_onset_q).add(e.duration_quarters).toString();}else{c={id:e.id,ids:[e.id],hand:e.hand,key:e.pitch.midi,start:e.arpeggioPerformance?.attack??e.editor_onset_q,...(e.arpeggioPerformance?{arpeggio:e.arpeggioPerformance}:{}),end:at.add(e.duration_quarters).toString(),releaseBasis:'assumed_score_duration'};out.push(c);if(stop)warnings.push({code:'AMBIGUOUS_TIE',event:e.id});}if(start)open.set(key,c);else open.delete(key);}if(out.some(c=>c.arpeggio))out.sort((a,b)=>new Q(a.start).cmp(b.start)||a.id.localeCompare(b.id));return {contacts:score.editor?.schema && !score.editor.sharedUnison ? out : mergeUnisons(out,byId,locks),warnings};}

function mergeUnisons(contacts, byId, locks) {
  const buckets = new Map(), aliases = new Map(), hidden = new Set();
  const parts = new Map();
  for (const c of contacts) {
    const members = c.ids.map(id=>byId.get(id));
    if (members.some(({event:e})=>!e.editor_supported || e.grace || !e.voice ||
      e.unisonSpecial || e.unisonTiming?.some(v=>v!=null))) continue;
    const notes = members.map(({event:e})=>e);
    // A tie continuation without its matching start is never a fresh unison.
    if (notes[0].ties?.includes('stop')) continue;
    if (!parts.has(members[0].part)) parts.set(members[0].part,parts.size);
    const key = JSON.stringify([parts.get(members[0].part),c.hand,c.key,c.start,c.arpeggio?.group??null,
      members.map(({event:e,at})=>[at.toString(),new Q(e.duration_quarters).toString(),
        [...(e.ties||[])].sort(),[...(e.articulations||[])].sort()])]);
    if (!buckets.has(key)) buckets.set(key,[]);
    buckets.get(key).push({c,members});
  }
  const upper = (a,b) =>
    (a.event.staff??1)-(b.event.staff??1) ||
    (a.event.stem==='up'?-1:a.event.stem==='down'?1:0)-(b.event.stem==='up'?-1:b.event.stem==='down'?1:0) ||
    a.order-b.order;
  for (const bucket of buckets.values()) {
    if (bucket.length<2 || new Set(bucket.map(item=>item.members[0].event.voice)).size!==bucket.length) continue;
    const notes=bucket.flatMap(item=>item.members.map(x=>x.event));
    const source=new Set(notes.map(e=>e.source_fingering).filter(f=>f!=null));
    const manual=new Set(notes.map(e=>locks[e.id]??e.sharedContactLock).filter(f=>f!=null));
    if (source.size>1 || manual.size>1) continue;
    bucket.sort((a,b)=>upper(a.members[0],b.members[0]));
    const [{c:leader}]=bucket;
    const unisonGroups = leader.ids.map((_,i)=>bucket.map(item=>item.members[i]).sort(upper).map(x=>x.event.id));
    const ids = bucket.flatMap(item=>item.c.ids);
    aliases.set(leader,{...leader,ids,unisonGroups});
    for (const {c} of bucket.slice(1)) hidden.add(c);
  }
  return contacts.filter(c=>!hidden.has(c)).map(c=>aliases.get(c)??c);
}
function validate(cs,assign){const conflicts=[],unknown=[];for(const c of cs){const f=assign[c.id];if(f!=null&&(!Number.isInteger(f)||f<1||f>5))conflicts.push({code:'INVALID_FINGER',ids:c.ids,severity:'error'});}const timed=cs.map(c=>({c,start:new Q(c.start),end:new Q(c.end)})).sort((a,b)=>a.start.cmp(b.start));for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length;j++){const first=timed[i],second=timed[j];if(second.start.cmp(first.end)>=0)break;if(first.start.cmp(second.end)>=0)continue;const {c:a}=first,{c:b}=second;if(a.key===b.key){unknown.push({code:'KEY_OWNERSHIP_UNKNOWN',ids:[a.id,b.id],severity:'warning'});continue;}if(a.hand===b.hand&&assign[a.id]!=null&&assign[a.id]===assign[b.id]){const confirmed=a.releaseBasis!=='assumed_score_duration'&&b.releaseBasis!=='assumed_score_duration';(confirmed?conflicts:unknown).push({code:'FINGER_OVERLAP',ids:[a.id,b.id],severity:confirmed?'error':'warning',basis:[a.releaseBasis,b.releaseBasis]});}}return{conflicts,warnings:unknown,physical:'unknown'};}
function keyX(midi,cfg){const pc=((midi%12)+12)%12,white={0:0,2:1,4:2,5:3,7:4,9:5,11:6},black={1:0,3:1,6:2,8:3,10:4};return Math.floor(midi/12)*700+(white[pc]!=null?cfg.geometry.white[white[pc]]:cfg.geometry.black[black[pc]]);}
function propose(score,cfg,locks={},detailed=false,performance=null){const started=performance?.started??Date.now(),base=performance?.base??contacts(score,{locks}),all=performance?.actions??base.contacts,assign={},reasons=[...base.warnings],stats={generated:0,rejected:0,pruned:0},details=[],alternatives=[];const keyPositions=new Map(all.map(c=>[c.key,keyX(c.key,cfg)]));const keyPosition=key=>keyPositions.get(key);
const arpeggioPreferred=new Map(), arpeggiosByHand=new Map();
for(const contact of all) if(contact.arpeggio){
  const key=JSON.stringify([contact.arpeggio.group,contact.hand]);
  if(!arpeggiosByHand.has(key))arpeggiosByHand.set(key,[]);
  arpeggiosByHand.get(key).push(contact);
}
for(const group of arpeggiosByHand.values()) if(group.length>=2&&group.length<=5){
  group.sort((a,b)=>a.key-b.key);
  for(const [i,contact] of group.entries()){
    const offset=Math.floor(i*4/(group.length-1));
    arpeggioPreferred.set(contact.id,contact.hand==='R'?1+offset:5-offset);
  }
}
const unassignedReasons = Object.create(null);
const markUnassigned = (contacts, reason) => {
  for (const contact of contacts) for (const id of contact.ids) unassignedReasons[id] = reason;
};
let timedOut=false, truncated=false;for(const hand of ['L','R']){const cs=all.filter(c=>c.hand===hand).sort((a,b)=>new Q(a.start).cmp(b.start)||a.key-b.key||a.id.localeCompare(b.id));const groups=[];for(const c of cs){let g=groups.at(-1);if(!g||new Q(g[0].start).cmp(c.start))groups.push(g=[]);g.push(c);}const ends=new Map(cs.map(c=>[c.id,new Q(c.end)]));let held=[], recoveryEnd=null;let states=[{cost:0,assign:{},last:{},position:null,features:{},rank:0,path:null}];for(let gi=0;gi<groups.length;gi++){const group=groups[gi],time=group[0].start,next=groups[gi+1]?.[0];const onset=new Q(time);
if (Date.now()-started>cfg.search.maxMilliseconds) {
  timedOut=true;
  reasons.push({code:'SEARCH_BUDGET',hand});
  for (let i=gi;i<groups.length;i++) markUnassigned(groups[i], 'TIME_LIMIT');
  break;
}
held=held.filter(c=>ends.get(c.id).cmp(onset)>0);
if(recoveryEnd && onset.cmp(recoveryEnd)<0) {
  markUnassigned(group,'RECOVERY_PENDING_RELEASE');
  // An unresolved attack may itself remain held beyond the current boundary.
  for(const c of group) if(ends.get(c.id).cmp(recoveryEnd)>0) recoveryEnd=ends.get(c.id);
  continue;
}
recoveryEnd=null;
const active=held;
const keys = new Set(active.map(c=>c.key));
const sharedKey = group.some(c=>{const duplicate=keys.has(c.key);keys.add(c.key);return duplicate;});
// Distinct attacks with unresolved ownership cannot consume separate fingers on
// one key. A genuine tie has already been resolved to one contact by contacts().
let results=[],layerGenerated=0;for(const state of sharedKey||active.length+group.length>5?[]:states){const used=new Set(active.map(c=>state.assign[c.id]));const placements=[];function gen(i,usedNow,p){if(i===group.length){placements.push(p);return;}const c=group[i],fixed=locks[c.id]??(c.unisonGroups?c.ids.map(id=>locks[id]).find(f=>f!=null):null);for(const f of fixed?[fixed]:[1,2,3,4,5]){stats.generated++;layerGenerated++;if(!Number.isInteger(f)||f<1||f>5||usedNow.has(f)){stats.rejected++;continue;}gen(i+1,new Set([...usedNow,f]),{...p,[c.id]:f});if(layerGenerated>=cfg.search.maxCandidatesPerLayer)break;}}gen(0,used,{});const together=[...active,...group];const prev=Object.values(state.last).sort((a,b)=>new Q(b.start).cmp(a.start))[0];for(const p of placements){let cost=state.cost,features={},last={...state.last};const add=(name,raw)=>{const value=Math.round(raw)*cfg.weights[name];cost+=value;features[name]=(features[name]||0)+value;};for(const c of group){const f=p[c.id],old=state.last[f],x=keyPosition(c.key);
const natural=arpeggioPreferred.get(c.id);
if(natural!=null)cost+=Math.abs(f-natural)*cfg.weights.chordOrder*400;if(performance?.preferred[c.id] && performance.preferred[c.id]!==f)cost+=performance.preferenceCost;if([1,3,6,8,10].includes(c.key%12)){if(f===1)add('thumbBlack',1);if(f===5)add('pinkyBlack',1);}if(old&&old.key!==c.key)add('sameFingerMove',1);if(prev&&prev.key!==c.key&&prev.f!==f){const direction=(x-keyPosition(prev.key))*(f-prev.f)*(hand==='R'?1:-1);if(direction<0)add('crossing',1);}if(next){const target=(keyPosition(next.key)-x)/100*(hand==='R'?1:-1),available=target>0?5-f:f-1;add('futureReach',Math.max(0,Math.abs(target)-available));}last[f]={key:c.key,start:c.start,f};}
for(let i=0;i<together.length;i++)for(let j=i+1;j<together.length;j++){const a=together[i],b=together[j];if(p[a.id]==null&&p[b.id]==null)continue;const fa=p[a.id]||state.assign[a.id],fb=p[b.id]||state.assign[b.id],dx=(keyPosition(b.key)-keyPosition(a.key))*(hand==='R'?1:-1)/100;add('chordShape',Math.abs(Math.abs(dx)-Math.abs(fb-fa))*10);if(dx*(fb-fa)<0)add('chordOrder',a.arpeggio&&a.arpeggio.group===b.arpeggio?.group?40:1);}const position=group.reduce((v,c)=>v+keyPosition(c.key)-(hand==='R'?1:-1)*(p[c.id]-1)*100,0)/group.length;if(state.position!=null)add('positionShift',Math.abs(position-state.position));results.push({cost,parent:state,p,tie:JSON.stringify(p),last,position,features});if(detailed&&details.length<cfg.diagnostics.maxDetails)details.push({hand,time,assign:p,cost,features});}if(layerGenerated>=cfg.search.maxCandidatesPerLayer){truncated=true;break;}}
if (!results.length) {
  if(group.some(c=>locks[c.id] && (!Number.isInteger(locks[c.id]) || locks[c.id]<1 || locks[c.id]>5))) {
    markUnassigned(group,'INVALID_LOCK');
    reasons.push({code:'NO_PATH_UNDER_CONTACT_ASSUMPTION',ids:group.flatMap(c=>c.ids),hand,reason:'INVALID_LOCK'});
    break;
  }
  const reason = sharedKey ? 'MODEL_CONFLICT_UNRESOLVED_KEY' : layerGenerated>=cfg.search.maxCandidatesPerLayer
    ? 'SEARCH_EXHAUSTED' : 'NO_FEASIBLE_ASSIGNMENT';
  markUnassigned(group,reason);
  recoveryEnd=group.reduce((end,c)=>max(end,ends.get(c.id)),onset);
  // Preserve the surviving prefix and its exact occupied fingers. If a failed
  // attack addresses an already held key, wait for that known contact too.
  for(const c of active) if(group.some(newContact=>newContact.key===c.key)) recoveryEnd=max(recoveryEnd,ends.get(c.id));
  reasons.push({code:'NO_PATH_UNDER_CONTACT_ASSUMPTION',ids:group.flatMap(c=>c.ids),hand,reason,
    start:time,releaseBoundary:recoveryEnd.toString(),
    message:'Не найден путь при принятой модели удержания. Это не доказательство физической невозможности.'});
  continue;
}const byPath=(a,b)=>a.parent.rank-b.parent.rank||a.tie.localeCompare(b.tie);
results.sort((a,b)=>a.cost-b.cost||byPath(a,b));
stats.pruned+=Math.max(0,results.length-cfg.search.beamWidth);
const beam=results.slice(0,cfg.search.beamWidth);
const ranks=new Map(beam.slice().sort(byPath).map((candidate,index)=>[candidate,index]));
states=beam.map(candidate=>{const {parent,p,cost,last,position,features}=candidate;return {
  cost,last,position,path:{previous:parent.path,placement:p},
  assign:{...Object.fromEntries(active.map(c=>[c.id,parent.assign[c.id]])),...p},
  features:{...parent.features,...Object.fromEntries(Object.entries(features).map(([k,v])=>[k,(parent.features[k]||0)+v]))},
  rank:ranks.get(candidate)
};});
held.push(...group);
}
if(states[0]){
  function materialize(state){
    const layers=[];
    for(let path=state.path;path;path=path.previous)layers.push(path.placement);
    const assignments={};
    for(let i=layers.length-1;i>=0;i--)Object.assign(assignments,layers[i]);
    return assignments;
  }
  Object.assign(assign,materialize(states[0]));
  alternatives.push({hand,paths:states.slice(0,cfg.search.alternatives).map(s=>({assignments:materialize(s),cost:s.cost,features:s.features}))});
}}
const checked=validate(all,assign);const unique=new Map();for(const c of all)for(const id of c.ids)unique.set(id,assign[c.id]??null);const notes=events(score),assigned=notes.filter(e=>unique.get(e.id)!=null).length;for(const e of notes) if(unique.get(e.id)==null&&!unassignedReasons[e.id]) unassignedReasons[e.id]=unique.has(e.id)?'NOT_PROCESSED':'EXCLUDED';return{version:VERSION,unassignedReasons,profile:clone(cfg),assignments:Object.fromEntries(unique),contactAssignments:assign,contacts:all,alternatives,stats,details,warnings:[...reasons,...checked.warnings,{code:'EXPERIMENTAL_PROFILE',message:'Экспериментальная аппликатура: проверьте с преподавателем. Физическая достижимость не подтверждена.'}],validation:checked,coverage:notes.length?assigned/notes.length:0,assigned,total:notes.length,search_status:timedOut?'budget_exhausted':assigned<notes.length?'partial':stats.pruned||truncated?'approximate_complete':'exact_complete',optimality:stats.pruned||truncated||assigned<notes.length?'not_proven':'within_declared_finite_model',ranking_status:'experimental_config',feasibility:'unknown',elapsed_ms:Date.now()-started};}
const runtimeFingerings = new WeakMap();
function setRuntimeFingering(doc, run) { if(run) runtimeFingerings.set(doc,run); else runtimeFingerings.delete(doc); }
function baseAssignments(doc){return doc.mode==='source'?Object.fromEntries(events(doc.score).map(e=>[e.id,e.source_fingering])):(runtimeFingerings.get(doc)??doc.run).assignments;}
function effective(doc) {
  const score=clone(doc.score), base=baseAssignments(doc), notes=events(score);
  const byId=new Map(notes.map(e=>[e.id,e]));
  for(const e of notes){
    e.sharedContactLock=doc.manual[e.id]??null;
    e.method.finger=doc.manual[e.id]??base[e.id]??null;
    e.method.fingering_source=e.method.finger==null?null:doc.manual[e.id]!=null?'user':doc.mode==='source'?'source':'engine';
  }
  for(const c of contacts(score).contacts){
    if(!c.unisonGroups)continue;
    const manual=c.ids.map(id=>doc.manual[id]).find(f=>f!=null);
    const finger=manual??c.ids.map(id=>base[id]).find(f=>f!=null)??null;
    for(const [head,...followers] of c.unisonGroups){
      for(const id of [head,...followers]){
        const e=byId.get(id);
        e.method.finger=finger;
        e.method.fingering_source=finger==null?null:manual!=null?'user':doc.mode==='source'?'source':'engine';
      }
      for(const id of followers)byId.get(id).sharedContactRepresentative=head;
    }
  }
  return score;
}
function edit(doc,id,finger){if(!Number.isInteger(finger)||finger<1||finger>5)throw Error('Палец должен быть от 1 до 5');const cs=contacts(doc.score,{manual:true,locks:doc.manual}).contacts,c=cs.find(c=>c.ids.includes(id));if(!c)throw Error('Рука или исполнительский контакт не определены');const before=clone(doc.manual),after={...before};for(const x of c.ids)after[x]=finger;const effectiveAssign={...baseAssignments(doc),...after},assign=Object.fromEntries(cs.map(c=>[c.id,effectiveAssign[c.id]])),check=validate(cs,assign);if(check.conflicts.length)return{accepted:false,check};return{accepted:true,check,before,after,ids:c.ids};}
function commit(doc,trial){if(!trial.accepted)throw Error('Rejected');doc.history=doc.history.slice(0,doc.cursor);doc.history.push({before:trial.before,after:trial.after,ids:trial.ids,timestamp:new Date().toISOString(),engine:doc.run.version,profile:doc.run.profile.version});doc.cursor=doc.history.length;doc.manual=trial.after;doc.revision++;return doc;}
const dbPromise=()=>new Promise((resolve,reject)=>{const req=indexedDB.open('play12-editor',1);req.onupgradeneeded=()=>req.result.createObjectStore('compositions',{keyPath:'id'});req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);});
const Store={async get(id){const db=await dbPromise();return new Promise((res,rej)=>{const tx=db.transaction('compositions'),r=tx.objectStore('compositions').get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);tx.oncomplete=()=>db.close();});},async list(){const db=await dbPromise();return new Promise((res,rej)=>{const tx=db.transaction('compositions'),r=tx.objectStore('compositions').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);tx.oncomplete=()=>db.close();});},async put(doc,expected){const db=await dbPromise();return new Promise((res,rej)=>{const tx=db.transaction('compositions','readwrite'),store=tx.objectStore('compositions'),r=store.get(doc.id);r.onsuccess=()=>{if(expected!=null&&r.result&&r.result.revision!==expected){tx.abort();return;}store.put(clone(doc));};tx.oncomplete=()=>{db.close();res();};tx.onabort=()=>{db.close();rej(Error('Конфликт ревизии или ошибка сохранения. Изменения не перезаписаны.'));};tx.onerror=()=>rej(tx.error);});}};
G.Play12Editor={VERSION,Q,hash,importXML,ARPEGGIO_SPREAD_QUARTERS,realizeArpeggios,events,contacts,validate,keyX,propose,setRuntimeFingering,effective,edit,commit,clone,Store};if(typeof module!=='undefined')module.exports=G.Play12Editor;
})(typeof window!=='undefined'?window:globalThis);
