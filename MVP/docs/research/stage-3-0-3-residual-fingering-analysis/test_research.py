"""Small independent exhaustive fixtures. Run from this directory with Python."""
import itertools
import json
import sys
from pathlib import Path
from fractions import Fraction as Q
from research import audit, experiment, frontier

PROFILE=json.loads((Path(__file__).resolve().parents[3]/'editor/beginner.json').read_text())

def c(id,key,lo,hi,base=0,hand='R',segments=1):
    return dict(id=id,key=key,lo=Q(lo),hi=Q(hi),base=base,hand=hand,ids=[f'{id}.{i}' for i in range(segments)])

cases=[
 ('S01',[c('a',60,0,2,2),c('b',72,1,2)],2),
 ('S02',[c('a',60,0,3,2),c('b',64,0,3,1),c('c',72,1,2)],3),
 ('S03',[c('a',60,0,3,2),c('b',72,2,4),c('c',67,3,5,1)],3),
 ('S04',[c('bass',40,0,4,1),c('high',64,2,3)],1),
 ('S05',[c('a',48,0,2,hand='L'),c('b',59,0,2,hand='L'),c('c',60,0,2,hand='L')],2),
 ('S06',[c('a',60,0,3,1),c('b',60,1,2)],1),
 ('S07',[c('a',60,0,2),c('b',60,0,2)],1),
 ('S08',[c('a',60,0,2,1),c('b',60,1,2,hand='L')],1),
 ('S09',[c('a',60,0,1,1),c('b',60,1,2,hand='L')],2),
 ('S10',[c('held',60,0,3,2),c('octave',72,2,3)],2),
 ('S11',[c('a',60,0,1,1),c('b',60,2,3)],2),
 ('S12',[c('chain',60,0,4,segments=2),c('octave',72,3,5)],3),
 ('S13',[c('top',79,0,2),c('middle',68,0,2),c('bottom',67,0,2)],2),
 ('S14',[c('a',60,0,2,1),c('b',60,1,2,1,hand='L')],1),
 ('S15',[c('a',48,0,2),c('b',64,0,2)],1),
]
rows=[]
for label,contacts,expected in cases:
    ids=[n['id'] for n in contacts]
    brute=max(sum(len(n['ids']) for n in contacts if mapping[n['id']])
        for candidates in itertools.product(range(6),repeat=len(contacts))
        if not audit(contacts,(mapping:=dict(zip(ids,candidates))),PROFILE))
    observed,fingers=experiment(contacts,PROFILE,'B05')
    assert brute==observed['assigned']==expected and observed['status']=='exact',label
    rows.append(dict(id=label,expected=expected,observed=observed['assigned'],fingers=fingers))
# Test immutability and specific conflict handling separately from coverage.
assert experiment(cases[0][1],PROFILE,'B01')[0]['assigned']==1
assert len(audit(cases[13][1],{'a':1,'b':1},PROFILE))==1
assert frontier(cases[13][1],set(),PROFILE,required={'a','b'})[0] is None
print(json.dumps(rows,indent=2))
