"""Validate actual Chromium measurements produced by the browser scripts."""
import json, os
from pathlib import Path
root=Path(os.environ.get('PLAY12_TEST_OUTPUT_DIR','/tmp/play12-tutorial-acceptance'))
failures=[];total=targets=0
for name in ['spotlights','spotlights-early']:
    data=json.loads((root/(name+'.json')).read_text())
    failures.extend(data['errors'])
    for case in data['results']:
        total+=1;w,h=case['width'],case['height'];label=f"{w}x{h}:{case['guide']}"
        if not case['records']:failures.append(label+': no visible instructional card recorded')
        scroll=case['scroll']
        if scroll['w']>w+2 or scroll['h']>h+2:failures.append(label+': document overflow')
        for record in case['records']:
            card=record['card']
            if card['left']<0 or card['right']>w+1 or card['top']<0 or card['bottom']>h+1:failures.append(label+': card outside viewport')
            for target in record['targets']:
                targets+=1;r=target['rect']
                if not target['visible'] or r['left']< -2 or r['right']>w+2 or r['top']< -2 or r['bottom']>h+2:failures.append(label+': target outside viewport: '+target['id'])
                if not any(abs(hole['x']-(r['left']-3))<1 and abs(hole['y']-(r['top']-3))<1 and abs(hole['width']-(r['width']+6))<1 and abs(hole['height']-(r['height']+6))<1 for hole in record['holes']):failures.append(label+': spotlight mask does not match live target: '+target['id'])
summary={'scenarios':total,'target_boxes':targets,'failures':failures,'browser':'real Chromium headless, single process','hardware_midi':False}
(root/'acceptance-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False));assert not failures
