/* Runtime PC reuses the actual musical Round grid, without notes or repetition metadata. */
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
      make(round,'text',{x:box.x+box.width-2,y:top+10,'text-anchor':'end',fill:'#888','font-family':'Inter,sans-serif','font-size':6,'font-weight':500},'PC');
    }
    svg.appendChild(layer);
    return {clear(){layer.remove();svg.style.overflow=previousOverflow;}};
  }
  global.Play12PreCountView={create};
})(window);
