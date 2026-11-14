/* Read-only browser diagnostic. Load explicitly; never changes application state. */
(function(G){'use strict';G.Play12CheckMainGeometry=function(doc=G.document){
 const selectors={profile:'.main-profile',library:'.main-library-card',skill:'.training-skill-card',bpm:'#metronome-board',practice:'#practice-board',playback:'#playline',rounds:'#round-loop-board',zero:'#onboarding-choose-zero',title:'.main-tools h1',strip:'.training-three-zones'};
 const nodes={},rects={},checks=[];for(const[name,selector]of Object.entries(selectors)){nodes[name]=doc.querySelector(selector);if(!nodes[name])return{pass:false,checks:[{name:'required '+name,pass:false}]};const r=nodes[name].getBoundingClientRect();rects[name]={left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};}
 const check=(name,pass,detail)=>checks.push({name,pass,detail}),near=(a,b)=>Math.abs(a-b)<=2;
 check('BPM/Profile/Library left',near(rects.bpm.left,rects.profile.left)&&near(rects.library.left,rects.profile.left));
 check('Skill/Profile top',near(rects.skill.top,rects.profile.top));check('Skill/Library bottom',near(rects.skill.bottom,rects.library.bottom));check('Zero/Skill right',near(rects.zero.right,rects.skill.right));
 const bottoms=['bpm','practice','playback','rounds','zero'].map(k=>rects[k].bottom);check('five common bottoms',Math.max(...bottoms)-Math.min(...bottoms)<=2,bottoms);
 check('left corridor separation',rects.practice.right<=rects.playback.left);check('right corridor separation',rects.rounds.left>=rects.playback.right);
 const cells=[...doc.querySelectorAll('#play12-score .play12-cell')];check('title/visible graphic left',cells.length>0&&near(rects.title.left,Math.min(...cells.map(n=>n.getBoundingClientRect().left))));
 check('document horizontal overflow',doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+2);
 const wide=nodes.strip.classList.contains('is-three-wide');check('desktop three columns',wide&&G.getComputedStyle(nodes.strip).display==='grid');check('desktop no snap',G.getComputedStyle(nodes.strip).scrollSnapType==='none');
 for(const [name,selector]of [['Practice','#practice-board button'],['RoundBoard','#round-loop-board button']]){const controls=[...doc.querySelectorAll(selector)];check(name+' text fits',controls.every(n=>n.scrollWidth<=n.clientWidth+2));}
 return{pass:checks.every(c=>c.pass),checks,rects,viewport:{width:doc.documentElement.clientWidth,height:G.innerHeight},scrollY:G.scrollY};
};})(typeof window!=='undefined'?window:globalThis);
