(function (G) {
'use strict';

const { Q, contacts, propose } = (typeof module !== 'undefined' ? require('./core.js') : G.Play12Editor);
const { planContacts, validateFingers } = (typeof module !== 'undefined' ? require('./contact-plan.js') : G.Play12ContactPlan);

const reference = Object.freeze({whiteWidth: 23.5, blackWidth: 13, whiteDepth: 145,
  blackDepth: 95, blackHeight: 12, whiteContactDepth: 35, blackContactDepth: 105});
const offsets = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];

function keyGeometry(midi, geometry = reference) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new RangeError('Invalid MIDI key');
  const octave = Math.floor(midi / 12);
  const index = offsets[midi % 12];
  const black = !Number.isInteger(index);
  return {
    x: (octave * 7 + index) * geometry.whiteWidth,
    y: black ? geometry.blackContactDepth : geometry.whiteContactDepth,
    z: black ? geometry.blackHeight : 0,
    width: black ? geometry.blackWidth : geometry.whiteWidth,
    depth: black ? geometry.blackDepth : geometry.whiteDepth, black
  };
}

function elapsedMs(start, end, tempo) {
  const a = Number(new Q(start)), b = Number(new Q(end));
  if (!Array.isArray(tempo) || !tempo.length || b < a ||
      tempo.some((entry, index) => !Number.isFinite(entry.at) || !Number.isFinite(entry.bpm) ||
        entry.bpm <= 0 || (index && entry.at <= tempo[index - 1].at)) || tempo[0].at > a) return null;
  let total = 0;
  for (let i = 0; i < tempo.length && tempo[i].at < b; i++) {
    const left = Math.max(a, tempo[i].at);
    const right = Math.min(b, tempo[i + 1]?.at ?? b);
    if (right > left) total += (right - left) * 60000 / tempo[i].bpm;
  }
  return total;
}

function evaluateTransition(previous, next, {geometry, tempo, capability, resetMsByKey = {}} = {}) {
  const from = previous.map(contact => ({...contact, point:keyGeometry(contact.key, geometry ?? reference)}));
  const to = next.map(contact => ({...contact, point:keyGeometry(contact.key, geometry ?? reference)}));
  const center = pose => pose.reduce((sum, contact) => sum + contact.point.x, 0) / pose.length;
  const sameShape = from.length === to.length && from.every((c, i) => c.finger === to[i].finger);
  const distance = Math.abs(center(to) - center(from));
  const release = from.reduce((latest, contact) => latest.cmp(contact.end) >= 0 ? latest : new Q(contact.end),
    new Q(from[0].end)).toString();
  const at = to[0].start;
  const availableMs = elapsedMs(release, at, tempo);
  const requirements = capability?.({from, to, release, at});
  const minimumMs = requirements?.minimumMs;
  // Reset is parallel to movement after release. It is validated independently
  // by the contact planner. The capability must cover the whole hand pose.
  const repeats = to.flatMap(action => from.filter(contact => contact.key === action.key).map(contact => ({
    key:action.key, available:elapsedMs(contact.end, action.start, tempo), required:resetMsByKey[action.key]
  })));
  const resetUnknown = repeats.some(r => r.available == null || !Number.isFinite(r.required) || r.required <= 0);
  const resetRejected = repeats.some(r => r.available != null && Number.isFinite(r.required) && r.available < r.required);
  const status = resetRejected || new Q(release).cmp(at) > 0 || requirements?.poseAllowed === false ||
    (availableMs != null && Number.isFinite(minimumMs) && minimumMs > availableMs)
    ? 'constraint_violation'
    : resetUnknown || availableMs == null || !geometry || requirements?.poseAllowed !== true ||
      !Number.isFinite(minimumMs) || minimumMs < 0
      ? 'unknown' : 'conditionally_feasible';
  return {status, availableMs, distance, sameShape, repeats, from, to};
}

function* fingerings(layer) {
  // Simple monotone hand shapes, with no crossing or finger substitution.
  function* spread(prefix, remaining) {
    if (prefix.length === layer.length) {
      yield Object.fromEntries(layer.map((action, i) => [action.id,prefix[i]]));
      return;
    }
    for (let i = 0; i < remaining.length; i++) yield* spread([...prefix,remaining[i]], remaining.slice(i+1));
  }
  yield* spread([],layer[0].hand === 'L' ? [5,4,3,2,1] : [1,2,3,4,5]);
}

