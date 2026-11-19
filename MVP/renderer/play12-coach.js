(function (global) {
  'use strict';
  // One visual spotlight, independent of the instructional card's lifetime.
  function create(root, options = {}) {
    const padding = options.padding ?? 16, feather = options.feather ?? 16;
    const ns = 'http://www.w3.org/2000/svg';
    const node = (name, attributes = {}) => {
      const element = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      return element;
    };
    const overlay = node('svg', {class: 'mvp-coach-spotlight', 'aria-hidden': 'true', preserveAspectRatio: 'none'});
    const defs = node('defs');
    const mask = node('mask', {id: 'play12-coach-mask', maskUnits: 'userSpaceOnUse', x: 0, y: 0});
    mask.appendChild(node('rect', {width: '100%', height: '100%', fill: 'white'}));
    const softEdge = node('filter', {id: 'play12-coach-feather', filterUnits: 'userSpaceOnUse', x: -48, y: -48});
    softEdge.appendChild(node('feGaussianBlur', {stdDeviation: feather}));
    const holes = node('g', {fill: 'black'});
    mask.appendChild(holes); defs.appendChild(mask); defs.appendChild(softEdge); overlay.appendChild(defs);
    overlay.appendChild(node('rect', {width: '100%', height: '100%', fill: '#343a40', 'fill-opacity': '.60', mask: 'url(#play12-coach-mask)'}));
    (options.portal ? document.body : root).appendChild(overlay);
    let timer = 0, frame = 0, pulse = null, owner = null;
    function stop(card) {
      if (card && card !== owner) return;
      global.clearTimeout(timer); global.cancelAnimationFrame(frame);
      timer = frame = 0;if(owner)owner.style.visibility='';owner = null;
      overlay.style.display = 'none';
      pulse?.classList.remove('is-coach-pulsing'); pulse = null;
    }
    function show(card, targets = [], pulseTarget = null, cardAnchor = null) {
      stop(); owner = card; pulse = pulseTarget;
      overlay.style.display = 'block';
      overlay.classList.remove('is-active'); void overlay.getBoundingClientRect();
      overlay.classList.add('is-active');
      if (pulse) { void pulse.getBoundingClientRect(); pulse.classList.add('is-coach-pulsing'); }
      const update = () => {
        const origin=overlay.getBoundingClientRect(),width=origin.width||global.innerWidth,height=origin.height||global.innerHeight;
        overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
        softEdge.setAttribute('width', global.innerWidth + 96); softEdge.setAttribute('height', global.innerHeight + 96);
        mask.setAttribute('width', global.innerWidth); mask.setAttribute('height', global.innerHeight);
        if (card.id === 'onboarding-listen-coach' || card.id === 'zero-chooser') {
          const field = cardAnchor?.getBoundingClientRect();
          if (field?.height) card.style.setProperty('--mvp-coach-y', `${field.top + field.height / 2}px`);
        }
        holes.replaceChildren();
        const seen = new Set();
        // Zero changes rebuild Piano View asynchronously; follow the current elements.
        const currentTargets = typeof targets === 'function' ? targets() : targets;
        if(options.reveal?.(currentTargets.find(Boolean))===false){overlay.style.visibility='hidden';card.style.visibility='hidden';frame=global.requestAnimationFrame(update);return;}overlay.style.visibility='';card.style.visibility='';
        const targetRects=[];
        for (const element of currentTargets.filter(Boolean)) {
          const r = element.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;targetRects.push(r);
          const bounds = `${r.left},${r.top},${r.width},${r.height}`;
          if (seen.has(bounds)) continue;
          seen.add(bounds);
          holes.appendChild(node('rect', {x: r.left - origin.left - padding, y: r.top - origin.top - padding, width: r.width + padding * 2, height: r.height + padding * 2, rx: Math.min(28, r.height / 2 + padding), filter: 'url(#play12-coach-feather)'}));
        }
        if(options.avoidTargets && (card.id==='onboarding-listen-coach'||card.id==='zero-chooser')){
          const c=card.getBoundingClientRect(),top=(global.visualViewport?.offsetTop||0)+8,bottom=top+(global.visualViewport?.height||global.innerHeight)-16,height=c.height;
          const field=cardAnchor?.getBoundingClientRect(),preferred=field?.height?field.top+field.height/2:(c.top+c.height/2);
          const intervals=targetRects.filter(r=>r.left<c.right+8&&r.right>c.left-8&&r.bottom>top&&r.top<bottom).map(r=>[Math.max(top,r.top-10),Math.min(bottom,r.bottom+10)]).sort((a,b)=>a[0]-b[0]);
          const gaps=[];let cursor=top;for(const [a,b]of intervals){if(a>cursor)gaps.push([cursor,a]);cursor=Math.max(cursor,b);}if(cursor<bottom)gaps.push([cursor,bottom]);
          const choices=gaps.filter(([a,b])=>b-a>=height).map(([a,b])=>Math.max(a+height/2,Math.min(b-height/2,preferred))).sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred));
          if(choices.length)card.style.setProperty('--mvp-coach-y',`${choices[0]}px`);
          else if(options.dock?.(card)){overlay.style.visibility='hidden';card.style.visibility='hidden';frame=global.requestAnimationFrame(update);return;}
          else card.style.setProperty('--mvp-coach-y',`${Math.max(top+height/2,Math.min(bottom-height/2,preferred))}px`);
        }
        if (!timer) timer = global.setTimeout(() => stop(), 5000);
        frame = global.requestAnimationFrame(update);
      };
      update();
    }
    stop();
    return Object.freeze({show, stop});
  }
  global.Play12Coach = Object.freeze({create});
})(window);
