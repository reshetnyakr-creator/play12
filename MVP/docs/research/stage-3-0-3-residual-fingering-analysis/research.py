"""Isolated interval-frontier DP, no dependency on production search."""
import csv
import hashlib
import itertools
import json
import resource
import sys
from collections import Counter
from fractions import Fraction as Q
from pathlib import Path
from time import perf_counter


def valid_pair(a,b,f,g,profile,disable):
    if a['key']==b['key'] and 'ownership' not in disable:
        return False
    if a['hand']!=b['hand']:
        return True
    if f==g:
        return False
    low,high=(f,g) if a['key']<b['key'] else (g,f)
    gap=abs(a['key']-b['key'])
    if 'octave' not in disable and gap==12 and (low,high)!=((1,5) if a['hand']=='R' else (5,1)):
        return False
    return 'span' in disable or gap<=profile['practicalSpan'][f'{min(f,g)}-{max(f,g)}']


def overlap(a,b):
    return a['lo']<b['hi'] and b['lo']<a['hi']


def intersecting(contacts):
    held=[]
    for n in sorted(contacts,key=lambda c:(c['lo'],c['id'])):
        held=[c for c in held if c['hi']>n['lo']]
        yield n,held
        held.append(n)


def prepare(run):
    return [dict(c,lo=Q(c['start']),hi=Q(c['end']),base=run['contactAssignments'].get(c['id']) or 0)
            for c in run['contacts']]


def edge(a,b):
    return a['hand']==b['hand'] or a['key']==b['key']


def components(contacts):
    links={c['id']:{c['id']} for c in contacts}
    for c,held in intersecting(contacts):
        for a in held:
            if edge(a,c):
                links[c['id']].add(a['id'])
                links[a['id']].add(c['id'])
    by_id={c['id']:c for c in contacts}
    seen=set()
    for c in contacts:
        if c['id'] in seen:
            continue
        stack=[c['id']]
        group=[]
        while stack:
            id=stack.pop()
            if id in seen:
                continue
            seen.add(id)
            group.append(by_id[id])
            stack.extend(sorted(links[id]-seen,reverse=True))
        yield sorted(group,key=lambda a:(a['lo'],a['id']))


def frontier(group, movable, profile, disable=(), budget=1500000):
    state={():((0,0,0,0),())}
    active=[]
    count=peak=0
    for c in group:
        keep=[i for i,a in enumerate(active) if a['hi']>c['lo']]
        active=[active[i] for i in keep]
        next_state={}
        options=(0,c['base']) if c['base'] and c['id'] not in movable else range(6)
        for key,(score,path) in state.items():
            retained=tuple(key[i] for i in keep)
            for f in options:
                count+=1
                if count>budget:
                    return None,count,peak
                pair=[(a,g) for a,g in zip(active,retained) if f and g and edge(a,c)]
                if any(not valid_pair(a,c,g,f,profile,disable) for a,g in pair):
                    continue
                extra=[max(0,abs(c['key']-a['key'])-profile['comfortSpan'][f'{min(f,g)}-{max(f,g)}'])
                       for a,g in pair if a['hand']==c['hand']]
                value=(score[0]+bool(f)*len(c['ids']),score[1]-bool(c['base'] and f!=c['base']),
                       score[2]-sum(x>0 for x in extra),score[3]-sum(extra))
                updated=retained+(f,)
                if updated not in next_state or value>next_state[updated][0]:
                    next_state[updated]=(value,path+(f,))
        state=next_state
        active.append(c)
        peak=max(peak,len(state))
    score,path=max(state.values())
    return dict(zip((c['id'] for c in group),path)),count,peak


