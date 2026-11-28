// Wider-beam diagnostic. No production profile is edited.
const fs = require('node:fs');
const path = require('node:path');
const E = require('../../../editor/core.js');
require('../../../editor/contact-plan.js');
const solver = require('../../../editor/beginner-transition.js');
const [input,output] = process.argv.slice(2);
const experiments = {};
for(const name of fs.readdirSync(input).filter(name=>name.endsWith('-0.json'))){
  const {score,run} = JSON.parse(fs.readFileSync(path.join(input,name)));
  const profile = E.clone(run.profile);
  Object.assign(profile.search,{beamWidth:256,maxMilliseconds:30000});
  const wider = solver.proposeBeginner(score,profile);
  experiments[name] = {
    beam:profile.search.beamWidth, budget_ms:profile.search.maxMilliseconds,
    elapsed_ms:wider.elapsed_ms,status:wider.search_status, originallyAssigned:run.assigned,
    assigned:wider.assigned, missingSetEqual:Object.keys(run.unassignedReasons).sort().join()===Object.keys(wider.unassignedReasons).sort().join()
  };
}
fs.writeFileSync(output,JSON.stringify(experiments,null,2)+'\n');
