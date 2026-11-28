'use strict';
const E = require('../../../editor/core');
const { Q } = E;
const overlap = (a,b) => new Q(a.start).cmp(b.end)<0 && new Q(b.start).cmp(a.end)<0;

function runWide(score, baseline, { locks = {}, frozen = [] } = {}) {
  const protectedEvents = new Set([...frozen, ...Object.keys(locks)]);
  const map = baseline.contactAssignments;
  const limit = baseline.profile.practicalSpan?.['1-5'];
  const waiting = baseline.contacts.filter(c=>map[c.id]==null);
  const reconsider = new Set(baseline.contacts.filter(c=>map[c.id]!=null &&
    !c.ids.some(id=>protectedEvents.has(id)) && waiting.some(n=>n.hand===c.hand &&
      Math.abs(n.key-c.key)>limit && overlap(c,n))).map(c=>c.id));
  // The isolated caller is the only entry point that enables the exception.
  return E.recoverPartial(score, baseline, locks, Date.now, { wideIntervals:true, reconsider });
}

function residualReasons(contact, contacts, map, profile, locks) {
  const neighbors = contacts.filter(c=>c.id!==contact.id && map[c.id]!=null && overlap(c,contact));
  return Object.fromEntries([1,2,3,4,5].map(finger=>{
    const issues = contact.ids.filter(id=>locks[id]!=null&&locks[id]!==finger)
      .map(id=>({id,rule:'R45_MANUAL_LOCK'}));
    for(const other of neighbors){
      const previous=map[other.id];
      if(contact.key===other.key)issues.push({id:other.id,rule:'R05_KEY_OWNERSHIP'});
      else if(contact.hand===other.hand&&finger===previous)
        issues.push({id:other.id,rule:'R04_FINGER_OCCUPIED'});
      else if(contact.hand===other.hand){
        const validation=E.validate([contact,other],{[contact.id]:finger,[other.id]:previous},
          {profile,experimentalWideIntervals:true});
        for(const conflict of validation.conflicts)issues.push({
          id:other.id,rule:conflict.code==='SPAN_VIOLATION'?'R07_R30_MAXPRAC':'R37_OCTAVE',
          midi:other.key,finger:previous,distance:conflict.distance,limit:conflict.practicalLimit
        });
      }
    }
    return [finger,issues];
  }));
}

module.exports = { runWide, residualReasons };
