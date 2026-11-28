"""Aggregate preceding/current/following measure context without exporting score contents."""
import csv
import json
from collections import Counter
from pathlib import Path
import sys


def main(folder, destination):
    rows=[]
    for path in sorted(folder.glob('*-0.json')):
        name='time' if 'hans-zimmer' in path.name else 'no-surprises' if 'surprises' in path.name else None
        if name is None:
            continue
        data=json.loads(path.read_text())
        missing=set(data['run']['unassignedReasons'])
        for part in data['score']['score']['parts']:
            bars=part['measures']
            for i,bar in enumerate(bars):
                targets=[e for e in bar['events'] if e['id'] in missing]
                if not targets:
                    continue
                context=[]
                for other in bars[max(0,i-1):i+2]:
                    events=[e for e in other['events'] if e['kind']=='note']
                    context.append(dict(measure=other['number'],notes=len(events),
                        hands=dict(Counter(e['hand'] for e in events)),
                        voices=dict(Counter(f"{e['staff']}/{e['voice']}" for e in events)),
                        chord_continuations=sum(bool(e['chord']) for e in events),
                        tied_events=sum(bool(e['ties']) for e in events),
                        articulated_events=sum(bool(e['articulations']) for e in events),
                        authored_fingers=sum(bool(e['source_fingering']) for e in events),
                        pedal_marks=len(other.get('pedals',[]))))
                for event in targets:
                    rows.append(dict(composition=name,id=event['id'],context=json.dumps(context,separators=(',',':'))))
    assert len(rows)==62
    with destination.open('w',newline='',encoding='utf8') as stream:
        writer=csv.DictWriter(stream,rows[0].keys(),lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)

if __name__=='__main__':
    main(*map(Path,sys.argv[1:]))
