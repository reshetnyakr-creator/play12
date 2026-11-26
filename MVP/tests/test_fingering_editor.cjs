const {test}=require('node:test'),assert=require('node:assert/strict');const E=require('../editor/core.js'),cfg=require('../editor/beginner.json');
const note=(id,key,start,duration,hand='R',ties=[])=>({id,kind:'note',hand,voice:'1',staff:hand==='R'?1:2,pitch:{midi:key,step:'C',octave:4,alter:0},editor_onset_q:start,duration_quarters:duration,editor_supported:true,ties,method:{finger:null},source_fingering:null});
const score=es=>({score:{parts:[{id:'P1',measures:[{events:es}]}]}});
test('exact rational thirds, negatives, normalization and zero denominator',()=>{assert.equal(new E.Q('1/3').add('2/3').toString(),'1/1');assert.equal(new E.Q('-6/8').toString(),'-3/4');assert.equal(new E.Q('1.25').toString(),'5/4');assert.throws(()=>new E.Q('1/0'));});
test('confirmed overlap rejected, assumed duration is warning, half-open endpoints do not overlap',()=>{const a={id:'a',ids:['a'],hand:'R',key:60,start:'0/1',end:'2/1',releaseBasis:'measured'},b={id:'b',ids:['b'],hand:'R',key:64,start:'1/1',end:'3/1',releaseBasis:'measured'};assert.equal(E.validate([a,b],{a:2,b:2}).conflicts.length,1);b.releaseBasis='assumed_score_duration';assert.equal(E.validate([a,b],{a:2,b:2}).warnings.length,1);b.start='2/1';assert.equal(E.validate([a,b],{a:2,b:2}).warnings.length,0);});
test('held contacts constrain later candidates, both hands independent resource',()=>{const s=score([note('a',60,'0','3'),note('b',64,'1','1'),note('c',48,'0','2','L')]),r=E.propose(s,cfg);assert.notEqual(r.assignments.a,r.assignments.b);assert.equal(r.assigned,3);assert.equal(r.validation.conflicts.length,0);assert.equal(E.validate(r.contacts,r.contactAssignments).warnings.filter(x=>x.code==='FINGER_OVERLAP').length,0);});
test('three-key chord uses distinct fingers and is input-order invariant',()=>{const ns=[note('a',60,'0','1'),note('b',64,'0','1'),note('c',67,'0','1')],a=E.propose(score(ns),cfg),b=E.propose(score(ns.slice().reverse()),cfg);assert.equal(new Set(Object.values(a.assignments)).size,3);assert.deepEqual(a.assignments,b.assignments);});
test('tie continuation is one physical contact and one attack',()=>{const s=score([note('a',60,'0','1','R',['start']),note('b',60,'1','1','R',['stop'])]);const cs=E.contacts(s).contacts;assert.equal(cs.length,1);assert.equal(cs[0].end,'2/1');assert.equal(E.propose(s,cfg).assignments.a,E.propose(s,cfg).assignments.b);});
test('six simultaneous keys reported, no fake complete assignment',()=>{const r=E.propose(score([60,62,64,65,67,69].map((k,i)=>note('n'+i,k,'0','1'))),cfg);assert.equal(r.assigned,0);assert.equal(r.coverage,0);assert.equal(r.search_status,'partial');assert(r.warnings.some(w=>w.code==='NO_PATH_UNDER_CONTACT_ASSUMPTION'));});
test('manual locks survive recalc, invalid lock cannot create success',()=>{const s=score([note('a',60,'0','1'),note('b',62,'1','1')]);assert.equal(E.propose(s,cfg,{a:4}).assignments.a,4);assert.equal(E.propose(s,cfg,{a:9}).assigned,0);});
test('manual target-only transaction and undo/redo snapshots preserve music',()=>{const s=score([note('a',60,'0','1'),note('b',62,'1','1')]),before=JSON.stringify(s),d={score:s,run:E.propose(s,cfg),mode:'engine',manual:{},history:[],cursor:0,revision:1};const b=d.run.assignments.b;const trial=E.edit(d,'a',5);assert(trial.accepted);E.commit(d,trial);assert.equal(E.effective(d).score.parts[0].measures[0].events[1].method.finger,b);assert.equal(JSON.stringify(s),before);assert.equal(d.history.length,1);assert.deepEqual(d.history[0].before,{});assert.throws(()=>E.edit(d,'a',6));});
test('unknown hand and unsupported technique remain unassigned with partial coverage',()=>{const s=score([note('a',60,'0','1'),note('b',62,'1','1',null)]);s.score.parts[0].measures[0].events[1].editor_supported=false;const r=E.propose(s,cfg);assert.equal(r.assigned,1);assert.equal(r.coverage,.5);assert.equal(r.feasibility,'unknown');});
test('deterministic assignments, bounded detailed log, experimental factors explicit',()=>{const s=score([note('a',61,'0','1'),note('b',63,'1','1'),note('c',67,'2','1')]);const a=E.propose(s,cfg,{},true),b=E.propose(s,cfg);assert.deepEqual(a.assignments,b.assignments);assert(a.details.length<=cfg.diagnostics.maxDetails);assert.equal(a.ranking_status,'experimental_config');assert.equal(a.profile.geometry.calibrated,false);});

