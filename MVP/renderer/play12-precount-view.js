/* Runtime pre-count reuses the actual musical Round grid, without notes or repetition metadata. */
(function(global){
  'use strict';
  function create({svg,selected,plan,signature,stepQuarters,cellHeight,originY,timelineOffset}){
    const ns='http://www.w3.org/2000/svg',layer=document.createElementNS(ns,'g');layer.setAttribute('class','play12-precount-layer');
    const box=svg.viewBox.baseVal,previousOverflow=svg.style.overflow;svg.style.overflow='visible';
    const scale=cellHeight/stepQuarters,gridOrigin=originY+box.y;
    const templateBottom=gridOrigin-((signature.measureStart ?? selected)+timelineOffset)*scale;
    const templateTop=templateBottom-signature.measureQuarters*scale;
    const template=[...svg.querySelectorAll('.play12-cell,.play12-count-space,.play12-count,rect[fill="none"][stroke="#6B7280"]')].filter(node=>{
      const y=Number(node.getAttribute('y'));return y>=templateTop-1e-7 && y<templateBottom-1e-7;
    });
    const make=(parent,tag,attrs,text)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text)node.textContent=text;parent.appendChild(node);return node;};
    for(let elapsed=0;elapsed<plan.quarters-1e-7;elapsed+=signature.measureQuarters){
      const duration=Math.min(signature.measureQuarters,plan.quarters-elapsed),start=selected-plan.quarters+elapsed;
      const bottom=gridOrigin-(start+timelineOffset)*scale,top=bottom-duration*scale;
      const round=make(layer,'svg',{x:box.x,y:top,width:box.width,height:duration*scale,viewBox:`${box.x} ${top} ${box.width} ${duration*scale}`,overflow:'hidden',class:'play12-precount-round'});
      make(round,'rect',{x:box.x,y:top,width:box.width,height:duration*scale,fill:'#FFFFFF'});
      for(const source of template){const node=source.cloneNode(true);node.setAttribute('y',String(Number(source.getAttribute('y'))+bottom-templateBottom));round.appendChild(node);}
      const iconX=box.x+box.width-7,iconY=top+7;
      make(round,'line',{x1:iconX-3,y1:iconY-3,x2:iconX+3,y2:iconY+3,stroke:'#777','stroke-width':1.4,'stroke-linecap':'round'});
      make(round,'line',{x1:iconX+3,y1:iconY-3,x2:iconX-3,y2:iconY+3,stroke:'#777','stroke-width':1.4,'stroke-linecap':'round'});
    }
    svg.appendChild(layer);
    return {clear(){layer.remove();svg.style.overflow=previousOverflow;}};
  }
  global.Play12PreCountView={create};
})(window);