function searchTransition(score, request, layers) {
  const {firstIds, nextIds, releaseOptions = [], minimumHoldByContact, resetByKey, locks = {}} = request;
  const byId = new Map(layers.map(contact => [contact.id,contact]));
  const select = ids => ids.map(id => byId.get(id)).sort((a,b) => (a?.key ?? 0)-(b?.key ?? 0));
  const first = select(firstIds), next = select(nextIds);
  const hand = first[0]?.hand;
  if (!hand || !next.length || first.length > 5 || next.length > 5 ||
      new Set([...firstIds,...nextIds]).size !== first.length+next.length ||
      [...first,...next].some(c => !c || c.hand !== hand) ||
      [first,next].some(layer => layer.some(c => new Q(c.start).cmp(layer[0].start) !== 0)) ||
      new Q(first[0].start).cmp(next[0].start) >= 0) {
    return {status:'unknown', reason:'UNSUPPORTED_CHORD_PAIR'};
  }
  const scope = new Set([...firstIds,...nextIds]);
  // Only investigate isolated adjacent attack groups in this implementation.
  if (layers.some(c => !scope.has(c.id) && c.hand === hand &&
      new Q(c.end).cmp(first[0].start)>0 && new Q(c.start).cmp(next[0].start)<=0)) {
    return {status:'unknown', reason:'ADDITIONAL_HAND_CONTACT'};
  }
  const candidates = [];
  const rejected = [];
  // Bounded explicit release proposals are compared with the literal plan.
  for (const release of [null,...releaseOptions.slice(0,8)]) {
    const releases = release === null ? {} : Object.fromEntries(firstIds.map(id => [id,release]));
    const plan = planContacts(score,{releases,minimumHoldByContact,resetByKey},layers);
    const blockers = plan.issues.filter(issue => scope.has(issue.id) || issue.ids?.some(id => scope.has(id)));
    if (blockers.length) { rejected.push({release,blockers}); continue; }
    const planned = new Map(plan.actions.filter(c => scope.has(c.id)).map(c => [c.id,c]));
    const actions = [...first,...next].map(c => planned.get(c.id));
    for (const a of fingerings(first)) for (const b of fingerings(next)) {
      const fingers = {...a,...b};
      if (Object.entries(fingers).some(([id,finger]) => locks[id] != null && locks[id] !== finger)) continue;
      const placed = actions.map(action => ({...action,finger:fingers[action.id]}));
      const evaluation = evaluateTransition(placed.slice(0,first.length),placed.slice(first.length),request);
      const issues = validateFingers(actions,fingers,({previous}) => !previous || evaluation.status === 'conditionally_feasible');
      if (issues.length || evaluation.status !== 'conditionally_feasible') continue;
      candidates.push({release,fingers,evaluation,actions});
    }
  }
  candidates.sort((a,b) => Number(b.evaluation.sameShape)-Number(a.evaluation.sameShape) ||
    Number(a.release !== null)-Number(b.release !== null));
  return {status:candidates.length?'conditionally_feasible':'unknown', candidates,rejected};
}

// Explicit research entry point. The default browser Worker and saved
// fingerings are untouched; conditional candidates are returned separately.
function proposeWithTransitions(score, profile, requests = [], locks = {}) {
  const baseline = propose(score,profile,locks);
  if (!requests.length) return {baseline,transitions:[]};
  const layers = contacts(score).contacts;
  return {baseline,transitions:requests.slice(0,32).map(request => searchTransition(score,{...request,locks},layers))};
}

const defaults = Object.freeze({resetMs:60, releaseFraction:'1/2', maxTransfers:32, preferenceCost:4000});
const begin = c => new Q(c.start);
const end = c => new Q(c.end);

