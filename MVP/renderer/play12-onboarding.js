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
        onboardingStep: value.practiceGuideStage === 'cards' ? 'CHOOSE_ZERO' : value.onboardingStep,
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
        cardsSetupCompleted: value.cardsSetupCompleted === true || value.zeroChangeHintShown === true ||
          (value.cardsSetupCompleted === undefined && value.onboardingStep === 'TRY_IT_YOURSELF' && value.practiceGuideStage !== 'cards'),
        zeroSetupStage: value.zeroSetupStage === 'cards' || value.practiceGuideStage === 'cards' ? 'cards' : null,
        metronomeUnlocked: value.metronomeUnlocked === true,
        roundUnlocked: value.roundUnlocked === true,
        practiceModeEnabled: value.practiceModeEnabled === true,
        practiceLeftHandEnabled: value.practiceLeftHandEnabled !== false,
        practiceRightHandEnabled: value.practiceRightHandEnabled !== false,
        oneSkillMode: false, activeSkillId: null,
        listenGuideStage: ['initial', 'pause', 'continue', 'listening'].includes(value.listenGuideStage) ? value.listenGuideStage : null,
        practiceGuideStage: ['enable', 'hand', 'explain', 'ready', 'playing', 'metronome-on', 'metronome-tempo', 'metronome-play', 'metronome-playing', 'round-nav', 'round-loop', 'round-range', 'round-precount', 'free'].includes(value.practiceGuideStage) ? value.practiceGuideStage : value.practiceGuideStage === 'complete' ? 'free' : 'enable'
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
    const songTitleViewport = root.querySelector('#onboarding-song-title-viewport');
    const songTitle = root.querySelector('#onboarding-song-title');
    const songStep = root.querySelector('#onboarding-song-step');
    const listenContinue = root.querySelector('#onboarding-listen-continue');
    const onboardingChooseZero = root.querySelector('#onboarding-choose-zero');
    const practiceBoard = root.querySelector('#practice-board');
    const practiceModeButton = root.querySelector('#practice-board-mode');
    const leftHandButton = root.querySelector('#practice-left-hand');
    const rightHandButton = root.querySelector('#practice-right-hand');
    const reconnectCard = root.querySelector('#returning-midi');
    const reconnectMessage = root.querySelector('#returning-midi-message');
    let recoveringMidi = false;
    let resumeRequested = false;
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
      cardsSetupCompleted: false, zeroSetupStage: null
    };
    let runtime = null;
    let pianoHome = null;
    let stageHome = null;
    let transportHome = null;
    let removeNoteListener = null;
    let removeMidiStatusListener = null;
    let removePlaybackStateListener = null;
    let midiConnectState = 'choice';
    let listenPosition = 0;
    let listenPlaybackState = 'paused';
    const spotlight = global.Play12Coach.create(root);
    // Targets describe WHERE for each instruction; card positioning is independent.
    const targetsFor = instruction => {
      const element = id => document.getElementById(id);
      const piano = runtime?.pianoView?.mount;
      if (instruction === 'choose-zero') return [element('onboarding-choose-zero'), piano];
      if (instruction === 'cards') return [...(piano?.querySelectorAll('.piano-card-strip') || [])];
      if (instruction === 'round-range') return [element('round-range-controls'), element('round-timeline')];
      if (instruction === 'explain') return [element('play12-score'), piano];
      return instruction ? [element(instruction)] : [];
    };
    const spotlightHint = (element, instruction, pulse = false) => {
      if (!element.hidden) spotlight.show(element, () => targetsFor(instruction), pulse ? runtime?.pianoView?.mount : null,
        document.getElementById('play12-score'));
    };
    let returnAfterZero = null;
    let zeroHintSequence = 0;
    const hintTimers = new Map();
    const hintKeys = new Map();
    const dismissedHints = new Set();
    const hideHint = element => {
      spotlight.stop(element);
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
      for (const element of [listenCoach, document.getElementById('zero-chooser')]) if (element) hideHint(element);
      spotlight.stop();
    };
    const showCoach = (text, control = null, pulse = false, afterDismiss = null) => {
      if (!text) { hideHint(listenCoach); return; }
      const key = `${state.onboardingStep}:${text}`;
      if (hintKeys.get(listenCoach) === key) return;
      if (dismissedHints.has(key)) { hideHint(listenCoach); return; }
      listenCoach.dataset.copy = text;
      listenPrompt.innerHTML = text;
      showHint(listenCoach, key, afterDismiss);
      spotlightHint(listenCoach, control, pulse);
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
        visibleStep,
        playbackShortcutsEnabled: String(['LISTEN_AND_CONTROL', 'TRY_IT_YOURSELF'].includes(visibleStep) && !returnAfterZero),
        zeroSetupStage: state.zeroSetupStage || '',
        returnAfterZero: returnAfterZero?.destination || '',
        midiConnectState
      });
    };

    const highestUnlocked = () => Math.max(state.highestUnlockedStep || 1,
      state.chooseZeroCompleted || state.onboardingStep === 'TRY_IT_YOURSELF' ? 3 : state.listenFragmentCompleted ? 2 : 1);

    const visibleBoardsForStep = step => ({
      zero: ['CHOOSE_ZERO', 'TRY_IT_YOURSELF'].includes(step),
      practice: step === 'TRY_IT_YOURSELF',
      metronome: step === 'TRY_IT_YOURSELF' && state.metronomeUnlocked === true,
      rounds: step === 'TRY_IT_YOURSELF' && state.roundUnlocked === true
    });
    const syncProgress = () => {
      state.highestUnlockedStep = highestUnlocked();
      const activeStep = state.onboardingStep === 'TRY_IT_YOURSELF' ? 3 : state.onboardingStep === 'CHOOSE_ZERO' ? 2 : 1;
      for (const [number, element] of progressItems) {
        const completed = number < state.highestUnlockedStep && number !== activeStep;
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', number <= state.highestUnlockedStep ? '0' : '-1');
        element.setAttribute('aria-disabled', String(number > state.highestUnlockedStep));
        element.classList.toggle('is-active', number === activeStep);
        element.classList.toggle('is-complete', completed);
        element.dataset.progressState = number === activeStep ? 'active' : completed ? 'completed' : 'locked';
        if (number === activeStep) element.setAttribute('aria-current', 'step');
        else element.removeAttribute('aria-current');
      }
      const boards = visibleBoardsForStep(state.onboardingStep);
      if (onboardingChooseZero) onboardingChooseZero.hidden = !boards.zero;
      if (practiceBoard) practiceBoard.hidden = !boards.practice;
      const metronomeBoard = document.getElementById('metronome-board');
      if (metronomeBoard) metronomeBoard.hidden = !boards.metronome;
      root.classList.toggle('has-metronome-board', boards.metronome);
      const roundBoard = document.getElementById('round-loop-board');
      if (roundBoard) roundBoard.hidden = !boards.rounds;
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
      const transport = document.getElementById('playline');
      const row = document.getElementById('onboarding-control-row');
      if (transport && row) {
        transportHome ||= transport.parentElement;
        row.appendChild(transport);
        const roundBoard = document.getElementById('round-loop-board');
        if (roundBoard) row.appendChild(roundBoard);
      }
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
      const transport = document.getElementById('playline');
      if (transportHome && transport) transportHome.prepend(transport);
      if (stageHome.nextSibling?.parentElement === stageHome.parent) stageHome.parent.insertBefore(stage, stageHome.nextSibling);
      else stageHome.parent.appendChild(stage);
      document.body.classList.remove('play12-onboarding-listen');
      global.dispatchEvent(new Event('resize'));
      requestAnimationFrame(() => runtime?.playback?.layoutCoreGeometry?.());
    };

    const syncListenCopy = () => {
      listenContinue.hidden = true;
      const stage = state.listenGuideStage || (state.pauseLearned ? 'continue' : state.playLearned ? 'pause' : 'initial');
      if (state.listenFragmentCompleted) { showCoach(''); listenContinue.hidden = false; }
      else if (stage === 'initial') showCoach('Listen to how the melody sounds<br>Press Play or P', 'play');
      else if (listenPlaybackState === 'pause-queued') showCoach('');
      else if (stage === 'pause' && (listenPosition >= 4.8 || state.listenGuideStage === 'pause')) showCoach('Try pausing it', 'pause');
      else if (stage === 'continue') showCoach('Continue', 'play');
      else showCoach('');
      exposeState();
    };

    const showStep = step => {
      visibleStep = step;
      clearHints();
      dismissedHints.clear();
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
        }
        else {
          if (listenCoach) listenCoach.hidden = true;
          if (listenContinue) listenContinue.hidden = true;
        }
      }
      syncProgress();
      if (step === 'CHOOSE_ZERO' && state.zeroSetupStage === 'cards') showCardsSetup();
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
        cardsSetupCompleted: false, zeroSetupStage: null
      };
      runtime?.playback?.restart();
      restorePracticeSettings();
      recoveringMidi = false;
      resumeRequested = false;
      reconnectCard.hidden = true;
      returnAfterZero = null;
      global.dispatchEvent(new CustomEvent('play12:choose-zero-close'));
      clearHints();
      dismissedHints.clear();
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
      state.zeroSetupStage = null;
      if (number === 3) {
        if (state.metronomeUnlocked && !state.roundUnlocked && state.practiceGuideStage === 'free') { state.roundUnlocked = true; state.practiceGuideStage = 'round-nav'; }
        state.practiceGuideStage ||= 'enable';
        restorePracticeSettings();
      } else if (runtime) {
        // Listen revisits use normal playback without overwriting saved Practice preferences.
        runtime.playback.setPracticeSettings({ practiceModeEnabled: false });
      }
      syncProgress();
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
      if (returnAfterZero) { finishZero(false); return; }
      clearHints();
      global.dispatchEvent(new CustomEvent('play12:choose-zero-close'));
      if (state.onboardingStep === 'WELCOME') { startNew(); return; }
      if (state.onboardingStep === 'MIDI_CONNECT') {
        if (!state.inputMode) state.inputMode = 'demo';
        navigateStep(1);
      } else if (state.onboardingStep === 'LISTEN_AND_CONTROL') {
        const stage = state.listenGuideStage || (state.pauseLearned ? 'continue' : state.playLearned ? 'pause' : 'initial');
        if (stage === 'initial' || stage === 'pause') {
          state.listenGuideStage = stage === 'initial' ? 'pause' : 'continue';
          saveState(storage, state); syncListenCopy();
        } else {
          state.highestUnlockedStep = Math.max(highestUnlocked(), 2); navigateStep(2);
        }
      } else if (state.onboardingStep === 'CHOOSE_ZERO') {
        if (state.zeroSetupStage === 'cards') finishCardsSetup();
        else finishZero(false);
      } else if (state.onboardingStep === 'TRY_IT_YOURSELF') {
        advancePracticeInstruction();
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

    const showCardsSetup = () => {
      const ru = (document.documentElement.lang || 'en').startsWith('ru');
      showCoach(ru
        ? 'Разложите карточки Play12<br><small>Разместите карточки на пианино так же, как показано здесь</small><a href="/ru/manual.html#chapter2" target="_blank" rel="noopener">Как разместить карточки Play12</a>'
        : 'Set up your Play12 cards<br><small>Place the cards on your piano to match the layout you see here</small><a href="/manual.html#chapter2" target="_blank" rel="noopener">How to place the Play12 cards</a>', 'cards', true, finishCardsSetup);
    };
    const finishCardsSetup = () => {
      state.cardsSetupCompleted = true;
      state.zeroSetupStage = null;
      state.practiceGuideStage = 'enable';
      state.highestUnlockedStep = 3;
      navigateStep(3);
    };
    const finishZero = confirmed => {
      // Capture the entry context before closing the selection UI cancels it.
      const context = returnAfterZero || {destination: 'onboarding'};
      returnAfterZero = null;
      global.dispatchEvent(new CustomEvent('play12:choose-zero-close'));
      clearHints();
      if (confirmed) state.chooseZeroCompleted = true;
      state.highestUnlockedStep = 3;
      if (context.destination === 'practice') {
        state.practiceGuideStage = context.practiceGuideStage || 'free';
        navigateStep(3);
      } else if (state.cardsSetupCompleted) navigateStep(3);
      else {
        state.onboardingStep = 'CHOOSE_ZERO';
        state.zeroSetupStage = 'cards';
        runtime?.playback?.restart();
        saveState(storage, state);
        showStep('CHOOSE_ZERO');
      }
    };
    const handleZeroConfirmed = () => finishZero(true);
    const advancePracticeInstruction = () => {
      clearHints();
      const next = {enable: 'hand', hand: 'explain', explain: 'ready', ready: 'free', 'metronome-on': 'metronome-tempo', 'metronome-tempo': 'metronome-play', 'metronome-play': 'round-nav', 'round-nav': 'round-loop', 'round-loop': 'round-range', 'round-range': 'round-precount', 'round-precount': 'free'};
      state.practiceGuideStage = next[state.practiceGuideStage] || 'free';
      if (state.practiceGuideStage.startsWith('round-')) state.roundUnlocked = true;
      syncProgress();
      saveState(storage, state); syncPracticeGuide();
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
      if (state.onboardingStep !== 'TRY_IT_YOURSELF' || visibleStep !== 'TRY_IT_YOURSELF' || !runtime || returnAfterZero) return;
      const settings = runtime.playback.getPracticeSettings();
      practiceModeButton.setAttribute('aria-pressed', String(settings.practiceModeEnabled));
      leftHandButton.setAttribute('aria-pressed', String(settings.practiceLeftHandEnabled));
      rightHandButton.setAttribute('aria-pressed', String(settings.practiceRightHandEnabled));
      state.practiceGuideStage ||= 'enable';
      if (state.practiceGuideStage === 'metronome-on' && runtime.playback.metronomeInput.checked) {
        state.practiceGuideStage = 'metronome-tempo'; saveState(storage, state);
      }
      const stage = state.practiceGuideStage;
      practiceBoard.dataset.guideStage = stage;
      practiceBoard.hidden = false;
      practiceModeButton.classList.toggle('is-guided', stage === 'enable');
      leftHandButton.classList.toggle('is-guided', stage === 'hand');
      if (stage === 'enable') showCoach('Now try it yourself<br>Turn on Practice Mode', 'practice-board-mode');
      else if (stage === 'hand') showCoach('Let’s start with your right hand<br>Turn off Left Hand', 'practice-left-hand');
      else if (stage === 'explain') showCoach('Watch the Note Field and play the keys it shows you<br><small>The music will wait until you press the right key</small>', 'explain', false, advancePracticeInstruction);
      else if (stage === 'ready') showCoach("Press Play when you're ready", 'play');
      else if (stage === 'metronome-on') showCoach(isRu() ? 'Добавим ровный пульс<br>Включите метроном' : 'Let’s add a steady beat<br>Turn on the metronome', 'metronome-toggle');
      else if (stage === 'metronome-tempo') showCoach(isRu() ? 'Можно играть медленнее или быстрее<br><small>Введите BPM или меняйте темп кнопками − / + с шагом 10</small>' : 'Slow down or speed up the piece<br><small>Type a BPM, or use − / + to change it by 10</small>', 'metronome-tempo-controls', false, advancePracticeInstruction);
      else if (stage === 'metronome-play') showCoach(isRu() ? 'Сыграйте ещё раз под ровный пульс<br>Нажмите Play' : 'Play it again with a steady beat<br>Press Play', 'play');
      else if (stage === 'round-nav') showCoach(isRu() ? 'Перемещайтесь по произведению раундами' : 'Move through the piece by rounds', 'round-navigation', false, advancePracticeInstruction);
      else if (stage === 'round-loop') showCoach(isRu() ? 'Повторяйте участок, который хотите потренировать' : 'Loop a section you want to practise', 'round-loop-toggle', false, advancePracticeInstruction);
      else if (stage === 'round-range') showCoach(isRu() ? 'Выберите раунды, которые хотите повторять' : 'Choose the rounds you want to repeat', 'round-range', false, advancePracticeInstruction);
      else if (stage === 'round-precount') showCoach(isRu() ? 'Нужен момент перед попыткой?<br>Включите Pre-count' : 'Need a moment before each try?<br>Turn on Pre-count', 'round-precount-toggle', false, advancePracticeInstruction);
      else showCoach('');
    };
    const isRu = () => document.documentElement.lang === 'ru';
    global.addEventListener('play12:metronome-change', event => {
      if (state.onboardingStep === 'TRY_IT_YOURSELF' && state.practiceGuideStage === 'metronome-on' && event.detail.enabled) advancePracticeInstruction();
    });
    global.addEventListener('play12:tempo-change', () => {
      if (state.onboardingStep === 'TRY_IT_YOURSELF' && state.practiceGuideStage === 'metronome-tempo') advancePracticeInstruction();
    });

    global.addEventListener('play12:round-control', event => {
      if (state.onboardingStep !== 'TRY_IT_YOURSELF' || returnAfterZero) return;
      const required = {'round-nav':'navigate', 'round-loop':'loop-on', 'round-range':'range', 'round-precount':'precount'};
      if (required[state.practiceGuideStage] === event.detail.action) advancePracticeInstruction();
    });

    const changePracticeSetting = (key, button) => {
      if (!runtime) return;
      const current = runtime.playback.getPracticeSettings();
      if (!runtime.playback.setPracticeSettings({ [key]: !current[key] })) {
        button.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 220 });
        return;
      }
      Object.assign(state, runtime.playback.getPracticeSettings());
      if ((state.practiceGuideStage === 'enable' && state.practiceModeEnabled) ||
          (state.practiceGuideStage === 'hand' && !state.practiceLeftHandEnabled)) {
        advancePracticeInstruction();
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
          if (returnAfterZero) return;
          if ((['enable', 'hand', 'explain', 'ready'].includes(state.practiceGuideStage) || (state.practiceGuideStage === 'free' && !state.metronomeUnlocked)) && (snapshot.running || snapshot.state === 'waiting_for_input')) {
            clearHints();
            state.practiceGuideStage = 'playing';
            saveState(storage, state);
          }
          if (state.practiceGuideStage === 'playing' && snapshot.ended && runtime.playback.practiceEnabled()) {
            state.practiceGuideStage = state.metronomeUnlocked ? (state.roundUnlocked ? 'free' : 'round-nav') : 'metronome-on';
            if (state.practiceGuideStage === 'round-nav') state.roundUnlocked = true;
            state.metronomeUnlocked = true;
            syncProgress();
            saveState(storage, state);
          }
          if (state.practiceGuideStage === 'metronome-play' && (snapshot.running || snapshot.state === 'waiting_for_input')) {
            clearHints(); state.practiceGuideStage = 'metronome-playing'; saveState(storage, state);
          }
          if (state.practiceGuideStage === 'metronome-playing' && snapshot.ended) {
            state.practiceGuideStage = 'round-nav'; state.roundUnlocked = true;
            syncProgress(); saveState(storage, state);
          }
          syncPracticeGuide();
          return;
        }
        if (state.onboardingStep !== 'LISTEN_AND_CONTROL' || visibleStep !== 'LISTEN_AND_CONTROL') return;
        listenPosition = snapshot.position;
        listenPlaybackState = snapshot.state;
        if (snapshot.running && state.listenGuideStage === 'initial') state.listenGuideStage = null;
        if (snapshot.running && state.listenGuideStage === 'continue') state.listenGuideStage = 'listening';
        if (snapshot.running && !state.playLearned) {
          state = { ...state, playLearned: true };
          saveState(storage, state);
        }
        if (state.playLearned && !state.pauseLearned && snapshot.state === 'paused' && snapshot.position > 0 && !snapshot.ended) {
          state = { ...state, pauseLearned: true, listenGuideStage: 'continue' };
          saveState(storage, state);
        }
        if (state.playLearned && snapshot.ended && !state.listenFragmentCompleted) {
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
        if (state.onboardingStep === 'CHOOSE_ZERO' && state.zeroSetupStage !== 'cards') global.dispatchEvent(new CustomEvent('play12:choose-zero-open'));
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
    global.addEventListener('play12:zero-ui-open', () => {
      returnAfterZero ||= {destination: state.onboardingStep === 'TRY_IT_YOURSELF' ? 'practice' : 'onboarding',
        practiceGuideStage: state.practiceGuideStage};
      clearHints();
      exposeState();
      const chooser = document.getElementById('zero-chooser');
      if (chooser) { showHint(chooser, `zero-selection:${++zeroHintSequence}`); spotlightHint(chooser, 'choose-zero'); }
    });
    global.addEventListener('play12:zero-ui-candidate', () => {
      const chooser = document.getElementById('zero-chooser');
      if (chooser) {
        hideHint(chooser);
        showHint(chooser, `zero-confirmation:${++zeroHintSequence}`);
      }
    });
    global.addEventListener('play12:choose-zero-close', () => {
      returnAfterZero = null;
      exposeState();
      const chooser = document.getElementById('zero-chooser');
      if (chooser) hideHint(chooser);
    });
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
        cardsSetupCompleted: false, zeroSetupStage: null
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
