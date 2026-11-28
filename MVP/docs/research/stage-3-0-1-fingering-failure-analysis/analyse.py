"""Independent enumeration of simultaneous and sustained finger placements."""
import collections
import csv
import hashlib
import itertools
import json
from fractions import Fraction
from pathlib import Path
import sys

KEYS = ('time', 'no-surprises')
PATTERNS = ('hans-zimmer-time*', 'radiohead-no-surprises*')
FINGERS = tuple(range(1, 6))
SOLF = ('C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B')


def q(value):
    return Fraction(value)


def pair(a, b, fa, fb, limits, octave=True):
    if fa == fb:
        return 'occupied'
    if a['key'] == b['key']:
        return 'same_key'
    if a['key'] > b['key']:
        return pair(b, a, fb, fa, limits, octave)
    distance = b['key'] - a['key']
    if distance == 12 and octave and (fa, fb) != ((1, 5) if a['hand'] == 'R' else (5, 1)):
        return 'octave'
    if distance > limits[f'{min(fa, fb)}-{max(fa, fb)}']:
        return 'span'
    return None


def shapes(contacts, limits, octave=True):
    return sum(
        not any(pair(a, b, fingers[i], fingers[j], limits, octave)
                for (i, a), (j, b) in itertools.combinations(enumerate(contacts), 2))
        for fingers in itertools.permutations(FINGERS, len(contacts))
    )


def recover(contacts, assigned, limits, fixed=False):
    """Maximize restored note segments while keeping every existing assigned contact.
    Preserve the finger on each held contact. Older finger choices may change.
    """
    active = []
    states = {(): (0, 0, 0, (), ())}
    for at, group in itertools.groupby(contacts, lambda c: q(c['start'])):
        for c in group:
            keep = [i for i, a in enumerate(active) if q(a['end']) > at]
            previous = [active[i] for i in keep]
            next_states = {}
            optional = c['id'] not in assigned
            for current, (notes, unchanged, count, restored, changed) in states.items():
                held = tuple(current[i] for i in keep)
                candidates = (0,) + FINGERS if optional else (assigned[c['id']],) if fixed else FINGERS
                for finger in candidates:
                    if finger and any(f and pair(a, c, f, finger, limits)
                                      for a, f in zip(previous, held)):
                        continue
                    edit = not optional and finger != assigned[c['id']]
                    value = (notes + (len(c['ids']) if optional and finger else 0),
                             unchanged - edit, count + bool(optional and finger),
                             restored + (((c['id'],finger),) if optional and finger else ()),
                             changed + (((c['id'],finger),) if edit else ()))
                    key = held + (finger,)
                    if key not in next_states or value > next_states[key]:
                        next_states[key] = value
            active = previous + [c]
            states = next_states
    return max(states.values(), default=None)