def audit(contacts, fingers, profile, disable=()):
    # Independent pair enumeration rather than using the frontier traversal.
    problems=[]
    for a,b in itertools.combinations(contacts,2):
        f,g=fingers.get(a['id'],0),fingers.get(b['id'],0)
        if not f or not g or not edge(a,b) or not overlap(a,b):
            continue
        gap=abs(a['key']-b['key'])
        code=None
        if gap==0 and 'ownership' not in disable:
            code='same_key'
        elif a['hand']==b['hand']:
            order=(f,g) if a['key']<b['key'] else (g,f)
            if f==g:
                code='same_finger'
            elif gap==12 and 'octave' not in disable and order!=((1,5) if a['hand']=='R' else (5,1)):
                code='octave'
            elif 'span' not in disable and gap>profile['practicalSpan'][f'{min(f,g)}-{max(f,g)}']:
                code='span'
        if code:
            problems.append({'ids':[a['id'],b['id']],'type':code,'hands':[a['hand'],b['hand']],
                             'midi':[a['key'],b['key']],'overlap':[str(max(a['lo'],b['lo'])),str(min(a['hi'],b['hi']))]})
    return problems


def experiment(contacts, profile, mode, disable=()):
    t=perf_counter()
    status='exact'
    fingers={}
    count=peak=0
    for group in components(contacts):
        residual=[c for c in group if not c['base']]
        fixes={c['id']:c['base'] for c in group}
        if not residual and not audit(group,fixes,profile,disable):
            fingers.update(fixes)
            continue
        if mode=='B01':
            movable=set()
        elif mode=='B02':
            movable={a['id'] for a in group if any(a['lo']==b['lo'] for b in residual)}
        elif mode=='B03':
            movable={a['id'] for a in group if any(overlap(a,b) for b in residual)}
        else:
            movable=set(fixes)
        solution,steps,high=frontier(group,movable,profile,disable)
        count+=steps
        peak=max(peak,high)
        if solution is None:
            status='budget_exhausted'
            solution,_,_=frontier(group,set(),profile,disable)
            if solution is None:
                solution={}
        fingers.update(solution)
    problems=audit(contacts,fingers,profile,disable)
    assert not problems,problems[:3]
    gained=[c for c in contacts if not c['base'] and fingers.get(c['id'])]
    dropped=[c for c in contacts if c['base'] and not fingers.get(c['id'])]
    changed=[c for c in contacts if c['base'] and fingers.get(c['id']) not in (0,None,c['base'])]
    summary=dict(assigned=sum(len(c['ids']) for c in contacts if fingers.get(c['id'])),
                 gained=sum(len(c['ids']) for c in gained),dropped=sum(len(c['ids']) for c in dropped),
                 changed=len(changed),states=count,peak_frontier=peak,milliseconds=round((perf_counter()-t)*1000),
                 rss_peak_kib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,status=status)
    return summary,fingers


