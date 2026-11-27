(function(G){'use strict';
const VERSION='0.1.7',clone=x=>JSON.parse(JSON.stringify(x));
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
const FERMATA_EXTENSION_FACTOR = 1.0;

function realizeFermatas(score) {
  const injections=new Map(), chordStops=new Set();
  const members=score.score.parts.flatMap(part=>part.measures.flatMap(m=>m.events))
    .filter(e=>!e.grace && new Q(e.duration_quarters).cmp(0)>0);
  const end=e=>new Q(e.editor_onset_q).add(e.duration_quarters);
  const chordKey=e=>JSON.stringify([e.editor_onset_q,end(e).toString()]);
  for(const event of members){
    if(!event.fermata?.length)continue;
    if(event.kind==='note')chordStops.add(chordKey(event));
    const key=end(event).toString(), duration=new Q(event.duration_quarters);
    const factor=new Q(String(FERMATA_EXTENSION_FACTOR));
    const extra=new Q(duration.n*factor.n,duration.d*factor.d);
    injections.set(key,max(injections.get(key)??0,extra));
  }
  if(!injections.size)return score;
  const holds=[...injections].map(([q,extra])=>[new Q(q),extra]).sort((a,b)=>a[0].cmp(b[0]));
  let total=new Q(0);
  const cumulative=holds.map(([,extra])=>total=total.add(extra));
  const at=(point,after=true)=>{
    const value=new Q(typeof point==='number'?String(point):point);
    let lo=0,hi=holds.length;
    while(lo<hi){
      const mid=(lo+hi)>>>1,cmp=value.cmp(holds[mid][0]);
      if(cmp>0||(after&&cmp===0))lo=mid+1;
      else hi=mid;
    }
    return lo ? value.add(cumulative[lo-1]) : value;
  };
  for(const e of members){
    const notatedEnd=end(e).toString();
    const sustain=e.kind==='note'&&chordStops.has(chordKey(e));
    const duration=sustain?injections.get(notatedEnd):null;
    const mainEnd=at(notatedEnd,false);
    e.fermataPerformance={
      attack:at(e.arpeggioPerformance?.attack??e.editor_onset_q).toString(),
      mainEnd:mainEnd.toString(),
      end:(sustain?mainEnd.add(duration):mainEnd).toString(),
      trail:duration?.toString()??null
    };
  }
  score.editor.fermataTimeline={
    holds:holds.map(([q,extra])=>({q:q.toString(),extra:extra.toString(),start:Number(at(q,false)),end:Number(at(q))})),
    rounds:score.editor.rounds.map(r=>({...r,start:Number(at(r.startQ??r.start)),measureStart:Number(at(r.startQ??r.measureStart)),
      end:Number(at(r.endQ??r.end)),measureQuarters:Number(at(r.endQ??r.end).sub(at(r.startQ??r.start))),
      nominalMeasureQuarters:r.measureQuarters,beatsAt:Array.from({length:r.beats},
        (_,i)=>Number(at(new Q(r.startQ??String(r.measureStart)).add(new Q(BigInt(4*i),BigInt(r.beatType))))))})),
    tempoMap:score.editor.tempoMap.map(e=>({...e,at:Number(at(e.q??e.at))})),
    metricRounds:score.editor.metricMap?.rounds.map(r=>({...r,start:at(r.start).toString(),end:at(r.end).toString(),counts:r.counts.map(c=>({
      ...c, start:at(c.start).toString(), duration:at(new Q(c.start).add(c.duration)).sub(at(c.start)).toString(),
      subdivisions:c.subdivisions.map(step=>({...step,position:at(step.position).toString(),
        duration:at(new Q(step.position).add(step.duration)).sub(at(step.position)).toString()}))
    }))}))
  };
  for(const part of score.score.parts){
    part.fermataPedals=(part.pedals||[]).map(e=>({...e,at:at(e.at).toString()}));
  }
  return score;
}


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

function parseMusicXML(xml){if(/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(xml))throw Error('Определения сущностей не поддерживаются.');const parseSource=xml.replace(/<!DOCTYPE[^>]*>/gi,'');const dom=new G.DOMParser().parseFromString(parseSource,'application/xml');if(dom.querySelector('parsererror')||dom.documentElement.localName!=='score-partwise')throw Error('Нужен корректный MusicXML score-partwise.');return dom;}
const METRIC_VERSION = 1;
const TEMPO_UNITS = {whole:'4',half:'2',quarter:'1',eighth:'1/2','16th':'1/4','32nd':'1/8','64th':'1/16','128th':'1/32',breve:'8'};
function directionTempo(node) {
  const sound=node.localName==='sound'?node:one(node,'sound');
  const soundQPM=Number(sound?.getAttribute('tempo'));
  const metronome=node.querySelector('direction-type metronome');
  const printedBPM=Number(txt(metronome||{},'per-minute'));
  const unit=TEMPO_UNITS[txt(metronome||{},'beat-unit')];
  const dots=children(metronome||{},'beat-unit-dot').length;
  const base=unit?new Q(unit):null, factor=2n**BigInt(dots);
  const printedUnit=base?new Q(base.n*(2n*factor-1n),base.d*factor):null;
  const printedQPM=printedUnit&&printedBPM>0?Number(printedUnit)*printedBPM:null;
  const hasSound=Number.isFinite(soundQPM)&&soundQPM>0;
  const normalizedQPM=hasSound?soundQPM:printedQPM;
  if(!normalizedQPM||!Number.isFinite(normalizedQPM))return null;
  return {printedBPM:printedBPM>0?printedBPM:null,printedUnit:printedUnit?.toString()??null,
    soundQPM:hasSound?soundQPM:null,normalizedQPM,source:hasSound?'sound':'metronome',
    conflict:hasSound&&printedQPM!=null&&Math.abs(soundQPM-printedQPM)>1e-7};
}

function meterFromXML(time) {
  if(one(time,'senza-misura'))return {free:true,groups:[],beats:4,beatType:4,source:'senza-misura',confidence:'EXPLICIT'};
  const counts=children(time,'beats'), denominators=children(time,'beat-type');
  const groups=counts.flatMap((node,i)=>node.textContent.trim().split('+').map(term=>({
    size:Number(term.trim()), denominator:Number(denominators[i]?.textContent)
  })));
  if(!groups.length||counts.length!==denominators.length||groups.some(({size,denominator})=>
    !Number.isSafeInteger(size)||size<1||size>128||!Number.isSafeInteger(denominator)||denominator<1||denominator>1024)){
    throw Error('Некорректный размер MusicXML');
  }
  // The reduced denominator gives the factor needed to extend this common multiple.
  const denominator=groups.reduce((acc,g)=>acc*new Q(acc,BigInt(g.denominator)).d,1n);
  const beats=groups.reduce((sum,g)=>sum+BigInt(g.size)*(denominator/BigInt(g.denominator)),0n);
  if(beats>1024n||denominator>65536n)throw Error('Слишком сложный составной размер MusicXML');
  const explicit=groups.length>1;
  const conventional=!explicit&&([2,3,4].includes(Number(beats))||Number(denominator)===8&&[6,9,12].includes(Number(beats)));
  return {groups,beats:Number(beats),beatType:Number(denominator),confidence:explicit?'EXPLICIT':conventional?'CONVENTIONAL':'UNKNOWN',source:explicit?'additive':'time'};
}

function repeatedBeamGrouping(source, meter, divisions) {
  if(meter.confidence!=='UNKNOWN'||meter.beatType!==8)return null;
  const runs=new Map();
  for(const note of children(source,'note')){
    if(one(note,'chord')||one(note,'grace'))continue;
    const beam=children(note,'beam').find(node=>(node.getAttribute('number')||'1')==='1')?.textContent.trim();
    const key=txt(note,'staff','1')+':'+txt(note,'voice','1');
    if(!runs.has(key))runs.set(key,[]);
    runs.get(key).push(new Q(txt(note,'duration','0'),BigInt(divisions)).cmp('1/2')===0?beam:undefined);
  }
  const candidates=[];
  for(const marks of runs.values()){
    if(marks.length!==meter.beats)continue;
    const groups=[];
    for(let i=0;i<marks.length;){
      if(marks[i]!=='begin')break;
      let end=i+1;
      while(marks[end]==='continue')end++;
      if(marks[end]!=='end'||end-i>2)break;
      groups.push(end-i+1);
      i=end+1;
    }
    if(groups.reduce((a,b)=>a+b,0)===meter.beats)candidates.push(groups.join('+'));
  }
  return new Set(candidates).size===1?candidates[0]:null;
}

function applyRepeatedBeamGroups(rounds, diagnostics) {
  for(let first=0;first<rounds.length;){
    const signature=JSON.stringify(rounds[first].meter);
    let last=first+1;
    while(last<rounds.length&&JSON.stringify(rounds[last].meter)===signature)last++;
    const block=rounds.slice(first,last);
    const evidence=block.map(r=>r.beamGrouping).filter(Boolean);
    if(evidence.length>=2&&new Set(evidence).size===1){
      const sizes=evidence[0].split('+').map(Number);
      const secondary=new Set(sizes.slice(0,-1).map((_,i)=>sizes.slice(0,i+1).reduce((a,b)=>a+b,0)));
      for(const round of block){
        round.meter={...round.meter,confidence:'INFERRED',source:'repeated-beams',grouping:sizes};
        round.cycleAccents=round.cycleAccents.map((accent,index)=>secondary.has(index)?'SECONDARY':accent);
        for(const count of round.counts)if(secondary.has(count.index))count.accent='SECONDARY';
      }
      diagnostics.push({code:'METRIC_BEAM_GROUP_INFERRED',measure:first+1,grouping:sizes});
    }
    for(const round of block)delete round.beamGrouping;
    first=last;
  }
}

function metricRound({meter, measure, partId, start, length, nominal, pickup, boundaries}) {
  const counts=[];
  const phase=pickup&&nominal.cmp(length)>0?nominal.sub(length):new Q(0);
  const round={id:`${partId}:${measure.index}`,start:start.toString(),end:start.add(length).toString(),
    nominalDuration:meter.free?null:nominal.toString(),metricPhase:phase.toString(),sourceMeasureIds:[measure.number],meter,counts};
  if(meter.free)return {...round,pulseUnit:null,defaultSubdivisions:0,cycleAccents:[]};
  const compound=meter.groups.length===1&&meter.beatType===8&&[6,9,12].includes(meter.beats);
  const base=new Q(compound?'3/2':`4/${meter.beatType}`);
  const accents=new Set();
  let groupOffset=0;
  if(meter.groups.length>1)for(const group of meter.groups){
    if(groupOffset)accents.add(groupOffset);
    groupOffset+=group.size*(meter.beatType/group.denominator);
  }
  if(meter.groups.length===1&&meter.beats===(compound?12:4))accents.add(2);
  round.pulseUnit=base.toString();
  round.defaultSubdivisions=compound?3:1;
  round.cycleAccents=Array.from({length:compound?meter.beats/3:meter.beats},(_,i)=>
    i===0?'PRIMARY':accents.has(i)?'SECONDARY':'WEAK');
  const cuts=[...boundaries].map(q=>new Q(q).add(phase)).sort((a,b)=>a.cmp(b));
  let cut=0;
  for(let local=new Q(0),index=0;local.cmp(phase.add(length))<0;local=local.add(base),index++){
    const end=local.add(base);
    if(end.cmp(phase)<=0)continue;
    const lo=max(local,phase), hi=end.cmp(phase.add(length))>0?phase.add(length):end;
    const binary=new Q(base.n,base.d*2n), ternary=new Q(base.n,base.d*3n);
    const positions=[{at:local,ru:null,en:null,count:true}];
    const hasBoundary=q=>boundaries.has(q.sub(phase).toString());
    if(compound||hasBoundary(local.add(ternary))||hasBoundary(local.add(ternary).add(ternary))){
      positions.push({at:local.add(ternary),ru:'И',en:'AND'},{at:local.add(ternary).add(ternary),ru:'А',en:'A'});
    }
    if(hasBoundary(local.add(binary))||!compound&&hasBoundary(local.add(new Q(base.n,base.d*4n)))){
      positions.push({at:local.add(binary),ru:'И',en:'AND'});
    }
    while(cut<cuts.length&&cuts[cut].cmp(end)<0){
      const at=cuts[cut++];
      if(at.cmp(lo)>=0&&!positions.some(p=>p.at.cmp(at)===0))positions.push({at,ru:null,en:null});
    }
    const steps=positions.filter(p=>p.at.cmp(lo)>=0&&p.at.cmp(hi)<0).sort((a,b)=>a.at.cmp(b.at));
    counts.push({id:`${round.id}:${index}`,index,start:start.add(lo).sub(phase).toString(),
      duration:hi.sub(lo).toString(),pulse:lo.cmp(local)===0,
      accent:round.cycleAccents[index]??'WEAK',
      subdivisions:steps.map((step,i)=>({position:start.add(step.at).sub(phase).toString(),
        duration:(steps[i+1]?.at??hi).sub(step.at).toString(),count:step.count===true,labelRU:step.ru,labelEN:step.en}))});
  }
  return round;
}
function importXML(xml,handMap={},partIds=null){const dom=parseMusicXML(xml);const diagnostics=[],parts=[],notes=[],rounds=[],metricRounds=[],tempoEntries=new Map();let title=dom.querySelector('work-title')?.textContent.trim()||dom.querySelector('movement-title')?.textContent.trim()||'Без названия';let tempo=120,tempoSeen=false;const names={C:0,D:2,E:4,F:5,G:7,A:9,B:11};let total=new Q(0);
const sourceParts=children(dom.documentElement,'part');
const tempoSource=sourceParts.find(part=>Array.from(part.querySelectorAll('measure > direction, measure > sound')).some(directionTempo));
for(const [pi,part]of sourceParts.entries()){
const tempoOnly=Boolean(partIds&&!partIds.includes(part.getAttribute('id')));
if(tempoOnly&&part!==tempoSource)continue;
const primaryPart=!tempoOnly&&!parts.length;
let divisions=1,beats=4,beatType=4,meter={groups:[{size:4,denominator:4}],beats:4,beatType:4,source:'default',confidence:'UNKNOWN'},offset=new Q(0),transpose=0;const measures=[],pedals=[];const sourceMeasures=children(part,'measure');for(const [mi,m]of sourceMeasures.entries()){let cursor=new Q(0),extent=new Q(0),last=new Q(0),unsupported=false;const events=[],attrs=one(m,'attributes');if(attrs){divisions=Number(txt(attrs,'divisions',String(divisions)));if(!Number.isSafeInteger(divisions)||divisions<=0)throw Error('Некорректные divisions');const times=children(attrs,'time');const time=times.find(t=>!t.getAttribute('number'))??times[0];if(time){
  meter=meterFromXML(time);beats=meter.beats;beatType=meter.beatType;
  if(meter.confidence==='UNKNOWN'||meter.free||times.length>1)diagnostics.push({code:meter.free?'METRIC_FREE':times.length>1?'METRIC_MULTIPLE_STAVES':'METRIC_GROUPS_UNKNOWN',measure:mi+1});
}if(one(attrs,'transpose')){const tr=one(attrs,'transpose');transpose=Number(txt(tr,'chromatic','0'))+12*Number(txt(tr,'octave-change','0'));}}
const boundaries=new Set();
for(const node of Array.from(m.children)){
  if(node.localName==='backup'||node.localName==='forward'){
    const delta=new Q(txt(node,'duration','0'),BigInt(divisions));
    cursor=node.localName==='backup'?cursor.sub(delta):cursor.add(delta);
    if(cursor.cmp(0)<0)throw Error('MusicXML backup выходит за начало такта');
    if(node.localName==='forward')extent=max(extent,cursor);
    continue;
  }
  if(node.localName==='direction'||node.localName==='sound'){
    if(!tempoOnly)pedals.push(...pedalEvents(node,offset.add(cursor),divisions,pedals.length));
    const mark=part===tempoSource?directionTempo(node):null;
    if(mark){
      const sound=node.localName==='sound'?node:one(node,'sound');
      const directionOffset=node.localName==='direction'?one(node,'offset'):null;
      const timingOffset=(sound&&one(sound,'offset'))||(directionOffset?.getAttribute('sound')==='yes'?directionOffset:null);
      const at=offset.add(cursor).add(new Q(timingOffset?.textContent.trim()||'0',BigInt(divisions))).toString();
      const previous=tempoEntries.get(at);
      if(!previous||mark.soundQPM||!previous.soundQPM)tempoEntries.set(at,{...previous,...mark,position:at,
        printedBPM:mark.printedBPM??previous?.printedBPM??null,printedUnit:mark.printedUnit??previous?.printedUnit??null});
      else if(mark.printedBPM)tempoEntries.set(at,{...previous,printedBPM:mark.printedBPM,printedUnit:mark.printedUnit,conflict:Math.abs(previous.normalizedQPM-mark.normalizedQPM)>1e-7});
      if(tempoEntries.get(at).conflict)diagnostics.push({code:'TEMPO_MARK_CONFLICT',measure:mi+1,at});
      if(!tempoSeen){tempo=mark.normalizedQPM;tempoSeen=true;}
    }
    if(!tempoOnly&&node.querySelector('pedal'))diagnostics.push({code:'PEDAL_RELEASE_UNKNOWN',measure:mi+1,message:'Педаль не определяет время снятия пальца.'});
    continue;
  }
if(node.localName!=='note')continue;const rest=!!one(node,'rest'),grace=!!one(node,'grace'),chord=!!one(node,'chord'),pitch=one(node,'pitch'),duration=new Q(txt(node,'duration','0'),BigInt(divisions));if(duration.cmp(0)<0)throw Error('Отрицательная длительность');const start=chord?last:cursor;if(!chord){last=start;cursor=cursor.add(duration);}extent=max(extent,start.add(duration));if(!grace){boundaries.add(start.toString());boundaries.add(start.add(duration).toString());}if(tempoOnly)continue;const staff=Number(txt(node,'staff','1')),voice=txt(node,'voice','1'),pid=part.getAttribute('id')||'P'+pi;const hand=handMap[pid+':'+staff]||handMap[pid]||null;const id=pid+'.m'+mi+'.e'+events.length;const step=pitch?txt(pitch,'step'):null,alter=pitch?Number(txt(pitch,'alter','0')):0,octave=pitch?Number(txt(pitch,'octave')):0,midi=pitch?(octave+1)*12+names[step]+alter+transpose:null;const fnode=node.querySelector('notations technical fingering'),fraw=fnode?.textContent?.trim(),f=fraw&&/^[1-5]$/.test(fraw)?Number(fraw):null;const tied=children(node,'notations').flatMap(n=>children(n,'tied'));
const soundTies=children(node,'tie');
const ties=[...new Set((soundTies.length?soundTies:tied).flatMap(x=>{
  const type=x.getAttribute('type');return type==='continue'?['stop','start']:['start','stop'].includes(type)?[type]:[];
}))];let supported=!grace&&duration.cmp(0)>0&&(rest||Number.isInteger(midi)&&midi>=0&&midi<=127);if(node.querySelector('trill-mark, tremolo')||!rest&&!pitch){supported=false;unsupported=true;}if(fraw&&!f)diagnostics.push({code:'SOURCE_FINGERING_COMPLEX',event:id,message:'Сложное обозначение пальцев сохранено в MusicXML.'});const arpeggioMarks=children(node,'notations').flatMap(n=>Array.from(n.children).filter(m=>['arpeggiate','non-arpeggiate'].includes(m.localName)).map(m=>({type:m.localName,number:m.getAttribute('number'),direction:m.getAttribute('direction'),boundary:m.getAttribute('type')})));
const hasArpeggio=arpeggioMarks.some(m=>m.type==='arpeggiate');
const event={id,kind:rest?'rest':'note',staff,voice,hand,start_quarters:start.toString(),duration_quarters:duration.toString(),chord,grace,source_fingering:f,method:{finger:null,fingering_source:null,fingering_confidence:null,fingering_history:[]},ties,...(arpeggioMarks.length?{arpeggioMarks,arpeggioEligible:supported}:{}),fermata:children(node,'notations').flatMap(n=>children(n,'fermata')).map(mark=>({
  shape:mark.textContent.trim(),type:mark.getAttribute('type')
})), stem:txt(node,'stem',null),unisonSpecial:Boolean(fraw&&!f||fnode?.getAttribute('alternate')==='yes'||fnode?.getAttribute('substitution')==='yes'||node.querySelector('cue, play, listen, notations technical harmonic, notations glissando, notations slide, notations ornaments'))||children(node,'notations').some(notation=>Array.from(notation.children).some(mark=>!['tied','articulations','technical','slur','arpeggiate','fermata'].includes(mark.localName))||children(notation,'technical').some(tech=>Array.from(tech.children).some(mark=>mark.localName!=='fingering'))),unisonTiming:['attack','release','end-dynamics'].map(name=>node.getAttribute(name)),articulations:children(node,'notations').flatMap(n=>children(n,'articulations').flatMap(a=>Array.from(a.children,x=>x.localName))),editor_onset_q:offset.add(start).toString(),editor_supported:supported&&!hasArpeggio};if(!rest){if(!pitch){event.kind='unpitched';event.unpitched=one(node,'unpitched')?.textContent||null;event.pitch=null;diagnostics.push({code:'UNPITCHED_UNSUPPORTED',event:id,message:'Нота без определённой высоты сохранена, но не преобразована в клавишу.'});}else event.pitch={step,alter,octave,midi};event.play12_symbol={value:'0123456789XY'[((midi||0)%12+12)%12],origin:'conversion'};notes.push(event);}events.push(event);}
if(m.querySelector('repeat,ending,segno,coda')||m.querySelector('sound[da-capo],sound[dacapo],sound[dalsegno]')){diagnostics.push({code:'TRAVERSAL_UNSUPPORTED',measure:mi+1,message:'Повторы/переходы не раскрыты: показан записанный порядок.'});}
if(unsupported)diagnostics.push({code:'REALIZATION_MISSING',measure:mi+1,message:'Специальный приём требует исполнительского расписания; участок не назначен автоматически.'});const nominal=new Q(BigInt(beats*4),BigInt(beatType)),short=extent.cmp(0)>0&&extent.cmp(nominal)<0,pickup=mi===0&&m.getAttribute('implicit')==='yes',
terminalShort=mi===sourceMeasures.length-1&&short&&sourceMeasures.length>1&&
  new Set(events.map(e=>e.staff+':'+e.voice)).size===1&&!one(m,'forward'),
length=meter.free||m.getAttribute('implicit')==='yes'||terminalShort?extent:max(nominal,extent);
if(short&&!meter.free)diagnostics.push({code:length.cmp(extent)===0?'METRIC_SHORT_MEASURE':'METRIC_PADDED_MEASURE',measure:mi+1});if(!length.n)throw Error('Пустой такт без длительности');if(tempoOnly){offset=offset.add(length);continue;}const measure={index:mi,number:m.getAttribute('number')||String(mi+1),implicit:m.getAttribute('implicit')==='yes',attributes:{divisions,time:{beats,beat_type:beatType}},events,editor_duration_q:length.toString(),tempo_marks:mi===0?[{start_quarters:'0/1',bpm:tempo}]:[]};measures.push(measure);if(primaryPart){
  const round=metricRound({meter,measure,partId:part.getAttribute('id'),start:offset,length,nominal,pickup,boundaries});
  round.beamGrouping=repeatedBeamGrouping(m,meter,divisions);
  metricRounds.push(round);
}else{
  const primary=metricRounds[mi];
  if(primary&&(primary.start!==offset.toString()||primary.end!==offset.add(length).toString()||
    primary.meter.beatType!==meter.beatType||primary.meter.beats!==meter.beats||
    JSON.stringify(primary.meter.groups)!==JSON.stringify(meter.groups))){
    diagnostics.push({code:'METRIC_PART_CONFLICT',measure:mi+1,part:part.getAttribute('id')});
  }
}if(primaryPart)rounds.push({index:mi,startQ:offset.toString(),endQ:offset.add(length).toString(),start:num(offset),end:num(offset.add(length)),measureStart:num(offset),beats,beatType,beatQuarters:4/beatType,measureQuarters:num(length)});offset=offset.add(length);}if(tempoOnly)continue;total=max(total,offset);parts.push({id:part.getAttribute('id'),name:txt(children(one(dom.documentElement,'part-list')||{},'score-part').find(def=>def.getAttribute('id')===part.getAttribute('id'))||{},'part-name',part.getAttribute('id')),measures,pedals:pedals.sort((a,b)=>new Q(a.at).cmp(b.at)||a.order-b.order)});}
applyRepeatedBeamGroups(metricRounds,diagnostics);
for(const part of parts){realizeArpeggios(part,diagnostics);preserveUnresolvedArpeggioTies(part);}
if(!notes.length)throw Error('В файле нет нот.');for(const e of notes)if(!e.hand)diagnostics.push({code:'HAND_UNKNOWN',event:e.id,message:'Укажите руку для партии/нотоносца.'});const reference=21;for(const e of notes)if(e.pitch)e.play12_symbol.value='0123456789XY'[((e.pitch.midi-9)%12+12)%12]||'?';const score={format:'play12-json',version:'0.1',source:{type:'musicxml',title},play12:{zero_pitch_class:'A',reference_zero_midi:reference,symbols:'0123456789XY',pitch_class_mapping:Object.fromEntries(Array.from('0123456789XY').map((x,i)=>[String((i+9)%12),x]))},score:{title,creators:[],parts},editor:{schema:'play12-editor/1',sharedUnison:true,total_quarters:total.toString(),rounds,tempo,tempoMap:[...new Map([['0/1',{normalizedQPM:120}],...tempoEntries])].sort(([a],[b])=>new Q(a).cmp(b)).map(([q,mark])=>({at:num(q),q,bpm:mark.normalizedQPM})),metricMap:{version:METRIC_VERSION,rounds:metricRounds,tempoMarks:[...tempoEntries.values()].sort((a,b)=>new Q(a.position).cmp(b.position))},diagnostics}};return realizeFermatas(score);}
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
  if(c?.arpeggio&&(e.fermata===true||e.fermata?.length)&&new Q(c.end).cmp(at)===0){
    c.sustainedIds=[...(c.sustainedIds||[]),e.id];
    c.end=at.add(e.duration_quarters).toString();
    if(!start)open.delete(key);
  }
  continue;
}
const nominalEnd=at.add(e.duration_quarters).toString();
const actualEnd=e.fermataPerformance?.end??nominalEnd;
if(c&&new Q(c.notatedEnd??c.end).cmp(e.editor_onset_q)===0){
  c.ids.push(e.id);c.end=actualEnd;
  if(e.fermataPerformance)c.notatedEnd=nominalEnd;
  if(e.fermataPerformance?.trail)c.fermata=true;
}else{c={id:e.id,ids:[e.id],hand:e.hand,key:e.pitch.midi,start:e.fermataPerformance?.attack??e.arpeggioPerformance?.attack??e.editor_onset_q,...(e.arpeggioPerformance?{arpeggio:e.arpeggioPerformance}:{}),end:actualEnd,...(e.fermataPerformance?{notatedEnd:nominalEnd,fermata:!!e.fermataPerformance.trail}:{}),releaseBasis:'assumed_score_duration'};out.push(c);if(stop)warnings.push({code:'AMBIGUOUS_TIE',event:e.id});}if(start)open.set(key,c);else open.delete(key);}if(out.some(c=>c.arpeggio||c.notatedEnd))out.sort((a,b)=>new Q(a.start).cmp(b.start)||a.id.localeCompare(b.id));return {contacts:score.editor?.schema && !score.editor.sharedUnison ? out : mergeUnisons(out,byId,locks),warnings};}

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
    const key = JSON.stringify([parts.get(members[0].part),c.hand,c.key,c.start,c.end,c.arpeggio?.group??null,
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
const COMFORT_SPAN = 'BEGINNER_COMFORT_SPAN_EXCEEDED';
const OCTAVE_FINGERING = 'BEGINNER_OCTAVE_FINGERING_VIOLATION';
function pairKey(first,second) {
  return first<second?first+'-'+second:second+'-'+first;
}
function comfortLimit(profile, first, second) {
  return profile?.comfortSpan?.[pairKey(first,second)];
}
function practicalLimit(profile, first, second) {
  return (profile?.practicalSpan??profile?.comfortSpan)?.[pairKey(first,second)];
}
function octaveMatches(hand, lowFinger, highFinger) {
  return hand==='L' ? lowFinger===5&&highFinger===1 : lowFinger===1&&highFinger===5;
}
function spanViolation(profile, lower, upper, lowFinger, highFinger) {
  const distance=upper.key-lower.key;
  if(profile.octaveFingers&&distance===12&&!octaveMatches(lower.hand,lowFinger,highFinger))return OCTAVE_FINGERING;
  if(distance>practicalLimit(profile,lowFinger,highFinger))return profile.practicalSpan?'SPAN_VIOLATION':COMFORT_SPAN;
  return null;
}
// A local proof ignores the current beam prefix but retains actual contact
// intervals, ownership and manual locks. It never proves global reachability.
function hasLocalBeginnerShape(contacts, profile, fixed){
  const ordered=contacts.slice().sort((a,b)=>a.key-b.key);
  const fingers=[];
  function visit(index,used){
    if(index===ordered.length)return true;
    const c=ordered[index],lock=fixed.get(c.id);
    for(const f of lock!=null?[lock]:[1,2,3,4,5]){
      if(!Number.isInteger(f)||f<1||f>5||used&(1<<f))continue;
      if(fingers.some((other,i)=>!(lock!=null&&fixed.get(ordered[i].id)!=null)&&
        spanViolation(profile,ordered[i],c,other,f)))continue;
      fingers.push(f);
      if(visit(index+1,used|(1<<f)))return true;
      fingers.pop();
    }
    return false;
  }
  return visit(0,0);
}
function manualContact(c, locks) {
  return c.ids.some(id=>locks[id]!=null);
}
function checkContactSpan(a,b,first,second,options,conflicts,warnings,extensions) {
  const {profile,locks={},rounds=[],source='engine'}=options;
  if((!profile?.comfortSpan&&!profile?.octaveFingers)||a.hand!==b.hand||first===second||
      !Number.isInteger(first)||!Number.isInteger(second)||first<1||first>5||second<1||second>5)return;
  const [lower,upper,lowFinger,highFinger]=a.key<b.key?[a,b,first,second]:[b,a,second,first];
  const distance=upper.key-lower.key, limit=comfortLimit(profile,lowFinger,highFinger);
  const hardLimit=practicalLimit(profile,lowFinger,highFinger);
  const spanExceeded=distance>hardLimit;
  const extended=Boolean(profile.practicalSpan)&&distance>limit&&!spanExceeded;
  const badOctave=profile.octaveFingers&&distance===12&&!octaveMatches(a.hand,lowFinger,highFinger);
  if(!spanExceeded&&!badOctave&&!extended)return;
  const overlapStart=max(a.start,b.start);
  const overlapEnd = new Q(a.end).cmp(b.end)<=0 ? new Q(a.end) : new Q(b.end);
  const sources=[lower,upper].map(c=>manualContact(c,locks)?'manual':source);
  const advisory=sources.includes('manual')||source==='source';
  const record=rule=>{
    const extension=rule==='PRACTICAL_EXTENSION';
    (extension?extensions:advisory?warnings:conflicts).push({
      code:!extension&&sources.includes('manual')?'MANUAL_ASSIGNMENT_SPAN_VIOLATION':rule,
      rule,severity:extension?'info':advisory?'warning':'error',hand:a.hand,ids:[lower.id,upper.id],
      eventIds:[lower.ids,upper.ids],midi:[lower.key,upper.key],fingers:[lowFinger,highFinger],
      distance,limit:(extension?limit:hardLimit)??null,comfortLimit:limit??null,practicalLimit:hardLimit??null,reason:extension?(advisory?'USER_OR_SOURCE_ASSIGNMENT':'MINIMUM_EXCESS_AMONG_RETAINED_FEASIBLE_PATHS'):undefined,excess:limit==null?null:Math.max(0,distance-(extension?limit:hardLimit)),source:sources,
      overlap:[overlapStart.toString(),overlapEnd.toString()],
      rounds:rounds.filter(r=>r.end>Number(overlapStart)&&r.start<Number(overlapEnd)).map(r=>r.index+1)
    });
  };
  if(spanExceeded)record(profile.practicalSpan?'SPAN_VIOLATION':COMFORT_SPAN);
  if(extended&&!badOctave)record('PRACTICAL_EXTENSION');
  if(badOctave)record(OCTAVE_FINGERING);
}
function validate(cs,assign,options={}){const conflicts=[],unknown=[],extensions=[];for(const c of cs){const f=assign[c.id];if(f!=null&&(!Number.isInteger(f)||f<1||f>5))conflicts.push({code:'INVALID_FINGER',ids:c.ids,severity:'error'});}const timed=cs.map(c=>({c,start:new Q(c.start),end:new Q(c.end)})).sort((a,b)=>a.start.cmp(b.start));for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length;j++){const first=timed[i],second=timed[j];if(second.start.cmp(first.end)>=0)break;if(first.start.cmp(second.end)>=0)continue;const {c:a}=first,{c:b}=second;if(a.key===b.key){unknown.push({code:'KEY_OWNERSHIP_UNKNOWN',ids:[a.id,b.id],severity:'warning'});continue;}if(a.hand===b.hand&&assign[a.id]!=null&&assign[a.id]===assign[b.id]){const confirmed=a.releaseBasis!=='assumed_score_duration'&&b.releaseBasis!=='assumed_score_duration';(confirmed?conflicts:unknown).push({code:'FINGER_OVERLAP',ids:[a.id,b.id],severity:confirmed?'error':'warning',basis:[a.releaseBasis,b.releaseBasis]});}checkContactSpan(a,b,assign[a.id],assign[b.id],options,conflicts,unknown,extensions);}
  const result={conflicts,warnings:unknown,physical:'unknown'};
  if(options.profile?.practicalSpan){
    const categories=Object.fromEntries(cs.filter(c=>Number.isInteger(assign[c.id])).map(c=>[c.id,'COMFORTABLE']));
    for(const extension of extensions)for(const id of extension.ids)categories[id]='PRACTICAL_EXTENSION';
    for(const issue of [...conflicts,...unknown])if(issue.rule==='SPAN_VIOLATION'){
      for(const id of issue.ids)categories[id]='SPAN_VIOLATION';
    }
    Object.assign(result,{extensions,categories});
  }
  return result;
}
function keyX(midi,cfg){const pc=((midi%12)+12)%12,white={0:0,2:1,4:2,5:3,7:4,9:5,11:6},black={1:0,3:1,6:2,8:3,10:4};return Math.floor(midi/12)*700+(white[pc]!=null?cfg.geometry.white[white[pc]]:cfg.geometry.black[black[pc]]);}
// Reserve one beam slot per retained fingering of keys that will still be
// held at the next attack before filling the rest by normal path cost.
function chooseContactBeam(results, width, retained) {
  if(!retained.length||results.length<=width)return results.slice(0,width);
  const chosen=new Set(), shapes=new Set();
  for(const candidate of results){
    const key=retained.map(c=>candidate.p[c.id]??candidate.parent.assign[c.id]).join('');
    if(shapes.has(key))continue;
    shapes.add(key);
    chosen.add(candidate);
    if(chosen.size===width)break;
  }
  for(const candidate of results){
    if(chosen.size===width)break;
    chosen.add(candidate);
  }
  return results.filter(candidate=>chosen.has(candidate));
}
function propose(score,cfg,locks={},detailed=false,performance=null){const started=performance?.started??Date.now(),base=performance?.base??contacts(score,{locks}),all=performance?.actions??base.contacts,assign={},reasons=[...base.warnings],stats={generated:0,rejected:0,pruned:0,comfortSpanRejected:0,practicalSpanRejected:0,octaveRejected:0,admissible:0},details=[],alternatives=[];const keyPositions=new Map(all.map(c=>[c.key,keyX(c.key,cfg)]));const keyPosition=key=>keyPositions.get(key);
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
const enforceSpan=Boolean(cfg.comfortSpan||cfg.octaveFingers);
const fixedById=new Map(all.map(c=>[c.id, c.ids.map(id=>locks[id]).find(f=>f!=null)]));
const unassignedReasons = Object.create(null);
const markUnassigned = (contacts, reason) => {
  for (const contact of contacts) for (const id of contact.ids) unassignedReasons[id] = reason;
};
let timedOut=false, truncated=false;for(const hand of ['L','R']){const cs=all.filter(c=>c.hand===hand).sort((a,b)=>new Q(a.start).cmp(b.start)||a.key-b.key||a.id.localeCompare(b.id));const groups=[];for(const c of cs){let g=groups.at(-1);if(!g||new Q(g[0].start).cmp(c.start))groups.push(g=[]);g.push(c);}const ends=new Map(cs.map(c=>[c.id,new Q(c.end)]));let held=[], recoveryEnd=null;let states=[{cost:0,assign:{},last:{},position:null,features:{},rank:0,path:null,expandedPairs:0,excess:0}];for(let gi=0;gi<groups.length;gi++){const group=groups[gi],time=group[0].start,next=groups[gi+1]?.[0];const onset=new Q(time);
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
let results=[],layerGenerated=0,spanRejections=0;
for(const state of sharedKey||active.length+group.length>5?[]:states){
  const used = new Set(active.map(c=>state.assign[c.id]));
  const assignedContacts = active.map(c=>[c,state.assign[c.id]]);
  const placements=[];
  function gen(i, usedNow, p, expandedPairs, excess){
    if(i===group.length){
      placements.push({p,expandedPairs,excess});
      stats.admissible++;
      return;
    }
    const c=group[i],fixed=fixedById.get(c.id);
    for(const f of fixed!=null?[fixed]:[1,2,3,4,5]){
      if(layerGenerated>=cfg.search.maxCandidatesPerLayer)break;
      stats.generated++;
      if(!enforceSpan)layerGenerated++;
      if(!Number.isInteger(f)||f<1||f>5||usedNow.has(f)){
        stats.rejected++;
        if(enforceSpan)layerGenerated++;
        continue;
      }
      let addedPairs=0,addedExcess=0;
      if(enforceSpan){
        let violation=null;
        for(const [other,otherFinger] of assignedContacts){
          if(fixed!=null&&fixedById.get(other.id)!=null)continue;
          violation=other.key<c.key?spanViolation(cfg,other,c,otherFinger,f):spanViolation(cfg,c,other,f,otherFinger);
          if(violation)break;
          if(cfg.practicalSpan){
            const extra=Math.abs(c.key-other.key)-comfortLimit(cfg,f,otherFinger);
            if(extra>0){addedPairs++;addedExcess+=extra;}
          }
        }
        if(violation){
          stats.rejected++;
          spanRejections++;
          if(violation===OCTAVE_FINGERING)stats.octaveRejected++;
          else if(cfg.practicalSpan)stats.practicalSpanRejected++;
          else stats.comfortSpanRejected++;
          continue;
        }
      }
      if(enforceSpan)layerGenerated++;
      assignedContacts.push([c,f]);
      gen(i+1,new Set([...usedNow,f]),{...p,[c.id]:f},expandedPairs+addedPairs,excess+addedExcess);
      assignedContacts.pop();
    }
  }
  gen(0,used,{},state.expandedPairs,state.excess);
const together=[...active,...group];const prev=Object.values(state.last).sort((a,b)=>new Q(b.start).cmp(a.start))[0];for(const {p,expandedPairs,excess} of placements){let cost=state.cost,features={},last={...state.last};const add=(name,raw)=>{const value=Math.round(raw)*cfg.weights[name];cost+=value;features[name]=(features[name]||0)+value;};for(const c of group){const f=p[c.id],old=state.last[f],x=keyPosition(c.key);
const natural=arpeggioPreferred.get(c.id);
if(natural!=null)cost+=Math.abs(f-natural)*cfg.weights.chordOrder*400;if(performance?.preferred[c.id] && performance.preferred[c.id]!==f)cost+=performance.preferenceCost;if([1,3,6,8,10].includes(c.key%12)){if(f===1)add('thumbBlack',1);if(f===5)add('pinkyBlack',1);}if(old&&old.key!==c.key)add('sameFingerMove',1);if(prev&&prev.key!==c.key&&prev.f!==f){const direction=(x-keyPosition(prev.key))*(f-prev.f)*(hand==='R'?1:-1);if(direction<0)add('crossing',1);}if(next){const target=(keyPosition(next.key)-x)/100*(hand==='R'?1:-1),available=target>0?5-f:f-1;add('futureReach',Math.max(0,Math.abs(target)-available));}last[f]={key:c.key,start:c.start,f};}
for(let i=0;i<together.length;i++)for(let j=i+1;j<together.length;j++){const a=together[i],b=together[j];if(p[a.id]==null&&p[b.id]==null)continue;const fa=p[a.id]||state.assign[a.id],fb=p[b.id]||state.assign[b.id],dx=(keyPosition(b.key)-keyPosition(a.key))*(hand==='R'?1:-1)/100;add('chordShape',Math.abs(Math.abs(dx)-Math.abs(fb-fa))*10);if(dx*(fb-fa)<0)add('chordOrder',a.arpeggio&&a.arpeggio.group===b.arpeggio?.group?40:1);}const position=group.reduce((v,c)=>v+keyPosition(c.key)-(hand==='R'?1:-1)*(p[c.id]-1)*100,0)/group.length;if(state.position!=null)add('positionShift',Math.abs(position-state.position));results.push({cost,expandedPairs,excess,parent:state,p,tie:JSON.stringify(p),last,position,features});if(detailed&&details.length<cfg.diagnostics.maxDetails)details.push({hand,time,assign:p,cost,features});}if(layerGenerated>=cfg.search.maxCandidatesPerLayer){truncated=true;break;}}
if (!results.length) {
  if(group.some(c=>locks[c.id] && (!Number.isInteger(locks[c.id]) || locks[c.id]<1 || locks[c.id]>5))) {
    markUnassigned(group,'INVALID_LOCK');
    reasons.push({code:'NO_PATH_UNDER_CONTACT_ASSUMPTION',ids:group.flatMap(c=>c.ids),hand,reason:'INVALID_LOCK'});
    break;
  }
  let reason = sharedKey ? 'MODEL_CONFLICT_UNRESOLVED_KEY' : layerGenerated>=cfg.search.maxCandidatesPerLayer
    ? 'SEARCH_EXHAUSTED' : spanRejections
      ? 'NO_PATH_UNDER_BEGINNER_CONSTRAINTS'
      : 'NO_FEASIBLE_ASSIGNMENT';
  const local=[...active,...group];
  let diagnosis;
  if(spanRejections&&!sharedKey&&layerGenerated<cfg.search.maxCandidatesPerLayer){
    const feasible=hasLocalBeginnerShape(local,cfg,fixedById);
    diagnosis=feasible?'LOCAL_SHAPE_EXISTS_OUTSIDE_SURVIVING_PATHS':
      local.some(c=>fixedById.get(c.id)!=null)&&hasLocalBeginnerShape(local,cfg,new Map())
        ?'LOCAL_SHAPE_BLOCKED_BY_LOCK':'NO_LOCAL_SHAPE_WITH_CURRENT_CONTACTS';
  }
  if(diagnosis==='LOCAL_SHAPE_BLOCKED_BY_LOCK')reason='MANUAL_LOCK_BLOCKS_BEGINNER_PATH';
  markUnassigned(group,reason);
  recoveryEnd=group.reduce((end,c)=>max(end,ends.get(c.id)),onset);
  // Preserve the surviving prefix and its exact occupied fingers. If a failed
  // attack addresses an already held key, wait for that known contact too.
  for(const c of active) if(group.some(newContact=>newContact.key===c.key)) recoveryEnd=max(recoveryEnd,ends.get(c.id));
  reasons.push({code:'NO_PATH_UNDER_CONTACT_ASSUMPTION',ids:group.flatMap(c=>c.ids),hand,reason,diagnosis,
    start:time,activeContacts:active.map(c=>c.id),candidateRejections:spanRejections,releaseBoundary:recoveryEnd.toString(),
    message:'Не найден путь при принятой модели удержания. Это не доказательство физической невозможности.'});
  continue;
}const byPath=(a,b)=>a.parent.rank-b.parent.rank||a.tie.localeCompare(b.tie);
// A zero-extension path always ranks before a practical path. Keep
// different held fingerings in the beam so a later attack can still decide
// whether an earlier comfortable placement can be extended.
results.sort((a,b)=>a.expandedPairs-b.expandedPairs||a.excess-b.excess||a.cost-b.cost||byPath(a,b));
stats.pruned+=Math.max(0,results.length-cfg.search.beamWidth);
const nextOnset=next&&enforceSpan?new Q(next.start):null;
const retained=nextOnset?[...active,...group].filter(c=>ends.get(c.id).cmp(nextOnset)>0):[];
const beam=chooseContactBeam(results,cfg.search.beamWidth,retained);
const ranks=new Map(beam.slice().sort(byPath).map((candidate,index)=>[candidate,index]));
states=beam.map(candidate=>{const {parent,p,cost,last,position,features}=candidate;return {
  cost,expandedPairs:candidate.expandedPairs,excess:candidate.excess,last,position,path:{previous:parent.path,placement:p},
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
  alternatives.push({hand,paths:states.slice(0,cfg.search.alternatives).map(s=>({assignments:materialize(s),cost:s.cost,expandedPairs:s.expandedPairs,excess:s.excess,features:s.features}))});
}}
const checked=validate(all,assign,{profile:cfg,locks,rounds:score.editor?.fermataTimeline?.rounds??score.editor?.rounds});const unique=new Map();for(const c of all)for(const id of c.ids)unique.set(id,assign[c.id]??null);const notes=events(score),assigned=notes.filter(e=>unique.get(e.id)!=null).length;for(const e of notes) if(unique.get(e.id)==null&&!unassignedReasons[e.id]) unassignedReasons[e.id]=unique.has(e.id)?'NOT_PROCESSED':'EXCLUDED';return{version:VERSION,unassignedReasons,profile:clone(cfg),assignments:Object.fromEntries(unique),contactAssignments:assign,contacts:all,alternatives,stats,details,warnings:[...reasons,...checked.warnings,{code:'EXPERIMENTAL_PROFILE',message:'Экспериментальная аппликатура: проверьте с преподавателем. Физическая достижимость не подтверждена.'}],validation:checked,coverage:notes.length?assigned/notes.length:0,assigned,total:notes.length,search_status:timedOut?'budget_exhausted':assigned<notes.length?'partial':stats.pruned||truncated?'approximate_complete':'exact_complete',optimality:stats.pruned||truncated||assigned<notes.length?'not_proven':'within_declared_finite_model',ranking_status:'experimental_config',feasibility:'unknown',elapsed_ms:Date.now()-started};}
const runtimeFingerings = new WeakMap();
function setRuntimeFingering(doc, run) { if(run) runtimeFingerings.set(doc,run); else runtimeFingerings.delete(doc); }
function baseAssignments(doc){return doc.mode==='source'?Object.fromEntries(events(doc.score).map(e=>[e.id,e.source_fingering])):(runtimeFingerings.get(doc)??doc.run).assignments;}
const runtimeMetrics=new WeakMap();
function sameScoreTiming(before, after, includeTempo=false) {
  const a=before.editor,b=after.editor;
  if(!a||!b||!Array.isArray(a.rounds)||a.rounds.length!==b.rounds.length)return false;
  if(!a.rounds.every((r,i)=>r.start===b.rounds[i].start&&r.end===b.rounds[i].end))return false;
  const original=events(before),next=events(after);
  if(original.length!==next.length||!original.every((e,i)=>e.id===next[i].id&&
    e.editor_onset_q===next[i].editor_onset_q&&e.duration_quarters===next[i].duration_quarters))return false;
  if(JSON.stringify(a.fermataTimeline?.holds??[])!==JSON.stringify(b.fermataTimeline?.holds??[]))return false;
  const tempo=score=>score.tempoMap?.map(e=>[e.at,e.bpm])??[];
  return !includeTempo||JSON.stringify(tempo(a))===JSON.stringify(tempo(b));
}
function metricSidecar(doc, score) {
  if(!score.editor||score.editor.metricMap?.version===METRIC_VERSION)return;
  if(!runtimeMetrics.has(doc)){
    let result=null;
    try {
      if(typeof doc.source==='string'&&doc.source.trim()){
        const normalized=importXML(doc.source,{},doc.partIds??null);
        if(sameScoreTiming(doc.score,normalized)){
          result={map:{...normalized.editor.metricMap,sourceHash:doc.sourceHash??null},
            execution:normalized.editor.fermataTimeline?.metricRounds};
        }
      }
    }catch(_) {
      // A legacy document stays playable if its source cannot be normalized.
    }
    runtimeMetrics.set(doc,result);
  }
  const result=runtimeMetrics.get(doc);
  if(result){
    score.editor.metricMap=result.map;
    if(result.execution&&score.editor.fermataTimeline)score.editor.fermataTimeline.metricRounds=result.execution;
  }else{
    score.editor.diagnostics??=[];
    score.editor.diagnostics.push({code:'METRIC_LEGACY_TIMING_PRESERVED'});
  }
}
function effective(doc) {
  const score=clone(doc.score), base=baseAssignments(doc), notes=events(score);
  metricSidecar(doc,score);
  const byId=new Map(notes.map(e=>[e.id,e]));
  for(const e of notes){
    e.sharedContactLock=doc.manual[e.id]??null;
    e.method.finger=doc.manual[e.id]??base[e.id]??null;
    e.method.fingering_source=e.method.finger==null?null:doc.manual[e.id]!=null?'user':doc.mode==='source'?'source':'engine';
  }
  for(const c of contacts(score).contacts){
    if(c.ids.length<2)continue;
    const groups=c.unisonGroups??c.ids.map(id=>[id]);
    const manual=c.ids.map(id=>doc.manual[id]).find(f=>f!=null);
    const finger=manual??c.ids.map(id=>base[id]).find(f=>f!=null)??null;
    for(const [head,...followers] of groups){
      for(const id of [head,...followers]){
        const e=byId.get(id);
        e.method.finger=finger;
        e.method.fingering_source=finger==null?null:manual!=null?'user':doc.mode==='source'?'source':'engine';
      }
      for(const id of followers)byId.get(id).sharedContactRepresentative=head;
    }
    if(groups.length>1){
      const first=byId.get(c.id), last=byId.get(groups.at(-1)[0]);
      first.continuousPerformance={attack:c.start,mainEnd:last.fermataPerformance?.mainEnd??c.end,
        end:c.end,trail:last.fermataPerformance?.trail??null,trailSegment:last.duration_quarters};
      for(const id of c.ids)if(id!==c.id)byId.get(id).sharedContactRepresentative=c.id;
    }
  }
  return score;
}
function validateDocument(doc, manual=doc.manual) {
  const run=runtimeFingerings.get(doc)??doc.run;
  const base=baseAssignments(doc);
  const cs=run?.contacts??contacts(doc.score,{manual:true,locks:manual}).contacts;
  const assign=Object.fromEntries(cs.map(c=>[c.id,
    c.ids.map(id=>manual[id]).find(f=>f!=null)??base[c.id]]));
  return validate(cs,assign,{profile:run?.profile,locks:manual,source:doc.mode==='source'?'source':'engine',
    rounds:doc.score.editor?.fermataTimeline?.rounds??doc.score.editor?.rounds});
}
function edit(doc,id,finger){if(!Number.isInteger(finger)||finger<1||finger>5)throw Error('Палец должен быть от 1 до 5');const cs=contacts(doc.score,{manual:true,locks:doc.manual}).contacts,c=cs.find(c=>c.ids.includes(id));if(!c)throw Error('Рука или исполнительский контакт не определены');const before=clone(doc.manual),after={...before};for(const x of c.ids)after[x]=finger;const effectiveAssign={...baseAssignments(doc),...after},assign=Object.fromEntries(cs.map(c=>[c.id,effectiveAssign[c.id]]));const check=validate(cs,assign);const ergonomic=validateDocument(doc,after);check.warnings.push(...ergonomic.warnings.filter(w=>w.rule));if(ergonomic.extensions)check.extensions=ergonomic.extensions;if(check.conflicts.length)return{accepted:false,check};return{accepted:true,check,before,after,ids:c.ids};}
function commit(doc,trial){if(!trial.accepted)throw Error('Rejected');doc.history=doc.history.slice(0,doc.cursor);doc.history.push({before:trial.before,after:trial.after,ids:trial.ids,timestamp:new Date().toISOString(),engine:doc.run.version,profile:doc.run.profile.version});doc.cursor=doc.history.length;doc.manual=trial.after;doc.revision++;return doc;}
const dbPromise=()=>new Promise((resolve,reject)=>{const req=indexedDB.open('play12-editor',1);req.onupgradeneeded=()=>req.result.createObjectStore('compositions',{keyPath:'id'});req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);});
const Store={async get(id){const db=await dbPromise();return new Promise((res,rej)=>{const tx=db.transaction('compositions'),r=tx.objectStore('compositions').get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);tx.oncomplete=()=>db.close();});},async list(){const db=await dbPromise();return new Promise((res,rej)=>{const tx=db.transaction('compositions'),r=tx.objectStore('compositions').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);tx.oncomplete=()=>db.close();});},async put(doc,expected){const db=await dbPromise();return new Promise((res,rej)=>{const tx=db.transaction('compositions','readwrite'),store=tx.objectStore('compositions'),r=store.get(doc.id);r.onsuccess=()=>{if(expected!=null&&r.result&&r.result.revision!==expected){tx.abort();return;}store.put(clone(doc));};tx.oncomplete=()=>{db.close();res();};tx.onabort=()=>{db.close();rej(Error('Конфликт ревизии или ошибка сохранения. Изменения не перезаписаны.'));};tx.onerror=()=>rej(tx.error);});}};
G.Play12Editor={VERSION,Q,hash,parseMusicXML,importXML,ARPEGGIO_SPREAD_QUARTERS,FERMATA_EXTENSION_FACTOR,realizeFermatas,realizeArpeggios,events,contacts,validate,validateDocument,sameScoreTiming,keyX,propose,setRuntimeFingering,effective,edit,commit,clone,Store};if(typeof module!=='undefined')module.exports=G.Play12Editor;
})(typeof window!=='undefined'?window:globalThis);
