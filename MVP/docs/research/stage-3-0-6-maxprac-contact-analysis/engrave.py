"""Verify source notes and engrave original excerpts locally with Verovio."""
import json
import sys
from fractions import Fraction
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent
XML_ID = '{http://www.w3.org/XML/1998/namespace}id'


def source_xml(path):
    with ZipFile(path) as archive:
        container = ET.fromstring(archive.read('META-INF/container.xml'))
        return archive.read(container.find('.//{*}rootfile').attrib['full-path']).decode('utf-8-sig')


def index_xml(root):
    index = {}
    for part in root.findall('part'):
        divisions = 1
        for measure_idx, measure in enumerate(part.findall('measure')):
            cursor = previous = Fraction(0)
            events = []
            for node in measure:
                if node.tag == 'attributes':
                    divisions = int(node.findtext('divisions',str(divisions)))
                elif node.tag in ('backup','forward'):
                    step = Fraction(int(node.findtext('duration')),divisions)
                    cursor += step if node.tag=='forward' else -step
                elif node.tag == 'note':
                    length = Fraction(int(node.findtext('duration','0')),divisions)
                    start = previous if node.find('chord') is not None else cursor
                    if node.find('chord') is None:
                        previous = start
                        cursor += length
                    events.append((node,start,length))
            for event_idx,(node,start,length) in enumerate(events):
                pitch = node.find('pitch')
                if pitch is None:
                    continue
                midi = 12*(int(pitch.findtext('octave'))+1) + 'C D EF G A B'.index(pitch.findtext('step')) + int(pitch.findtext('alter','0'))
                key = f"{part.attrib['id']}.m{measure_idx}.e{event_idx}"
                index[key] = dict(measure=measure.attrib['number'], midi=midi, onset=start, duration=length,
                    voice=node.findtext('voice'), staff=node.findtext('staff','1'),
                    ties=sorted(t.attrib['type'] for t in node.findall('tie')),
                    attack=node.get('attack'), release=node.get('release'))
    return index


def engrave(xml, examples, dest):
    import verovio
    tk = verovio.toolkit()
    tk.setOptions({'breaks':'none','header':'none','footer':'none','adjustPageHeight':True,
                   'adjustPageWidth':True,'scale':45,'inputFrom':'musicxml'})
    assert tk.loadData(xml)
    measures = ET.fromstring(tk.getMEI()).findall('.//{*}measure')
    for example in examples:
        ids = [measure.get(XML_ID) for measure in measures[example['first']-1:example['last']]]
        assert ids and all(ids)
        assert tk.select({'measureRange':f"{example['first']}-{example['last']}"})
        tk.redoLayout()
        svg = tk.renderToSVG(1)
        assert set(ids) <= {e.get('id') for e in ET.fromstring(svg).iter()}
        assert sum(e.get('class')=='measure' for e in ET.fromstring(svg).iter())==len(ids)
        (dest/f"{example['composition']}-{example['id']}.svg").write_text(svg)


def run(uploads, imports, dest=None):
    cases = json.loads((HERE/'register.json').read_text())
    examples = json.loads((HERE/'examples.json').read_text())
    stats = {}
    for composition,prefix in [('time','hans-'),('no-surprises','radiohead-')]:
        xml = source_xml(next(uploads.glob(prefix+'*.mxl')))
        root = ET.fromstring(xml)
        assert not root.findall('.//pedal') and not any('damper-pedal' in e.attrib for e in root.iter('sound'))
        index = index_xml(root)
        imported = json.loads(next(imports.glob(prefix+'*-0.json')).read_text())['score']
        model = {e['id']:e for p in imported['score']['parts'] for m in p['measures'] for e in m['events'] if e['kind']=='note'}
        targets = [row for row in cases if row['composition']==composition]
        evidence = {row['id'] for row in targets} | {id for row in targets for b in row['blockers'] for id in b['events']}
        for id in evidence:
            a,b = index[id],model[id]
            assert (a['midi'],a['voice'],a['staff'],a['onset'],a['duration'],a['ties']) == (
                b['pitch']['midi'],str(b['voice']),str(b['staff']),Fraction(b['start_quarters']),
                Fraction(b['duration_quarters']),sorted(b['ties'])),id
        for row in targets:
            assert row['measure']==index[row['id']]['measure']
        stats[composition] = dict(targets=len(targets), verified_events=len(evidence),
            explicit_release_events=sum(index[id]['release'] is not None for id in evidence),
            explicit_attack_events=sum(index[id]['attack'] is not None for id in evidence))
        if dest:
            engrave(xml,[e for e in examples if e['composition']==composition],dest)
    print(json.dumps(stats,ensure_ascii=False,indent=2))


if __name__=='__main__':
    uploads, imports, *output = map(Path,sys.argv[1:])
    if output:
        output[0].mkdir(parents=True,exist_ok=True)
    run(uploads,imports,output[0] if output else None)
