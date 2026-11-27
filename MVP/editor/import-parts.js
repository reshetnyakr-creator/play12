(function(G){
'use strict';

const keyboardName=/\b(?:pianos?|pianoforte|fortepiano|keyboards?|harpsichords?|clavichords?|clavinets?|celestas?|organs?|synthesizers?|synthesisers?|klavier|cembalo)\b|фортепиано|пианино|клавесин|钢琴|ピアノ/i;
const keyboardProgram=n=>n>=1&&n<=9||n>=17&&n<=21||n>=81&&n<=88;
const value=(node,selector)=>node?.querySelector(selector)?.textContent.trim()||'';

function inspect(dom){
  const definitions=new Map(Array.from(dom.querySelectorAll('part-list > score-part'),node=>[node.getAttribute('id'),node]));
  const ids=new Set();
  const parts=Array.from(dom.querySelectorAll('score-partwise > part'),node=>{
    const id=node.getAttribute('id');
    if(!id||ids.has(id))throw Error('Invalid MusicXML part ID');
    ids.add(id);
    const definition=definitions.get(id);
    const name=value(definition,'part-name');
    const instruments=Array.from(definition?.querySelectorAll('score-instrument')||[]);
    const instrumentNames=instruments.map(i=>value(i,'instrument-name')).filter(Boolean);
    const programs=Array.from(definition?.querySelectorAll('midi-instrument')||[],i=>Number(value(i,'midi-program'))).filter(n=>n>=1&&n<=128);
    const evidence=instruments.map(i=>value(i,'instrument-sound')).filter(Boolean).map(sound=>/^keyboard(?:\.|$)/i.test(sound));
    evidence.push(...programs.map(keyboardProgram));
    if([...instrumentNames,name].some(n=>keyboardName.test(n)))evidence.push(true);
    const kind=evidence.includes(true)?(evidence.includes(false)?'unknown':'keyboard'):evidence.length?'other':'unknown';
    return {id,name,instrument:[...new Set(instrumentNames)].join(' / ')||(kind==='keyboard'?name:''),kind,node,
      notes:Array.from(node.querySelectorAll('measure > note')).filter(note=>!note.querySelector('rest')).length,measures:node.querySelectorAll('measure').length,
      staves:Array.from(node.querySelectorAll('attributes > staves, note > staff')).reduce((n,s)=>Math.max(n,Number(s.textContent)||1),1)};
  });
  if(!parts.length)throw Error('No MusicXML parts found');
  const keyboards=parts.filter(part=>part.kind==='keyboard'&&part.notes);
  return {parts,automatic:keyboards.length===1?[keyboards[0].id]:null};
}

G.Play12ImportParts={inspect};
if(typeof module!=='undefined')module.exports=G.Play12ImportParts;
})(typeof window!=='undefined'?window:globalThis);
