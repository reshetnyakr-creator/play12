"""Render the original Time measures locally without storing the source."""
import importlib.util
import json
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
prior = here.parent/'stage-3-0-6-maxprac-contact-analysis/engrave.py'
spec = importlib.util.spec_from_file_location('engraving', prior)
engraving = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engraving)

source, dest = map(Path,sys.argv[1:])
dest.mkdir(parents=True,exist_ok=True)
cases=json.loads((here/'results.json').read_text())['time']['views']
engraving.engrave(engraving.source_xml(source),
    [dict(id=c['measure'],composition='time',first=int(c['measure']),last=int(c['measure'])) for c in cases],dest)
