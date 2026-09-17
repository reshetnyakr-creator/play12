/* Runtime-only empty preparatory measures. Never modify source notes or numbering. */
(function(global){
  'use strict';
  function create({svg,selected,plan,signature,stepQuarters,cellHeight,originY,timelineOffset}){
    const ns='http://www.w3.org/2000/svg',layer=document.createElementNS(ns,'g');layer.setAttribute('class','play12-precount-layer');
    const box=svg.viewBox.baseVal,previousOverflow=svg.style.overflow;svg.style.overflow='visible';
    const make=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text)node.textContent=text;layer.appendChild(node);return node;};
    for(let elapsed=0;elapsed<plan.quarters-1e-7;elapsed+=signature.measureQuarters){
      const duration=Math.min(signature.measureQuarters,plan.quarters-elapsed);
      const end=selected-plan.quarters+elapsed+duration;
      const y=originY-(end+timelineOffset)/stepQuarters*cellHeight;
      const height=duration/stepQuarters*cellHeight;
      make('rect',{x:box.x,y,width:box.width,height,fill:'#FAFAF8',stroke:'#D1D3CE','stroke-width':1,class:'play12-precount-round'});
      for(let beat=signature.beatQuarters;beat<duration-1e-7;beat+=signature.beatQuarters)make('line',{x1:box.x,x2:box.x+box.width,y1:y+beat/stepQuarters*cellHeight,y2:y+beat/stepQuarters*cellHeight,stroke:'#D1D3CE','stroke-opacity':.45});
      make('text',{x:box.x+box.width/2,y:y+height/2,'text-anchor':'middle','dominant-baseline':'middle',fill:'#777','font-family':'Inter,sans-serif','font-size':14,'font-weight':600},'PC');
    }
    svg.appendChild(layer);
    return {clear(){layer.remove();svg.style.overflow=previousOverflow;}};
  }
  global.Play12PreCountView={create};
})(window);
