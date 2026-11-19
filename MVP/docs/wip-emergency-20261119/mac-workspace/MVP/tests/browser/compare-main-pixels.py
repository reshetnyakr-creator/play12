"""Compare the matched baseline/candidate screenshots made by main-geometry-baseline.cjs.
Only the note viewport is exempt (approved localized count and relocated markers).
A maximum 4/255 channel delta is tolerated for compositor subpixel rounding.
"""
from PIL import Image, ImageChops
from pathlib import Path
import json, sys
root=Path(sys.argv[1]); results=[]
for case in json.loads((root/'geometry.json').read_text())['results']:
    width=case['w'];before=Image.open(root/f'baseline-{width}.png').convert('RGB');after=Image.open(root/f'candidate-{width}.png').convert('RGB')
    assert before.size==after.size
    diff=ImageChops.difference(before,after);r=case['candidate']['rects']['#playback-stage'];changed=outside=outside_significant=0
    for y in range(before.height):
        for x in range(before.width):
            delta=max(diff.getpixel((x,y)))
            if not delta: continue
            changed+=1
            if not(r['left']-2<=x<=r['right']+2 and r['top']-2<=y<=r['bottom']+2):
                outside+=1;outside_significant+=delta>4
    results.append(dict(width=width,changed=changed,outsideNoteViewport=outside,outsideOver4=outside_significant))
(root/'pixels.json').write_text(json.dumps(results,indent=2));print(results)
assert all(case['outsideOver4']==0 for case in results)
