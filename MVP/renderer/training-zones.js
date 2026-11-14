/* External three-zone layout. One existing runtime; navigation never changes music state. */
(function(G){'use strict';
const gap=10,zoneGap=18;
function fit(width,available){return Math.min(1,Math.max(0,available)/Math.max(1,width));}
function metrics(available,left,music,right){const minimum=Math.max(left,music,right),unscaledThreshold=3*minimum+2*zoneGap;
 // A fit threshold for unscaled panels is not a desktop/mobile breakpoint.
 // Keep music at >=90% and the existing compact Left pair at >=75%.
 const threshold=Math.ceil(Math.max(3*music*.9+2*zoneGap,3*Math.min(left,405)*.75+2*zoneGap));
 return{wide:available>=1232||available>=threshold,threshold,unscaledThreshold,minimum};}
function compositionRange(events){const notes=events.map(e=>e.midi).filter(n=>Number.isInteger(n)&&n>=0&&n<=127);return notes.length?{min:Math.min(...notes),max:Math.max(...notes)}:{min:60,max:72,empty:true};}
function create({runtime,root,playbackHost,pianoHost,footer,zones,helpers}){
 let mounted=false,frame=0,observer,active=1,wide=false,initial=true,pendingRange=null,lastRange='',scrollFrame=0,desktopLeft=0,desktopRight=0,cachedEvents=null,cachedCount=-1,cachedZero=null,cachedRange=null;const off=[],homes=[];
 const {left,center,right}=zones,doc=root.ownerDocument||document;
 const node=(tag,cls)=>{const n=doc.createElement(tag);n.className=cls;return n;};
 const remember=n=>homes.push({n,parent:n.parentElement,next:n.nextSibling});
 const leftSlot=node('div','training-panel-slot'),leftControls=node('div','training-zone-controls training-left-controls'),rightSlot=node('div','training-panel-slot'),rightControls=node('div','training-zone-controls training-right-controls');
 const musicSlot=node('div','training-music-slot');let workspace,nav,warning,widthProbe;
 const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);off.push(()=>target.removeEventListener(type,fn,options));};
 const popupOpen=()=>!!doc.querySelector('#main-fingers:not([hidden]),dialog[open],.zero-chooser:not([hidden])');
 const hidePopup=()=>{G.play12Main?.closePicker?.();const p=doc.getElementById('main-fingers');if(p)p.hidden=true;};
 const mark=()=>{[...nav.children].forEach((b,i)=>b.setAttribute('aria-current',String(i===active)));root.dataset.activeZone=['left','center','right'][active];};
 function go(index){active=Math.max(0,Math.min(2,index));hidePopup();root.scrollTo({left:wide?0:root.clientWidth*active,behavior:'auto'});mark();}
 function scaleSlot(slot,content,width){const parent=slot.parentElement,style=getComputedStyle(parent),available=parent.clientWidth-parseFloat(style.paddingLeft||0)-parseFloat(style.paddingRight||0),s=fit(width,available);content.style.transform=`scale(${s})`;content.style.transformOrigin='top left';slot.style.width=`${width*s}px`;slot.style.height=`${content.offsetHeight*s}px`;slot.dataset.scale=String(s);return s;}
 function rangeForComposition(){const p=runtime.playback,events=p.events||[];if(events!==cachedEvents||events.length!==cachedCount||p.runtimeZeroNote!==cachedZero){cachedEvents=events;cachedCount=events.length;cachedZero=p.runtimeZeroNote;cachedRange=compositionRange(events);}return cachedRange;}
 function updateKeyboard(){const piano=runtime.pianoView,busy=piano.virtualPointers.size>0||[...piano.activeBySource].some(([,set])=>set.size>0);const next=wide?null:rangeForComposition(),key=JSON.stringify(next);if(key===lastRange){pendingRange=null;return;}if(busy){pendingRange=next;return;}if(piano.setWorkspaceKeyboard)piano.setWorkspaceKeyboard(wide?'desktop':'adaptive',next);else piano.setVisualWindow?.(next);lastRange=key;pendingRange=null;}
 function layout(){if(!mounted)return;runtime.playback.layoutCoreGeometry();const music=parseFloat(runtime.stage.style.width)||runtime.stage.offsetWidth,l=desktopLeft,r=desktopRight,m=metrics(widthProbe.clientWidth,l,music,r),changed=wide!==m.wide;wide=m.wide;root.classList.toggle('is-three-wide',wide);root.classList.toggle('is-three-narrow',!wide);root.dataset.wideThreshold=String(m.threshold);root.dataset.unscaledThreshold=String(m.unscaledThreshold);root.dataset.keyboardMode=wide?'desktop-full':'composition-range';nav.hidden=wide;root.style.setProperty('--training-music-width',music+'px');
  // Keep measured intrinsic sizes stable: CSS removes legacy viewport-based widths only in these slots.
  scaleSlot(leftSlot,leftControls,leftControls.scrollWidth);scaleSlot(rightSlot,rightControls,rightControls.scrollWidth);
  const s=fit(music,center.clientWidth);workspace.style.transform=`scale(${s})`;workspace.style.transformOrigin='top left';musicSlot.style.width=music*s+'px';const footerHeight=footer.getBoundingClientRect().height;root.style.setProperty('--training-footer-height',footerHeight+'px');document.body.style.setProperty('--training-footer-height',footerHeight+'px');
  const free=Math.max(260,(G.innerHeight-footerHeight-center.getBoundingClientRect().top-120)/s);runtime.stage.style.height=Math.floor(free)+'px';musicSlot.style.height=(runtime.stage.offsetHeight+doc.getElementById('playline').offsetHeight)*s+'px';runtime.playback.layoutCoreGeometry();updateKeyboard();runtime.pianoView.syncContainer();
  warning.hidden=wide||!runtime.pianoView.windowReadabilityLimited?.();warning.textContent='Диапазон произведения показан целиком. На этом экране обозначения клавиш могут быть слишком мелкими.';
  if(initial||changed){initial=false;go(active);}mark();
 }
 const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(layout);};
 return{resize,go,get activeZone(){return active;},mount(){if(mounted)return;mounted=true;widthProbe=node('div','training-width-probe');widthProbe.setAttribute('aria-hidden','true');root.before(widthProbe);root.classList.add('training-three-zones','training-shell-main');doc.body.classList.add('play12-training-shell','play12-three-zones');
  remember(footer);for(const n of [runtime.stage,doc.getElementById('playline'),runtime.pianoView.mount,doc.getElementById('metronome-board'),doc.getElementById('practice-board'),doc.getElementById('round-loop-board'),doc.getElementById('onboarding-choose-zero')])remember(n);
  left.classList.add('training-zone','training-zone-left');center.classList.add('training-zone','training-zone-center');right.classList.add('training-zone','training-zone-right');
  for(const [i,n]of [left,center,right].entries()){n.setAttribute('aria-label',['Профиль и мелодии','Музыкальное рабочее пространство','Skill Bank и раунды'][i]);n.setAttribute('tabindex','0');}
  footer.classList.add('training-persistent-footer');root.after(footer);helpers.placePiano(runtime.pianoView.mount,pianoHost);
  const bpm=doc.getElementById('metronome-board'),practice=doc.getElementById('practice-board'),round=doc.getElementById('round-loop-board'),zero=doc.getElementById('onboarding-choose-zero');for(const n of [bpm,practice,round,zero])n.hidden=false;
  leftControls.append(bpm,practice);rightControls.append(round,zero);leftSlot.append(leftControls);rightSlot.append(rightControls);left.append(leftSlot);right.append(rightSlot);desktopLeft=leftControls.scrollWidth;desktopRight=rightControls.scrollWidth;
  workspace=helpers.mountWorkspace(runtime.stage,playbackHost,doc.getElementById('playline'));workspace.dataset.progressContract='local';workspace.parentElement.insertBefore(musicSlot,workspace);musicSlot.append(workspace);
  nav=node('nav','training-zone-navigation');nav.setAttribute('aria-label','Области рабочего пространства');['Мои мелодии','Музыка','Раунды'].forEach((text,i)=>{const b=doc.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>go(i);nav.append(b);});footer.prepend(nav);warning=node('p','training-keyboard-notice');warning.hidden=true;footer.prepend(warning);
  off.push(helpers.bindPractice({playback:runtime.playback}),helpers.trackSuccess(runtime.playback));
  off.push(runtime.playback.addStateListener?.(()=>{if(initial)return;if(pendingRange!==null||JSON.stringify(wide?null:rangeForComposition())!==lastRange)updateKeyboard();})||(()=>{}));
  listen(root,'scroll',()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(()=>{if(!wide){active=Math.round(root.scrollLeft/Math.max(1,root.clientWidth));active=Math.max(0,Math.min(2,active));hidePopup();mark();}});},{passive:true});
  listen(root,'keydown',e=>{if(e.target!==root&&![left,center,right].includes(e.target))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();go(active+(e.key==='ArrowLeft'?-1:1));}});
  listen(root,'touchstart',e=>{if(popupOpen())return;const interactive=e.target.closest('button,input,select,a,[role="dialog"],.mvp-round-loop-board,.mvp-practice-board,.mvp-metronome-board');if(interactive)e.stopPropagation();},{passive:true});
  observer=new ResizeObserver(resize);[root,footer,leftControls,rightControls,widthProbe].forEach(n=>observer.observe(n));listen(G,'resize',resize);resize();
 },dispose(){if(!mounted)return;mounted=false;observer?.disconnect();cancelAnimationFrame(frame);cancelAnimationFrame(scrollFrame);off.splice(0).forEach(f=>f());for(const h of homes.reverse()){if(h.next?.parentElement===h.parent)h.parent.insertBefore(h.n,h.next);else h.parent.appendChild(h.n);}leftSlot.remove();rightSlot.remove();musicSlot.remove();nav.remove();warning.remove();widthProbe.remove();root.classList.remove('training-three-zones','training-shell-main','is-three-wide','is-three-narrow');doc.body.classList.remove('play12-three-zones','play12-training-shell');}};
}
G.Play12TrainingZones={fit,metrics,compositionRange,create};if(typeof module!=='undefined')module.exports=G.Play12TrainingZones;
})(typeof window!=='undefined'?window:globalThis);
