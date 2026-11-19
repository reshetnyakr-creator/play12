/* Tutorial-only adapter. TrainingZones owns the geometry; lessons own state. */
(function(G){'use strict';
function create({runtime,root}){
 const doc=root.ownerDocument,body=doc.body,view=root.querySelector('[data-onboarding-view="LISTEN_AND_CONTROL"]'),header=root.querySelector('.mvp-site-header'),page=root.querySelector('.mvp-page');
 const progress=root.querySelector('.mvp-onboarding-progress'),song=progress.querySelector('.mvp-song-card'),steps=progress.querySelector('ol'),host=root.querySelector('#onboarding-playback-host'),pianoHost=root.querySelector('#onboarding-listen-piano-host');
 const make=(tag,cls)=>{const n=doc.createElement(tag);n.className=cls;return n;};
 const homes=[],keep=n=>homes.push({n,parent:n.parentElement,next:n.nextSibling});
 let shell=null,layout=null,footer=null,removeStatus=null,stepObserver=null;const markerHomes=[];let progressHome=null;
 const overlays=['onboarding-listen-coach','zero-chooser','onboarding-completion','round-ok12','onboarding-confetti','returning-midi'];
 function mount(){if(shell){shell.layoutNow();return;}
  runtime.playback.tutorialProgress=true;
  for(const n of runtime.playback.svg.querySelectorAll('[data-round-marker]')){markerHomes.push([n,n.getAttribute('transform')]);n.setAttribute('transform',`translate(${n.dataset.roundLeftX} ${n.dataset.roundTopY})`);}
  const rail=doc.getElementById('round-training-progress');if(rail){progressHome={n:rail,parent:rail.parentElement,next:rail.nextSibling};rail.remove();}
  [header,progress,song,steps,host,pianoHost,runtime.stage,doc.getElementById('playline'),runtime.pianoView.mount,...overlays.map(id=>doc.getElementById(id))].filter(Boolean).forEach(keep);
  body.prepend(header);body.classList.add('tutorial-main-aligned','play12-main');root.classList.add('tutorial-aligned-root');page.classList.add('tutorial-aligned-page');view.classList.add('tutorial-aligned-view');
  layout=make('div','main-layout tutorial-training-layout');const left=make('aside','main-library'),center=make('section','tutorial-center'),right=make('aside','tutorial-right');
  const identity=make('section','main-profile tutorial-identity'),navigation=make('section','main-library-card tutorial-progress-card');identity.append(song);navigation.append(steps);left.append(identity,navigation);const tools=make('div','main-tools'),title=doc.createElement('h1');title.textContent=song.querySelector('strong').textContent;title.title=title.textContent;tools.append(title);center.append(tools,host);layout.append(left,center,right);view.prepend(layout);
  footer=make('section','main-footer');footer.append(pianoHost);body.append(footer);
  for(const id of overlays){const n=doc.getElementById(id);if(n){n.classList.add('tutorial-portal');body.append(n);}}
  runtime.pianoView.mount.classList.remove('is-fixed-piano-view');body.classList.remove('play12-fixed-piano-visible');
  const clearFixedPosition=()=>{for(const name of ['left','right','top','bottom','transform'])runtime.pianoView.mount.style.removeProperty(name);};clearFixedPosition();requestAnimationFrame(()=>{if(shell)clearFixedPosition();});
  shell=G.Play12TrainingZones.create({runtime,root:layout,playbackHost:host,pianoHost,footer,zones:{left,center,right},helpers:{...G.Play12TrainingShell,bindPractice:()=>()=>{},trackSuccess:()=>()=>{}}});shell.mount();body.append(footer);
  const navigationButtons=footer.querySelector('.training-zone-navigation')?.querySelectorAll('[data-zone-tab]');if(navigationButtons){const labels=G.Play12I18n?.isRu?.()?['Обучение','Музыка','Раунды']:['Tutorial','Music','Rounds'];[...navigationButtons].forEach((button,i)=>{button.textContent=labels[i];});}
  const midiStatus=make('div','main-midi tutorial-midi-status'),label=doc.createElement('span');label.className='main-midi-status';label.setAttribute('role','status');label.setAttribute('aria-live','polite');midiStatus.append(label);footer.append(midiStatus);
  const updateStatus=event=>{const connected=event?.status==='connected';label.textContent=G.Play12I18n?.isRu?.()?(connected?'MIDI: подключено':'MIDI: не подключено'):(connected?'MIDI: connected':'MIDI: not connected');label.dataset.midiStatus=connected?'connected':event?.status||'no-input';};
  if(runtime.midiDiagnostic)removeStatus=runtime.midiDiagnostic.addStatusListener(updateStatus);updateStatus(runtime.midiDiagnostic?.currentStatus);shell.layoutNow();
  const keepStepVisible=()=>{const current=steps.querySelector('[aria-current="step"]');if(!current)return;const first=steps.firstElementChild?.getBoundingClientRect(),gap=parseFloat(G.getComputedStyle(steps).rowGap)||0;if(first?.height)steps.style.maxHeight=Math.min(240,first.height*3+gap*2)+'px';const r=current.getBoundingClientRect(),box=steps.getBoundingClientRect();if(r.top<box.top)steps.scrollTop-=box.top-r.top+8;else if(r.bottom>box.bottom)steps.scrollTop+=r.bottom-box.bottom+8;};stepObserver=new MutationObserver(keepStepVisible);stepObserver.observe(steps,{subtree:true,attributes:true,attributeFilter:['aria-current']});keepStepVisible();
  const skip=doc.getElementById('onboarding-skip');if(skip){keep(skip);right.prepend(skip);}
  song.querySelector('strong')?.setAttribute('title',song.querySelector('strong').textContent);
 }
 function dispose(){if(!shell)return;stepObserver?.disconnect();stepObserver=null;delete runtime.playback.tutorialProgress;for(const[n,t]of markerHomes.splice(0))n.setAttribute('transform',t);if(progressHome){const h=progressHome;if(h.next?.parentElement===h.parent)h.parent.insertBefore(h.n,h.next);else h.parent.append(h.n);progressHome=null;}removeStatus?.();removeStatus=null;shell.dispose();shell=null;for(const h of homes.reverse()){if(h.next?.parentElement===h.parent)h.parent.insertBefore(h.n,h.next);else h.parent.append(h.n);}homes.length=0;layout.remove();footer.remove();body.classList.remove('tutorial-main-aligned','play12-main');root.classList.remove('tutorial-aligned-root');page.classList.remove('tutorial-aligned-page');view.classList.remove('tutorial-aligned-view');}
 return{mount,dispose,resize:()=>shell?.layoutNow(),reveal(target){const zone=target?.closest?.('.training-zone');if(zone&&layout?.classList.contains('is-three-narrow')){const index=[...layout.children].filter(n=>n.classList.contains('training-zone')).indexOf(zone);const rect=target.getBoundingClientRect();if(shell.transitioning)return false;if(index>=0&&(shell.activeZone!==index||rect.left<0||rect.right>G.innerWidth)){shell.go(index,{tutorial:true});if(shell.transitioning)return false;}const box=zone.getBoundingClientRect(),r=target.getBoundingClientRect();if(r.top<box.top)zone.scrollTop-=box.top-r.top+8;else if(r.bottom>box.bottom)zone.scrollTop+=r.bottom-box.bottom+8;}}};
}
G.Play12TutorialLayout={create};
})(window);
