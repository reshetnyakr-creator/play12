/* Compact round controls reuse the production player's position and loop inputs. */
(function(global){
  'use strict';
  const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
  const normalizeRange=(total,from,to)=>{
    if(total<2)return {from:0,to:0};
    const nextFrom=clamp(Number(from)||0,0,total-2);
    const nextTo=clamp(Number(to)||0,nextFrom+1,total-1);
    return {from:nextFrom,to:nextTo};
  };
  const editRange=(total,from,to,which,direction)=>{
    const current=normalizeRange(total,from,to);
    if(which==='from'){
      const nextFrom=clamp(current.from+direction,0,Math.max(0,total-2));
      return normalizeRange(total,nextFrom,nextFrom>=current.to?nextFrom+1:current.to);
    }
    return normalizeRange(total,current.from,clamp(current.to+direction,current.from+1,Math.max(0,total-1)));
  };
  const roundIndex=(rounds,position)=>Math.max(0,rounds.findIndex(round=>position>=round.start-1e-7&&position<round.end-1e-7));
  const ribbonFor=(repetitions,hand,number)=>repetitions.segments.find(segment=>segment.hand===hand&&segment.occurrences.some(o=>number>=o.measure_start&&number<=o.measure_end))?.display_color;
  function create({root,playback:c,repetitions,title}){
    const element=id=>root.querySelector('#'+id), total=c.rounds.length;
    const timeline=element('round-timeline'),strip=element('round-strip'),head=element('round-playhead'),frame=element('round-loop-frame');
    const previous=element('round-previous'),next=element('round-next'),loop=element('round-loop-toggle'),precount=element('round-precount-toggle');
    const key=`play12.round-loop.v1:${title}`;
    c.loopGapInput.value='direct';
    try{
      const saved=JSON.parse(localStorage.getItem(key));
      if(saved&&Number.isInteger(saved.from)&&Number.isInteger(saved.to)&&saved.from>=1&&saved.to<=total){
        const range=normalizeRange(total,saved.from-1,saved.to-1);
        c.loopStartInput.value=String(range.from);c.loopEndInput.value=String(range.to);c.loopInput.checked=saved.loop===true;c.countInInput.checked=saved.precount===true;
      }
    }catch(_){}
    const initialRange=normalizeRange(total,c.loopStartInput.value,c.loopEndInput.value);
    c.loopStartInput.value=String(initialRange.from);c.loopEndInput.value=String(initialRange.to);
    const publish=action=>{try{localStorage.setItem(key,JSON.stringify({from:Number(c.loopStartInput.value)+1,to:Number(c.loopEndInput.value)+1,loop:c.loopInput.checked,precount:c.countInInput.checked}));}catch(_){}global.dispatchEvent(new CustomEvent('play12:round-control',{detail:{action}}));};
    c.rounds.forEach((round,index)=>{
      const block=document.createElement('span');block.className='round-mini-block';block.textContent=String(index+1);block.dataset.round=String(index+1);
      for(const [hand,edge] of [['L','top'],['R','bottom']]){const color=ribbonFor(repetitions,hand,index+1);if(color){const ribbon=document.createElement('i');ribbon.className='round-mini-ribbon is-'+edge;ribbon.style.backgroundColor=color;ribbon.dataset.hand=hand;block.appendChild(ribbon);}}
      strip.insertBefore(block,frame);
    });
    const pc=document.createElement('span');pc.className='round-mini-block round-mini-pc';pc.textContent='PC';pc.setAttribute('aria-label','Pre-count');
    const syncGeometry=()=>{
      const bpm=document.getElementById('metronome-board'),practice=document.getElementById('practice-board'),control=document.getElementById('metronome-toggle');
      if(root.hidden || !bpm || bpm.hidden || !practice || practice.hidden)return;
      const b=bpm.getBoundingClientRect(),p=practice.getBoundingClientRect(),row=root.parentElement.getBoundingClientRect(),h=control.getBoundingClientRect().height;
      if(h>0)root.style.setProperty('--round-mini-height',`${h}px`);
      const height=`${p.bottom-b.top}px`,bottom=`${row.bottom-p.bottom}px`;
      if(root.style.height!==height)root.style.height=height;if(root.style.bottom!==bottom)root.style.bottom=bottom;
    };
    const update=position=>{
      syncGeometry();
      const musicalPosition=c.countIn?.selected ?? position;
      const index=musicalPosition>=c.rounds[total-1].end?total-1:roundIndex(c.rounds,Math.max(0,musicalPosition));
      element('current-round').textContent=String(index+1);root.dataset.currentRound=String(index+1);previous.disabled=index===0;next.disabled=index===total-1;
      // Equal-width blocks require interpolation inside the actual current measure.
      const round=c.rounds[index],fraction=clamp((position-round.start)/(round.end-round.start),0,1);
      const width=Number.parseFloat(getComputedStyle(root).getPropertyValue('--mini-round-width')) || 62;
      const count=c.countIn;
      let pcUnits=0,pcIndex=-1,stripPosition=index+fraction;
      if(count){
        pcIndex=roundIndex(c.rounds,count.selected);pcUnits=1;
        pc.style.width=`${pcUnits*width}px`;pc.style.flexBasis=`${pcUnits*width}px`;
        const target=strip.querySelector(`[data-round="${pcIndex+1}"]`);if(pc.nextSibling!==target)strip.insertBefore(pc,target);
        const elapsed=clamp(c.audioContext.currentTime-count.startedAt,0,count.endsAt-count.startedAt);
        stripPosition=pcIndex+elapsed/(count.endsAt-count.startedAt);
        root.dataset.precountVisible='true';
      }else{pc.remove();root.dataset.precountVisible='false';}
      strip.style.transform=`translateX(${-stripPosition*width}px)`;
      root.dataset.stripPosition=String(stripPosition);
      const from=Number(c.loopStartInput.value),to=Number(c.loopEndInput.value);
      element('round-from').textContent=String(from+1);element('round-to').textContent=String(to+1);
      loop.setAttribute('aria-pressed',String(c.loopInput.checked));precount.setAttribute('aria-pressed',String(c.countInInput.checked));
      frame.hidden=!c.loopInput.checked;frame.style.left=`${(from+(pcIndex>=0&&pcIndex<=from?pcUnits:0))*width}px`;frame.style.width=`${(to-from+1+(pcIndex>from&&pcIndex<=to?pcUnits:0))*width}px`;
      element('round-from-minus').disabled=!c.loopInput.checked||from===0;
      element('round-from-plus').disabled=!c.loopInput.checked||from>=Math.max(0,total-2);
      element('round-to-minus').disabled=!c.loopInput.checked||to<=from+1;
      element('round-to-plus').disabled=!c.loopInput.checked||to>=total-1;
      element('round-range-controls').classList.toggle('is-disabled',!c.loopInput.checked);
    };
    for(const [button,direction] of [[previous,-1],[next,1]])button.addEventListener('click',()=>{c.moveRound(direction);update(c.clock.position);publish('navigate');});
    loop.addEventListener('click',()=>{
      const valid=normalizeRange(total,c.loopStartInput.value,c.loopEndInput.value);
      c.loopStartInput.value=String(valid.from);c.loopEndInput.value=String(valid.to);
      c.loopInput.checked=!c.loopInput.checked;c.loopInput.dispatchEvent(new Event('change'));
      const range=c.currentLoop();
      c.pauseImmediate(range&&(c.clock.position<range.start||c.clock.position>=range.end)?range.start:c.clock.position);
      update(c.clock.position);publish(c.loopInput.checked?'loop-on':'loop-off');
    });
    for(const [id,input,direction] of [['round-from-minus',c.loopStartInput,-1],['round-from-plus',c.loopStartInput,1],['round-to-minus',c.loopEndInput,-1],['round-to-plus',c.loopEndInput,1]])element(id).addEventListener('click',()=>{
      if(!c.loopInput.checked)return;
      const before=normalizeRange(total,c.loopStartInput.value,c.loopEndInput.value);
      const after=editRange(total,before.from,before.to,input===c.loopStartInput?'from':'to',direction);
      if(after.from===before.from&&after.to===before.to)return;
      c.loopStartInput.value=String(after.from);c.loopEndInput.value=String(after.to);
      const range=c.currentLoop();c.pauseImmediate(c.clock.position>=range.start&&c.clock.position<range.end?c.clock.position:range.start);
      update(c.clock.position);publish('range');
    });
    for(const input of [c.loopStartInput,c.loopEndInput])input.addEventListener('change',()=>{
      const range=normalizeRange(total,c.loopStartInput.value,c.loopEndInput.value);
      c.loopStartInput.value=String(range.from);c.loopEndInput.value=String(range.to);
      if(!c.loopInput.checked){update(c.clock.position);return;}
      const loopRange=c.currentLoop();c.pauseImmediate(c.clock.position>=loopRange.start&&c.clock.position<loopRange.end?c.clock.position:loopRange.start);
      update(c.clock.position);publish('range');
    });
    precount.addEventListener('click',()=>{c.countInInput.checked=!c.countInInput.checked;if(!c.countInInput.checked&&c.countIn)c.pauseImmediate(c.countIn.selected);update(c.clock.position);publish('precount');});
    const pulse=()=>{if(root.hidden||!c.metronomeInput.checked)return;head.classList.remove('is-beat');void head.offsetWidth;head.classList.add('is-beat');};
    const reset=()=>{
      c.loopInput.checked=false;c.countInInput.checked=false;c.loopStartInput.value='0';c.loopEndInput.value=total>1?'1':'0';
      try{localStorage.removeItem(key);}catch(_){}
      c.pauseImmediate(0);update(0);
    };
    update(c.clock.position);
    return {root,update,pulse,reset};
  }
  global.Play12RoundBoard={create,roundIndex,ribbonFor,normalizeRange,editRange};
})(window);
