(function(global){
  'use strict';
  const t=(key,params)=>global.Play12I18n?.t?.(key,params)??key;
  const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));

  function indexAt(rounds,position){
    let lo=0,hi=rounds.length;
    while(lo<hi){
      const mid=(lo+hi)>>>1;
      if(rounds[mid].start<=position+1e-7)lo=mid+1;
      else hi=mid;
    }
    return Math.max(0,lo-1);
  }

  const bpmMin=20,bpmMax=300;
  const tempoSteps=Array.from({length:bpmMax-bpmMin+1},(_,i)=>({start:i+bpmMin}));
  function create(playback,tempo=false){
    if(tempo)playback={stage:playback.stage,rounds:tempoSteps,executionY:()=>playback.controller.executionY(),
      controller:playback,clock:{position:playback.clock.bpm},seek:value=>playback.controller.setUserBpm(value)};
    const {stage,rounds}=playback, doc=stage.ownerDocument, last=rounds.length-1;
    if(last<0)return null;
    const root=doc.createElement('div');
    root.id=tempo?'tempo-navigator':'round-navigator';
    root.className='round-navigator';
    root.setAttribute('role','group');
    root.setAttribute('aria-label',t(tempo?'Tempo':'Round Navigation'));
    function button(text,label){
      const item=doc.createElement('button');
      item.type='button';
      item.textContent=text;
      item.setAttribute('aria-label',t(label));
      root.append(item);
      return item;
    }
    const next=button('▲',tempo?'Increase tempo by 1 BPM':'Next round');
    const number=button('1','Go to round');
    const previous=button('▼',tempo?'Decrease tempo by 1 BPM':'Previous round');
    number.className='round-navigator-number';

    stage.append(root);
    stage.classList.add(tempo?'has-tempo-navigator':'has-round-navigator');

    let index=-1,travel=0,gesture=null,frame=0,blocked=false;
    function update(position){
      const current=indexAt(rounds,position);
      if(index===current)return;
      index=current;
      number.textContent=tempo?String(rounds[index].start):String(index+1);

      number.style.fontSize=number.textContent.length>3?`max(1px, calc(var(--round-nav-size) * ${1.36/number.textContent.length}))`:'';
      if(tempo){const unit=doc.createElement('small');unit.textContent='BPM';number.append(unit);}
      number.setAttribute('aria-label',tempo?t('Metronome')+' · '+rounds[index].start+' BPM':t('Round {number}',{number:index+1})+' · '+t('Go to round'));
      previous.disabled=index===0;
      next.disabled=index===last;
      root.style.setProperty('--round-nav-offset',`${last?travel*index/last:0}px`);
    }
    function layout(){
      const bar=stage.getBoundingClientRect(),grab=doc.getElementById('playback-grid')?.getBoundingClientRect();
      if(!bar.width||!bar.height)return;
      const scaleX=bar.width/stage.offsetWidth||1,scaleY=bar.height/stage.offsetHeight||1;
      const size=grab?.height ? grab.height/scaleY : 30;
      root.style.setProperty('--round-nav-size',size+'px');
      if(!tempo&&grab?.width)root.style.setProperty('--round-nav-x',((grab.left+grab.width/2-bar.left)/scaleX)+'px');
      const area=Math.min(stage.offsetHeight,playback.executionY());
      const bottom=Math.max(0,stage.offsetHeight-area)+4;
      root.style.bottom=bottom+'px';
      travel=Math.max(0,area-root.offsetHeight-8);
      root.dataset.travel=String(travel*scaleY);
      const current=index;
      index=-1;
      update(rounds[Math.max(0,current)].start);
    }
    const canMove=direction=>!root.hidden&&index+direction>=0&&index+direction<=last;
    function jump(target){
      if(target===index||target<0||target>last)return false;
      playback.seek(rounds[target].start);
      update(rounds[target].start);
      playback.roundBoard?.notifyNavigation?.();
      return true;
    }
    previous.addEventListener('click',()=>{if(!blocked)jump(index-1);});
    next.addEventListener('click',()=>{if(!blocked)jump(index+1);});
    let pulse;
    if(tempo){
      root.style.touchAction='none';
      number.id='tempo-metronome';
      number.setAttribute('aria-keyshortcuts','Home');
      number.setAttribute('aria-pressed','false');
      let tap=null,press=null;
      const controller=playback.controller;
      const toggle=()=>controller.setMetronome(!controller.metronomeInput.checked);
      const activate=()=>{
        if(tap!==null){
          global.clearTimeout(tap);
          tap=null;
          // The panel moves before the synthesized click is dispatched.
          blocked=true;
          controller.setUserBpm(null);
          return;
        }
        tap=global.setTimeout(()=>{tap=null;toggle();},300);
      };
      number.addEventListener('pointerdown',event=>{
        if(event.isPrimary&&event.button===0)press={id:event.pointerId,x:event.clientX,y:event.clientY};
      });
      global.addEventListener('pointerup',event=>{
        if(press?.id!==event.pointerId)return;
        const moved=Math.hypot(event.clientX-press.x,event.clientY-press.y);
        press=null;
        if(!gesture?.dragged&&moved<5&&number.contains(event.target))activate();
      });
      global.addEventListener('pointercancel',event=>{if(press?.id===event.pointerId)press=null;});
      number.addEventListener('click',event=>{if(!event.detail&&!event.pointerType)toggle();});
      number.addEventListener('keydown',event=>{
        if(event.key==='Home'){
          event.preventDefault();
          if(tap!==null)global.clearTimeout(tap);
          tap=null;
          controller.setUserBpm(null);
        }
      });
      pulse=()=>{beat?.cancel();beat=number.animate?.([{backgroundColor:'#CEF932'},{backgroundColor:'#CEF932'}],110);};
    }else{
      const dialog=doc.createElement('dialog');
      dialog.className='round-navigator-dialog';

      const form=doc.createElement('form');
      form.method='dialog';
      const label=doc.createElement('label');
      label.textContent=t('Go to round');
      const input=doc.createElement('input');
      input.inputMode='numeric';
      input.autocomplete='off';
      input.pattern='[0-9]+';
      input.required=true;
      label.append(input);
      const range=doc.createElement('small');
      range.textContent='1–'+rounds.length;
      const go=doc.createElement('button');
      go.textContent=t('Go');
      const cancel=doc.createElement('button');
      cancel.type='button';
      cancel.textContent=t('Cancel');
      cancel.addEventListener('click',()=>dialog.close());
      form.append(label,range,go,cancel);
      dialog.append(form);
      doc.body.append(dialog);
      number.addEventListener('click',()=>{
        if(blocked)return;
        input.value=String(index+1);
        input.setCustomValidity('');
        dialog.showModal();
        input.focus();
        input.select();
      });
      input.addEventListener('input',()=>input.setCustomValidity(''));
      form.addEventListener('submit',event=>{
        event.preventDefault();
        const target=Number(input.value);
        if(!/^\d+$/.test(input.value)||!Number.isSafeInteger(target)||target<1||target>rounds.length){
          input.setCustomValidity(range.textContent);
          input.reportValidity();
          return;
        }
        dialog.close();
        jump(target-1);
      });
    }
    let beat;
    function metronome(enabled,active){
      if(!tempo)return;
      const pressed=String(enabled),running=String(active);
      if(number.getAttribute('aria-pressed')===pressed&&number.dataset.ticking===running)return;
      beat?.cancel();
      number.setAttribute('aria-pressed',pressed);
      number.dataset.ticking=running;
    }
    const apply=(y,state)=>{
      const target=Math.round(clamp(state.index/last+(state.y-y)/Number(root.dataset.travel),0,1)*last);
      jump(target);
    };
    root.addEventListener('pointerdown',event=>{
      if(tempo&&event.isPrimary)blocked=false;
      if(gesture||event.button!==0||!last||!travel)return;
      blocked=false;
      gesture={id:event.pointerId,y:event.clientY,index,dragged:false};
    });
    global.addEventListener('pointermove',event=>{
      if(!gesture||gesture.id!==event.pointerId||!travel)return;
      if(!gesture.dragged&&Math.abs(gesture.y-event.clientY)<5)return;
      if(!gesture.dragged){
        gesture.dragged=true;
        root.setPointerCapture(event.pointerId);
        if(playback.clock.running||playback.countIn||playback.waitingForInput)playback.seek(rounds[index].start);
      }
      gesture.latest=event.clientY;
      if(!frame)frame=global.requestAnimationFrame(()=>{
        frame=0;
        if(gesture)apply(gesture.latest,gesture);
      });
    });
    function finish(event){
      if(!gesture||event.pointerId!==gesture.id)return;
      const state=gesture;
      gesture=null;
      if(frame)global.cancelAnimationFrame(frame);
      frame=0;
      if(!state.dragged)return;
      blocked=true;
      if(event.type==='pointerup')apply(event.clientY,state);
      global.setTimeout(()=>{blocked=false;},0);
    }
    global.addEventListener('pointerup',finish);
    root.addEventListener('pointercancel',finish);
    root.addEventListener('click',event=>{
      if(blocked&&(!tempo||event.detail)){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    new ResizeObserver(layout).observe(stage);
    update(playback.clock.position);
    layout();
    return {root,update,layout,canMove,move:direction=>jump(index+direction),metronome,pulse};
  }

  global.Play12RoundNavigator={create,indexAt};
  global.Play12TempoNavigator={create:playback=>create(playback,true)};
})(window);
