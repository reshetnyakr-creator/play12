(function (G) {
'use strict';

// Research sidecar. Times are exact quarter-note coordinates. Calibration is
// supplied by the caller for the specific instrument, tempo and performer.
const { Q, contacts } = (typeof module !== 'undefined' ? require('./core.js') : G.Play12Editor);
const compare = (first, second) => new Q(first).cmp(second);

function damperWindows(part) {
  const entries = part.fermataPedals || part.pedals || [];
  const playback = entries.filter(event => event.source === 'sound' && event.kind === 'damper');
  if (!playback.length && entries.some(event => event.type === 'sostenuto' || Number(event.number) > 1)) {
    return []; // Ambiguous notation-only controller ownership.
  }
  const events = playback.length ? playback : entries.filter(event => event.source === 'notation');
  const windows = [];
  let start = null;
  for (const event of events) {
    const action = event.source === 'notation' ? event.type :
      ['yes', '100'].includes(event.value) ? 'start' : ['no', '0'].includes(event.value) ? 'stop' : 'unknown';
    if (['stop', 'change', 'unknown'].includes(action) && start !== null) {
      if (compare(start, event.at) < 0) windows.push({ start, end: event.at });
      start = null;
    }
    if (['start', 'change'].includes(action) && start === null) start = event.at;
  }
  // An open pedal indication provides no proven future release boundary.
  return windows;
}

function containingWindow(windows, at) {
  const point = new Q(at);
  let lo = 0, hi = windows.length;
  while (lo < hi) {
    const mid = (lo+hi) >>> 1;
    if (point.cmp(windows[mid].start) > 0) lo = mid+1;
    else hi = mid;
  }
  const window = windows[lo-1];
  return window && point.cmp(window.end) < 0 ? window : null;
}

function planContacts(score, { releases = {}, resetByKey = {}, minimumHoldByContact = {} } = {}, sourceContacts = contacts(score).contacts) {
  const parts = new Map();
  for (const part of score.score.parts) {
    const damper = damperWindows(part);
    for (const measure of part.measures) {
      for (const event of measure.events) parts.set(event.id, { event, damper, instrument: part.id });
    }
  }
  const issues = [];
  const actions = sourceContacts.map(contact => {
    const { event, damper, instrument } = parts.get(contact.id);
    const end = new Q(releases[contact.id] ?? contact.end).toString();
    const coverage = containingWindow(damper,end);
    if (end !== contact.end) {
      const min = minimumHoldByContact[contact.id];
      const unknown = min == null;
      const protectedContact = contact.fermata || contact.ids.length !== 1 || event.ties?.length ||
        event.articulations?.some(mark => mark !== 'staccato');
      const validBounds = compare(end, contact.start) > 0 && compare(end, contact.end) <= 0 &&
        !unknown && compare(new Q(end).sub(contact.start), min) >= 0;
      const coversNotation = coverage && compare(coverage.end, contact.end) >= 0;
      if (unknown || protectedContact || !validBounds || (!coversNotation && !event.articulations?.includes('staccato'))) {
        issues.push({code: unknown ? 'MINIMUM_HOLD_UNKNOWN' : 'RELEASE_NOT_SUPPORTED', id: contact.id});
        return { ...contact, instrument, notatedEnd: contact.end, soundEnd: null };
      }
    }
    return { ...contact, instrument, notatedEnd: contact.end, end,
      soundEnd: coverage?.end ?? end,
      soundBasis: 'idealized_damper_boundary',
      releaseBasis: end === contact.end ? contact.releaseBasis : 'explicit_release_plan' };
  });
  const byInstrumentKey = new Map();
  for (const action of actions) {
    const key = JSON.stringify([action.instrument, action.key]);
    const previous = byInstrumentKey.get(key);
    if (previous) {
      if (compare(previous.end, action.start) > 0) {
        issues.push({ code: 'KEY_OWNERSHIP_UNKNOWN', ids: [previous.id, action.id] });
      } else if (previous.releaseBasis === 'explicit_release_plan') {
        const reset = resetByKey[action.key];
        if (reset == null || compare(reset, 0) <= 0) {
          issues.push({ code: 'KEY_RESET_UNKNOWN', ids: [previous.id, action.id] });
        } else if (compare(new Q(action.start).sub(previous.end), reset) < 0) {
          issues.push({ code: 'KEY_RESET_INSUFFICIENT', ids: [previous.id, action.id] });
        }
      }
    }
    if (!previous || compare(action.end, previous.end) >= 0) byInstrumentKey.set(key, action);
  }
  return { actions, issues };
}

function groupBy(actions, keyFor) {
  const groups = new Map();
  for (const action of actions) {
    const key = keyFor(action);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(action);
  }
  return groups;
}

// Validate an explicit assignment using a transition oracle for this
// instrument and hand. The oracle receives the complete adjacent hand poses.
function validateFingers(actions, fingers, transition) {
  const issues = [];
  const hands = groupBy(actions, action => action.hand);
  for (const handActions of hands.values()) {
    const layers = groupBy(handActions, action => new Q(action.start).toString());
    const busy = new Map();
    let previous = null;
    for (const layer of layers.values()) {
      const held = [...busy.values()].filter(action => compare(action.end, layer[0].start) > 0);
      const pose = [...held];
      for (const action of layer) {
        const finger = fingers[action.id];
        if (!Number.isInteger(finger) || finger < 1 || finger > 5) {
          issues.push({code:'INVALID_FINGER', id:action.id});
          continue;
        }
        const old = busy.get(finger);
        if (old && compare(old.end, action.start) > 0) {
          issues.push({code:'FINGER_OVERLAP', ids:[old.id, action.id]});
          continue;
        }
        const placed = {...action, finger};
        busy.set(finger, placed);
        pose.push(placed);
      }
      const status = transition?.({ previous, pose, at:layer[0].start });
      if (status !== true) issues.push({code:status === false ? 'TRANSITION_REJECTED' : 'TRANSITION_UNKNOWN',
        ids:layer.map(action => action.id)});
      previous = pose;
    }
  }
  return issues;
}

const api = { damperWindows, planContacts, validateFingers };

if (typeof module !== 'undefined') module.exports = api;
else G.Play12ContactPlan = api;
})(globalThis);