test('long two-hand score assigns the last supported notes within the default budget', () => {
  const notes = Array.from({length: 440}, (_, i) => [
    note('r'+i, 60+i%7, String(i), '2'),
    note('l'+i, 40+i%5, String(i), '1', 'L')
  ]).flat();
  const run = E.propose(score(notes), cfg, {r0: 2});
  assert.equal(run.assignments.r0, 2);
  assert.equal(run.assigned, notes.length);
  assert.equal(run.coverage, 1);
  assert(!['budget_exhausted', 'partial'].includes(run.search_status));
  assert(run.assignments.r439 && run.assignments.l439);
  assert.equal(run.validation.conflicts.length, 0);
  assert(!run.validation.warnings.some(x => x.code === 'FINGER_OVERLAP'));
});

test('Interstellar measure 33: repeated held key is unresolved and search resumes with surviving contacts', () => {
  const held = [41, 48, 53].map((key, i) => note('held' + i, key, '96', '3', 'L'));
  held.push(note('sustain', 40, '95', '6', 'L'));
  const attacks = [53, 60, 65].map((key, i) => ({
    ...note('attack' + i, key, '97', '2', 'L'), voice: '2'
  }));
  const following = note('next', 55, '99', '1', 'L');
  const right = note('right', 73, '97', '3');
  const input = score([...held, ...attacks, following, right]);
  const snapshot = JSON.stringify(input);
  const {comfortSpan,octaveFingers,...legacy}=cfg;
  const run = E.propose(input, legacy, { sustain: 3 });
  assert.equal(run.contacts.length, 9);
  assert.equal(run.assignments.sustain, 3);
  assert(held.every(n => run.assignments[n.id] != null));
  for (const n of attacks) {
    assert.equal(run.assignments[n.id], null);
    assert.equal(run.unassignedReasons[n.id], 'MODEL_CONFLICT_UNRESOLVED_KEY');
  }
  assert(run.assignments.next);
  assert.notEqual(run.assignments.next, 3);
  assert.equal(run.assignments.right, E.propose(score([right]), cfg).assignments.right);
  assert.equal(run.validation.conflicts.length, 0);
  assert(!run.validation.warnings.some(w => w.code === 'FINGER_OVERLAP'));
  assert.equal(run.warnings.find(w => w.reason === 'MODEL_CONFLICT_UNRESOLVED_KEY').releaseBoundary, '99/1');
  assert.deepEqual(E.propose(input, legacy, { sustain: 3 }).assignments, run.assignments);
  const beginner=E.propose(input,cfg,{sustain:3});
  assert.equal(beginner.assignments.sustain,3);
  assert.equal(beginner.validation.conflicts.length,0);
  assert(held.slice(0,3).every(n=>beginner.unassignedReasons[n.id]==='NO_PATH_UNDER_BEGINNER_CONSTRAINTS'));
  assert.equal(beginner.warnings.find(w=>w.reason==='NO_PATH_UNDER_BEGINNER_CONSTRAINTS')?.diagnosis,
    'NO_LOCAL_SHAPE_WITH_CURRENT_CONTACTS');
  assert.equal(JSON.stringify(input), snapshot);
});

test('multiple local failures at beginning, middle and end preserve feasible material', () => {
  const chord = (start, size) => Array.from({ length: size }, (_, i) =>
    note(start + ':' + i, 60 + i, start, '1'));
  const bridge = note('bridge', 75, '1/2', '2');
  const five = chord('3', 5);
  const other = note('other', 45, '5', '1', 'L');
  const run = E.propose(score([...chord('0', 6), bridge, ...five, ...chord('5', 6),
    ...chord('6', 1), ...chord('7', 6), other]), cfg);
  assert.equal(run.unassignedReasons.bridge, 'RECOVERY_PENDING_RELEASE');
  assert.equal(new Set(five.map(n => run.assignments[n.id])).size, 5);
  assert(five.every(n => run.assignments[n.id] != null));
  assert(run.assignments['6:0']);
  assert(run.assignments.other);
  assert.equal(run.warnings.filter(w => w.reason === 'NO_FEASIBLE_ASSIGNMENT').length, 3);
  assert.equal(run.validation.conflicts.length, 0);
});

