importScripts('core.js?v=stage17','contact-plan.js?v=stage17','beginner-transition.js?v=stage17');
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
    const run = Play12BeginnerTransition.proposeBeginner(score,data.config,data.locks,data.detailed);
    postMessage({id:data.id,run});
  } catch (error) {
    postMessage({id:data.id,error:error.message});
  }
};
