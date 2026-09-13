(function (global) {
  'use strict';

  const STEPS = Object.freeze([
    'WELCOME', 'MIDI_CONNECT', 'LISTEN_AND_CONTROL', 'CHOOSE_ZERO', 'AUDIO_CHECK', 'LEARN_PLAY',
    'LEARN_PAUSE', 'LEARN_TEMPO', 'LEARN_METRONOME', 'RIGHT_HAND_PLAY',
    'TEMPO_CHECK', 'LEARN_LOOP', 'LEFT_HAND_PLAY', 'BOTH_HANDS_PLAY',
    'ONBOARDING_COMPLETE'
  ]);

  const STORAGE_KEYS = Object.freeze({
    state: 'play12.onboarding.state.v1',
    sessionExists: 'play12.session.exists.v1'
  });

  const EXISTING_SESSION_KEYS = Object.freeze([
    'play12.zero_note.midi', 'play12.zero_note.pitch_class',
    'play12.loop-gap', 'play12.metronome-volume'
  ]);

  const isStep = value => STEPS.includes(value);

  function readSavedState(storage) {
    try {
      const value = JSON.parse(storage.getItem(STORAGE_KEYS.state));
      if (!value || typeof value !== 'object' || !isStep(value.onboardingStep)) return null;
      return {
        onboardingStarted: value.onboardingStarted === true,
        onboardingStep: value.onboardingStep,
        onboardingCompleted: value.onboardingCompleted === true,
        lastSessionExists: true,
        midiVerified: value.midiVerified === true,
        inputMode: value.inputMode === 'midi' || value.inputMode === 'demo' ? value.inputMode : null,
        midiUsbGuideSeen: value.midiUsbGuideSeen === true,
        playLearned: value.playLearned === true,
        pauseLearned: value.pauseLearned === true,
        listenFragmentCompleted: value.listenFragmentCompleted === true,
        chooseZeroCompleted: value.chooseZeroCompleted === true,
        zeroChangeHintShown: value.zeroChangeHintShown === true
      };
    } catch (_) {
      return null;
    }
  }

  function hasExistingSession(storage) {
    if (readSavedState(storage)) return true;
    if (storage.getItem(STORAGE_KEYS.sessionExists) === 'true') return true;
    if (EXISTING_SESSION_KEYS.some(key => storage.getItem(key) !== null)) return true;
    for (let index = 0; index < storage.length; index += 1) {
      if ((storage.key(index) || '').startsWith('play12.ui-module-position.')) return true;
    }
    return false;
  }

  function saveState(storage, state) {
    storage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
    storage.setItem(STORAGE_KEYS.sessionExists, 'true');
  }

  function create(options) {
    const storage = options.storage || global.localStorage;
    const root = options.root;
    const startButton = options.startButton;
    const continueButton = options.continueButton;
    const views = new Map([...root.querySelectorAll('[data-onboarding-view]')]
      .map(element => [element.dataset.onboardingView, element]));
    const midiStates = new Map([...root.querySelectorAll('[data-midi-connect-state]')]
      .map(element => [element.dataset.midiConnectState, element]));
    const pianoHost = root.querySelector('#onboarding-piano-host');
    const playbackHost = root.querySelector('#onboarding-playback-host');
    const listenPianoHost = root.querySelector('#onboarding-listen-piano-host');
    const listenPrompt = root.querySelector('#onboarding-listen-prompt');
    const listenCoach = root.querySelector('#onboarding-listen-coach');
    const pianoCallout = root.querySelector('#onboarding-piano-callout');
    const songTitleViewport = root.querySelector('#onboarding-song-title-viewport');
    const songTitle = root.querySelector('#onboarding-song-title');
    const songStep = root.querySelector('#onboarding-song-step');
    const listenContinue = root.querySelector('#onboarding-listen-continue');
    const onboardingChooseZero = root.querySelector('#onboarding-choose-zero');
    const zeroCallout = root.querySelector('#onboarding-zero-callout');
    const progressItems = new Map([...root.querySelectorAll('[data-progress-step]')]
      .map(element => [Number(element.dataset.progressStep), element]));
    const savedState = readSavedState(storage);
    const returning = hasExistingSession(storage);
    let state = savedState || {
      onboardingStarted: false,
      onboardingStep: 'WELCOME',
      onboardingCompleted: false,
      lastSessionExists: returning,
      midiVerified: false,
      inputMode: null,
      midiUsbGuideSeen: false,
      playLearned: false,
      pauseLearned: false,
      listenFragmentCompleted: false,
      chooseZeroCompleted: false,
      zeroChangeHintShown: false
    };
    let runtime = null;
    let pianoHome = null;
    let stageHome = null;
    let removeNoteListener = null;
    let removeMidiStatusListener = null;
    let removePlaybackStateListener = null;
    let midiConnectState = 'choice';
    let listenPosition = 0;
    let listenPlaybackRunning = false;
    let listenPlaybackState = 'paused';
    let annotationResumeArmed = false;
    let pianoAnnotationShown = false;
    let pianoAnnotationTimer = null;
    let zeroAnnotationTimer = null;
    let playerClipFrame = 0;

    const syncSongTitleMarquee = () => {
      if (!songTitleViewport || !songTitle) return;
      songTitle.classList.remove('is-marquee');
      songTitle.style.removeProperty('--mvp-marquee-distance');
      const overflow = Math.ceil(songTitle.scrollWidth - songTitleViewport.clientWidth);
      songTitleViewport.dataset.overflowing = String(overflow > 1);
      if (overflow > 1) {
        songTitle.style.setProperty('--mvp-marquee-distance', `${overflow}px`);
        songTitle.classList.add('is-marquee');
      }
    };

    const showPianoAnnotationOnce = () => {
      if (!pianoCallout || pianoAnnotationShown) return;
      pianoAnnotationShown = true;
      pianoCallout.hidden = false;
      pianoCallout.classList.add('is-visible');
      pianoAnnotationTimer = global.setTimeout(() => {
        pianoCallout.classList.remove('is-visible');
        pianoCallout.hidden = true;
      }, 7000);
    };

    const showZeroAnnotation = () => {
      if (!zeroCallout) return;
      zeroCallout.hidden = false;
      zeroCallout.classList.remove('is-visible');
      void zeroCallout.offsetWidth;
      zeroCallout.classList.add('is-visible');
      clearTimeout(zeroAnnotationTimer);
      zeroAnnotationTimer = global.setTimeout(() => {
        zeroCallout.classList.remove('is-visible');
        zeroCallout.hidden = true;
      }, 7000);
    };

    const syncPlayerClip = () => {
      cancelAnimationFrame(playerClipFrame);
      playerClipFrame = requestAnimationFrame(() => runtime?.playback?.layoutCoreGeometry?.());
    };
    let fixedPianoResizeHandler = null;

    const syncFixedPiano = () => {
      const mount = runtime?.pianoView?.mount;
      if (!mount?.classList.contains('is-fixed-piano-view')) return;
      runtime.pianoView.syncContainer?.();
      requestAnimationFrame(() => {
        const pianoRect = mount.getBoundingClientRect();
        const height = Math.ceil(pianoRect.height);
        const playbackHeight = document.body.classList.contains('play12-onboarding-listen') ? 50 : 0;
        const reserved = height + playbackHeight + 36;
        root.style.setProperty('--mvp-fixed-piano-height', `${height}px`);
        document.documentElement.style.setProperty('--mvp-fixed-piano-height', `${height}px`);
        root.style.setProperty('--mvp-fixed-piano-space', `${reserved}px`);
        document.documentElement.style.setProperty('--mvp-fixed-piano-space', `${reserved}px`);
        root.style.setProperty('--mvp-piano-left-x', `${pianoRect.left}px`);
        document.documentElement.style.setProperty('--mvp-piano-left-x', `${pianoRect.left}px`);
      });
    };

    const keepPianoFixed = () => {
      const mount = runtime?.pianoView?.mount;
      if (!mount) return;
      mount.classList.add('is-fixed-piano-view');
      document.body.classList.add('play12-fixed-piano-visible');
      if (!fixedPianoResizeHandler) {
        fixedPianoResizeHandler = () => {
          syncFixedPiano();
          syncPlayerClip();
          syncSongTitleMarquee();
        };
        global.addEventListener('resize', fixedPianoResizeHandler);
        root.addEventListener('scroll', syncPlayerClip, { passive: true });
      }
      syncFixedPiano();
    };

    const exposeState = () => {
      Object.assign(root.dataset, {
        onboardingStarted: String(state.onboardingStarted),
        onboardingStep: state.onboardingStep,
        onboardingCompleted: String(state.onboardingCompleted),
        lastSessionExists: String(state.lastSessionExists),
        midiVerified: String(state.midiVerified),
        inputMode: state.inputMode || 'none',
        midiUsbGuideSeen: String(state.midiUsbGuideSeen),
        playLearned: String(state.playLearned),
        pauseLearned: String(state.pauseLearned),
        listenFragmentCompleted: String(state.listenFragmentCompleted),
        chooseZeroCompleted: String(state.chooseZeroCompleted),
        zeroChangeHintShown: String(state.zeroChangeHintShown),
        midiConnectState
      });
    };

    const syncProgress = () => {
      const activeStep = state.onboardingStep === 'CHOOSE_ZERO' ? 2 : 1;
      for (const [number, element] of progressItems) {
        const completed = number < activeStep || (number === 2 && state.chooseZeroCompleted);
        element.classList.toggle('is-active', number === activeStep && !completed);
        element.classList.toggle('is-complete', completed);
        if (number === activeStep && !completed) element.setAttribute('aria-current', 'step');
        else element.removeAttribute('aria-current');
      }
      if (onboardingChooseZero) onboardingChooseZero.hidden = state.onboardingStep !== 'CHOOSE_ZERO';
      if (songStep) songStep.textContent = `Step ${activeStep} of 4`;
    };

    const showMidiState = value => {
      midiConnectState = value;
      for (const [name, element] of midiStates) element.hidden = name !== value;
      exposeState();
    };

    const movePianoToOnboarding = () => {
      if (!runtime?.pianoView?.mount || !pianoHost) return;
      const mount = runtime.pianoView.mount;
      if (!pianoHome) pianoHome = { parent: mount.parentElement, nextSibling: mount.nextSibling };
      if (mount.parentElement !== pianoHost) pianoHost.appendChild(mount);
      keepPianoFixed();
      runtime.pianoView.syncContainer?.();
    };

    const restorePiano = () => {
      if (!runtime?.pianoView?.mount || !pianoHome) return;
      const mount = runtime.pianoView.mount;
      if (pianoHome.nextSibling?.parentElement === pianoHome.parent) pianoHome.parent.insertBefore(mount, pianoHome.nextSibling);
      else pianoHome.parent.appendChild(mount);
      runtime.pianoView.syncContainer?.();
    };

    const moveStageToOnboarding = () => {
      const stage = runtime?.stage;
      if (!stage || !playbackHost) return;
      if (!stageHome) stageHome = { parent: stage.parentElement, nextSibling: stage.nextSibling };
      if (stage.parentElement !== playbackHost) playbackHost.appendChild(stage);
      if (runtime?.pianoView?.mount && listenPianoHost) {
        const mount = runtime.pianoView.mount;
        if (!pianoHome) pianoHome = { parent: mount.parentElement, nextSibling: mount.nextSibling };
        if (mount.parentElement !== listenPianoHost) listenPianoHost.appendChild(mount);
        keepPianoFixed();
        runtime.pianoView.syncContainer?.();
      }
      document.body.classList.add('play12-onboarding-listen');
      global.dispatchEvent(new Event('resize'));
      requestAnimationFrame(() => runtime?.playback?.layoutCoreGeometry?.());
    };

    const restoreStage = () => {
      const stage = runtime?.stage;
      if (!stage || !stageHome) return;
      if (stageHome.nextSibling?.parentElement === stageHome.parent) stageHome.parent.insertBefore(stage, stageHome.nextSibling);
      else stageHome.parent.appendChild(stage);
      document.body.classList.remove('play12-onboarding-listen');
      global.dispatchEvent(new Event('resize'));
      requestAnimationFrame(() => runtime?.playback?.layoutCoreGeometry?.());
    };

    const syncListenCopy = () => {
      const showCoach = text => {
        if (!listenCoach) return;
        if (!listenCoach.hidden && listenCoach.dataset.copy === text) return;
        listenCoach.dataset.copy = text;
        listenPrompt.innerHTML = text;
        listenCoach.hidden = false;
        listenCoach.classList.remove('is-entering');
        void listenCoach.offsetWidth;
        listenCoach.classList.add('is-entering');
      };
      const hideCoach = () => {
        if (!listenCoach) return;
        listenCoach.classList.remove('is-entering');
        listenCoach.hidden = true;
      };
      if (state.listenFragmentCompleted) {
        hideCoach();
        listenContinue.hidden = false;
      } else if (state.pauseLearned) {
        if (listenPlaybackRunning) hideCoach();
        else showCoach('Continue');
        listenContinue.hidden = true;
      } else if (listenPlaybackState === 'pause-queued') {
        hideCoach();
        listenContinue.hidden = true;
      } else if (state.playLearned && listenPosition >= 4.8) {
        showCoach('Try pausing the music');
        listenContinue.hidden = true;
      } else if (state.playLearned) {
        hideCoach();
        listenContinue.hidden = true;
      } else {
        showCoach('Listen to how the melody sounds<br>Press Play or Space');
        listenContinue.hidden = true;
      }
      exposeState();
    };

    const showStep = step => {
      const visibleView = step === 'CHOOSE_ZERO' ? 'LISTEN_AND_CONTROL' : step;
      for (const [name, element] of views) element.hidden = name !== visibleView;
      document.body.classList.toggle('play12-onboarding-choose-zero', step === 'CHOOSE_ZERO');
      if (step === 'MIDI_CONNECT') {
        restoreStage();
        root.hidden = false;
        document.body.classList.add('play12-onboarding-active');
        document.body.classList.remove('play12-onboarding-dismissed');
        showMidiState('choice');
        movePianoToOnboarding();
      } else if (step === 'LISTEN_AND_CONTROL' || step === 'CHOOSE_ZERO') {
        root.hidden = false;
        document.body.classList.add('play12-onboarding-active');
        document.body.classList.remove('play12-onboarding-dismissed');
        moveStageToOnboarding();
        requestAnimationFrame(syncSongTitleMarquee);
        if (step === 'LISTEN_AND_CONTROL') syncListenCopy();
        else {
          if (listenCoach) listenCoach.hidden = true;
          if (listenContinue) listenContinue.hidden = true;
        }
      }
      syncProgress();
      exposeState();
    };

    const showMvp = () => {
      restorePiano();
      restoreStage();
      root.hidden = true;
      document.body.classList.remove('play12-onboarding-boot', 'play12-onboarding-active');
      document.body.classList.add('play12-onboarding-dismissed');
      exposeState();
    };

    const startNew = () => {
      state = {
        onboardingStarted: true,
        onboardingStep: 'MIDI_CONNECT',
        onboardingCompleted: false,
        lastSessionExists: true,
        midiVerified: false,
        inputMode: null,
        midiUsbGuideSeen: false,
        playLearned: false,
        pauseLearned: false,
        listenFragmentCompleted: false,
        chooseZeroCompleted: false,
        zeroChangeHintShown: false
      };
      annotationResumeArmed = false;
      pianoAnnotationShown = false;
      clearTimeout(pianoAnnotationTimer);
      clearTimeout(zeroAnnotationTimer);
      if (pianoCallout) {
        pianoCallout.hidden = true;
        pianoCallout.classList.remove('is-visible');
      }
      if (zeroCallout) {
        zeroCallout.hidden = true;
        zeroCallout.classList.remove('is-visible');
      }
      saveState(storage, state);
      showStep('MIDI_CONNECT');
      return { ...state };
    };

    const continueSession = () => {
      const restored = readSavedState(storage);
      if (restored) state = restored;
      else state = { ...state, lastSessionExists: true };
      saveState(storage, state);
      if (state.onboardingStep === 'MIDI_CONNECT') showStep('MIDI_CONNECT');
      else if (state.onboardingStep === 'LISTEN_AND_CONTROL') showStep('LISTEN_AND_CONTROL');
      else if (state.onboardingStep === 'CHOOSE_ZERO') showStep('CHOOSE_ZERO');
      else if (state.onboardingStep === 'WELCOME') showStep('WELCOME');
      else showMvp();
      return { ...state };
    };

    const beginMidiTest = () => {
      showMidiState('test');
      runtime?.noteEvents?.unlockAudio?.();
      if (!runtime?.midiDiagnostic) {
        showMidiState('unsupported');
        return;
      }
      runtime.midiDiagnostic.enable();
    };

    const showUsbGuide = () => {
      state = { ...state, midiUsbGuideSeen: true };
      saveState(storage, state);
      showMidiState('guide');
    };

    const showPermissionHelp = () => showMidiState('permission-help');

    const verifyMidi = () => {
      state = { ...state, midiVerified: true, inputMode: 'midi' };
      saveState(storage, state);
      showMidiState('success');
    };

    const enterDemoMode = () => {
      state = { ...state, inputMode: 'demo', midiVerified: false, onboardingStep: 'LISTEN_AND_CONTROL' };
      saveState(storage, state);
      showStep('LISTEN_AND_CONTROL');
    };

    const advanceToListen = () => {
      if (!state.midiVerified && state.inputMode !== 'demo') return;
      state = { ...state, onboardingStep: 'LISTEN_AND_CONTROL' };
      saveState(storage, state);
      showStep('LISTEN_AND_CONTROL');
    };

    const advanceToChooseZero = () => {
      if (!state.listenFragmentCompleted) return;
      state = { ...state, onboardingStep: 'CHOOSE_ZERO' };
      saveState(storage, state);
      showStep('CHOOSE_ZERO');
    };

    const handleZeroConfirmed = () => {
      if (state.onboardingStep !== 'CHOOSE_ZERO') return;
      const shouldShowHint = !state.zeroChangeHintShown;
      state = { ...state, chooseZeroCompleted: true, zeroChangeHintShown: true };
      saveState(storage, state);
      syncProgress();
      exposeState();
      if (shouldShowHint) showZeroAnnotation();
    };

    const connectRuntime = nextRuntime => {
      runtime = nextRuntime;
      removeNoteListener?.();
      removeMidiStatusListener?.();
      removePlaybackStateListener?.();
      removeNoteListener = runtime.noteEvents?.addNoteListener?.(event => {
        if (state.onboardingStep === 'MIDI_CONNECT' && midiConnectState === 'test' &&
            event.type === 'note-on' && event.source === 'midi' && event.velocity > 0) verifyMidi();
      }) || null;
      removeMidiStatusListener = runtime.midiDiagnostic?.addStatusListener?.(event => {
        if (state.onboardingStep !== 'MIDI_CONNECT') return;
        if (event.status === 'unavailable') showMidiState(event.detail?.safari ? 'unsupported-safari' : 'unsupported');
        else if (event.status === 'permission-denied') showMidiState('permission-denied');
        else if (event.status === 'no-input') showMidiState('device-not-found');
        else if (event.status === 'connected' && midiConnectState !== 'success') showMidiState('test');
        else if (event.status === 'error') showMidiState('permission-help');
      }) || null;
      removePlaybackStateListener = runtime.playback?.addStateListener?.(snapshot => {
        if (state.onboardingStep !== 'LISTEN_AND_CONTROL') return;
        const previousPlaybackState = listenPlaybackState;
        listenPosition = snapshot.position;
        listenPlaybackRunning = snapshot.running;
        listenPlaybackState = snapshot.state;
        if (snapshot.state === 'paused' && snapshot.position === 0) annotationResumeArmed = false;
        if (snapshot.state === 'paused' && previousPlaybackState !== 'paused' && snapshot.position > 0 && !snapshot.ended && !pianoAnnotationShown) {
          annotationResumeArmed = true;
        }
        if (snapshot.running && !state.playLearned) {
          state = { ...state, playLearned: true };
          saveState(storage, state);
        }
        if (state.playLearned && !state.pauseLearned && snapshot.state === 'paused' && snapshot.position > 0 && !snapshot.ended) {
          state = { ...state, pauseLearned: true };
          saveState(storage, state);
        }
        if (snapshot.running && previousPlaybackState === 'paused' && annotationResumeArmed) {
          annotationResumeArmed = false;
          showPianoAnnotationOnce();
        }
        if (state.pauseLearned && snapshot.ended && !state.listenFragmentCompleted) {
          state = { ...state, listenFragmentCompleted: true, onboardingStep: 'CHOOSE_ZERO' };
          saveState(storage, state);
          showStep('CHOOSE_ZERO');
          global.dispatchEvent(new CustomEvent('play12:choose-zero-open'));
          return;
        }
        syncListenCopy();
      }) || null;
      if (state.onboardingStep === 'MIDI_CONNECT') movePianoToOnboarding();
      if (state.onboardingStep === 'LISTEN_AND_CONTROL' || state.onboardingStep === 'CHOOSE_ZERO') moveStageToOnboarding();
      if (state.onboardingStep === 'CHOOSE_ZERO' && new URLSearchParams(location.search).get('onboardingPreview') === 'choose-zero') {
        global.dispatchEvent(new CustomEvent('play12:choose-zero-open'));
      }
    };

    document.body.classList.remove('play12-onboarding-boot');
    document.body.classList.add('play12-onboarding-active');
    continueButton.hidden = !returning;
    startButton.addEventListener('click', startNew);
    continueButton.addEventListener('click', continueSession);
    root.querySelector('#onboarding-midi-ready').addEventListener('click', beginMidiTest);
    root.querySelector('#onboarding-midi-guide').addEventListener('click', showUsbGuide);
    root.querySelector('#onboarding-demo').addEventListener('click', enterDemoMode);
    root.querySelector('#onboarding-midi-check').addEventListener('click', beginMidiTest);
    root.querySelector('#onboarding-midi-browser-help').addEventListener('click', showPermissionHelp);
    root.querySelector('#onboarding-midi-request-access').addEventListener('click', beginMidiTest);
    root.querySelector('#onboarding-midi-retry').addEventListener('click', beginMidiTest);
    root.querySelector('#onboarding-midi-show-guide').addEventListener('click', showUsbGuide);
    root.querySelector('#onboarding-midi-refresh').addEventListener('click', beginMidiTest);
    root.querySelector('#onboarding-midi-continue').addEventListener('click', advanceToListen);
    listenContinue.addEventListener('click', advanceToChooseZero);
    global.addEventListener('play12:zero-confirmed', handleZeroConfirmed);
    showStep('WELCOME');
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('onboardingPreview') === 'listen') {
      state = {
        ...state, onboardingStarted: true, onboardingStep: 'LISTEN_AND_CONTROL', midiVerified: true,
        playLearned: false, pauseLearned: false, listenFragmentCompleted: false
      };
      showStep('LISTEN_AND_CONTROL');
    }
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('onboardingPreview') === 'choose-zero') {
      state = {
        ...state, onboardingStarted: true, onboardingStep: 'CHOOSE_ZERO', inputMode: 'demo', midiVerified: false,
        playLearned: true, pauseLearned: true, listenFragmentCompleted: true, chooseZeroCompleted: false,
        zeroChangeHintShown: false
      };
      saveState(storage, state);
      showStep('CHOOSE_ZERO');
      global.dispatchEvent(new CustomEvent('play12:choose-zero-open'));
    }

    return Object.freeze({
      steps: STEPS,
      storageKeys: STORAGE_KEYS,
      getState: () => ({ ...state }),
      startNew,
      continueSession,
      connectRuntime
    });
  }

  global.Play12Onboarding = Object.freeze({ STEPS, STORAGE_KEYS, create });
})(window);
