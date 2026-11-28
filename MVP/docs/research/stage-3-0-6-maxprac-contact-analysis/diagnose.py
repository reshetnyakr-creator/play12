"""Exact contact diagnostics on the Stage 3.0.5 map. No proposed rule is executed."""
import csv
import importlib.util
import json
import sys
from collections import Counter
from itertools import combinations
from pathlib import Path

HERE = Path(__file__).resolve().parent
OLD = HERE.parent / 'stage-3-0-4-residual-fingering-classification'
spec = importlib.util.spec_from_file_location('frontier', HERE.parent / 'stage-3-0-3-residual-fingering-analysis/research.py')
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


def quality(contacts, mapping, profile):
    extra = []
    for a, b in combinations(contacts, 2):
        f, g = mapping.get(a['id']), mapping.get(b['id'])
        if not f or not g or f == g or a['hand'] != b['hand'] or not model.overlap(a, b):
            continue
        excess = abs(a['key'] - b['key']) - profile['comfortSpan'][f'{min(f,g)}-{max(f,g)}']
        if excess > 0:
            extra.append(excess)
    return [len(extra), sum(extra)]


def solve(contacts, profile, target, restored, g4, *, disable=(), keep=True):
    required = {target['id'], *[c['id'] for c in contacts if restored.intersection(c['ids'])]}
    baseline = {c['id']: c['base'] for c in contacts}
    if keep:
        required.update(id for id, finger in baseline.items() if finger)
    movable = {c['id'] for c in contacts if not restored.intersection(c['ids'])}
    result, steps, _ = model.frontier(contacts, movable, profile, disable, budget=8000000, required=required)
    if result is None:
        return dict(status='budget' if steps > 8000000 else 'infeasible')
    assert not model.audit(contacts, result, profile, disable)
    assert all(result[id] for id in required)
    assert all(result[c['id']] == c['base'] for c in contacts if restored.intersection(c['ids']))
    gained = [id for c in contacts if not baseline[c['id']] and result[c['id']] for id in c['ids']]
    lost = [id for c in contacts if baseline[c['id']] and not result[c['id']] for id in c['ids']]
    changed = [id for c in contacts if baseline[c['id']] and result[c['id']] and
               baseline[c['id']] != result[c['id']] for id in c['ids']]
    return dict(status='feasible', finger=result[target['id']], gained=gained, lost=lost, net=len(gained)-len(lost),
                changed=changed, g4_gain=sorted(g4.intersection(gained)), quality=quality(contacts, result, profile),
                conflicts=0)


def blocker(target, neighbor, data, profile):
    gap = abs(neighbor['key'] - target['key'])
    limit = max(profile['practicalSpan'].values())
    f = neighbor['base']
    start, end = max(neighbor['lo'], target['lo']), min(neighbor['hi'], target['hi'])
    holds = [(target, neighbor), (neighbor, target)]
    earlier, later = min(holds, key=lambda pair: pair[0]['lo'])
    return dict(id=neighbor['id'], events=neighbor['ids'], midi=neighbor['key'], finger=f,
        voices=sorted({data['events'][id]['voice'] for id in neighbor['ids']}),
        ties={id:data['events'][id]['ties'] for id in neighbor['ids'] if data['events'][id]['ties']},
        interval=[str(neighbor['lo']), str(neighbor['hi'])], overlap=[str(start), str(end)],
        overlap_duration=str(end-start), gap=gap, excess_best_pair=max(0, gap-limit),
        attack_relation='together' if neighbor['lo']==target['lo'] else 'neighbor_held' if neighbor['lo']<target['lo'] else 'target_held',
        existing_release=data['releaseChecks'].get(earlier['id']+'|'+later['id']),
        max_practical_by_target_finger={i:profile['practicalSpan'][f'{min(f,i)}-{max(f,i)}'] for i in range(1,6) if i!=f},
        blocked_fingers=[i for i in range(1,6) if not model.valid_pair(neighbor,target,f,i,profile,())])


