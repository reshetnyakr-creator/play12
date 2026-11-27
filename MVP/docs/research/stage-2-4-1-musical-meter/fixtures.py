"""Generate synthetic scores and a reference timeline in exact quarter units."""
from fractions import Fraction as Q
from pathlib import Path
import json
import xml.etree.ElementTree as ET
import zipfile
import hashlib
import sys

ROOT = Path(__file__).parent
D = 24
# Meter per measure, expected primary groups in denominator units.
CASES = [
 ('2/4',[1,1]), ('3/4',[1,1,1]), ('4/4',[1]*4), ('2/2',[1,1]),
 ('3/8',[1]*3), ('6/8',[3]*2), ('9/8',[3]*3), ('12/8',[3]*4),
 ('5/4',None), ('7/4',None), ('2+3/8',[2,3]), ('3+2/8',[3,2]),
 ('2+2+3/8',[2,2,3]), ('3+2+2/8',[3,2,2]), ('11/8',None),
 ('4/4 3/4',[[1]*4,[1]*3]), ('4/4 6/8',[[1]*4,[3]*2]),
 ('6/8 12/8',[[3]*2,[3]*4]), ('4/4',[1]*4), ('4/4',[1]*4),
 ('4/4',[1]*4), ('6/8',[3]*2), ('6/8',[3]*2), ('4/4',[1]*4),
 ('6/8',[3]*2), ('4/4',[1]*4), ('6/8',[3]*2), ('7/8',None),
 ('12/8',[3]*4), ('free',None), ('3/2',[1]*3), ('2/8',[1]*2),
 ('2+3+2/8',[2,3,2]), ('7/8',[2,3,2]),
]

def add(parent, name, value=None, **attrs):
    node = ET.SubElement(parent, name, attrs)
    if value is not None:
        node.text = str(value)
    return node

def mark(measure, bpm, unit, qpm, dotted=False):
    direction = add(measure, 'direction')
    metro = add(add(direction, 'direction-type'), 'metronome')
    add(metro, 'beat-unit', unit)
    if dotted:
        add(metro, 'beat-unit-dot')
    add(metro, 'per-minute', bpm)
    if qpm is not None:
        add(direction, 'sound', tempo=str(qpm))

def generate():
    expected = {}
    for i, (signature, groups) in enumerate(CASES, 1):
        case = f'M{i:02}'
        score = ET.Element('score-partwise', version='4.0')
        add(score, 'movement-title', case)
        definition = add(add(score, 'part-list'), 'score-part', id='P1')
        add(definition, 'part-name', 'Piano')
        part = add(score, 'part', id='P1')
        meters = signature.split() if ' ' in signature else [signature]*2
        segments, start, seconds = [], Q(0), Q(0)
        for j, meter in enumerate(meters):
            partial = (i,j) in [(19,0),(20,1)]
            measure = add(part, 'measure', number=str(j+(0 if i==19 else 1)), **({'implicit':'yes'} if (i,j)==(19,0) else {}))
            attrs = add(measure, 'attributes')
            add(attrs, 'divisions', D)
            time = add(attrs, 'time')
            clef = add(attrs, 'clef')
            if meter == 'free':
                add(time,'senza-misura')
                denominator, nominal = 4,Q(3)
            else:
                numerator, raw_d = meter.split('/')
                denominator = int(raw_d)
                add(time,'beats',numerator)
                add(time,'beat-type',denominator)
                nominal = Q(sum(map(int,numerator.split('+')))*4,denominator)
            attrs.remove(clef)
            attrs.append(clef)
            add(clef,"sign","G")
            add(clef,"line",2)
            length = Q(1) if partial else nominal
            unit, dotted, bpm, qpm = ('quarter', True, 63, Q(189,2)) if i in [8,29] else ('quarter',False,120,Q(120))
            if i == 26 and j:
                bpm,qpm = 90,Q(90)
            if i == 27 and j:
                unit,dotted,bpm,qpm = 'quarter',True,80,Q(120)
            if i == 29:
                qpm = Q(90)
            if j==0 or i in [26,27]:
                mark(measure,bpm,unit,float(qpm) if i!=27 else None,dotted)
            durations = [Q(4,denominator)]*int(length*denominator/4)
            if i==21:
                durations = [Q(1,3)]*3+[Q(1)]*3
            if i==22:
                durations = [Q(3,4)]*2+[Q(1,2)]*3
            if i==23:
                durations = [Q(1), Q(1), Q(1)]
            if i==24:
                durations = [length]
            for k,duration in enumerate(durations):
                note = add(measure,'note')
                pitch = add(note,'pitch')
                add(pitch,'step','C' if i==24 else 'CDEFG'[k%5])
                add(pitch,'octave',4)
                add(note,'duration',int(duration*D))
                if i==24:
                    add(note,'tie',type='start' if not j else 'stop')
                add(note,'voice',1)
                if i in [21,22] and k<(3 if i==21 else 2):
                    add(note,'type','eighth')
                    change = add(note,'time-modification')
                    add(change,'actual-notes',3 if i==21 else 2)
                    add(change,'normal-notes',2 if i==21 else 3)
                if i==34:
                    add(note,'type','eighth')
                    add(note,'beam','begin' if k in [0,2,5] else 'end' if k in [1,4,6] else 'continue', number='1')
                if i==25 and k==1 and not j:
                    add(add(note,'notations'),'fermata')
            active = groups[j] if ' ' in signature else groups
            at = []
            if active:
                local = nominal-length if (i,j)==(19,0) else Q(0)
                cursor = Q(0)
                for size in active:
                    if local<=cursor<local+length:
                        at.append(str(start+cursor-local))
                    cursor += Q(4*size,denominator)
            segments.append(dict(meter=meter, length=str(length), groups=active, beatPositions=at, qpm=str(qpm), start=str(start)))
            start += length
            seconds += length*60/qpm
        ET.indent(score)
        ET.ElementTree(score).write(ROOT/'fixtures'/f'{case}.musicxml',encoding='utf-8',xml_declaration=True)
        expected[case] = dict(measures=segments, totalQ=str(start), nominalSeconds=str(seconds), executionSeconds=None if i==25 else str(seconds))
    (ROOT/'results/reference.json').write_text(json.dumps(expected,indent=2)+'\n')

