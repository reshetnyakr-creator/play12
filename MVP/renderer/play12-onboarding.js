(function (global) {
  'use strict';

  const STEPS = Object.freeze([
    'WELCOME', 'MIDI_CONNECT', 'LISTEN_AND_CONTROL', 'CHOOSE_ZERO', 'TRY_IT_YOURSELF', 'AUDIO_CHECK', 'LEARN_PLAY',
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
        highestUnlockedStep: Math.max(1, Math.min(3, Number(value.highestUnlockedStep) || 1)),
        midiVerified: value.midiVerified === true,
        inputMode: value.inputMode === 'midi' || value.inputMode === 'demo' ? value.inputMode : null,
        midiUsbGuideSeen: value.midiUsbGuideSeen === true,
        playLearned: value.playLearned === true,
        pauseLearned: value.pauseLearned === true,
        listenFragmentCompleted: value.listenFragmentCompleted === true,
        chooseZeroCompleted: value.chooseZeroCompleted === true,
        zeroChangeHintShown: value.zeroChangeHintShown === true,
        practiceModeEnabled: value.practiceModeEnabled === true,
        practiceLeftHandEnabled: value.practiceLeftHandEnabled !== false,
        practiceRightHandEnabled: value.practiceRightHandEnabled !== false,
        oneSkillMode: false, activeSkillId: null,
        practiceGuideStage: ['enable', 'hand', 'ready', 'playing', 'complete', 'free'].includes(value.practiceGuideStage) ? value.practiceGuideStage : 'enable'
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
    const notesCallout = root.querySelector('.mvp-notes-callout');
    const songTitleViewport = root.querySelector('#onboarding-song-title-viewport');
    const songTitle = root.querySelector('#onboarding-song-title');
    const songStep = root.querySelector('#onboarding-song-step');
    const listenContinue = root.querySelector('#onboarding-listen-continue');
    const onboardingChooseZero = root.querySelector('#onboarding-choose-zero');
    const practiceBoard = root.querySelector('#practice-board');
    const practiceModeButton = root.querySelector('#practice-board-mode');
    const leftHandButton = root.querySelector('#practice-left-hand');
    const rightHandButton = root.querySelector('#practice-right-hand');
    let practiceGuidePending = false;
    const reconnectCard = root.querySelector('#returning-midi');
    const reconnectMessage = root.querySelector('#returning-midi-message');
    let recoveringMidi = false;
    let resumeRequested = false;
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
    const hintTimers = new Map();
    const hintKeys = new Map();
    const dismissedHints = new Set();
    const hideHint = element => {
      clearTimeout(hintTimers.get(element));
      hintTimers.delete(element);
      if (hintKeys.has(element)) dismissedHints.add(hintKeys.get(element));
      hintKeys.delete(element);
      element.hidden = true;
      element.classList.remove('has-dismiss-timer', 'is-entering', 'is-visible');
    };
    const showHint = (element, key, afterDismiss = null) => {
      if (hintKeys.get(element) === key) return;
      hideHint(element);
      if (dismissedHints.has(key)) { afterDismiss?.(); return; }
      hintKeys.set(element, key);
      element.hidden = false;
      element.classList.add('has-dismiss-timer');
      hintTimers.set(element, global.setTimeout(() => { hideHint(element); afterDismiss?.(); }, 12000));
    };
    const clearHints = () => {
      for (const element of [listenCoach, pianoCallout, zeroCallout, notesCallout]) if (element) hideHint(element);
      practiceGuidePending = false;
    };
    const showCoach = text => {
      if (!text) { hideHint(listenCoach); return; }
      const key = `${state.onboardingStep}:${text}`;
      if (hintKeys.get(listenCoach) === key) return;
      if (dismissedHints.has(key)) { hideHint(listenCoach); return; }
      listenCoach.dataset.copy = text;
      listenPrompt.innerHTML = text;
      showHint(listenCoach, key);
      void listenCoach.offsetWidth;
      listenCoach.classList.add('is-entering');
    };
    let playerClipFrame = 0;
    let visibleStep = 'WELCOME';

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
      showHint(pianoCallout, 'piano-annotation');
      pianoCallout.classList.add('is-visible');
    };

    const showZeroAnnotation = () => {
      if (!zeroCallout) return;
      showHint(zeroCallout, 'zero-annotation', () => {
        practiceGuidePending = false;
        syncPracticeGuide();
      });
      zeroCallout.classList.add('is-visible');
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
        document.documentElement.style.setProperty('--mvp-piano-right-inset', `${global.innerWidth - pianoRect.right}px`);
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

    const highestUnlocked = () => Math.max(state.highestUnlockedStep || 1,
      state.chooseZeroCompleted || state.onboardingStep === 'TRY_IT_YOURSELF' ? 3 : state.listenFragmentCompleted ? 2 : 1);

    const syncProgress = () => {
      state.highestUnlockedStep = highestUnlocked();
      const activeStep = state.onboardingStep === 'TRY_IT_YOURSELF' ? 3 : state.onboardingStep === 'CHOOSE_ZERO' ? 2 : 1;
      for (const [number, element] of progressItems) {
        const completed = (number === 1 && state.listenFragmentCompleted) || (number === 2 && state.chooseZeroCompleted);
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', number <= state.highestUnlockedStep ? '0' : '-1');
        element.setAttribute('aria-disabled', String(number > state.highestUnlockedStep));
        element.classList.toggle('is-active', number === activeStep);
        element.classList.toggle('is-complete', completed);
        if (number === activeStep) element.setAttribute('aria-current', 'step');
        else element.removeAttribute('aria-current');
      }
      if (onboardingChooseZero) onboardingChooseZero.hidden = !['CHOOSE_ZERO', 'TRY_IT_YOURSELF'].includes(state.onboardingStep);
      if (practiceBoard) practiceBoard.hidden = activeStep !== 3;
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
      const hideCoach = () => hideHint(listenCoach);
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
      visibleStep = step;
      const pendingZeroHint = practiceGuidePending;
      clearHints();
      if (step === 'TRY_IT_YOURSELF') practiceGuidePending = pendingZeroHint;
      syncSkipAnchor();
      const visibleView = ['CHOOSE_ZERO', 'TRY_IT_YOURSELF'].includes(step) ? 'LISTEN_AND_CONTROL' : step;
      for (const [name, element] of views) element.hidden = name !== visibleView;
      document.body.classList.toggle('play12-onboarding-choose-zero', step === 'CHOOSE_ZERO');
      document.body.classList.toggle('play12-onboarding-practice', step === 'TRY_IT_YOURSELF');
      if (step === 'MIDI_CONNECT') {
        restoreStage();
        root.hidden = false;
        document.body.classList.add('play12-onboarding-active');
        document.body.classList.remove('play12-onboarding-dismissed');
        showMidiState('choice');
        movePianoToOnboarding();
      } else if (step === 'LISTEN_AND_CONTROL' || step === 'CHOOSE_ZERO' || step === 'TRY_IT_YOURSELF') {
        root.hidden = false;
        document.body.classList.add('play12-onboarding-active');
        document.body.classList.remove('play12-onboarding-dismissed');
        moveStageToOnboarding();
        requestAnimationFrame(syncSongTitleMarquee);
        if (step === 'LISTEN_AND_CONTROL') {
          syncListenCopy();
          if (notesCallout) showHint(notesCallout, 'notes-direction');
        }
        else {
          if (listenCoach) listenCoach.hidden = true;
          if (listenContinue) listenContinue.hidden = true;
        }
      }
      syncProgress();
      if (step === 'TRY_IT_YOURSELF') syncPracticeGuide();
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
      runtime?.playback?.restart();
      restorePracticeSettings();
      practiceGuidePending = false;
      recoveringMidi = false;
      resumeRequested = false;
      reconnectCard.hidden = true;
      annotationResumeArmed = false;
      pianoAnnotationShown = false;
      clearHints();
      dismissedHints.clear();
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

    const recoverMidi = () => {
      if (!runtime || !state.midiVerified || state.inputMode === 'demo') return;
      recoveringMidi = true;
      reconnectCard.hidden = false;
      reconnectMessage.textContent = 'Connecting your MIDI piano…';
      if (runtime.midiDiagnostic && runtime.midiDiagnostic.currentStatus?.status !== 'unavailable') runtime.midiDiagnostic.enable();
      else reconnectMessage.textContent = 'MIDI is unavailable here — you can play with your mouse';
    };

    const navigateStep = number => {
      if (number > highestUnlocked() || number < 1 || number > 3) return;
      state.highestUnlockedStep = highestUnlocked();
      runtime?.playback?.pauseImmediate();
      if (number !== 2) global.dispatchEvent(new CustomEvent('play12:choose-zero-close'));
      state.onboardingStep = ['LISTEN_AND_CONTROL', 'CHOOSE_ZERO', 'TRY_IT_YOURSELF'][number - 1];
      if (number === 3) {
        hideHint(zeroCallout);
        practiceGuidePending = false;
        zeroCallout.hidden = true;
        restorePracticeSettings();
      } else if (runtime) {
        // Listen revisits use normal playback without overwriting saved Practice preferences.
        runtime.playback.setPracticeSettings({ practiceModeEnabled: false });
      }
      if (number === 1) runtime?.playback?.restart();
      saveState(storage, state);
      showStep(state.onboardingStep);
      if (number === 2) global.dispatchEvent(new CustomEvent('play12:choose-zero-open'));
    };
    for (const [number, element] of progressItems) {
      element.addEventListener('click', () => navigateStep(number));
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigateStep(number); }
      });
    }
    root.querySelector('#returning-midi-retry').addEventListener('click', recoverMidi);

    const syncSkipAnchor = () => {
      const language = root.querySelector('.mvp-language-switch');
      if (language) document.documentElement.style.setProperty('--mvp-skip-top', `${Math.max(12, language.getBoundingClientRect().bottom + 14)}px`);
    };
    global.addEventListener('resize', syncSkipAnchor);
    root.querySelector('#onboarding-skip').addEventListener('click', () => {
      clearHints();
      global.dispatchEvent(new CustomEvent('play12:choose-zero-close'));
      if (state.onboardingStep === 'WELCOME') { startNew(); return; }
      if (state.onboardingStep === 'MIDI_CONNECT') {
        if (!state.inputMode) state.inputMode = 'demo';
        navigateStep(1);
      } else if (state.onboardingStep === 'LISTEN_AND_CONTROL') {
        state.highestUnlockedStep = Math.max(highestUnlocked(), 2);
        navigateStep(2);
      } else if (state.onboardingStep === 'CHOOSE_ZERO') {
        state.highestUnlockedStep = 3;
        state.practiceGuideStage ||= 'enable';
        navigateStep(3);
      } else if (state.onboardingStep === 'TRY_IT_YOURSELF') {
        runtime?.playback?.pauseImmediate();
        state.practiceGuideStage = 'free';
        saveState(storage, state);
        syncPracticeGuide();
      }
    });

    const continueSession = () => {
      const restored = readSavedState(storage);
      if (restored) state = restored;
      else state = { ...state, lastSessionExists: true };
      resumeRequested = true;
      if (highestUnlocked() >= 2) navigateStep(highestUnlocked());
      else if (state.midiVerified || state.inputMode === 'demo') navigateStep(1);
      else if (state.onboardingStep === 'MIDI_CONNECT') showStep('MIDI_CONNECT');
      else showStep('WELCOME');
      recoverMidi();
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
      if (state.chooseZeroCompleted) { navigateStep(3); return; }
      const shouldShowHint = !state.zeroChangeHintShown;
      state = { ...state, chooseZeroCompleted: true, zeroChangeHintShown: true,
        onboardingStep: 'TRY_IT_YOURSELF', practiceModeEnabled: false,
        practiceLeftHandEnabled: true, practiceRightHandEnabled: true,
        oneSkillMode: false, activeSkillId: null, practiceGuideStage: 'enable' };
      practiceGuidePending = shouldShowHint;
      runtime.playback.restart();
      runtime.playback.metronomeInput.checked = false;
      runtime.playback.countInInput.checked = false;
      runtime.playback.loopInput.checked = false;
      restorePracticeSettings();
      saveState(storage, state);
      syncProgress();
      exposeState();
      showStep('TRY_IT_YOURSELF');
      if (shouldShowHint) {
        practiceGuidePending = true;
        hideHint(listenCoach);
        showZeroAnnotation();
        syncPracticeGuide();
      }
    };

    const restorePracticeSettings = () => {
      if (!runtime) return;
      runtime.playback.setPracticeSettings({
        practiceModeEnabled: state.practiceModeEnabled === true,
        practiceLeftHandEnabled: state.practiceLeftHandEnabled !== false,
        practiceRightHandEnabled: state.practiceRightHandEnabled !== false
      });
    };

    const syncPracticeGuide = () => {
      if (state.onboardingStep !== 'TRY_IT_YOURSELF' || visibleStep !== 'TRY_IT_YOURSELF' || !runtime) return;
      const settings = runtime.playback.getPracticeSettings();
      practiceModeButton.setAttribute('aria-pressed', String(settings.practiceModeEnabled));
      leftHandButton.setAttribute('aria-pressed', String(settings.practiceLeftHandEnabled));
      rightHandButton.setAttribute('aria-pressed', String(settings.practiceRightHandEnabled));
      practiceBoard.dataset.guideStage = state.practiceGuideStage;
      let text = '';
      if (!practiceGuidePending) {
        if (state.practiceGuideStage === 'enable') text = 'Now try it yourself<br>First, turn on Practice Mode';
        else if (state.practiceGuideStage === 'hand') text = 'Let’s start with your right hand<br>Turn off Left Hand';
        else if (state.practiceGuideStage === 'ready') text = 'Watch the Note Field and play the keys it shows<br>The music will wait for the right key<br><small>Press Play when you’re ready</small>';
        else if (state.practiceGuideStage === 'complete') text = 'You’ve played through the piece';
      }
      practiceModeButton.classList.toggle('is-guided', !practiceGuidePending && state.practiceGuideStage === 'enable');
      leftHandButton.classList.toggle('is-guided', !practiceGuidePending && state.practiceGuideStage === 'hand');
      showCoach(text);
    };

    const changePracticeSetting = (key, button) => {
      if (!runtime) return;
      const current = runtime.playback.getPracticeSettings();
      if (!runtime.playback.setPracticeSettings({ [key]: !current[key] })) {
        button.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 220 });
        return;
      }
      Object.assign(state, runtime.playback.getPracticeSettings());
      if (['enable', 'hand', 'ready'].includes(state.practiceGuideStage)) {
        state.practiceGuideStage = !state.practiceModeEnabled ? 'enable'
          : !state.practiceLeftHandEnabled && state.practiceRightHandEnabled ? 'ready' : 'hand';
      }
      saveState(storage, state);
      syncPracticeGuide();
    };
    practiceModeButton.addEventListener('click', () => changePracticeSetting('practiceModeEnabled', practiceModeButton));
    leftHandButton.addEventListener('click', () => changePracticeSetting('practiceLeftHandEnabled', leftHandButton));
    rightHandButton.addEventListener('click', () => changePracticeSetting('practiceRightHandEnabled', rightHandButton));

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
        if (recoveringMidi) {
          reconnectCard.hidden = event.status === 'connected';
          reconnectCard.dataset.midiStatus = event.status;
          reconnectMessage.textContent = event.status === 'requesting' ? 'Connecting your MIDI piano…'
            : event.status === 'permission-denied' ? 'Allow MIDI access, then reconnect — or play with your mouse'
            : 'Reconnect your MIDI piano, or play with your mouse';
          return;
        }
        if (state.onboardingStep !== 'MIDI_CONNECT') return;
        if (event.status === 'unavailable') showMidiState(event.detail?.safari ? 'unsupported-safari' : 'unsupported');
        else if (event.status === 'permission-denied') showMidiState('permission-denied');
        else if (event.status === 'no-input') showMidiState('device-not-found');
        else if (event.status === 'connected' && midiConnectState !== 'success') showMidiState('test');
        else if (event.status === 'error') showMidiState('permission-help');
      }) || null;
      removePlaybackStateListener = runtime.playback?.addStateListener?.(snapshot => {
        if (state.onboardingStep === 'TRY_IT_YOURSELF') {
          if (['ready', 'complete'].includes(state.practiceGuideStage) && (snapshot.running || snapshot.state === 'waiting_for_input')) {
            state.practiceGuideStage = 'playing';
            saveState(storage, state);
          }
          if (state.practiceGuideStage === 'playing' && snapshot.ended && runtime.playback.practiceEnabled()) {
            state.practiceGuideStage = 'complete';
            saveState(storage, state);
          }
          syncPracticeGuide();
          return;
        }
        if (state.onboardingStep !== 'LISTEN_AND_CONTROL' || visibleStep !== 'LISTEN_AND_CONTROL') return;
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
      if (resumeRequested) {
        if (state.onboardingStep === 'TRY_IT_YOURSELF') restorePracticeSettings();
        if (state.onboardingStep === 'CHOOSE_ZERO') global.dispatchEvent(new CustomEvent('play12:choose-zero-open'));
        recoverMidi();
      }
      if (state.onboardingStep === 'MIDI_CONNECT') movePianoToOnboarding();
      if (state.onboardingStep === 'LISTEN_AND_CONTROL' || state.onboardingStep === 'CHOOSE_ZERO' || state.onboardingStep === 'TRY_IT_YOURSELF') moveStageToOnboarding();
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
