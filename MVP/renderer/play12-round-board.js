/* Compact round controls reuse the production player's position and loop inputs. */
(function(global){
  'use strict';
  const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
  const roundIndex=(rounds,position)=>Math.max(0,rounds.findIndex(round=>position>=round.start-1e-7&&position<round.end-1e-7));
  const ribbonFor=(repetitions,hand,number)=>repetitions.segments.find(segment=>segment.hand===hand&&segment.occurrences.some(o=>number>=o.measure_start&&number<=o.measure_end))?.display_color;
  function create({root,playback:c,repetitions,title}){
    const element=id=>root.querySelector('#'+id), total=c.rounds.length;
    const timeline=element('round-timeline'),head=element('round-playhead'),frame=element('round-loop-frame');
    const previous=element('round-previous'),next=element('round-next'),loop=element('round-loop-toggle'),precount=element('round-precount-toggle');
    const key=`play12.round-loop.v1:${title}`;
    c.loopGapInput.value='direct';
    try{
      const saved=JSON.parse(localStorage.getItem(key));
      if(saved&&Number.isInteger(saved.from)&&Number.isInteger(saved.to)&&saved.from>=1&&saved.to<=total&&saved.from<=saved.to){
        c.loopStartInput.value=String(saved.from-1);c.loopEndInput.value=String(saved.to-1);c.loopInput.checked=saved.loop===true;c.countInInput.checked=saved.precount===true;
      }
    }catch(_){}
    const publish=action=>{try{localStorage.setItem(key,JSON.stringify({from:Number(c.loopStartInput.value)+1,to:Number(c.loopEndInput.value)+1,loop:c.loopInput.checked,precount:c.countInInput.checked}));}catch(_){}global.dispatchEvent(new CustomEvent('play12:round-control',{detail:{action}}));};
    c.rounds.forEach((round,index)=>{
      const block=document.createElement('span');block.className='round-mini-block';block.textContent=String(index+1);block.dataset.round=String(index+1);
      for(const [hand,edge] of [['L','top'],['R','bottom']]){const color=ribbonFor(repetitions,hand,index+1);if(color){const ribbon=document.createElement('i');ribbon.className='round-mini-ribbon is-'+edge;ribbon.style.backgroundColor=color;ribbon.dataset.hand=hand;block.appendChild(ribbon);}}
      timeline.insertBefore(block,frame);
    });
    const update=position=>{
      const index=position>=c.rounds[total-1].end?total-1:roundIndex(c.rounds,Math.max(0,position));
      element('current-round').textContent=String(index+1);root.dataset.currentRound=String(index+1);previous.disabled=index===0;next.disabled=index===total-1;
      // Equal-width blocks require interpolation inside the actual current measure.
      const round=c.rounds[index],fraction=clamp((position-round.start)/(round.end-round.start),0,1);
      head.style.left=`${(index+fraction)/total*100}%`;
      const from=Number(c.loopStartInput.value),to=Number(c.loopEndInput.value);
      element('round-from').textContent=String(from+1);element('round-to').textContent=String(to+1);
      loop.setAttribute('aria-pressed',String(c.loopInput.checked));precount.setAttribute('aria-pressed',String(c.countInInput.checked));
      frame.hidden=!c.loopInput.checked;frame.style.left=`${from/total*100}%`;frame.style.width=`${(to-from+1)/total*100}%`;
      for(const id of ['round-from-minus','round-from-plus','round-to-minus','round-to-plus'])element(id).disabled=!c.loopInput.checked;
      element('round-range-controls').classList.toggle('is-disabled',!c.loopInput.checked);
    };
    for(const [button,direction] of [[previous,-1],[next,1]])button.addEventListener('click',()=>{c.moveRound(direction);update(c.clock.position);publish('navigate');});
    loop.addEventListener('click',()=>{
      c.loopInput.checked=!c.loopInput.checked;c.loopInput.dispatchEvent(new Event('change'));
      const range=c.currentLoop();
      c.pauseImmediate(range&&(c.clock.position<range.start||c.clock.position>=range.end)?range.start:c.clock.position);
      update(c.clock.position);publish(c.loopInput.checked?'loop-on':'loop-off');
    });
    for(const [id,input,direction] of [['round-from-minus',c.loopStartInput,-1],['round-from-plus',c.loopStartInput,1],['round-to-minus',c.loopEndInput,-1],['round-to-plus',c.loopEndInput,1]])element(id).addEventListener('click',()=>{
      if(!c.loopInput.checked)return;
      const from=Number(c.loopStartInput.value),to=Number(c.loopEndInput.value);
      const value=clamp(Number(input.value)+direction,input===c.loopEndInput?from:0,input===c.loopStartInput?to:total-1);
      if(value===Number(input.value))return;input.value=String(value);
      const range=c.currentLoop();c.pauseImmediate(c.clock.position>=range.start&&c.clock.position<range.end?c.clock.position:range.start);
      update(c.clock.position);publish('range');
    });
    precount.addEventListener('click',()=>{c.countInInput.checked=!c.countInInput.checked;if(!c.countInInput.checked&&c.countIn)c.pauseImmediate(c.countIn.selected);update(c.clock.position);publish('precount');});
    const pulse=()=>{if(root.hidden||!c.metronomeInput.checked)return;head.classList.remove('is-beat');void head.offsetWidth;head.classList.add('is-beat');};
    update(c.clock.position);
    return {root,update,pulse};
  }
  global.Play12RoundBoard={create,roundIndex,ribbonFor};
})(window);
