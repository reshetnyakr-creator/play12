"""Verify recovery independently from production candidate generation."""
import csv
import hashlib
import json
from fractions import Fraction as Q
from pathlib import Path
from statistics import median
import sys


def intersects(a, b):
    return max(Q(a['start']), Q(b['start'])) < min(Q(a['end']), Q(b['end']))


def permissible(a, b, fa, fb, profile):
    if a['key'] == b['key']:
        return False
    if a['hand'] != b['hand']:
        return True
    if fa == fb:
        return False
    lower, upper = (fa, fb) if a['key'] < b['key'] else (fb, fa)
    span = abs(a['key'] - b['key'])
    if span == 12 and (lower, upper) != ((1, 5) if a['hand'] == 'R' else (5, 1)):
        return False
    return span <= profile['practicalSpan'][f'{min(fa,fb)}-{max(fa,fb)}']


def exact(before):
    """Absolute note maximum with assigned fingers fixed. Existing conflicts are grandfathered."""
    run = before['run']
    assigned = run['contactAssignments']
    frontier = {():0}
    active = []
    contacts = sorted(run['contacts'], key=lambda c:(Q(c['start']), c['id']))
    for new in contacts:
        kept = [i for i,c in enumerate(active) if Q(c['end']) > Q(new['start'])]
        active = [active[i] for i in kept]
        merged = {}
        known = assigned.get(new['id'])
        for state, count in frontier.items():
            current = tuple(state[i] for i in kept)
            for finger in (known,) if known else range(6):
                if finger and any(f and not (known and assigned.get(old['id']))
                                  and not permissible(old,new,f,finger,run['profile'])
                                  for old,f in zip(active,current)):
                    continue
                key = current+(finger,)
                merged[key] = max(merged.get(key,-1),count+(len(new['ids']) if finger and not known else 0))
        active.append(new)
        frontier = merged
    return max(frontier.values())


def verifier(before, after):
    a,b = before['run'],after['run']
    assert before['score'] == after['score']
    assert a['contacts'] == b['contacts']
    assert all(b['assignments'].get(id)==f for id,f in a['assignments'].items() if f)
    added = {c['id'] for c in b.get('recovery',{}).get('contacts',[])}
    recovery = b['contactAssignments']
    assigned = [c for c in b['contacts'] if recovery.get(c['id'])]
    bad = []
    active = []
    for y in sorted(assigned,key=lambda c:Q(c['start'])):
        active = [x for x in active if Q(x['end'])>Q(y['start'])]
        for x in active:
            if (x['id'] in added or y['id'] in added) and intersects(x,y) and not permissible(x,y,recovery[x['id']],recovery[y['id']],b['profile']):
                bad.append((x['id'],y['id']))
        active.append(y)
    expected = {c['id'] for c in assigned if not a['contactAssignments'].get(c['id'])}
    assert added == expected and len(b['validation']['conflicts'])==0
    assert all(all(b['assignments'].get(n)==recovery[c['id']] for n in c['ids']) for c in assigned)
    return bad


def write_registries(name, before, after, output):
    old,new = before['run'],after['run']
    details = {id:c for c in new['recovery']['contacts'] for id in c['notes']}
    contacts = {id:c for c in new['contacts'] for id in c['ids']}
    fields = ['composition','note_id','contact_id','measure','round','position_Q','hand','midi','duration_Q',
              'finger','original_status','method','ergonomic_status','independent_validation']
    rows={True:[],False:[]}
    for part in after['score']['score']['parts']:
        for m in part['measures']:
            for e in m['events']:
                id=e['id']
                if id not in old['unassignedReasons']:
                    continue
                c=contacts[id]
                d=details.get(id,{})
                rows[bool(d)].append(dict(zip(fields,[name,id,c['id'],m['number'],m['index']+1,e['editor_onset_q'],
                  c['hand'],c['key'],e['duration_quarters'],new['assignments'][id],old['unassignedReasons'][id],
                  d.get('method'),d.get('ergonomic'),'passed' if d else None])))
    for is_recovered,suffix in ((True,'recovered-notes'),(False,'remaining-unassigned')):
        with (output/f'{name}-{suffix}.csv').open('w',newline='') as f:
            writer=csv.DictWriter(f,fields,lineterminator='\n')
            writer.writeheader()
            writer.writerows(rows[is_recovered])


def timings(data):
    ms=[d['run']['elapsed_ms'] for d in data]
    return [min(ms),median(ms),max(ms)]


def fingerprint(data):
    run=data['run']
    return hashlib.sha256(json.dumps([run['assignments'],run['contacts']],sort_keys=True).encode()).hexdigest()


def load(root,prefix):
    return [json.loads(p.read_text()) for p in sorted(root.glob(prefix+'*-?.json'))]


def main(baseline,candidate,first_candidate,output):
    results={}
    for name,prefix in [('time','hans-zimmer'),('no-surprises','radiohead'),('interstellar','interstellar'),
                        ('creep','Creep'),('clocks','Clocks'),('pirate','HE_')]:
        a,b=load(baseline,prefix),load(candidate,prefix) or load(first_candidate,prefix)
        if not a or not b:
            results[name]={'status':'no_data'}
            continue
        for run in b:
            assert verifier(a[0],run)==[]
        r=b[0]['run']
        metrics={'before':a[0]['run']['assigned'],'after':r['assigned'],'total':r['total'],
                 'before_ms':timings(a),'after_ms':timings(b),'before_runs':len(a),'after_runs':len(b),
                 'baseline_stable':len(set(map(fingerprint,a)))==1,'deterministic':len(set(map(fingerprint,b)))==1,
                 'independent_conflicts':0,'changed_prior_fingers':0,'changed_contacts':0}
        if r.get('recovery'):
            witness=load(first_candidate,prefix)[0]
            violations=verifier(a[0],witness)
            metrics.update(maximum_additional=exact(a[0]),first_candidate_conflicts=violations,
                           recovered_contacts=len(r['recovery']['contacts']),states=r['recovery']['states'],
                           recovery_cpu_ms=[run['run']['recovery']['elapsed_ms'] for run in b],
                           rejection_counts=r['recovery']['rejected'],status=r['recovery']['status'])
            assert metrics['maximum_additional']==metrics['after']-metrics['before']
            write_registries(name,a[0],b[0],output)
        results[name]=metrics
    (output/'validation.json').write_text(json.dumps(results,indent=2)+'\n')


if __name__=='__main__':
    main(*map(Path,sys.argv[1:]))