def save_csv(path,rows):
    if not rows:
        return
    with path.open('w',newline='',encoding='utf8') as f:
        writer=csv.DictWriter(f,rows[0].keys(),lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def main(source,dest):
    summary={}
    reassignment=[]
    sensitivity=[]
    model=[]
    patterns=Counter()
    for file in sorted(source.glob('*-0.json')):
        d=json.loads(file.read_text())
        run=d['run']
        name='time' if 'hans-zimmer-time' in file.name else 'no-surprises' if 'surprises' in file.name else file.name.split('.')[0]
        contacts=prepare(run); profile=run['profile']
        base={c['id']:c['base'] for c in contacts}
        baseline=audit(contacts,base,profile)
        item=summary[name]={'before':run['assigned'],'total':run['total'],'baseline_conflicts':baseline,
            'input_sha256':d['sourceHash'],'baseline_map_hash':hashlib.sha256(json.dumps(run['assignments'],sort_keys=True).encode()).hexdigest(),
            'unsupported_notes':run['total']-sum(len(c['ids']) for c in contacts)}
        if name not in ('time','no-surprises'):
            continue
        item['experiments']={}
        for mode in ('B01','B02','B03','B04','B05'):
            result, fingers=experiment(contacts,profile,mode)
            item['experiments'][mode]=result
            reassignment.append({'composition':name,'mode':mode,**result})
        strict,fixed_fingers=experiment(contacts,profile,'B05')
        for disable in [('span',),('octave',),('ownership',),('span','octave'),('span','octave','ownership')]:
            result,_=experiment(contacts,profile,'B05',disable)
            sensitivity.append({'composition':name,'disabled':'+'.join(disable),**result})
        # A counterfactual release at the following distinct attack, with no change to the score.
        changes={}
        clipped=[]
        for c in contacts:
            attacks=[a['lo'] for a in contacts if a['key']==c['key'] and c['lo']<a['lo']<c['hi']]
            if attacks:
                changes[c['id']]=str(min(attacks))
            clipped.append(dict(c,hi=min(attacks)) if attacks else c)
        result,_=experiment(clipped,profile,'B05')
        model.append({'composition':name,'variant':'release_at_next_same_key_zero_gap','altered_contacts':len(changes),**result})
        item['release_counterfactual']=changes
        context={e['id']:(m,e) for part in d['score']['score']['parts'] for m in part['measures'] for e in m['events']}
        rows=[]
        for c in contacts:
            if c['base']:
                continue
            active=[a for a in contacts if a['id']!=c['id'] and a['base'] and overlap(a,c) and edge(a,c)]
            rejected={str(f):[a['id'] for a in active if not valid_pair(a,c,a['base'],f,profile,())] for f in range(1,6)}
            ownership=[a for a in active if a['key']==c['key']]
            impossible_span=[a for a in active if a['hand']==c['hand'] and abs(a['key']-c['key'])>max(profile['practicalSpan'].values())]
            if ownership:
                cause='C03' if any(a['hand']!=c['hand'] for a in ownership) else 'C02'
            elif impossible_span:
                cause='R01'
            else:
                cause='U01'
            patterns[(name,cause)]+=len(c['ids'])
            for id in c['ids']:
                m,e=context[id]
                rows.append(dict(composition=name,note_id=id,contact_id=c['id'],measure=m['number'],round=m['index']+1,
                    position=e['editor_onset_q'],hand=c['hand'],midi=c['key'],duration=e['duration_quarters'],
                    contact_interval=f"[{c['lo']},{c['hi']})",staff=e['staff'],voice=e['voice'],
                    ties=json.dumps(e['ties']),articulation=json.dumps(e['articulations']),source_fingering=e['source_fingering'],
                    original_status=run['unassignedReasons'][id],primary_cause=cause,
                    blocking_contacts=json.dumps([[a['id'],a['hand'],a['key'],a['start'],a['end'],a['base']] for a in active]),
                    ruled_out_by_finger=json.dumps(rejected),alternative_fingering=fixed_fingers.get(c['id']) or '',
                    reassignment_result='included_in_B05_witness' if fixed_fingers.get(c['id']) else 'outside_B05_witness',
                    changed_fingers=sum(a['base']!=fixed_fingers.get(a['id']) and fixed_fingers.get(a['id'],0)>0 for a in active),
                    contact_model_change='investigate_release' if ownership else '',
                    independent_validation='B05_witness_pair_checked'))
        assert len(rows)==run['total']-run['assigned']
        item['residual_reasons']=dict(Counter(r['original_status'] for r in rows))
        item['residual_hands']=dict(Counter(r['hand'] for r in rows))
        save_csv(dest/f'{name}-residual-analysis.csv',rows)
    save_csv(dest/'reassignment-experiments.csv',reassignment)
    save_csv(dest/'rule-sensitivity-analysis.csv',sensitivity)
    save_csv(dest/'contact-model-experiments.csv',model)
    save_csv(dest/'unique-problem-patterns.csv',[dict(composition=k[0],pattern_family=k[1],notes=v) for k,v in sorted(patterns.items())])
    (dest/'independent-validation.json').write_text(json.dumps(summary,indent=2)+'\n')


if __name__=='__main__':
    main(*map(Path,sys.argv[1:]))
