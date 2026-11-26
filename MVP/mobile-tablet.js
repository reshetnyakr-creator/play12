/* Responsive shell policy only: no musical or persistence state is changed. */
(function(G){'use strict';
function classify({width,height,coarse=false,touches=0,screenShort=0,orientation}){const touch=coarse&&touches>0,short=screenShort||Math.min(width,height),phone=touch&&short<600,landscape=orientation?orientation==='landscape':width>height;return phone?(landscape?'phone-landscape':'phone-portrait'):touch?(landscape?'tablet-landscape':'tablet-portrait'):'desktop';}
G.Play12Responsive={classify,state:'desktop'};if(typeof module!=='undefined')module.exports={classify};if(!G.document)return;
let frame=0;
function update(){
 const v=G.visualViewport,width=v?.width||G.innerWidth,height=v?.height||G.innerHeight;
 const mode=classify({width,height,coarse:G.matchMedia('(pointer: coarse)').matches,touches:G.navigator.maxTouchPoints,
  screenShort:Math.min(G.screen.width,G.screen.height),
  orientation:G.screen.orientation?.type?.split('-')[0]||(typeof G.orientation==='number'?(Math.abs(G.orientation)===90?'landscape':'portrait'):undefined)});
 G.Play12Responsive.state=mode;
 document.documentElement.dataset.deviceMode=mode;
 G.dispatchEvent(new CustomEvent('play12:responsive-layout',{detail:{mode,width,height}}));
}
const resize=()=>{G.cancelAnimationFrame(frame);frame=G.requestAnimationFrame(update);};G.addEventListener('resize',resize);G.visualViewport?.addEventListener('resize',resize);function start(){new MutationObserver(resize).observe(document.body,{attributes:true,attributeFilter:['class']});update();}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(typeof window!=='undefined'?window:globalThis);
