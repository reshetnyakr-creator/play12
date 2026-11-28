// Isolated whole-score reflection. It does not preserve black-key geometry.
const fs=require('node:fs');
const path=require('node:path');
const E=require('../../../editor/core.js');
require('../../../editor/contact-plan.js');
const B=require('../../../editor/beginner-transition.js');
const [input,dest]=process.argv.slice(2);
const opposite=hand=>hand==='L'?'R':hand==='R'?'L':hand;
const outcomes={};
for(const file of fs.readdirSync(input).filter(name=>name.endsWith('-0.json')&&/hans-zimmer-time|radiohead-no-surprises/.test(name))){
  const data=JSON.parse(fs.readFileSync(path.join(input,file)));
  const score=E.clone(data.score);
  for(const event of E.events(score)){
    event.hand=opposite(event.hand);
    if(event.pitch){
      event.pitch.midi=127-event.pitch.midi;
      const name=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][event.pitch.midi%12];
      event.pitch.step=name[0];
      event.pitch.alter=name.length-1;
      event.pitch.octave=Math.floor(event.pitch.midi/12)-1;
    }
  }
  const base=B.proposeBeginner(score,data.run.profile);
  const run=E.recoverPartial(score,base);
  const original=data.run;
  const mirrored=new Map(run.contacts.map(c=>[c.id,c]));
  const contactMatch=original.contacts.every(c=>{
    const other=mirrored.get(c.id);
    return other&&other.hand===opposite(c.hand)&&other.key===127-c.key&&other.start===c.start&&other.end===c.end&&other.ids.join()===c.ids.join();
  })&&original.contacts.length===run.contacts.length;
  outcomes[file.includes('hans')?'time':'no-surprises']={
    originalAssigned:original.assigned,mirroredAssigned:run.assigned,matchedContactStructure:contactMatch,
    assignmentsWithDifferentFingerOrPresence:Object.entries(original.assignments).filter(([id,f])=>f!==run.assignments[id]).length,
    sameUnassignedIds:Object.keys(original.unassignedReasons).sort().join()===Object.keys(run.unassignedReasons).sort().join()
  };
}
fs.writeFileSync(dest,JSON.stringify(outcomes,null,2)+'\n');
