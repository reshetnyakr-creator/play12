/* Independent pointer-driven placement for Playback UI modules. */
(function (global) {
  "use strict";

  const STORAGE_PREFIX = "play12.ui-module-position.";
  const MIN_VISIBLE = 44;
  const INTERACTIVE = "button,input,select,option,textarea,label,a,[contenteditable='true']";

  class DraggableModule {
    constructor(name, element, boundary) {
      this.name = name;
      this.element = element;
      this.boundary = boundary;
      this.storageKey = `${STORAGE_PREFIX}${name}`;
      this.drag = null;
      this.suppressClick = false;
      element.dataset.uiModule = name;
      element.addEventListener("pointerdown", event => this.pointerDown(event));
      element.addEventListener("pointermove", event => this.pointerMove(event));
      element.addEventListener("pointerup", event => this.pointerUp(event));
      element.addEventListener("pointercancel", event => this.pointerUp(event));
      element.addEventListener("click", event => {
        if (!this.suppressClick) return;
        event.preventDefault();
        event.stopPropagation();
        this.suppressClick = false;
      }, true);
      this.restore();
    }

    pointerDown(event) {
      if (event.button !== 0 || event.target.closest?.(INTERACTIVE)) return;
      const rect = this.element.getBoundingClientRect();
      const bounds = this.boundary.getBoundingClientRect();
      this.drag = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        left: rect.left - bounds.left,
        top: rect.top - bounds.top,
        moved: false
      };
      this.element.setPointerCapture(event.pointerId);
    }

    pointerMove(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const dx = event.clientX - this.drag.originX;
      const dy = event.clientY - this.drag.originY;
      if (!this.drag.moved && Math.hypot(dx, dy) < 3) return;
      this.drag.moved = true;
      event.preventDefault();
      this.element.classList.add("is-ui-module-dragging");
      this.place(this.drag.left + dx, this.drag.top + dy, false);
    }

    pointerUp(event) {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
      this.element.classList.remove("is-ui-module-dragging");
      if (this.drag.moved) {
        this.suppressClick = true;
        this.save();
      }
      this.drag = null;
    }

    constrained(left, top) {
      const width = this.element.offsetWidth;
      const height = this.element.offsetHeight;
      return {
        left: Math.min(this.boundary.clientWidth - MIN_VISIBLE, Math.max(MIN_VISIBLE - width, left)),
        top: Math.min(this.boundary.clientHeight - MIN_VISIBLE, Math.max(MIN_VISIBLE - height, top))
      };
    }

    place(left, top, persist = true) {
      const position = this.constrained(left, top);
      Object.assign(this.element.style, {
        left: `${position.left}px`, top: `${position.top}px`, right: "auto", bottom: "auto", transform: "none"
      });
      this.element.dataset.dragPositioned = "true";
      this.element.dispatchEvent(new CustomEvent("play12:modulemove", { detail: { name: this.name, ...position } }));
      if (persist) this.save();
    }

    save() {
      const left = parseFloat(this.element.style.left);
      const top = parseFloat(this.element.style.top);
      if (Number.isFinite(left) && Number.isFinite(top)) {
        localStorage.setItem(this.storageKey, JSON.stringify({ left, top }));
      }
    }

    restore() {
      try {
        const saved = JSON.parse(localStorage.getItem(this.storageKey));
        if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) requestAnimationFrame(() => this.place(saved.left, saved.top, false));
      } catch (_) {}
    }

    keepAccessible() {
      if (this.element.dataset.dragPositioned !== "true") return;
      this.place(parseFloat(this.element.style.left), parseFloat(this.element.style.top));
    }
  }

  class ModuleManager {
    constructor({ boundary, modules }) {
      this.items = modules.filter(([, element]) => element).map(([name, element]) => new DraggableModule(name, element, boundary));
      global.addEventListener("resize", () => this.items.forEach(item => item.keepAccessible()));
    }
  }

  global.Play12DraggableModules = Object.freeze({ init: options => new ModuleManager(options) });
})(window);