def shorten(group, target, wide):
    # Counterfactual interval boundary only; removal of acoustic duration and
    # instantaneous movement are deliberately outside the evidence model.
    ends = {}
    for neighbor in wide:
        earlier, later = sorted([target, neighbor], key=lambda c:c['lo'])
        if earlier['lo'] < later['lo']:
            ends[earlier['id']] = min(ends.get(earlier['id'], earlier['hi']), later['lo'])
    return [dict(c, hi=ends.get(c['id'],c['hi'])) for c in group], {id:str(t) for id,t in ends.items()}


def run(source):
    rows = list(csv.DictReader((OLD/'results/residual-notes.csv').open()))
    out, summary = [], {}
    for composition, data in source.items():
        contacts = model.prepare(data['run'])
        profile = data['run']['profile']
        assert not data['manual'], 'Manual constraints must be represented before diagnostic re-fingering'
        baseline = {c['id']:c['base'] for c in contacts}
        assert not model.audit(contacts,baseline,profile)
        active = [c for c in contacts if c['base']]
        by_event = {id:c for c in contacts for id in c['ids']}
        components = {c['id']:g for g in model.components(contacts) for c in g}
        residual = [row for row in rows if row['composition']==composition]
        g4 = {r['event_id'] for r in residual if r['primary_group']=='G4'}
        restored = set(data['rests'])
        assert all(by_event[id]['base'] for id in restored)
        limit = max(profile['practicalSpan'].values())
        cache = {}
        for row in residual:
            id = row['event_id']
            if row['primary_group']!='G3':
                continue
            target = by_event[id]
            assert not target['base']
            neighbors = [c for c in active if model.edge(c,target) and model.overlap(c,target)]
            blocked = [blocker(target,c,data,profile) for c in neighbors]
            blocked = [b for b in blocked if b['blocked_fingers']]
            wide = [c for c in neighbors if c['hand']==target['hand'] and abs(c['key']-target['key'])>limit]
            assert wide
            topology = sorted({b['attack_relation'] for b in blocked if b['excess_best_pair']})
            category = 'A' if 'together' in topology else 'B' if topology==['neighbor_held'] else 'C' if topology==['target_held'] else 'D'
            group = components[target['id']]
            if target['id'] not in cache:
                shortened, changes = shorten(group,target,wide)
                shortened_target = next(c for c in shortened if c['id']==target['id'])
                alternate_hand = 'L' if target['hand']=='R' else 'R'
                # Keep the original musical hand. This isolated copy tests only
                # occupancy/span, not crossing, geometry, reach time or pedagogy.
                alternate = dict(target, hand=alternate_hand)
                joint = [alternate if c['id']==target['id'] else c for c in contacts]
                joint_group = next(g for g in model.components(joint) if any(c['id']==target['id'] for c in g))
                cache[target['id']] = dict(
                    strict_keep=solve(group,profile,target,restored,g4),
                    strict_exchange=solve(group,profile,target,restored,g4,keep=False),
                    without_maxprac=solve(group,profile,target,restored,g4,disable=('span',)),
                    shorter_hold=dict(ends=changes, **solve(shortened,profile,shortened_target,restored,g4)),
                    alternate_physical_hand=dict(hand=alternate_hand, **solve(joint_group,profile,alternate,restored,g4)),
                    quality_baseline=quality(group,baseline,profile))
            out.append(dict(composition=composition,id=id,**data['events'][id],
                contact_id=target['id'], contact=[str(target['lo']),str(target['hi'])],
                original_end=data['original'][target['id']], shortened_305=target['hi']<model.Q(data['original'][target['id']]),
                category=category, topology=topology, primary_cause='wide_same_hand_overlap',
                secondary=[dict(neighbor=b['id'], relation=b['attack_relation'], blocked_fingers=b['blocked_fingers'])
                           for b in blocked if not b['excess_best_pair']],
                pedals=data['xml']['pedal'], current_possible_fingers=[i for i in range(1,6)
                    if all(i not in b['blocked_fingers'] for b in blocked)], blockers=blocked, diagnostics=cache[target['id']]))
        selected = [r for r in out if r['composition']==composition]
        global_map = {}
        for group in model.components(contacts):
            fixed = {c['id'] for c in group if restored.intersection(c['ids'])}
            candidate, _, _ = model.frontier(group, {c['id'] for c in group}-fixed, profile,
                                             budget=8000000, required=fixed)
            assert candidate is not None
            global_map.update(candidate)
        assert not model.audit(contacts,global_map,profile)
        assert all(global_map[by_event[id]['id']]==by_event[id]['base'] for id in restored)
        global_gain = sorted(id for id,c in by_event.items() if not c['base'] and global_map[c['id']])
        global_loss = sorted(id for id,c in by_event.items() if c['base'] and not global_map[c['id']])
        assert sum(len(c['ids']) for c in contacts if c['base']) == data['stage305']
        g4_intersection = sorted(id for id in g4 if any(
            components[by_event[id]['id']] is components[r['contact_id']] for r in selected))
        summary[composition] = dict(assigned=data['stage305'], restored_preserved=sorted(restored),
            categories=dict(sorted(Counter(r['category'] for r in selected).items())),
            shortened_305=sum(r['shortened_305'] for r in selected),
            diagnostics={mode:dict(sorted(Counter(str(r['diagnostics'][mode].get('net',r['diagnostics'][mode]['status']))
                for r in selected).items())) for mode in ('strict_keep','strict_exchange','without_maxprac','shorter_hold','alternate_physical_hand')},
            global_strict=dict(gained=global_gain, lost=global_loss, net=len(global_gain)-len(global_loss),
                quality_before=quality(contacts,baseline,profile), quality_after=quality(contacts,global_map,profile),
                g4_gain=sorted(g4.intersection(global_gain))),
            g4=sorted(g4), g4_shared_components=g4_intersection, g4_changes={mode:sorted({i for r in selected for i in r['diagnostics'][mode].get('g4_gain',[])})
               for mode in ('strict_exchange','without_maxprac','shorter_hold','alternate_physical_hand')})
    assert len(out)==40 and len({(r['composition'],r['id']) for r in out})==40
    assert all(not r['current_possible_fingers'] for r in out)
    assert all(r['diagnostics']['strict_keep']['status']=='infeasible' for r in out)
    assert not any(isinstance(value,dict) and value.get('status')=='budget'
        for r in out for value in r['diagnostics'].values())
    return out, summary