function proposeBeginner(score, profile, locks = {}, detailed = false, settings = defaults) {
  if (profile.id !== 'beginner' || !score.score.parts.some(p => p.pedals?.length)) {
    return propose(score,profile,locks,detailed);
  }
  const started = Date.now(), base = contacts(score,{locks});
  const releases = {}, preferred = {}, minimumHoldByContact = {}, resetByKey = {};
  const tempo = score.editor?.fermataTimeline?.tempoMap ?? score.editor?.tempoMap ?? [{at:0,bpm:score.editor?.tempo}];
  const referenceResets = new Proxy({}, {get:()=>settings.resetMs});
  const proposals = [];
  const byHand = groupByHand(base.contacts);
  for (const groups of byHand) {
    for (let i = 1; i < groups.length && proposals.length < settings.maxTransfers; i++) {
      if (Date.now()-started > profile.search.maxMilliseconds / 4) break;
      const previous = groups[i-1], next = groups[i], at = next[0].start;
      const repeated = next.length===1 ? previous.find(a=>a.key===next[0].key) : null;
      // A same-key single attack can release its own key while tied bass keys
      // remain held. The ordinary beam search still reserves those fingers.
      const stationary = Boolean(repeated);
      const first = stationary ? [repeated] : previous;
      if ((!stationary && first.length !== 3) || next.length > 3 ||
          !first.some(a => end(a).cmp(at)>0 && next.some(b => a.key===b.key)) ||
          first.some(a=>end(a).cmp(at)<=0 || a.ids.length!==1) ||
          new Set(next.map(a=>a.key)).size!==next.length) continue;
      const prior = groups.slice(0,i-1);
      if (!stationary && prior.some(group=>group.some(a=>end(a).cmp(first[0].start)>0))) continue;
      const interval = begin(next[0]).sub(first[0].start);
      const fraction = new Q(settings.releaseFraction);
      const release = begin(first[0]).add(new Q(interval.n*fraction.n,interval.d*fraction.d)).toString();
      const available = elapsedMs(release,at,tempo);
      if (available == null || available < settings.resetMs) continue;
      const shaped = stationary ? {first:[],next:[]} : bestSimpleShape(first,next,locks);
      if (!shaped) continue;
      const evaluation = stationary ? {status:'conditionally_feasible',availableMs:available} :
        evaluateTransition(shaped.first.map(a=>({...a,end:release})),shaped.next,
        {geometry:reference,tempo, resetMsByKey:referenceResets,
          capability:({from,to})=>({poseAllowed:[from,to].every(p=>p.at(-1).point.x-p[0].point.x<=7*reference.whiteWidth),
            minimumMs:0})});
      if (evaluation.status!=='conditionally_feasible') continue;
      for (const action of first) {
        releases[action.id]=release;
        minimumHoldByContact[action.id]=new Q(release).sub(action.start).toString();
        resetByKey[action.key]=interval.sub(new Q(release).sub(first[0].start)).toString();
      }
      proposals.push({first,next,shaped,release,evaluation,stationary});
    }
  }
  if (!proposals.length) return propose(score,profile,locks,detailed,{base,started,preferred});
  function plan() { return planContacts(score,{releases,resetByKey,minimumHoldByContact},base.contacts); }
  let resolved = plan();
  const affected = new Set(resolved.issues.flatMap(issue=>issue.ids??[issue.id]));
  for (const old of resolved.actions.filter(a=>releases[a.id])) {
    const repeat = resolved.actions.find(a=>a.instrument===old.instrument&&a.key===old.key&&begin(a).cmp(old.start)>0);
    if (repeat && !(elapsedMs(old.end,repeat.start,tempo)>=settings.resetMs)) affected.add(old.id);
  }
  const accepted = proposals.filter(p=>![...p.first,...p.next].some(a=>affected.has(a.id)));
  if (accepted.length!==proposals.length) {
    for (const p of proposals.filter(p=>!accepted.includes(p))) for (const a of p.first) delete releases[a.id];
    resolved = plan();
  }
  const acceptedIds = new Set(accepted.flatMap(p=>[...p.first,...p.next].map(a=>a.id)));
  if (resolved.issues.some(issue=>(issue.ids??[issue.id]).some(id=>acceptedIds.has(id)))) {
    return propose(score,profile,locks,detailed,{base,started,preferred});
  }
  for (const {shaped} of accepted) for (const a of [...shaped.first,...shaped.next]) preferred[a.id]=a.finger;
  const run = propose(score,profile,locks,detailed,{base,started,preferred,actions:resolved.actions,
    preferenceCost:settings.preferenceCost});
  run.releaseShift = accepted.map(p=>({status:'conditionally_feasible', strategy:p.stationary?'rearticulate':'release_shift', from:p.first.map(a=>a.id),
    to:p.next.map(a=>a.id), release:p.release, availableMs:p.evaluation.availableMs,
    matchedPreference:[...p.shaped.first,...p.shaped.next].every(a=>run.assignments[a.id]===a.finger)}));
  return run;
}

function groupByHand(contacts) {
  return ['L','R'].map(hand=>{
    const groups = new Map();
    for (const c of contacts.filter(c=>c.hand===hand).sort((a,b)=>begin(a).cmp(b.start)||a.key-b.key)) {
      if (!groups.has(c.start)) groups.set(c.start,[]);
      groups.get(c.start).push(c);
    }
    return [...groups.values()];
  });
}

function bestSimpleShape(first,next,locks) {
  const spread = [5,3,1];
  const options = group=>[...fingerings(group)].filter(f=>group.every(a=>locks[a.id]==null||locks[a.id]===f[a.id]))
    .map(f=>group.map(a=>({...a,finger:f[a.id]})));
  const pairs = options(first).flatMap(a=>options(next).map(b=>({first:a,next:b})));
  const ideal = first[0].hand==='L'?spread:[...spread].reverse();
  const cost = pair=>pair.first.reduce((sum,a,i)=>sum+Math.abs(a.finger-ideal[i]),0)+
    pair.next.reduce((sum,a,i)=>sum+(pair.next.length===3?Math.abs(a.finger-pair.first[i].finger)*2:0),0);
  return pairs.sort((a,b)=>cost(a)-cost(b))[0];
}

const api = {proposeBeginner,defaults,reference,keyGeometry,elapsedMs,evaluateTransition,proposeWithTransitions};

if (typeof module !== 'undefined') module.exports = api;
else G.Play12BeginnerTransition = api;
})(globalThis);
