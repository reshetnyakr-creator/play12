importScripts('core.js?v=stage302','contact-plan.js?v=stage19','beginner-transition.js?v=stage19');
onmessage = ({data}) => {
  try {
    const score = data.score;
    if (data.transpose != null && !Number.isInteger(data.transpose)) throw Error('Invalid transpose');
    if (data.transpose) {
      for (const event of Play12Editor.events(score)) {
        if (!event.pitch) continue;
        event.pitch.midi += data.transpose;
        if (event.pitch.midi < 0 || event.pitch.midi > 127) event.editor_supported = false;
      }
    }
    const baseline = Play12BeginnerTransition.proposeBeginner(score,data.config,data.locks,data.detailed);
    const run = data.partialRecovery ? Play12Editor.recoverPartial(score,baseline,data.locks) : baseline;
    postMessage({id:data.id,run});
  } catch (error) {
    postMessage({id:data.id,error:error.message});
  }
};