def readable_register(rows):
    lines = ['# Реестр 40 нот G3', '',
        'Время указано в четвертях от начала композиции. Обозначение «да» выделяет целевой контакт, уже сокращённый Stage 3.0.5. '
        'Столбец расстояний показывает все блокирующие интервалы выше 15 полутонов, включая повторные контакты той же клавиши. '
        'В [машиночитаемом реестре](register.json) для каждой цели есть соседние пальцы и голоса, длительность перекрытия, '
        'превышение общего и конкретных парных порогов, педаль, лиги и альтернативы из диагностических опытов.', '']
    for name,title in [('time','Time'),('no-surprises','No Surprises')]:
        lines += ['## '+title,'',
            '| Такт и ID | Группа | MIDI / рука / голос | Нотная длина | Контакт 3.0.5 | Уже сокращён | Дальние блокеры MIDI / Δ полутонов / пересечение |',
            '| --- | --- | --- | ---: | --- | --- | --- |']
        for r in rows:
            if r['composition'] != name:
                continue
            wide = [f"{b['midi']} / {b['gap']} / {b['overlap_duration']}" for b in r['blockers'] if b['excess_best_pair']]
            left,right = r['contact']
            shortened = f"да, конец был {r['original_end']}" if r['shortened_305'] else '—'
            lines.append(f"| {r['measure']} · `{r['id']}` | {r['category']} | {r['midi']} / {r['hand']} / {r['voice']} | "
                         f"{r['duration']} | [{left}, {right}) | {shortened} | {'; '.join(wide)} |")
        lines.append('')
    return '\n'.join(lines)


if __name__ == '__main__':
    rows, summary = run(json.load(open(sys.argv[1])))
    folder = Path(sys.argv[2])
    (folder/'register.json').write_text('[\n' + ',\n'.join(
        json.dumps(row,ensure_ascii=False,separators=(',',':')) for row in rows) + '\n]\n')
    (folder/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    (folder/'01_Register.md').write_text(readable_register(rows))