def analyse(data, destination, name):
    run, score = data['run'], data['score']
    contacts = run['contacts']
    assigned = {key: value for key, value in run['contactAssignments'].items() if value}
    practical = run['profile']['practicalSpan']
    comfort = run['profile']['comfortSpan']
    timing = score['editor']['rounds']
    events = {e['id']: (e, m['number'])
              for part in score['score']['parts'] for m in part['measures']
              for e in m['events'] if e.get('pitch')}
    contact_map = {note: c for c in contacts for note in c['ids']}
    graphics = {}
    for item in data['display']:
        graphics.setdefault(item['id'], item)
    records = {}
    summary = {'groups': [], 'recovery': {}, 'fixed_finger_recovery': {}}
    for hand in ('L','R'):
        hand_contacts = sorted((c for c in contacts if c['hand'] == hand),
                               key=lambda c:(q(c['start']), c['key'], c['id']))
        recovery = recover(hand_contacts, assigned, practical)
        summary['recovery'][hand] = recovery
        summary['fixed_finger_recovery'][hand] = recover(hand_contacts, assigned, practical, fixed=True)
        if recovery:
            witness = assigned | dict(recovery[3]) | dict(recovery[4])
            held = []
            for contact in hand_contacts:
                finger = witness.get(contact['id'])
                if not finger:
                    continue
                held = [other for other in held if q(other['end']) > q(contact['start'])]
                assert all(not pair(other, contact, witness[other['id']], finger, practical) for other in held)
                held.append(contact)
        boundary, trigger = None, None
        for at, iterator in itertools.groupby(hand_contacts, lambda c:q(c['start'])):
            group = list(iterator)
            missing = [c for c in group if c['id'] not in assigned]
            if not missing:
                continue
            active = [c for c in hand_contacts if c['id'] in assigned and q(c['start']) < at < q(c['end'])]
            layer = active + group
            code = run['unassignedReasons'][missing[0]['ids'][0]]
            local = {label:shapes(layer, limit, octaves) for label, limit, octaves in (
                ('comfortable',comfort,True), ('practical',practical,True), ('without_octave',practical,False))}
            blockers = [c for c in active if any(a['key'] == c['key'] for a in group)]
            if code == 'RECOVERY_PENDING_RELEASE':
                cause = 'C19'
            elif code == 'TIME_LIMIT':
                cause = 'C15'
                trigger = None
            elif len({c['key'] for c in layer}) < len(layer):
                cause = 'C03' if blockers else 'C10'
            elif len(layer) > 5:
                cause = 'C01'
            elif local['practical']:
                cause = 'C14' if code in ('SEARCH_EXHAUSTED', 'NO_PATH_UNDER_BEGINNER_CONSTRAINTS') else 'C20'
            elif local['without_octave']:
                cause = 'C06'
            else:
                cause = 'C05'
            if code != 'RECOVERY_PENDING_RELEASE':
                trigger = '+'.join(c['id'] for c in missing)
                boundary = max([q(c['end']) for c in missing + blockers])
            key = f'{hand}@{at}'
            summary['groups'].append({'id':key,'engine':code,'cause':cause,'trigger':trigger,
                 'boundary_before_extension':str(boundary),'shapes':local,
                 'active':[c['id'] for c in active],'attack':[c['id'] for c in group]})
            if code == 'RECOVERY_PENDING_RELEASE':
                boundary = max([boundary or at] + [q(c['end']) for c in missing])
            for c in missing:
                others = [a for a in layer if a['id'] != c['id']]
                rejected = {f:[f"{a['id']}:{reason}" for a in active
                             if (reason := pair(a, c, assigned[a['id']], f, practical))]
                            for f in FINGERS}
                for note in c['ids']:
                    records[note] = {'group':key,'error':code,'cause':cause,'trigger':trigger,
                      'competing_contacts':[[a['id'],a['key'],a['end'],assigned.get(a['id'])] for a in others],
                      'free_fingers':sorted(set(FINGERS)-{assigned[a['id']] for a in active}),
                      'rejected_against_final_active':rejected,'shapes':local}
    rows = []
    recovered = {contact for val in summary['recovery'].values() if val for contact, _ in val[3]}
    for note, error in sorted(run['unassignedReasons'].items(), key=lambda item: (q(events[item[0]][0]['editor_onset_q']),item[0])):
        e, measure = events[note]
        c = contact_map.get(note, {})
        onset = q(e['editor_onset_q'])
        midi = e['pitch']['midi']
        row = {'note_id':note,'contact_id':c.get('id'),'measure':measure,
               'round':next((i+1 for i,r in enumerate(timing) if q(str(r['start']))<=onset<q(str(r['end']))),None),
               'position_Q':str(onset),'hand':e['hand'],'voice':e['voice'],
               'pitch':f'{SOLF[midi%12]}{midi//12-1}','midi':midi,
               'duration_Q':e['duration_quarters'],
               'hold_Q':str(q(c['end'])-q(c['start'])) if c else None,
               'sound_Q':str(q(c.get('soundEnd') or c['end'])-q(c['start'])) if c else None,
               'tie':len(c.get('ids',[]))>1,'tie_marks':e['ties'],
               'pedal':c.get('pedalCoverage') or c.get('releaseBasis'),
               'recovery':'selected_in_exact_practical_optimum' if c.get('id') in recovered else 'not_selected_in_reported_optimum',
               **records.get(note,{'error':error,'cause':'C18' if not e['editor_supported'] else 'C20'}),
               'renderer':graphics.get(note),
               'renderer_contact_representative':graphics.get(c.get('id'),{}).get('id')}
        rows.append(row)
    columns = list(dict.fromkeys(k for row in rows for k in row))
    with (destination / f'{name}-unassigned-notes.csv').open('w',encoding='utf-8',newline='') as f:
        writer = csv.DictWriter(f,columns,lineterminator='\n')
        writer.writeheader()
        writer.writerows({k:json.dumps(v,ensure_ascii=False,separators=(',',':')) if isinstance(v,(list,dict)) else v
                          for k,v in row.items()} for row in rows)
    summary.update({'causes':dict(collections.Counter(row['cause'] for row in rows)),
                    'reasons':dict(collections.Counter(row['error'] for row in rows)),
                    'display_count':len(graphics),
                    'display_center_count':sum(100<=g['x'] and g['x']+g['width']<=132.000001 for g in graphics.values()),
                    'display_missing_source_segments':len(rows)-len(graphics),
                    'display_unique_x':sorted(set(g['x'] for g in graphics.values())),'contacts':len(contacts),'assigned_contacts':len(assigned),
                    'tied_contacts':sum(len(c['ids'])>1 for c in contacts),
                    'missing_tied_contacts':sum(len(c['ids'])>1 and c['id'] not in assigned for c in contacts),
                    'release_shifts':len(run.get('releaseShift',[])),
                    'warning_codes':dict(collections.Counter(w['code'] for w in run['warnings'])),
                    'solver_stats':run['stats'],'source_hash':data['sourceHash'],'source_counts':data['xml']})
    return summary


def payload(data):
    run = data['run']
    return {'events':[(e['id'],e['hand'],e.get('pitch'),e['editor_onset_q'],e['duration_quarters'])
                      for p in data['score']['score']['parts'] for m in p['measures'] for e in m['events'] if e.get('pitch')],
            'contacts':run['contacts'],'assignments':run['assignments'],'reasons':run['unassignedReasons']}


def brief(data):
    r=data['run']
    return dict(assigned=r['assigned'],total=r['total'],elapsed_ms=r['elapsed_ms'],status=r['search_status'],
                version=r['version'],fingerprint=hashlib.sha256(json.dumps(payload(data),sort_keys=True).encode()).hexdigest())


def main(current, older, controls, destination):
    results = {}
    for key, pattern in zip(KEYS,PATTERNS):
        attempts = [json.loads(p.read_text()) for p in sorted(current.glob(pattern+'-?.json'))]
        baseline = json.loads(next(older.glob(pattern+'-0.json')).read_text())
        assert attempts
        first = attempts[0]
        results[key] = analyse(first,destination,key)
        results[key].update(runs=[brief(a) for a in attempts],before=brief(baseline),
                            comparison={k:v==payload(baseline)[k] for k,v in payload(first).items()},
                            display_equal=first['display']==baseline['display'])
    results['controls'] = {p.stem:brief(json.loads(p.read_text())) for p in controls.glob('*.json')}
    (destination/'summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')


if __name__ == '__main__':
    main(*map(Path,sys.argv[1:]))