def inspect(path):
    raw = path.read_bytes()
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            entry = ET.fromstring(archive.read('META-INF/container.xml')).find('rootfiles/rootfile').attrib['full-path']
            if entry not in archive.namelist():
                candidates = [name for name in archive.namelist() if name.endswith((".xml",".musicxml")) and not name.startswith(("META-INF/","__MACOSX/"))]
                if len(candidates) != 1:
                    raise ValueError(f"Ambiguous archive entry: {entry}")
                entry = candidates[0]
            data = archive.read(entry)
    else:
        entry, data = None, raw
    root = ET.fromstring(data)
    parts = []
    for part in root.findall('part'):
        elapsed, divisions = Q(0), Q(1)
        meters, tempos, short, lengths = [], [], [], []
        nominal = Q(4)
        for measure in part.findall('measure'):
            cursor = extent = previous = Q(0)
            number = measure.attrib['number']
            for node in measure:
                if node.tag == 'attributes':
                    divisions = Q(node.findtext('divisions') or divisions)
                    for t in node.findall('time'):
                        pairs = list(zip([x.text for x in t.findall('beats')],[x.text for x in t.findall('beat-type')]))
                        nominal = sum((Q(4*sum(map(int,n.split('+'))),int(d)) for n,d in pairs), Q(0))
                        meters.append(dict(measure=number,signature=pairs,staff=t.get('number'),at=str(elapsed+cursor)))
                if node.tag in ('note','backup','forward'):
                    duration = Q(node.findtext('duration') or 0)/divisions
                    if node.tag=='backup':
                        cursor -= duration
                    elif node.tag=='forward':
                        cursor += duration
                        extent = max(extent,cursor)
                    elif node.find('chord') is not None:
                        extent = max(extent,previous+duration)
                    else:
                        previous = cursor
                        cursor += duration
                        extent = max(extent,cursor)
                if node.tag in ('sound','direction'):
                    sound = node if node.tag=='sound' else node.find('sound')
                    metro = node.find('direction-type/metronome')
                    qpm = sound.get('tempo') if sound is not None else None
                    if metro is not None or qpm:
                        off = sound.find('offset') if sound is not None else None
                        if off is None:
                            off = node.find('offset[@sound="yes"]')
                        tempos.append(dict(measure=number,at=str(elapsed+cursor+(Q(off.text)/divisions if off is not None else 0)),units=metro.findall('beat-unit') and [x.text for x in metro.findall('beat-unit')] if metro is not None else [],dots=len(metro.findall('beat-unit-dot')) if metro is not None else 0, bpm=metro.findtext('per-minute') if metro is not None else None,qpm=qpm))
            if extent!=nominal:
                short.append(dict(measure=number,actual=str(extent),nominal=str(nominal),implicit=measure.get('implicit')))
            elapsed += extent
            lengths.append(str(extent))
        parts.append(dict(id=part.get('id'),measures=len(lengths),totalQ=str(elapsed),meters=meters,tempos=tempos,irregular=short,lengths=lengths))
    return dict(filename=path.name,sha256=hashlib.sha256(raw).hexdigest(),entry=entry,parts=parts,features={tag:len(root.findall('.//'+tag)) for tag in ['repeat','ending','segno','coda','fermata','arpeggiate','pedal','time-modification','beam','tie']})

if __name__ == '__main__':
    generate()
    if len(sys.argv)>1:
        (ROOT/'results/source-scores.json').write_text(json.dumps([inspect(Path(p)) for p in sys.argv[1:]],ensure_ascii=False,indent=2)+'\n')
