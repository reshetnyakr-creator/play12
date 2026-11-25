'use strict';

const { Q, contacts, propose } = require('./core.js');
const { planContacts, validateFingers } = require('./contact-plan.cjs');

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

module.exports = {reference,keyGeometry,elapsedMs,evaluateTransition,proposeWithTransitions};
