/* Runtime pre-count reuses the actual musical Round grid, without notes or repetition metadata. */
(function(global){
  'use strict';
  function create({svg,selected,plan,signature,stepQuarters,cellHeight,originY,timelineOffset}){
    const ns='http://www.w3.org/2000/svg',layer=document.createElementNS(ns,'g');layer.setAttribute('class','play12-precount-layer');
    const box=svg.viewBox.baseVal,previousOverflow=svg.style.overflow;svg.style.overflow='visible';
    const scale=cellHeight/stepQuarters,gridOrigin=Number(svg.dataset?.gridOriginY ?? (originY+box.y));
    const templateBottom=gridOrigin-((signature.measureStart ?? selected)+timelineOffset)*scale;
    const templateTop=templateBottom-signature.measureQuarters*scale;
    const template=[...svg.querySelectorAll('.play12-cell,.play12-count-space,.play12-count,rect[fill="none"][stroke="#6B7280"]')].filter(node=>{
      const y=Number(node.getAttribute('y'));return y>=templateTop-1e-7 && y<templateBottom-1e-7;
    });
    const make=(parent,tag,attrs,text)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text)node.textContent=text;parent.appendChild(node);return node;};
    const cycle=signature.metricBeats?signature.nominalMeasureQuarters:signature.measureQuarters;
    const virtual=signature.metricBeats&&Math.abs(signature.measureQuarters-cycle)>1e-7;
    const match=virtual&&template.find(node=>node.classList.contains('play12-count-space'));
    const neutral=virtual?template.filter(node=>node.classList.contains('play12-cell')).slice(0,10):[];
    const ru=global.Play12I18n?.isRu?.()??true;
    const words=ru?['РАЗ','ДВА','ТРИ','ЧЕ','ПЯТЬ','ШЕСТЬ','СЕМЬ','ВОСЕМЬ','ДЕВЯТЬ','ДЕСЯТЬ','ОДИННАДЦАТЬ','ДВЕНАДЦАТЬ']:
      ['ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE'];
    for(let elapsed=0;elapsed<plan.quarters-1e-7;elapsed+=cycle){
      const duration=Math.min(cycle,plan.quarters-elapsed),start=selected-plan.quarters+elapsed;
      const bottom=gridOrigin-(start+timelineOffset)*scale,top=bottom-duration*scale;
      const round=make(layer,'svg',{x:box.x,y:top,width:box.width,height:duration*scale,viewBox:`${box.x} ${top} ${box.width} ${duration*scale}`,overflow:'hidden',class:'play12-precount-round'});
      make(round,'rect',{x:box.x,y:top,width:box.width,height:duration*scale,fill:'#FFFFFF'});
      if(virtual&&match&&signature.pulseQ){
        const pulse=signature.pulseQ, subdivide=signature.defaultSubdivisions||1;
        const unit=pulse/subdivide;
        for(let i=0;i*unit<duration-1e-7;i++){
          const index=Math.floor(i/subdivide),step=i%subdivide;
          const y=bottom-Math.min(duration,(i+1)*unit)*scale;
          const h=bottom-i*unit*scale-y;
          const accent=signature.cycleAccents?.[index];
          const opacity=step?1:accent==='PRIMARY'?.36:accent==='SECONDARY'?.24:.12;
          for(const exemplar of [match,...neutral]){
            const cell=exemplar.cloneNode(true);
            for(const [key,value] of Object.entries({y,height:h,fill:step?'#FFFFFF':'#CEF932','fill-opacity':opacity}))cell.setAttribute(key,String(value));
            round.appendChild(cell);
          }
          const x=Number(match.getAttribute('x'))+Number(match.getAttribute('width'))/2;
          const label=step===1?(ru?'И':'AND'):step===2?(ru?'А':'A'):words[index]??String(index+1);
          make(round,'text',{x,y:y+h/2,'dominant-baseline':'central','text-anchor':'middle',class:'play12-count'},label);
        }
      }else{
        for(const source of template){const node=source.cloneNode(true);node.setAttribute('y',String(Number(source.getAttribute('y'))+bottom-templateBottom));round.appendChild(node);}
      }
      const iconX=box.x+box.width-7,iconY=top+7;
      make(round,'line',{x1:iconX-3,y1:iconY-3,x2:iconX+3,y2:iconY+3,stroke:'#777','stroke-width':1.4,'stroke-linecap':'round'});
      make(round,'line',{x1:iconX+3,y1:iconY-3,x2:iconX-3,y2:iconY+3,stroke:'#777','stroke-width':1.4,'stroke-linecap':'round'});
    }
    svg.appendChild(layer);
    return {clear(){layer.remove();svg.style.overflow=previousOverflow;}};
  }
  global.Play12PreCountView={create};
})(window);
