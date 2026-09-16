(function (global) {
  'use strict';
  // One visual spotlight, independent of the instructional card's lifetime.
  function create(root) {
    const ns = 'http://www.w3.org/2000/svg';
    const node = (name, attributes = {}) => {
      const element = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      return element;
    };
    const overlay = node('svg', {class: 'mvp-coach-spotlight', 'aria-hidden': 'true'});
    const defs = node('defs');
    const mask = node('mask', {id: 'play12-coach-mask', maskUnits: 'userSpaceOnUse'});
    mask.appendChild(node('rect', {width: '100%', height: '100%', fill: 'white'}));
    const holes = node('g', {fill: 'black'});
    mask.appendChild(holes); defs.appendChild(mask); overlay.appendChild(defs);
    overlay.appendChild(node('rect', {width: '100%', height: '100%', fill: '#343a40', 'fill-opacity': '.60', mask: 'url(#play12-coach-mask)'}));
    root.appendChild(overlay);
    let timer = 0, frame = 0, pulse = null, owner = null;
    function stop(card) {
      if (card && card !== owner) return;
      global.clearTimeout(timer); global.cancelAnimationFrame(frame);
      timer = frame = 0; owner = null;
      overlay.style.display = 'none';
      pulse?.classList.remove('is-coach-pulsing'); pulse = null;
    }
    function show(card, targets = [], pulseTarget = null) {
      stop(); owner = card; pulse = pulseTarget;
      overlay.style.display = 'block';
      overlay.classList.remove('is-active'); void overlay.getBoundingClientRect();
      overlay.classList.add('is-active');
      if (pulse) { void pulse.getBoundingClientRect(); pulse.classList.add('is-coach-pulsing'); }
      const update = () => {
        overlay.setAttribute('viewBox', `0 0 ${global.innerWidth} ${global.innerHeight}`);
        mask.setAttribute('width', global.innerWidth); mask.setAttribute('height', global.innerHeight);
        if (card.id === 'onboarding-listen-coach' || card.id === 'zero-chooser') {
          const field = targets[0]?.getBoundingClientRect();
          if (field?.height) card.style.setProperty('--mvp-coach-y', `${field.top + field.height / 2}px`);
        }
        holes.replaceChildren();
        for (const element of targets.filter(Boolean)) {
          const r = element.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          holes.appendChild(node('rect', {x: r.left - 7, y: r.top - 7, width: r.width + 14, height: r.height + 14, rx: 10}));
        }
        frame = global.requestAnimationFrame(update);
      };
      update(); timer = global.setTimeout(() => stop(), 5000);
    }
    stop();
    return Object.freeze({show, stop});
  }
  global.Play12Coach = Object.freeze({create});
})(window);
