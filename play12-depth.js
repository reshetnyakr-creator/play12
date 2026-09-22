/* Cursor light for large visual surfaces. Musical content remains untouched. */
(() => {
  const selectors = [
    '.hero-visual', '.keyboard-img', '.button', '.language-modal', '.language-options',
    '.manual-hero', '.manual-image', '.toc', '.card-item', '.card-preview', '.back',
    '.email-link', '.manifesto-final',
    '.mvp-button', '.mvp-choose-zero-control', '.mvp-song-card', '.mvp-metronome-board', '.mvp-practice-board',
    '.mvp-round-loop-board', '.playback-zone', '.play12-piano-view',
    '.mvp-midi-copy', '.mvp-listen-coach', '.mvp-zero-chooser-card',
    '.playback-service-panel', '.midi-diagnostic', '.mvp-midi-reconnect'
  ].join(',');
  const radius = 300;
  const maxOffset = 7;
  const maxOpacity = 0.10;
  const capability = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let surfaces = [];
  let geometry = [];
  let pointer = null;
  let frame = 0;
  let dirty = true;
  let scanPending = false;

  function clear() {
    for (const element of surfaces) {
      element.style.setProperty('--light-shadow-opacity', '0');
    }
  }

  function scan() {
    scanPending = false;
    const next = Array.from(document.querySelectorAll(selectors)).filter((element) => {
      if (element.closest('.play12-note, .piano-key, .round-mini-block, .piano-card-strip, .mvp-coach-spotlight')) return false;
      return !element.parentElement?.closest(selectors);
    });
    for (const element of surfaces) {
      if (!next.includes(element)) element.classList.remove('play12-depth-surface', 'play12-depth-positioned');
    }
    surfaces = next;
    for (const element of surfaces) {
      if (getComputedStyle(element).position === 'static') element.classList.add('play12-depth-positioned');
      element.classList.add('play12-depth-surface');
    }
    dirty = true;
    schedule();
  }

  function requestScan() {
    if (scanPending) return;
    scanPending = true;
    requestAnimationFrame(scan);
  }

  function measure() {
    geometry = surfaces.map((element) => {
      const rect = element.getBoundingClientRect();
      return { element, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
        visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth };
    });
    dirty = false;
  }

  function update() {
    frame = 0;
    if (!pointer || !capability.matches || reducedMotion.matches || document.querySelector('.mvp-coach-spotlight.is-active')) {
      clear();
      return;
    }
    if (dirty) measure();
    for (const { element, x, y, visible } of geometry) {
      const dx = x - pointer.x;
      const dy = y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (!visible || distance >= radius) {
        element.style.setProperty('--light-shadow-opacity', '0');
        continue;
      }
      const proximity = 1 - distance / radius;
      const strength = proximity * proximity * (3 - 2 * proximity);
      const direction = distance || 1;
      element.style.setProperty('--light-shadow-x', `${(maxOffset * strength * dx / direction).toFixed(2)}px`);
      element.style.setProperty('--light-shadow-y', `${(maxOffset * strength * dy / direction).toFixed(2)}px`);
      element.style.setProperty('--light-shadow-opacity', (maxOpacity * strength).toFixed(3));
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  addEventListener('pointermove', (event) => {
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = null; schedule(); });
  addEventListener('blur', () => { pointer = null; schedule(); });
  addEventListener('resize', () => { dirty = true; schedule(); }, { passive: true });
  addEventListener('scroll', () => { dirty = true; schedule(); }, { passive: true, capture: true });
  capability.addEventListener('change', schedule);
  reducedMotion.addEventListener('change', schedule);
  new MutationObserver((records) => {
    if (records.some((record) => record.type === 'childList' || record.attributeName === 'hidden')) requestScan();
    if (records.some((record) => record.attributeName === 'class' && record.target.classList.contains('mvp-coach-spotlight'))) schedule();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  scan();
})();