test('time and candidate budgets are reported separately', () => {
  const input = score([note('first', 60, '0', '1'), note('second', 62, '1', '1')]);
  const limited = (key, value) => E.propose(input, { ...cfg, search: { ...cfg.search, [key]: value } });
  const timeout = limited('maxMilliseconds', -1);
  assert.equal(timeout.search_status, 'budget_exhausted');
  assert.deepEqual({ ...timeout.unassignedReasons }, {first: 'TIME_LIMIT', second: 'TIME_LIMIT'});
  const narrow = { ...cfg, search: { ...cfg.search, maxCandidatesPerLayer: 1 } };
  const chord = score([note('lower', 60, '0', '1'), note('upper', 64, '0', '1'),
    note('following', 67, '1', '1')]);
  const exhausted = E.propose(chord, narrow, { lower: 1, upper: 1 });
  assert.equal(exhausted.unassignedReasons.lower, 'SEARCH_EXHAUSTED');
  assert.equal(exhausted.unassignedReasons.upper, 'SEARCH_EXHAUSTED');
  assert(exhausted.assignments.following);
  const invalid = E.propose(input, narrow, { first: 9 });
  assert.equal(invalid.unassignedReasons.first, 'INVALID_LOCK');
  assert.equal(invalid.unassignedReasons.second, 'NOT_PROCESSED');
});

test('simultaneous unison shares a contact while a later attack stays separate', () => {
  const first = note('first', 64, '0', '1');
  const second = { ...note('second', 64, '0', '1'), voice: '2', stem:'up' };
  const next = note('next', 64, '1', '1');
  const run = E.propose(score([first, second, next]), cfg);
  assert.equal(run.contacts.length, 2);
  assert.deepEqual(run.contacts[0].unisonGroups,[['second','first']]);
  assert.equal(run.assignments.first,run.assignments.second);
  assert.equal(run.assigned,3);
});

test('three compatible voices map to one contact and one editable representative', () => {
  const notes = [1,2,3].map(i=>({...note('n'+i,64,'0','1'),voice:String(i),
    staff:2,stem:i===2?'up':'down'}));
  const input=score(notes);
  const run=E.propose(input,cfg,{n3:4});
  assert.equal(run.contacts.length,1);
  assert.deepEqual(run.contacts[0].unisonGroups,[['n2','n1','n3']]);
  assert.deepEqual(Object.values(run.assignments),[4,4,4]);
  assert.equal(run.validation.warnings.length,0);
  const doc={score:input,run,mode:'engine',manual:{},history:[],cursor:0,revision:1};
  const edited=E.edit(doc,'n2',3);
  assert(edited.accepted);
  E.commit(doc,edited);
  assert.equal(doc.history.length,1);
  assert.deepEqual(doc.manual,{n1:3,n2:3,n3:3});
  const restored=E.clone(doc);
  const visible=E.events(E.effective(restored));
  assert.deepEqual(visible.filter(e=>!e.sharedContactRepresentative).map(e=>e.id),['n2']);
  assert(visible.every(e=>e.method.finger===3));
  restored.manual=restored.history[0].before;
  assert(E.events(E.effective(restored)).every(e=>e.method.finger===4));
  restored.manual=restored.history[0].after;
  assert(E.events(E.effective(restored)).every(e=>e.method.finger===3));
  assert(notes.every(e=>!('sharedContactRepresentative' in e)));
});

test('same pitch stays separate for unrelated or conflicting performances', () => {
  const first={...note('a',64,'0','2'),voice:'1'};
  const twin={...note('b',64,'0','2'),voice:'2'};
  for(const change of [
    {voice:'1'}, {hand:'L'}, {editor_onset_q:'1'}, {duration_quarters:'1'},
    {articulations:['staccato']}, {ties:['stop']}, {unisonSpecial:true}, {unisonTiming:['2',null,null]}
  ]) {
    assert.equal(E.contacts(score([first,{...twin,...change}])).contacts.length,2);
  }
  assert.equal(E.contacts(score([{...first,source_fingering:2},{...twin,source_fingering:3}])).contacts.length,2);
  assert.equal(E.contacts(score([first,twin]),{locks:{a:2,b:3}}).contacts.length,2);
  const split=score([first]);
  split.score.parts.push({id:'P2',measures:[{events:[twin]}]});
  assert.equal(E.contacts(split).contacts.length,2);
});

test('aligned tie chains share a contact and preserve separate representatives per segment',()=>{
  const chain = (id,voice,stem) => [
    {...note(id+'a',64,'0','1','R',['start']),voice,stem},
    {...note(id+'b',64,'1','1','R',['stop']),voice,stem}
  ];
  const input=score([...chain('x','1','down'),...chain('y','2','up'),note('z',67,'0','1')]);
  const run=E.propose(input,cfg);
  assert.equal(run.contacts.length,2);
  assert.deepEqual(run.contacts.find(c=>c.id==='ya').unisonGroups,[['ya','xa'],['yb','xb']]);
  assert.equal(run.assigned,5);
  assert.equal(run.assignments.xb,run.assignments.ya);
  assert.notEqual(run.assignments.z,run.assignments.ya);
});
