"""Render original examples locally; there is no score in the repository."""
import importlib.util
import json
import sys
from pathlib import Path

here=Path(__file__).resolve().parent
prior=here.parent/'stage-3-0-6-maxprac-contact-analysis'/'engrave.py'
spec=importlib.util.spec_from_file_location('engraving',prior)
engraving=importlib.util.module_from_spec(spec)
spec.loader.exec_module(engraving)
source,dest=map(Path,sys.argv[1:])
dest.mkdir(parents=True,exist_ok=True)
examples=json.loads((here/'atlas-cases.json').read_text())
engraving.engrave(engraving.source_xml(source),
  [dict(id=c['measure'],composition='time',first=int(c['measure']),last=int(c['measure'])) for c in examples],dest)
