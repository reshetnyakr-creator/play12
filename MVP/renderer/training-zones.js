/* External three-zone layout. One existing runtime; navigation never changes music state. */
(function(G){'use strict';
const gap=10,zoneGap=18;
const local=(ru,en)=>G.Play12I18n?.isRu?.()??true?ru:en;
function fit(width,available){return Math.min(1,Math.max(0,available)/Math.max(1,width));}
function metrics(available,left,music,right){const minimum=Math.max(left,music,right),unscaledThreshold=3*minimum+2*zoneGap;
 // A fit threshold for unscaled panels is not a desktop/mobile breakpoint.
 // Keep music at >=90% and the existing compact Left pair at >=75%.
 const threshold=Math.ceil(Math.max(3*music*.9+2*zoneGap,3*Math.min(left,405)*.75+2*zoneGap));
 return{wide:available>=1232||available>=threshold,threshold,unscaledThreshold,minimum};}
function corridors({left,right,playbackLeft,playbackRight,gap,leftWidth,rightWidth}){const leftAvailable=Math.max(0,playbackLeft-left-gap),rightAvailable=Math.max(0,right-playbackRight-gap);return{leftAvailable,rightAvailable,leftScale:fit(leftWidth,leftAvailable),rightScale:fit(rightWidth,rightAvailable)};}
function fieldBudget(zoneHeight,chromeHeight,scale,lineHeight){return Math.max(0,Math.floor((Math.max(0,zoneHeight-chromeHeight))/Math.max(.01,scale)-lineHeight));}
function compositionRange(events){const notes=events.map(e=>e.midi).filter(n=>Number.isInteger(n)&&n>=0&&n<=127);return notes.length?{min:Math.min(...notes),max:Math.max(...notes)}:{min:60,max:72,empty:true};}
// A saved calibration is applicable only while its exact MIDI input is connected.
function physicalKeyboard(midi){
 const c=midi?.getCalibration?.();
 if(!c)return{range:null,reason:midi?.invalidSavedCalibration?local("Сохранённая калибровка MIDI повреждена. Показаны 88 клавиш.","Saved MIDI calibration is invalid. Showing 88 keys."):''};
 const valid=c.verified===true&&typeof c.inputId==='string'&&c.inputId.length>0&&Number.isInteger(c.channel)&&c.channel>=1&&c.channel<=16&&Number.isInteger(c.leftMidi)&&Number.isInteger(c.rightMidi)&&c.leftMidi>=21&&c.rightMidi<=108&&c.rightMidi>c.leftMidi&&c.keyCount===c.rightMidi-c.leftMidi+1&&c.functionMidi===c.rightMidi;
 if(!valid)return{range:null,reason:local("Сохранённый диапазон MIDI некорректен или не поддерживается (21–108). Показаны 88 клавиш.","The saved MIDI range is invalid or unsupported (21\u2013108). Showing 88 keys.")};
 const input=midi.inputHandlers?.get(c.inputId);
 return{range:midi.currentStatus?.status==='connected'&&input?.state==='connected'?{min:c.leftMidi,max:c.rightMidi}:null,reason:''};
}
function create({runtime,root,playbackHost,pianoHost,footer,zones,helpers}){
 let mounted=false,frame=0,observer,active=1,wide=false,initial=true,pendingRange=null,lastRange='',scrollFrame=0,desktopLeft=0,desktopRight=0,cachedEvents=null,cachedCount=-1,cachedZero=null,cachedRange=null;let motionTimer=0,hintTimer=0,transitioning=false,swipeHint=null,swipeShown=false;const off=[],homes=[];
 const {left,center,right}=zones,doc=root.ownerDocument||document;
 const node=(tag,cls)=>{const n=doc.createElement(tag);n.className=cls;return n;};
 const remember=n=>homes.push({n,parent:n.parentElement,next:n.nextSibling});
 const leftSlot=node('div','training-panel-slot'),leftControls=node('div','training-zone-controls training-left-controls'),rightSlot=node('div','training-panel-slot'),rightControls=node('div','training-zone-controls training-right-controls');
 const musicSlot=node('div','training-music-slot');let workspace,nav,warning,widthProbe,skillCard;
 const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);off.push(()=>target.removeEventListener(type,fn,options));};
 const popupOpen=()=>!!doc.querySelector('#main-fingers:not([hidden]),dialog[open],.zero-chooser:not([hidden])');
 const hidePopup=()=>{G.play12Main?.closePicker?.();const p=doc.getElementById('main-fingers');if(p)p.hidden=true;};
 const mark=()=>{[...nav.querySelectorAll('[data-zone-tab]')].forEach((b,i)=>b.setAttribute('aria-current',String(i===active)));root.dataset.activeZone=['left','center','right'][active];const arrows=nav.querySelectorAll('[data-zone-arrow]');if(arrows.length){arrows[0].disabled=active===0;arrows[1].disabled=active===2;}};
 function go(index,options={}){const next=Math.max(0,Math.min(2,index)),move=options.tutorial&&!wide&&next!==active,reduced=G.matchMedia?.('(prefers-reduced-motion: reduce)').matches;active=next;hidePopup();G.clearTimeout(motionTimer);transitioning=move&&!reduced;
  if(move&&!swipeShown){swipeShown=true;swipeHint=node('p','training-swipe-hint');swipeHint.textContent=local('Проведите пальцем влево или вправо, чтобы переключаться между экранами','Swipe left or right to switch between screens.');swipeHint.setAttribute('role','status');footer.prepend(swipeHint);hintTimer=G.setTimeout(()=>{swipeHint?.remove();swipeHint=null;resize();},3500);}
  root.scrollTo({left:wide?0:root.clientWidth*active,behavior:transitioning?'smooth':'auto'});mark();if(transitioning)motionTimer=G.setTimeout(()=>{transitioning=false;root.scrollTo({left:root.clientWidth*active,behavior:'auto'});mark();},400);
 }
 function scaleSlot(slot,content,width){const parent=slot.parentElement,style=getComputedStyle(parent),available=parent.clientWidth-parseFloat(style.paddingLeft||0)-parseFloat(style.paddingRight||0),s=fit(width,available);content.style.transform=`scale(${s})`;content.style.transformOrigin='top left';slot.style.width=`${width*s}px`;slot.style.height=`${content.offsetHeight*s}px`;slot.dataset.scale=String(s);return s;}
 function layoutCorridors(){
  if(!wide){left.style.paddingBottom='';leftSlot.style.left='';rightSlot.style.right='';right.style.paddingBottom='';if(skillCard)skillCard.style.height='';rightControls.children[0].style.width='';return;}
  const profile=left.querySelector('.main-profile'),library=left.querySelector('.main-library-card');if(!profile||!library)return;
  const line=doc.getElementById('playline'),p=line.getBoundingClientRect(),a=profile.getBoundingClientRect(),b=right.getBoundingClientRect(),spacing=parseFloat(getComputedStyle(leftControls).columnGap)||gap;
  const c=corridors({left:a.left,right:b.right,playbackLeft:p.left,playbackRight:p.right,gap:spacing,leftWidth:desktopLeft,rightWidth:desktopRight});
  const round=rightControls.children[0];round.style.width=Math.max(372,c.rightAvailable)+'px';
  const ls=fit(leftControls.scrollWidth,c.leftAvailable),rs=fit(rightControls.scrollWidth,c.rightAvailable);
  for(const[slot,content,s]of [[leftSlot,leftControls,ls],[rightSlot,rightControls,rs]]){content.style.transform=`scale(${s})`;content.style.transformOrigin='top left';slot.style.width=content.scrollWidth*s+'px';slot.style.height=content.offsetHeight*s+'px';slot.dataset.scale=String(s);}
  leftSlot.style.left=a.left-left.getBoundingClientRect().left+'px';rightSlot.style.right='0px';const reserve=Math.max(leftControls.offsetHeight*ls,rightControls.offsetHeight*rs)+14;left.style.paddingBottom=reserve+'px';right.style.paddingBottom=reserve+'px';
  const lib=library.getBoundingClientRect();if(skillCard)skillCard.style.height=Math.max(0,lib.bottom-a.top)+'px';
 }
 function alignTitle(){const heading=center.querySelector('.main-tools h1'),cells=runtime.stage.querySelectorAll?.('.play12-cell');if(!heading||!cells?.length)return;const rects=[...cells].map(n=>n.getBoundingClientRect()),x=Math.min(...rects.map(r=>r.left)),rightEdge=Math.max(...rects.map(r=>r.right)),inset=Math.max(0,x-center.getBoundingClientRect().left);heading.classList.add('main-title-board');heading.style.marginInlineStart=inset+'px';heading.style.width=(rightEdge-x)+'px';
  let label=heading.querySelector('.main-title-text');if(!label){label=node('span','main-title-text');label.textContent=heading.textContent;heading.replaceChildren(label);}heading.title=label.textContent;heading.setAttribute('aria-label',label.textContent);const hs=getComputedStyle(heading),available=heading.clientWidth-(parseFloat(hs.paddingLeft)||0)-(parseFloat(hs.paddingRight)||0),travel=Math.max(0,label.scrollWidth-available);heading.classList.toggle('is-overflowing',travel>1);heading.setAttribute('tabindex',travel>1?'0':'-1');heading.style.setProperty('--title-travel',-travel+'px');heading.style.setProperty('--title-duration',Math.max(12,travel/20+6)+'s');
 }
 function rangeForComposition(){const p=runtime.playback,events=p.events||[];if(events!==cachedEvents||events.length!==cachedCount||p.runtimeZeroNote!==cachedZero){cachedEvents=events;cachedCount=events.length;cachedZero=p.runtimeZeroNote;cachedRange=compositionRange(events);}return cachedRange;}
 function updateRangeWarning(physical){const n=doc.getElementById('keyboard-range-warning');if(!n)return;const outside=physical.range&&(runtime.playback.events||[]).some(e=>Number.isInteger(e.midi)&&(e.midi<physical.range.min||e.midi>physical.range.max));
 // Preserve independent warnings (for example, fingering after changing zero).
 if(!n.hidden&&n.textContent!==n.dataset.rangeMessage)n.dataset.rangeBaseMessage=n.textContent;
 const message=physical.reason||(outside?local("В произведении есть ноты за пределами диапазона подключённой MIDI-клавиатуры.","This piece uses notes outside your connected keyboard range."):'');
 const text=[n.dataset.rangeBaseMessage,message].filter(Boolean).join(' ');if(n.textContent!==text)n.textContent=text;n.dataset.rangeMessage=text;n.hidden=!text;
 }
 function updateKeyboard(){const piano=runtime.pianoView,busy=runtime.midiDiagnostic?.inputBusy?.()||piano.virtualPointers.size>0||[...piano.activeBySource].some(([,set])=>set.size>0);const physical=physicalKeyboard(runtime.midiDiagnostic);updateRangeWarning(physical);const next=wide?physical.range:rangeForComposition(),key=JSON.stringify([wide,next]);root.dataset.keyboardMode=wide?(next?'desktop-physical':'desktop-full'):'composition-range';if(key===lastRange){pendingRange=null;return;}if(busy){pendingRange=next;return;}if(piano.setWorkspaceKeyboard)piano.setWorkspaceKeyboard(wide?'desktop':'adaptive',next);else piano.setVisualWindow?.(next);lastRange=key;pendingRange=null;root.dataset.keyboardMode=wide?(next?'desktop-physical':'desktop-full'):'composition-range';}
 function layout(){if(!mounted)return;const viewportHeight=G.visualViewport?.height||G.innerHeight;doc.body.style.setProperty('--training-viewport-height',viewportHeight+'px');doc.body.style.setProperty('--training-visual-top',(G.visualViewport?.offsetTop||0)+'px');runtime.playback.layoutCoreGeometry();const music=parseFloat(runtime.stage.style.width)||runtime.stage.offsetWidth,l=desktopLeft,r=desktopRight,m=metrics(widthProbe.clientWidth,l,music,r);const nextWide=G.Play12Responsive?.state==='tablet-landscape'?true:['tablet-portrait','phone-portrait','phone-landscape'].includes(G.Play12Responsive?.state)?false:m.wide;const changed=wide!==nextWide;wide=nextWide;root.classList.toggle('is-three-wide',wide);root.classList.toggle('is-three-narrow',!wide);root.dataset.wideThreshold=String(m.threshold);root.dataset.unscaledThreshold=String(m.unscaledThreshold);root.dataset.keyboardMode=wide?'desktop-full':'composition-range';nav.hidden=wide;root.style.setProperty('--training-music-width',music+'px');
  // Keep measured intrinsic sizes stable: CSS removes legacy viewport-based widths only in these slots.
  if(!wide){layoutCorridors();scaleSlot(leftSlot,leftControls,leftControls.scrollWidth);scaleSlot(rightSlot,rightControls,rightControls.scrollWidth);}
  layoutCorridors();const s=fit(music,center.clientWidth);workspace.style.transform=`scale(${s})`;workspace.style.transformOrigin='top left';musicSlot.style.width=music*s+'px';const footerHeight=footer.getBoundingClientRect().height;root.style.setProperty('--training-footer-height',footerHeight+'px');document.body.style.setProperty('--training-footer-height',footerHeight+'px');
  alignTitle();const cs=getComputedStyle(center),visible=[...center.children].filter(n=>!n.hidden&&n!==playbackHost&&getComputedStyle(n).display!=='none'),chrome=visible.reduce((sum,n)=>{const style=getComputedStyle(n);return sum+n.getBoundingClientRect().height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);},0)+visible.length*(parseFloat(cs.rowGap)||0),available=center.clientHeight||center.getBoundingClientRect().height,field=fieldBudget(available,chrome,s,doc.getElementById('playline').offsetHeight);runtime.stage.style.height=field+'px';root.dataset.viewportLimited=String(field<2*(runtime.playback.cellHeight||32));musicSlot.style.height=(runtime.stage.offsetHeight+doc.getElementById('playline').offsetHeight)*s+'px';runtime.playback.layoutCoreGeometry();layoutCorridors();alignTitle();updateKeyboard();runtime.pianoView.syncContainer();
  warning.hidden=root.dataset.viewportLimited!=='true'&&(wide||!runtime.pianoView.windowReadabilityLimited?.());warning.textContent=root.dataset.viewportLimited==='true'?local("Недостаточно высоты окна для удобного нотного поля. Увеличьте окно или измените ориентацию.","The window is too short for a comfortable note field. Enlarge it or change orientation."):local("Диапазон произведения показан целиком. На этом экране обозначения клавиш могут быть слишком мелкими.","The complete piece range is shown. Key labels may be too small on this screen.");
  if(initial||changed){initial=false;go(active);}mark();
 }
 const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(layout);};
 return{resize,layoutNow(){cancelAnimationFrame(frame);layout();},go,get activeZone(){return active;},get transitioning(){return transitioning;},mount(){if(mounted)return;mounted=true;widthProbe=node('div','training-width-probe');widthProbe.setAttribute('aria-hidden','true');root.before(widthProbe);root.classList.add('training-three-zones','training-shell-main');doc.body.classList.add('play12-training-shell','play12-three-zones');
  remember(footer);for(const n of [runtime.stage,doc.getElementById('playline'),runtime.pianoView.mount,doc.getElementById('metronome-board'),doc.getElementById('practice-board'),doc.getElementById('practice-loop-board')||doc.getElementById('round-loop-board'),doc.getElementById('onboarding-choose-zero')])remember(n);
  if(right.classList.contains('main-skill')){skillCard=node('section','main-skill training-skill-card');while(right.firstChild)skillCard.append(right.firstChild);right.classList.remove('main-skill');right.append(skillCard);}
  left.classList.add('training-zone','training-zone-left');center.classList.add('training-zone','training-zone-center');right.classList.add('training-zone','training-zone-right');
  for(const [i,n]of [left,center,right].entries()){n.setAttribute('aria-label',[local("Профиль и мелодии","Profile and melodies"),local("Музыкальное рабочее пространство","Music workspace"),local("Skill Bank и раунды","Skill Bank and rounds")][i]);n.setAttribute('tabindex','0');}
  footer.classList.add('training-persistent-footer');root.after(footer);helpers.placePiano(runtime.pianoView.mount,pianoHost);
  const bpm=doc.getElementById('metronome-board'),practice=doc.getElementById('practice-board'),round=doc.getElementById('round-loop-board'),zero=doc.getElementById('onboarding-choose-zero');const board=doc.getElementById('practice-loop-board')||round;for(const n of [bpm,practice,round,board,zero])n.hidden=false;
  leftControls.append(bpm);rightControls.append(board);const grab=doc.getElementById('playback-grid');grab.parentElement.insertBefore(zero,grab);leftSlot.append(leftControls);rightSlot.append(rightControls);left.append(leftSlot);right.append(rightSlot);desktopLeft=leftControls.scrollWidth;desktopRight=rightControls.scrollWidth;
  workspace=helpers.mountWorkspace(runtime.stage,playbackHost,doc.getElementById('playline'));workspace.dataset.progressContract='local';workspace.parentElement.insertBefore(musicSlot,workspace);musicSlot.append(workspace);
  nav=node('nav','training-zone-navigation');nav.setAttribute('aria-label',local("Области рабочего пространства","Workspace areas"));[local("Мои мелодии","My melodies"),local("Музыка","Music"),local("Раунды","Rounds")].forEach((text,i)=>{const b=doc.createElement('button');b.type='button';b.dataset.zoneTab=String(i);b.textContent=text;b.onclick=()=>go(i);nav.append(b);});for(const [delta,label]of [[-1,local('Предыдущая панель','Previous panel')],[1,local('Следующая панель','Next panel')]]){const arrow=doc.createElement('button');arrow.type='button';arrow.className='training-nav-arrow';arrow.dataset.zoneArrow=String(delta);arrow.textContent=delta<0?'‹':'›';arrow.setAttribute('aria-label',label);arrow.onclick=()=>go(active+delta);delta<0?nav.prepend(arrow):nav.append(arrow);}footer.prepend(nav);warning=node('p','training-keyboard-notice');warning.hidden=true;footer.prepend(warning);
  off.push(helpers.bindPractice({playback:runtime.playback}),helpers.trackSuccess(runtime.playback));
  off.push(runtime.playback.addStateListener?.(()=>{if(initial)return;updateKeyboard();})||(()=>{}));
  const midi=runtime.midiDiagnostic;
  if(midi){off.push(midi.addStatusListener(resize),midi.addCalibrationListener(resize));if(midi.addInputStateListener)off.push(midi.addInputStateListener(()=>{if(mounted)updateKeyboard();}));}
  for(const type of ['pointerup','pointercancel','blur'])listen(G,type,resize);
  for(const type of ['pointerleave','lostpointercapture'])listen(runtime.pianoView.mount,type,resize);
  listen(root,'scroll',()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(()=>{if(!wide&&!transitioning){active=Math.round(root.scrollLeft/Math.max(1,root.clientWidth));active=Math.max(0,Math.min(2,active));hidePopup();mark();}});},{passive:true});
  listen(root,'keydown',e=>{if(e.target!==root&&![left,center,right].includes(e.target))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();go(active+(e.key==='ArrowLeft'?-1:1));}});
  listen(root,'touchstart',e=>{if(popupOpen())return;const interactive=e.target.closest('button,input,select,a,[role="dialog"],.mvp-round-loop-board,.mvp-practice-board,.mvp-metronome-board');if(interactive)e.stopPropagation();},{passive:true});
  observer=new ResizeObserver(resize);[root,footer,leftControls,rightControls,widthProbe].forEach(n=>observer.observe(n));
  // A status row can disappear without changing the fixed-height training shell.
  // Observe the inputs to the score height budget, excluding the score itself.
  for(const child of center.children){
    if(child!==playbackHost)observer.observe(child);
  }
  listen(G,'resize',resize);listen(G,'play12:responsive-layout',resize);if(doc.fonts){doc.fonts.ready?.then(resize);if(doc.fonts.addEventListener)listen(doc.fonts,'loadingdone',resize);}if(G.visualViewport){listen(G.visualViewport,'resize',resize);listen(G.visualViewport,'scroll',resize);}resize();
 },dispose(){if(!mounted)return;mounted=false;G.clearTimeout(motionTimer);G.clearTimeout(hintTimer);swipeHint?.remove();observer?.disconnect();cancelAnimationFrame(frame);cancelAnimationFrame(scrollFrame);off.splice(0).forEach(f=>f());for(const h of homes.reverse()){if(h.next?.parentElement===h.parent)h.parent.insertBefore(h.n,h.next);else h.parent.appendChild(h.n);}leftSlot.remove();rightSlot.remove();musicSlot.remove();nav.remove();warning.remove();widthProbe.remove();root.classList.remove('training-three-zones','training-shell-main','is-three-wide','is-three-narrow');doc.body.classList.remove('play12-three-zones','play12-training-shell');}};
}
G.Play12TrainingZones={fit,metrics,corridors,fieldBudget,compositionRange,physicalKeyboard,create};if(typeof module!=='undefined')module.exports=G.Play12TrainingZones;
})(typeof window!=='undefined'?window:globalThis);
