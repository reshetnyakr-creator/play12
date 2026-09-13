/* Approved Piano View: one immutable SVG strip per 12-note color cycle. */
(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg", XLINK = "http://www.w3.org/1999/xlink";
  const SYMBOLS = "0123456789XY";
  const PITCH_CLASSES = { C:0,"C#":1,D:2,"D#":3,E:4,F:5,"F#":6,G:7,"G#":8,A:9,"A#":10,B:11 };
  const WHITE = new Set([0,2,4,5,7,9,11]);
  const PIANO_WIDTH = 3222.2, PIANO_HEIGHT = 436, CARD_HEIGHT = 128, VIEW_HEIGHT = 564;
  const modulo = (value, base) => ((value % base) + base) % base;

  function layoutZeroForMidi(midi, minMidi = 21) {
    const pitchClass = modulo(midi, 12);
    for (let candidate = minMidi; candidate < minMidi + 12; candidate++) {
      if (modulo(candidate, 12) === pitchClass) return candidate;
    }
    throw new Error(`No layout zero for MIDI pitch class ${pitchClass}`);
  }

  function element(name, attrs = {}) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }

  function mappingForMidi(midi, zeroMidi, colors) {
    const offset = midi - zeroMidi, cycle = Math.floor(offset / 12);
    return { symbol: SYMBOLS[modulo(offset, 12)], cycle, color: colors[modulo(cycle, colors.length)] };
  }

  class PianoView {
    constructor(options) {
      Object.assign(this, options);
      this.minMidi = options.minMidi || 21;
      this.maxMidi = options.maxMidi || 108;
      this.keys = new Map();
      this.activeBySource = new Map([["playback",new Set()],["mouse",new Set()],["midi",new Set()]]);
      this.virtualPointers = new Map();
      this.bindPointerControls();
      this.render(Number.isInteger(options.zeroMidi) ? options.zeroMidi : this.zeroMidiFor(options.zeroNote));
      this.resizeObserver = new ResizeObserver(() => this.fitReferenceAspect());
      this.resizeObserver.observe(this.mount.parentElement);
    }

    zeroMidiFor(zeroNote) {
      const pitchClass = PITCH_CLASSES[zeroNote];
      if (!Number.isInteger(pitchClass)) throw new Error(`Unsupported Piano View zero_note: ${zeroNote}`);
      for (let midi=this.minMidi; midi<=this.maxMidi; midi++) if (modulo(midi,12)===pitchClass) return midi;
      throw new Error(`No physical ${zeroNote} key in Piano View range`);
    }

    render(zeroMidi) {
      if (!Number.isInteger(zeroMidi) || zeroMidi < this.minMidi || zeroMidi > this.maxMidi) throw new Error(`Unsupported zero MIDI note: ${zeroMidi}`);
      this.zeroMidi = zeroMidi;
      this.keys.clear();
      const outer = element("svg", { viewBox:`0 0 ${PIANO_WIDTH} ${VIEW_HEIGHT}`,
        preserveAspectRatio:"xMidYMid meet", role:"img", "aria-label":`Фортепианная клавиатура Play12, MIDI ${zeroMidi} = 0` });
      outer.classList.add("play12-piano-svg","play12-piano-composite");
      const defs=element("defs");
      const cardBounds=element("clipPath",{id:"play12-card-keyboard-bounds"});
      this.cardClipRect=element("rect",{x:0,y:0,width:PIANO_WIDTH,height:CARD_HEIGHT});
      cardBounds.appendChild(this.cardClipRect);
      defs.appendChild(cardBounds); outer.appendChild(defs);
      const parsed = new DOMParser().parseFromString(this.cardTheme.pianoSvgText,"image/svg+xml");
      const keyboard = document.importNode(parsed.documentElement,true);
      for (const [key,value] of Object.entries({x:0,y:CARD_HEIGHT,width:PIANO_WIDTH,height:PIANO_HEIGHT,
        viewBox:`0 0 ${PIANO_WIDTH} ${PIANO_HEIGHT}`,preserveAspectRatio:"none"})) keyboard.setAttribute(key,String(value));
      outer.appendChild(keyboard);
      this.mount.replaceChildren(outer);
      this.svg=outer; this.keyboardSvg=keyboard;
      Object.assign(this.mount.dataset,{zeroNote:String(zeroMidi),zeroMidi:String(this.zeroMidi),cardTheme:this.cardTheme.id,
        pianoSource:this.cardTheme.pianoUrl,referenceWidth:String(PIANO_WIDTH),referenceHeight:String(VIEW_HEIGHT)});
      this.fitReferenceAspect();
      requestAnimationFrame(() => this.bindGeometry());
    }

    bindGeometry() {
      // Onboarding boots with the underlying playback page hidden. Geometry
      // becomes measurable only after Piano View is moved into a visible step.
      if (!this.mount.getClientRects().length) return;
      const faces=[...this.keyboardSvg.querySelectorAll("path")].filter(path=>!path.closest('[display="none"]'))
        .map(path=>({path,bounds:this.boundsInPianoCoordinates(path)})).filter(item=>item.bounds.width>0&&item.bounds.height>0)
        .sort((a,b)=>(a.bounds.left+a.bounds.width/2)-(b.bounds.left+b.bounds.width/2));
      const count=this.maxMidi-this.minMidi+1;
      if(faces.length!==count) throw new Error(`Piano_Roll.svg: expected ${count} keys, found ${faces.length}`);
      const keyAnchors=new Map();
      faces.forEach(({path,bounds},index)=>{
        const midi=this.minMidi+index, type=WHITE.has(modulo(midi,12))?"white":"black";
        const wrapper=element("g",{"data-midi":midi,"data-key-type":type});
        wrapper.classList.add("piano-key",`piano-key-${type}`); path.classList.add("piano-key-face");
        path.replaceWith(wrapper); wrapper.appendChild(path); this.keys.set(midi,wrapper);
        const mapping=mappingForMidi(midi,this.zeroMidi,this.colors);
        Object.assign(wrapper.dataset,{play12Symbol:mapping.symbol,play12Color:mapping.color,cycleIndex:String(mapping.cycle)});
        wrapper.style.setProperty("--play12-key-color",mapping.color);
        keyAnchors.set(midi,{left:bounds.left,right:bounds.right,top:bounds.top,type});
      });
      this.mount.dataset.keyCount=String(this.keys.size);
      const penultimateKeyAnchor=keyAnchors.get(this.maxMidi-1);
      if(!penultimateKeyAnchor) throw new Error("Piano_Roll.svg: penultimate key geometry is missing");
      this.cardClipRect.setAttribute("width",String(penultimateKeyAnchor.right));
      this.mount.dataset.cardClipRight=String(penultimateKeyAnchor.right);
      this.mount.dataset.cardClipLastVisibleMidi=String(this.maxMidi-1);
      this.renderStrips(keyAnchors);
      for (const [source, midis] of this.activeBySource) this.setActiveMidis(midis,source);
    }

    boundsInPianoCoordinates(path) {
      const box=path.getBBox(), matrix=path.getCTM();
      const points=[
        new DOMPoint(box.x,box.y),new DOMPoint(box.x+box.width,box.y),
        new DOMPoint(box.x,box.y+box.height),new DOMPoint(box.x+box.width,box.y+box.height)
      ].map(point=>point.matrixTransform(matrix));
      const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
      const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
      return {left,right,top,bottom,width:right-left,height:bottom-top};
    }

    renderStrips(keyAnchors) {
      const octaveSpan=this.measureOctaveSpan(keyAnchors);
      const blackZero=!WHITE.has(modulo(this.zeroMidi,12));
      // A Play12 keyboard has exactly one non-repeating seven-color set.
      // Keys before red and after pink intentionally have no card strip.
      for(let cycle=0;cycle<this.cardTheme.cycleNames.length;cycle++){
        const cycleStartMidi=this.zeroMidi+cycle*12;
        if(cycleStartMidi>this.maxMidi) break;
        const yMidi=this.zeroMidi+cycle*12+11;
        const yAnchor=this.anchorForMidi(yMidi,keyAnchors,octaveSpan);
        const zeroAnchor=keyAnchors.get(cycleStartMidi);
        const colorName=this.cardTheme.cycleNames[cycle];
        // White zero keeps the approved Y-key bottom-right anchor. A black zero
        // anchors every immutable strip to the actual top-left of that cycle's
        // black zero key; no neighbouring white-key geometry participates.
        const stripX=blackZero?zeroAnchor.left:yAnchor.right-this.cardTheme.stripWidth;
        const stripTop=blackZero?zeroAnchor.top:yAnchor.top;
        const stripRight=stripX+this.cardTheme.stripWidth;
        if(stripRight<=0||stripX>=PIANO_WIDTH) continue;
        const strip=element("image",{x:stripX,y:stripTop-this.cardTheme.stripHeight,
          width:this.cardTheme.stripWidth,height:this.cardTheme.stripHeight,
          "data-color-cycle":colorName,"data-cycle-index":cycle,"data-y-midi":yMidi,
          "data-zero-midi":cycleStartMidi,"data-zero-key-type":zeroAnchor.type,
          "data-anchor":blackZero?"bottom-left-to-black-zero-key-top-left":"bottom-right-to-y-key-top-right",
          "clip-path":"url(#play12-card-keyboard-bounds)"});
        const url=this.cardTheme.stripUrls[colorName];
        strip.setAttribute("href",url); strip.setAttributeNS(XLINK,"xlink:href",url);
        strip.classList.add("piano-card-strip"); this.svg.appendChild(strip);
      }
    }

    measureOctaveSpan(anchors) {
      for(let midi=this.minMidi;midi+12<=this.maxMidi;midi++) if(anchors.has(midi)&&anchors.has(midi+12)) return anchors.get(midi+12).right-anchors.get(midi).right;
      throw new Error("Piano_Roll.svg: cannot measure octave span");
    }

    anchorForMidi(midi,anchors,octaveSpan) {
      if(anchors.has(midi)) return anchors.get(midi);
      let reference=midi;
      while(reference>this.maxMidi) reference-=12;
      while(reference<this.minMidi) reference+=12;
      const anchor=anchors.get(reference);
      const shift=(midi-reference)/12*octaveSpan;
      return {...anchor,left:anchor.left+shift,right:anchor.right+shift};
    }

    fitReferenceAspect() {
      const parent=this.mount.parentElement, availableHeight=Math.max(0,parent.clientHeight*.22-42);
      if(parent.classList.contains("mvp-piano-host")||this.mount.classList.contains("is-fixed-piano-view")){
        const availableWidth=this.mount.classList.contains("is-fixed-piano-view")
          ? Math.max(0,global.innerWidth-24)
          : Math.max(0,parent.clientWidth);
        const targetWidth=Math.max(1100,availableWidth);
        this.mount.style.width=`${targetWidth}px`;
        this.mount.style.height=`${targetWidth*VIEW_HEIGHT/PIANO_WIDTH}px`;
        return;
      }
      this.mount.style.width=`${Math.min(parent.clientWidth-2,availableHeight*PIANO_WIDTH/VIEW_HEIGHT+18)}px`;
      this.mount.style.height="";
    }
    syncContainer(){
      this.resizeObserver.disconnect();
      this.resizeObserver.observe(this.mount.parentElement);
      this.fitReferenceAspect();
      if(!this.keys.size) requestAnimationFrame(()=>this.bindGeometry());
    }
    setZeroMidi(zeroMidi){if(zeroMidi!==this.zeroMidi)this.render(zeroMidi);}
    setZeroNote(zeroNote){this.setZeroMidi(this.zeroMidiFor(zeroNote));}
    bindPointerControls(){
      this.mount.addEventListener("pointerdown",event=>{
        const key=event.target.closest?.(".piano-key");
        if(!key||!this.mount.contains(key))return;
        event.preventDefault();
        const midi=Number(key.dataset.midi);
        this.releaseVirtualPointer(event.pointerId);
        this.virtualPointers.set(event.pointerId,midi);
        this.virtualHandlers?.noteOn(midi,event.pointerId);
      });
      const release=event=>this.releaseVirtualPointer(event.pointerId);
      global.addEventListener("pointerup",release);
      global.addEventListener("pointercancel",release);
      this.mount.addEventListener("pointerleave",release);
    }
    releaseVirtualPointer(pointerId){
      if(!this.virtualPointers.has(pointerId))return;
      const midi=this.virtualPointers.get(pointerId);
      this.virtualPointers.delete(pointerId);
      this.virtualHandlers?.noteOff(midi,pointerId);
    }
    setVirtualNoteHandlers(handlers){this.virtualHandlers=handlers;}
    setActiveMidis(midis,source="playback"){
      if(!this.activeBySource.has(source))this.activeBySource.set(source,new Set());
      const previous=this.activeBySource.get(source),next=new Set(midis); this.activeBySource.set(source,next);
      for(const midi of new Set([...previous,...next])){
        const key=this.keys.get(midi); if(!key)continue;
        key.classList.toggle("is-sounding",this.activeBySource.get("playback")?.has(midi)||false);
        key.classList.toggle("is-input-active",this.activeBySource.get("mouse")?.has(midi)||this.activeBySource.get("midi")?.has(midi)||false);
      }
      const union=new Set([...this.activeBySource.values()].flatMap(active=>[...active]));
      this.mount.dataset.activeMidis=[...union].sort((a,b)=>a-b).join(",");
      this.mount.dataset.playbackActiveMidis=[...(this.activeBySource.get("playback")||[])].sort((a,b)=>a-b).join(",");
      this.mount.dataset.midiInputActiveMidis=[...(this.activeBySource.get("midi")||[])].sort((a,b)=>a-b).join(",");
      this.mount.dataset.virtualKeyActiveMidis=[...(this.activeBySource.get("mouse")||[])].sort((a,b)=>a-b).join(",");
    }
    setActivePitches(pitches){this.setActiveMidis(pitches.map(pitch=>pitch.midi).filter(Number.isFinite),"playback");}
  }
  global.Play12PianoView={render:options=>new PianoView(options),mappingForMidi,layoutZeroForMidi};
})(window);
