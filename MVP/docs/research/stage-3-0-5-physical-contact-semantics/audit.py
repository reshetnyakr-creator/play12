import csv
import json
import sys
from fractions import Fraction as Q
from itertools import combinations
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'stage-3-0-4-residual-fingering-classification'

def inspect(imports, uploads, c_register=False):
    targets=list(csv.DictReader((OLD/'results/residual-notes.csv').open()))
    targets=[r for r in targets if r['primary_group'] in ('G1','G2')]
    reports=[]
    simultaneous=[]
    c_events=[]
    for name,prefix in [('time','hans-zimmer'),('no-surprises','radiohead')]:
        xml_path,=uploads.glob(prefix+'*.mxl')
        with ZipFile(xml_path) as archive:
            container=ET.fromstring(archive.read('META-INF/container.xml'))
            rootfile=next(e for e in container.iter() if e.tag.split('}')[-1]=='rootfile')
            root=ET.fromstring(archive.read(rootfile.attrib['full-path']))
        path,=imports.glob(prefix+'*-0.json')
        data=json.loads(path.read_text())
        raw={}
        events={}
        part=data['score']['score']['parts'][0]
        xml_part=root.find('part')
        divisions=1
        for measure, bar in zip(part['measures'],xml_part.findall('measure'),strict=True):
            cursor=last=Q(0)
            nodes=[]
            for node in bar:
                if node.tag=='attributes':
                    divisions=int(node.findtext('divisions',str(divisions)))
                elif node.tag in ('backup','forward'):
                    cursor+=Q(int(node.findtext('duration')),divisions)*(1 if node.tag=='forward' else -1)
                elif node.tag=='note':
                    length=Q(int(node.findtext('duration','0')),divisions)
                    start=last if node.find('chord') is not None else cursor
                    if node.find('chord') is None:
                        last=start
                        cursor+=length
                    nodes.append((node,start,length))
            for event,(node,start,length) in zip(measure['events'],nodes,strict=True):
                assert Q(event['start_quarters'])==start and Q(event['duration_quarters'])==length,event['id']
                if node.find('pitch') is None:
                    continue
                step=node.findtext('pitch/step')
                midi=12*(int(node.findtext('pitch/octave'))+1)+'C D EF G A B'.index(step)+int(node.findtext('pitch/alter','0'))
                assert midi==event['pitch']['midi'],event['id']
                id=event['id']
                events[id]=event
                raw[id]=dict(id=id,measure=measure['number'],midi=midi,voice=node.findtext('voice'),
                    staff=node.findtext('staff','1'),hand=event['hand'],onset=event['editor_onset_q'],
                    onset_in_measure=str(start),duration=str(length),ties=[t.get('type') for t in node.findall('tie')],
                    notation_ties=[t.get('type') for t in node.findall('notations/tied')],
                    attack=node.get('attack'),release=node.get('release'),pedal_marks=data['xml']['pedal'],
                    source_fingerings=[t.text for t in node.findall('notations/technical/fingering')])
        contacts={id:c for c in data['run']['contacts'] for id in c['ids']}
        for r in targets:
            if r['composition']!=name:
                continue
            id=r['event_id']
            neighbors=json.loads(r['contact_evidence'])
            same=[raw[k] for k,a in neighbors.items() if r['primary_group'] in a['groups']]
            assert all(a['onset']!=raw[id]['onset'] for a in same)
            reports.append(dict(composition=name,group=r['primary_group'],**raw[id],
                contact=[contacts[id]['start'],contacts[id]['end']],prior_finger=r['prior_finger'] or None,
                strict_finger=None,blockers=[dict(a,contact=[contacts[a['id']]['start'],contacts[a['id']]['end']],
                    strict_finger=neighbors[a['id']]['finger']) for a in same],
                fixed_plan='H1_DISTINCT_ATTACKS',evidence='no release/reset measurement'))
        if name=='no-surprises':
            c_events.extend(r for r in raw.values()
                            if r['measure'] in ('51','53') and r['midi'] % 12 == 0)
            for a,b in combinations((r for r in raw.values() if r['measure'] in ('51','53')),2):
                if a['midi']==b['midi'] and a['onset']==b['onset']:
                    simultaneous.append(dict(events=[a,b],same_duration=a['duration']==b['duration'],
                                             shared_contact=contacts[a['id']]['id']==contacts[b['id']]['id']))
    assert len(reports)==8 and sum(len(r['blockers']) for r in reports)==16
    if c_register:
        return c_events
    return dict(cases=reports,no_surprises_simultaneous_same_midi=simultaneous)

if __name__=='__main__':
    paths = [Path(arg) for arg in sys.argv[1:] if arg != '--c-register']
    print(json.dumps(inspect(*paths, c_register='--c-register' in sys.argv),ensure_ascii=False,indent=2))
