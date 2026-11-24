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
  const run = E.propose(input, cfg, { sustain: 3 });
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
  assert.deepEqual(E.propose(input, cfg, { sustain: 3 }).assignments, run.assignments);
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
  const exhausted = E.propose(input, { ...cfg, search: { ...cfg.search, maxCandidatesPerLayer: 1 } }, { first: 9 });
  assert.equal(exhausted.unassignedReasons.first, 'INVALID_LOCK');
  assert.equal(exhausted.unassignedReasons.second, 'NOT_PROCESSED');
});

test('simultaneous unison in different voices requires a shared-contact plan', () => {
  const first = note('first', 64, '0', '1');
  const second = { ...note('second', 64, '0', '1'), voice: '2' };
  const next = note('next', 64, '1', '1');
  const run = E.propose(score([first, second, next]), cfg);
  assert.equal(run.contacts.length, 3);
  assert.equal(run.unassignedReasons.first, 'MODEL_CONFLICT_UNRESOLVED_KEY');
  assert.equal(run.unassignedReasons.second, 'MODEL_CONFLICT_UNRESOLVED_KEY');
  assert(run.assignments.next);
});
