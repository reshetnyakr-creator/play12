"""Create original short rhythm fixtures and their hand-authored expected counts."""
from pathlib import Path
import json
import xml.etree.ElementTree as XML

directory = Path(__file__).parent
cases = [
    ('4',[24,24,24,24],1), ('4',[12,12,24,24,24],2),
    ('4',[8,8,8,24,24,24],3), ('4',[24,12,12,8,8,8,24],1),
    ('4',[12,12,24,24,24],4), ('2+2',[24]*4,4),
    ('3+2',[24]*5,5), ('2+3',[24]*5,5), ('2+2+3',[24]*7,7),
    ('2+3+2',[24]*7,7), ('3+2+2',[24]*7,7),
    ('3+3+2',[24]*8,8), ('2+3+3',[24]*8,8), ('3+2+3',[24]*8,8),
    ('2+2+3+2+3',[24]*12,12), ('2+2',[24]*4,4),
    ('4',[8,8,8,24,24,24],3), ('4',[24]*4,4),
    ('4',[16,8,24,24,24],3), ('4',[8,16,24,24,24],3),
]
def element(node, name, text=None, **attrs):
    child = XML.SubElement(node,name,attrs)
    if text is not None:
        child.text=str(text)
    return child

def notes(measure, durations, staff=None):
    for i, duration in enumerate(durations):
        n=element(measure,'note')
        pitch=element(n,'pitch')
        element(pitch,'step','CDEG'[i%4])
        element(pitch,'octave',4 if staff!=2 else 3)
        element(n,'duration',duration)
        element(n,'voice',staff or 1)
        if staff:
            element(n,'staff',staff)

expected={}
for index,(meter,durations,_) in enumerate(cases,1):
    case=f'P{index:02}'
    root=XML.Element('score-partwise',version='4.0')
    element(root,'movement-title',case)
    definition=element(element(root,'part-list'),'score-part',id='P1')
    element(definition,'part-name','Piano')
    part=element(root,'part',id='P1')
    sizes=[int(x) for x in meter.split('+')]
    secondary=[]
    if len(sizes)>1:
        secondary=[sum(sizes[:n]) for n in range(1,len(sizes))]
    elif sizes==[4]:
        secondary=[2]
    m=element(part,'measure',number='1')
    a=element(m,'attributes')
    element(a,'divisions',24)
    time=element(a,'time')
    element(time,'beats',meter)
    element(time,'beat-type',4)
    notes(m,durations,1 if index==5 else None)
    if index==5:
        element(element(m,'backup'),'duration',96)
        notes(m,[8,8,8,24,24,24],2)
    if index==18:
        m=element(part,'measure',number='2')
        a=element(m,'attributes')
        time=element(a,'time')
        element(time,'beats',3)
        element(time,'beat-type',4)
        notes(m,[24]*3)
    XML.indent(root)
    XML.ElementTree(root).write(directory/'fixtures'/f'{case}.musicxml',encoding='utf-8',xml_declaration=True)
    patterns={2:[None,'И'],3:[None,'И','А'],4:[None,'И','И','А']}
    expected[case]={'counts':sum(sizes),'secondary':secondary,'firstSteps':patterns.get(_,[None]) if index in {1,2,3,4,5,17,19,20} else [None]}
(directory/'play12-reference.json').write_text(json.dumps(expected,ensure_ascii=False,indent=2)+'\n')
