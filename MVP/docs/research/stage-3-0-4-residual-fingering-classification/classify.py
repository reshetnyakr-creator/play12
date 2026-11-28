"""Reproduce the strict witness and classify its residual contacts without changing it."""
import csv
import hashlib
import importlib.util
import json
from collections import Counter
from pathlib import Path
import sys

OLD=Path(__file__).resolve().parent.parent/'stage-3-0-3-residual-fingering-analysis'
spec=importlib.util.spec_from_file_location('stage303',OLD/'research.py')
research=importlib.util.module_from_spec(spec)
spec.loader.exec_module(research)
RULES={
 'G1': 'Пересечение одной клавиши между руками',
 'G2': 'Повтор удерживаемой клавиши той же рукой',
 'G3': 'Интервал выше MaxPrac для любой пары',
 'G4': 'Совместное ограничение пальцев, интервалов и октавы',
}
MODES={'G1':'Проверка снятия и переатаки между руками',
       'G2':'Проверка снятия и новой атаки внутри одной руки',
       'G3':'Проверка способа удержания и звучания, затем оценка профиля',
       'G4':'Проверка выбора совместимого подмножества и цены обмена назначений'}


def run(folder, dest):
    prior=json.loads((OLD/'results/independent-validation.json').read_text())
    rows=[]
    summary={}
    for pattern,name,count,total in [('hans-zimmer*','time',18,541),('radiohead*','no-surprises',34,1101)]:
        path,=folder.glob(pattern+'-0.json')
        data=json.loads(path.read_text())
        engine=data['run']
        fingerprint=hashlib.sha256(json.dumps(engine['assignments'],sort_keys=True).encode()).hexdigest()
        assert (fingerprint,data['sourceHash'])==(prior[name]['baseline_map_hash'],prior[name]['input_sha256'])
        contacts=research.prepare(engine)
        profile=engine['profile']
        result,map_=research.experiment(contacts,profile,'B05')
        delta=[dict(id=c['id'],before=c['base'],after=map_.get(c['id'],0)) for c in contacts if c['base']!=map_.get(c['id'],0)]
        assert delta==prior[name]['strict_witness_delta']
        assert not research.audit(contacts,map_,profile)
        assert result['status']=='exact'
        context={e['id']:(m,e) for part in data['score']['score']['parts'] for m in part['measures'] for e in m['events']}
        original=set(engine['unassignedReasons'])
        groups={c['id']:g for g in research.components(contacts) for c in g}
        for c in contacts:
            if map_.get(c['id']):
                continue
            active=[a for a in groups[c['id']] if a['id']!=c['id'] and map_.get(a['id']) and research.overlap(a,c)]
            rejected={f:[] for f in range(1,6)}
            flags=set()
            detail={}
            lower_constraints=set()
            for a in active:
                distance=abs(a['key']-c['key'])
                flags_here=set()
                if distance==0:
                    flags_here.add('G1' if a['hand']!=c['hand'] else 'G2')
                if a['hand']==c['hand'] and distance>max(profile['practicalSpan'].values()):
                    flags_here.add('G3')
                if a['hand']==c['hand'] and 0<distance<=max(profile['practicalSpan'].values()) and any(
                        not research.valid_pair(a,c,map_[a['id']],f,profile,()) for f in rejected):
                    lower_constraints.add('G4')
                for finger in rejected:
                    if not research.valid_pair(a,c,map_[a['id']],finger,profile,()):
                        rejected[finger].append(a['id'])
                flags.update(flags_here)
                detail[a['id']]=dict(hand=a['hand'],midi=a['key'],start=str(a['lo']),end=str(a['hi']),
                                     finger=map_[a['id']],groups=sorted(flags_here))
            assert all(rejected.values()),c['id']
            starts={a['id']:max(a['lo'],c['lo']) for a in active}
            blockage_at=max(min(starts[id] for id in ids) for ids in rejected.values())
            group=next((x for x in ('G1','G2','G3') if x in flags),'G4')
            possible_without_octave=any(all(research.valid_pair(a,c,map_[a['id']],f,profile,('octave',)) for a in active)
                                        for f in range(1,6))
            if group=='G4':
                flags.add(group)
            component=groups[c['id']]
            forced,_,_=research.frontier(component,{a['id'] for a in component},profile,required={c['id']})
            def coverage(mapping):
                return sum(len(a['ids']) for a in component if mapping.get(a['id']))
            assert forced
            margin=coverage(map_)-coverage(forced)
            component_id=min(a['id'] for a in component)
            for id in c['ids']:
                m,e=context[id]
                rows.append(dict(composition=name,event_id=id,contact_id=c['id'],measure=m['number'],onset=e['editor_onset_q'],
                    hand=c['hand'],midi=c['key'],voice=e['voice'],staff=e['staff'],duration=e['duration_quarters'],
                    contact_start=str(c['lo']),contact_end=str(c['hi']),tie_marks=json.dumps(e['ties']),
                    origin='original_62' if id in original else 'removed_from_stage_302',
                    prior_finger=c['base'] or '',strict_finger='',primary_group=group,secondary_groups='|'.join(sorted((flags|lower_constraints)-{group})),
                    all_fingers_blocked_by_Q=str(blockage_at),
                    obstacle=RULES[group],cause='Пересечение интервалов контакта с уже назначенными соседями',
                    reversal_without_octave_at_fixed_neighbors=possible_without_octave,
                    resolution_hypothesis=MODES[group],loss_if_contact_required=margin,component_id=component_id,
                    contact_evidence=json.dumps(detail,ensure_ascii=False),blocked_by_finger=json.dumps(rejected)))
        current=[r for r in rows if r['composition']==name]
        assert len(current)==count and result['assigned']==total-count
        summary[name]={'input_hash':data['sourceHash'],'baseline_fingering_sha256':fingerprint,
                 'total':total,'stage302':engine['assigned'],'strict':result['assigned'],
                 'added_to_map':result['gained'],'removed_from_map':result['dropped'],'reassigned':result['changed'],
                 'groups':dict(Counter(r['primary_group'] for r in current)),
                 'secondary':dict(Counter(r['secondary_groups'] for r in current if r['secondary_groups'])),
                 'zero_loss_individually':sum(r['loss_if_contact_required']==0 for r in current),
                 'ids_removed':[r['event_id'] for r in current if r['origin']=='removed_from_stage_302'],
                 'ids_closed':[id for c in contacts if not c['base'] and map_.get(c['id']) for id in c['ids']],
                 'assigned_contact_conflicts':0,'strict_map_delta':delta}
    assert len(rows)==52 and sum(r['origin']=='original_62' for r in rows)==42
    assert len({(r['composition'],r['event_id']) for r in rows})==52
    dest.mkdir(parents=True,exist_ok=True)
    with (dest/'residual-notes.csv').open('w',newline='',encoding='utf8') as f:
        w=csv.DictWriter(f,rows[0].keys(),lineterminator='\n');w.writeheader();w.writerows(rows)
    (dest/'reproduction.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print({k:{key:v[key] for key in ('groups','secondary','zero_loss_individually')} for k,v in summary.items()})


if __name__=='__main__':
    run(*map(Path,sys.argv[1:]))
