(function (global) {
  'use strict';
  const i18n = global.Play12I18n || { isRu:()=>false, t:key=>key, keysText:count=>`We detected ${count} keys.` };
  const t = (key, params) => i18n.t(key, params);
  const localizedHtml = (...parts) => parts.map(part => t(part)).join('');

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
  const INFO_CARD_DURATION_MS = 6000;

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
        highestUnlockedStep: Math.max(1, Math.min(6, Number(value.highestUnlockedStep) || 1)),
        midiVerified: value.midiVerified === true,
        inputMode: value.inputMode === 'midi' || value.inputMode === 'demo' ? value.inputMode : null,
        midiUsbGuideSeen: value.midiUsbGuideSeen === true,
        playLearned: value.playLearned === true,
        pauseLearned: value.pauseLearned === true,
        listenFragmentCompleted: value.listenFragmentCompleted === true,
        chooseZeroCompleted: value.chooseZeroCompleted === true,
        cardsSetupCompleted: value.cardsSetupCompleted === true || value.zeroChangeHintShown === true ||
          (value.cardsSetupCompleted === undefined && value.onboardingStep === 'TRY_IT_YOURSELF' && value.practiceGuideStage !== 'cards'),
        zeroSetupStage: ['cards', 'verify-yellow', 'verify-green'].includes(value.zeroSetupStage) ? value.zeroSetupStage
          : value.practiceGuideStage === 'cards' ? 'cards' : null,
        metronomeUnlocked: value.metronomeUnlocked === true,
        roundUnlocked: value.roundUnlocked === true,
        practiceModeEnabled: value.practiceModeEnabled === true,
        practiceLeftHandEnabled: value.practiceLeftHandEnabled !== false,
        practiceRightHandEnabled: value.practiceRightHandEnabled !== false,
        oneSkillMode: false, activeSkillId: null,
        listenGuideStage: ['initial', 'pause', 'continue', 'listening'].includes(value.listenGuideStage) ? value.listenGuideStage : null,
        practiceGuideStage: ['enable', 'hand', 'explain', 'ready', 'playing', 'metronome-on', 'metronome-tempo', 'metronome-play', 'metronome-playing', 'round-info', 'round-go4', 'round-loop-info', 'round-loop', 'round-range', 'round-precount-info', 'round-precount', 'round-practice', 'round-nav', 'final-instruction', 'final-practice', 'completed', 'free'].includes(value.practiceGuideStage) ? value.practiceGuideStage : value.practiceGuideStage === 'complete' ? 'free' : 'enable'
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
    const cardsReady = root.querySelector('#cards-ready');
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
    const skipButton = root.querySelector('#onboarding-skip');
    const reconnectMessage = root.querySelector('#returning-midi-message');
    const reconnectButton = root.querySelector('#returning-midi-retry');
    const completionCard = root.querySelector('#onboarding-completion');
    const completionTitle = root.querySelector('#onboarding-completion-title');
    const completionMessage = root.querySelector('#onboarding-completion-message');
    const confettiLayer = root.querySelector('#onboarding-confetti');
    const ok12Toast = root.querySelector('#round-ok12');
    let recoveringMidi = false;
    let resumeRequested = false;
    let completionCardTimer = null;
    let celebrationFired = false;
    let finalAttempt = { active: false, valid: false, successfulRounds: new Set() };
    let roundTraining = { active: false, started: false, valid: false, passes: 0, successfulRounds: new Set(), feedbackPending: false };
    let ok12Timer = null;
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
    if (state.practiceGuideStage === 'round-nav') state.practiceGuideStage = 'round-info';
    let runtime = null;
    let pianoHome = null;
    let stageHome = null;
    let transportHome = null;
    let removeNoteListener = null;
    let removeMidiStatusListener = null;
    let removeMidiInputInterceptor = null;
    let removeCalibrationListener = null;
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
      if (instruction === 'cards') return [piano?.querySelector('.piano-visible-card-region')];
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
      hintTimers.set(element, global.setTimeout(() => { hideHint(element); afterDismiss?.(); }, INFO_CARD_DURATION_MS));
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
    const keepCoachUntilAction = () => {
      clearTimeout(hintTimers.get(listenCoach));
      hintTimers.delete(listenCoach);
      listenCoach.classList.remove('has-dismiss-timer');
    };
    const showActionCoach = (text, control = null, pulse = false) => {
      showCoach(text, control, pulse);
      keepCoachUntilAction();
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

    const syncOverlayGeometry = () => {
      const field = document.getElementById('play12-score');
      const rect = field?.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const viewportHeight = Number(global.innerHeight) || document.documentElement.clientHeight || 800;
      const scoreSvg = field.querySelector?.('svg.play12-score');
      const scoreRect = scoreSvg?.getBoundingClientRect?.();
      const markerRailWidth = Number(scoreSvg?.dataset.roundMarkerGap || 0) + Number(scoreSvg?.dataset.roundMarkerDiameter || 0);
      const noteFieldWidth = Number(scoreSvg?.dataset.noteFieldWidth || 0);
      const x = scoreRect && noteFieldWidth > 0 ? scoreRect.left + markerRailWidth + noteFieldWidth / 2 : rect.left + rect.width / 2;
      const y = Math.max(130, Math.min(viewportHeight - 130, rect.top + rect.height * .36));
      root.style.setProperty('--mvp-note-field-center-x', `${x}px`);
      root.style.setProperty('--mvp-note-field-upper-center-y', `${y}px`);
      root.style.setProperty('--mvp-note-field-top-y', `${rect.top}px`);
    };

    const reconnectCopy = () => ({
      message: localizedHtml('MIDI keyboard connection lost.','<br>','Reconnect your instrument or continue playing with your mouse.'),
      button: t('Reconnect MIDI')
    });

    const setReconnectVisible = (visible, status = 'no-input') => {
      if (!reconnectCard) return;
      reconnectCard.hidden = !visible;
      reconnectCard.dataset.midiStatus = status;
      if (visible) {
        spotlight.stop(listenCoach);
        clearTimeout(hintTimers.get(listenCoach));
        hintTimers.delete(listenCoach);
        hintKeys.delete(listenCoach);
        listenCoach.hidden = true;
        listenCoach.classList.remove('has-dismiss-timer', 'is-entering', 'is-visible');
        const copy = reconnectCopy();
        reconnectMessage.innerHTML = copy.message;
        reconnectButton.textContent = copy.button;
        requestAnimationFrame(syncOverlayGeometry);
      } else if (state.onboardingStep === 'TRY_IT_YOURSELF') {
        syncPracticeGuide();
      }
    };

    const playCompletionChime = () => {
      try {
        const audioContext = runtime?.playback?.audioContext;
        if (!audioContext || audioContext.state === 'closed') return;
        const now = audioContext.currentTime;
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(.0001, now);
        gain.gain.exponentialRampToValueAtTime(.055, now + .02);
        gain.gain.exponentialRampToValueAtTime(.0001, now + .9);
        gain.connect(audioContext.destination);
        for (const [frequency, offset, duration] of [[523.25, 0, .48], [659.25, .12, .55], [783.99, .26, .62]]) {
          const oscillator = audioContext.createOscillator();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency, now + offset);
          oscillator.connect(gain);
          oscillator.start(now + offset);
          oscillator.stop(now + offset + duration);
        }
      } catch (_) { /* Completion must never be blocked by audio policy. */ }
    };

    const playConfetti = () => {
      if (!confettiLayer || global.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      confettiLayer.replaceChildren?.();
      const colors = ['#E96E40', '#F2B84B', '#6FAE8A', '#6D8BC3', '#D77AA8'];
      for (let index = 0; index < 36; index += 1) {
        const particle = document.createElement('i');
        particle.className = 'mvp-confetti-piece';
        particle.style.left = `${12 + Math.random() * 76}%`;
        particle.style.background = colors[index % colors.length];
        particle.style.setProperty('--delay', `${Math.random() * .3}s`);
        particle.style.setProperty('--duration', `${1.8 + Math.random() * .6}s`);
        particle.style.setProperty('--drift', `${-70 + Math.random() * 140}px`);
        particle.style.setProperty('--spin', `${240 + Math.random() * 360}deg`);
        confettiLayer.appendChild(particle);
        global.setTimeout(() => particle.remove?.(), 2800);
      }
    };

    const showCompletionCelebration = () => {
      if (celebrationFired) return;
      celebrationFired = true;
      syncOverlayGeometry();
      completionTitle.textContent = t('Congratulations!');
      completionMessage.innerHTML = localizedHtml("You've completed the Play12 tutorial.",'<br><br>','Now you can practise your skills and learn your favourite melodies on your own.');
      completionCard.hidden = false;
      clearTimeout(completionCardTimer);
      completionCardTimer = global.setTimeout(() => { completionCard.hidden = true; }, 6500);
      playConfetti();
      playCompletionChime();
    };
    let fixedPianoResizeHandler = null;

    const syncFixedPiano = () => {
      const mount = runtime?.pianoView?.mount;
      if (!mount?.classList.contains('is-fixed-piano-view')) return;
      runtime.pianoView.syncContainer?.();
      requestAnimationFrame(() => {
        const fieldRect = playbackHost?.getBoundingClientRect();
        mount.style.left = fieldRect?.width > 0 ? `${fieldRect.left + fieldRect.width / 2}px` : '50%';
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
          syncOverlayGeometry();
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

    const guideStageNumber = () => {
      const guide = state.practiceGuideStage || 'enable';
      if (guide === 'completed' || state.onboardingCompleted) return 6;
      if (guide === 'final-instruction' || guide === 'final-practice') return 6;
      if (guide.startsWith('round-')) return 5;
      if (guide.startsWith('metronome-')) return 4;
      return 3;
    };
    const activeProgressStep = () => state.onboardingStep === 'ONBOARDING_COMPLETE' ? 6
      : state.onboardingStep === 'TRY_IT_YOURSELF' ? guideStageNumber()
      : state.onboardingStep === 'CHOOSE_ZERO' ? 2 : 1;
    const highestUnlocked = () => Math.max(state.onboardingCompleted ? 6 : state.highestUnlockedStep || 1,
      state.onboardingStep === 'TRY_IT_YOURSELF' ? guideStageNumber()
        : state.chooseZeroCompleted ? 3 : state.listenFragmentCompleted ? 2 : 1);

    const visibleBoardsForStep = step => ({
      zero: ['CHOOSE_ZERO', 'TRY_IT_YOURSELF'].includes(step),
      practice: ['TRY_IT_YOURSELF', 'ONBOARDING_COMPLETE'].includes(step),
      metronome: ['TRY_IT_YOURSELF', 'ONBOARDING_COMPLETE'].includes(step) && state.metronomeUnlocked === true,
      rounds: ['TRY_IT_YOURSELF', 'ONBOARDING_COMPLETE'].includes(step) && state.roundUnlocked === true
    });
    const syncProgress = () => {
      state.highestUnlockedStep = highestUnlocked();
      const activeStep = activeProgressStep();
      for (const [number, element] of progressItems) {
        const completed = state.onboardingCompleted ? number <= 6 : number < state.highestUnlockedStep && number !== activeStep;
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', number <= state.highestUnlockedStep ? '0' : '-1');
        element.setAttribute('aria-disabled', String(number > state.highestUnlockedStep));
        element.classList.toggle('is-active', number === activeStep && !state.onboardingCompleted);
        element.classList.toggle('is-complete', completed);
        element.dataset.progressState = number === activeStep && !state.onboardingCompleted ? 'active' : completed ? 'completed' : 'locked';
        if (number === activeStep && !state.onboardingCompleted) element.setAttribute('aria-current', 'step');
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
      if (songStep) songStep.textContent = t('Step {current} of 6', { current: activeStep });
      if (skipButton) skipButton.hidden = !['LISTEN_AND_CONTROL', 'CHOOSE_ZERO', 'TRY_IT_YOURSELF'].includes(visibleStep);
    };

    const showMidiState = value => {
      midiConnectState = value;
      for (const [name, element] of midiStates) element.hidden = name !== value;
      const mount = runtime?.pianoView?.mount;
      if (mount) mount.classList.toggle('is-calibration-hidden', !['calibrate-unusual', 'calibrate-confirm', 'calibration-complete'].includes(value) && state.inputMode !== 'demo');
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
      else if (stage === 'initial') showActionCoach(`${t('Listen to how the melody sounds')}<br>${t('Press Play or P')}`, 'play');
      else if (listenPlaybackState === 'pause-queued') showCoach('');
      else if (stage === 'pause' && (listenPosition >= 4.8 || state.listenGuideStage === 'pause')) showActionCoach(t('Try pausing it'), 'pause');
      else if (stage === 'continue') showActionCoach(t('Continue'), 'play');
      else showCoach('');
      exposeState();
    };

    const showStep = step => {
      visibleStep = step;
      clearHints();
      cardsReady.hidden = true;
      dismissedHints.clear();
      const visibleView = ['CHOOSE_ZERO', 'TRY_IT_YOURSELF', 'ONBOARDING_COMPLETE'].includes(step) ? 'LISTEN_AND_CONTROL' : step;
      for (const [name, element] of views) element.hidden = name !== visibleView;
      document.body.classList.toggle('play12-onboarding-choose-zero', step === 'CHOOSE_ZERO');
      document.body.classList.toggle('play12-onboarding-practice', ['TRY_IT_YOURSELF', 'ONBOARDING_COMPLETE'].includes(step));
      if (step === 'MIDI_CONNECT') {
        restoreStage();
        root.hidden = false;
        document.body.classList.add('play12-onboarding-active');
        document.body.classList.remove('play12-onboarding-dismissed');
        showMidiState('choice');
        movePianoToOnboarding();
      } else if (step === 'LISTEN_AND_CONTROL' || step === 'CHOOSE_ZERO' || step === 'TRY_IT_YOURSELF' || step === 'ONBOARDING_COMPLETE') {
        root.hidden = false;
        document.body.classList.add('play12-onboarding-active');
        document.body.classList.remove('play12-onboarding-dismissed');
        moveStageToOnboarding();
        if (state.inputMode === 'demo' || runtime?.midiDiagnostic?.getCalibration?.()?.verified) runtime?.pianoView?.mount?.classList.remove('is-calibration-hidden');
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
      if (step === 'CHOOSE_ZERO' && state.zeroSetupStage?.startsWith('verify-')) showCardVerificationPrompt();
      if (step === 'TRY_IT_YOURSELF') syncPracticeGuide();
      if (step === 'ONBOARDING_COMPLETE') {
        hideHint(listenCoach);
        completionCard.hidden = true;
        requestAnimationFrame(syncOverlayGeometry);
      }
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
      runtime?.resetLearningSetup?.();
      clearTimeout(ok12Timer); ok12Timer = null;
      if (ok12Toast) ok12Toast.hidden = true;
      runtime?.playback?.roundBoard?.setTraining?.(false, 0);
      roundTraining = { active: false, started: false, valid: false, passes: 0, successfulRounds: new Set(), feedbackPending: false };
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
      syncProgress();
      runtime?.playback?.restart();
      restorePracticeSettings();
      recoveringMidi = false;
      resumeRequested = false;
      setReconnectVisible(false);
      completionCard.hidden = true;
      celebrationFired = false;
      finalAttempt = { active: false, valid: false, successfulRounds: new Set() };
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
      setReconnectVisible(true, 'requesting');
      if (runtime.midiDiagnostic && runtime.midiDiagnostic.currentStatus?.status !== 'unavailable') runtime.midiDiagnostic.enable({ reacquire: true });
      else setReconnectVisible(true, 'unavailable');
    };

    const navigateStep = number => {
      if (number > highestUnlocked() || number < 1 || number > 6) return;
      state.highestUnlockedStep = highestUnlocked();
      runtime?.playback?.pauseImmediate();
      clearRoundTraining();
      if (number !== 2) global.dispatchEvent(new CustomEvent('play12:choose-zero-close'));
      state.onboardingStep = number === 1 ? 'LISTEN_AND_CONTROL' : number === 2 ? 'CHOOSE_ZERO' : 'TRY_IT_YOURSELF';
      state.zeroSetupStage = null;
      if (number >= 3) {
        state.practiceGuideStage = ({3:'enable', 4:'metronome-on', 5:'round-info', 6:'final-instruction'})[number];
        if (number >= 4) state.metronomeUnlocked = true;
        if (number >= 5) state.roundUnlocked = true;
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

    root.querySelector('#onboarding-skip').addEventListener('click', () => {
      clearHints();
      runtime?.playback?.pauseImmediate?.();
      if (returnAfterZero) { finishZero(false); return; }
      global.dispatchEvent(new CustomEvent('play12:choose-zero-close'));
      if (state.onboardingStep === 'WELCOME') { state.onboardingStarted = true; state.onboardingStep = 'MIDI_CONNECT'; saveState(storage, state); showStep('MIDI_CONNECT'); return; }
      if (state.onboardingStep === 'MIDI_CONNECT') {
        if (!state.inputMode || !runtime?.midiDiagnostic?.getCalibration?.()?.verified) {
          state.inputMode = 'demo'; runtime?.pianoView?.setRange?.(21,108);
        }
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
        if (state.zeroSetupStage === 'cards' || state.zeroSetupStage?.startsWith('verify-')) finishCardsSetup();
        else finishZero(false);
      } else if (state.onboardingStep === 'TRY_IT_YOURSELF') {
        advancePracticeInstruction(true);
      }
    });

    const continueSession = () => {
      const restored = readSavedState(storage);
      if (restored) state = restored;
      else state = { ...state, lastSessionExists: true };
      resumeRequested = true;
      if (runtime?.playback?.metronomeButton) runtime.playback.setMetronome(false, false);
      else if (runtime?.playback?.metronomeInput) runtime.playback.metronomeInput.checked = false;
      if (state.onboardingCompleted) { state.onboardingStep = 'ONBOARDING_COMPLETE'; showStep('ONBOARDING_COMPLETE'); }
      else if (highestUnlocked() > activeProgressStep()) navigateStep(highestUnlocked());
      else if (['LISTEN_AND_CONTROL', 'CHOOSE_ZERO', 'TRY_IT_YOURSELF'].includes(state.onboardingStep)) {
        if (state.onboardingStep === 'TRY_IT_YOURSELF') restorePracticeSettings();
        showStep(state.onboardingStep);
        if (state.onboardingStep === 'CHOOSE_ZERO' && state.zeroSetupStage !== 'cards') global.dispatchEvent(new CustomEvent('play12:choose-zero-open'));
      }
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
      runtime?.pianoView?.setRange?.(21, 108);
      runtime?.pianoView?.mount?.classList.remove('is-calibration-hidden');
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

    const beginMidiCalibration = () => {
      if (!state.midiVerified || !runtime?.midiDiagnostic) return;
      runtime.midiDiagnostic.beginCalibration();
    };

    const syncCalibrationRange = range => {
      if (!range) return;
      const count = root.querySelector('#onboarding-midi-key-count');
      const unusual = root.querySelector('#onboarding-midi-unusual-count');
      const copy = i18n.keysText(range.keyCount);
      if (count) count.textContent = copy;
      if (unusual) unusual.textContent = copy;
      runtime?.pianoView?.setRange?.(range.leftMidi, range.rightMidi);
      runtime?.pianoView?.mount?.classList.remove('is-calibration-hidden');
      runtime?.pianoView?.syncContainer?.();
    };

    const advanceToChooseZero = () => {
      if (!state.listenFragmentCompleted) return;
      state = { ...state, onboardingStep: 'CHOOSE_ZERO' };
      saveState(storage, state);
      showStep('CHOOSE_ZERO');
    };

    const showCardsSetup = () => {
      const manual = isRu() ? '/ru/manual.html#chapter2' : '/manual.html#chapter2';
      showCoach(`${t('Set up your Play12 cards')}<br><small>${t('Place the cards on your piano to match the layout you see here')}</small><a href="${manual}" target="_blank" rel="noopener">${t('How to place the Play12 cards')}</a>`, 'cards', true);
      keepCoachUntilAction();
      cardsReady.textContent = t('Ready');
      cardsReady.hidden = false;
    };
    const visibleCardMidi = (symbol, colorIndex) => {
      const piano = runtime?.pianoView;
      return piano?.midiForCard?.(symbol, colorIndex) ?? null;
    };
    const expectedCardMidi = () => state.zeroSetupStage === 'verify-yellow'
      ? visibleCardMidi('1', 2) : state.zeroSetupStage === 'verify-green' ? visibleCardMidi('2', 3) : null;
    const showCardVerificationPrompt = (retry = false) => {
      const yellow = state.zeroSetupStage === 'verify-yellow';
      const target = expectedCardMidi();
      const retryCopy = retry ? `${t('Check that the cards are placed correctly and try again.')}<br>` : '';
      showCoach(target == null
        ? t(yellow ? 'The yellow 1 card is not visible on this keyboard range.' : 'The green 2 card is not visible on this keyboard range.')
        : `${retryCopy}${t(yellow ? 'Press the key under the <strong>yellow 1</strong> card' : 'Press the key under the <strong>green 2</strong> card')}`, 'cards', true);
      keepCoachUntilAction();
    };
    const startCardVerification = () => {
      cardsReady.hidden = true;
      state.zeroSetupStage = 'verify-yellow';
      saveState(storage, state);
      showCardVerificationPrompt();
    };
    cardsReady.addEventListener('click', startCardVerification);
    const acceptCardVerificationInput = event => {
      if (!state.zeroSetupStage?.startsWith('verify-')) return false;
      if (event.type !== 'note-on') return true;
      if (event.midiNote !== expectedCardMidi()) { showCardVerificationPrompt(true); return true; }
      if (state.zeroSetupStage === 'verify-yellow') {
        state.zeroSetupStage = 'verify-green'; saveState(storage, state); showCardVerificationPrompt();
      } else {
        showCoach(t('Cards are ready ✓'));
        global.setTimeout(finishCardsSetup, 650);
      }
      return true;
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
        state.onboardingStep = 'TRY_IT_YOURSELF';
        restorePracticeSettings();
        saveState(storage, state);
        showStep('TRY_IT_YOURSELF');
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

    const finalPracticeSettingsReady = () => {
      const settings = runtime?.playback?.getPracticeSettings?.();
      return settings?.practiceModeEnabled === true && settings.practiceLeftHandEnabled === false &&
        settings.practiceRightHandEnabled === true && runtime?.playback?.loopInput?.checked !== true;
    };

    const playRoundFeedback = (kind, progressRatio = 0, fullSong = false) => {
      try {
        const audioContext = runtime?.playback?.audioContext;
        if (!audioContext || audioContext.state === 'closed') return;
        const now = audioContext.currentTime;
        const ratio = Math.max(0, Math.min(1, Number(progressRatio) || 0));
        const notes = kind === 'ok12'
          ? [[523.25, 0], [659.25, .09], [783.99, .18]]
          : [[523.25, 0], [659.25, .085], ...(ratio >= 2/3 ? [[783.99, .17]] : [])];
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(.0001, now);
        gain.gain.exponentialRampToValueAtTime(kind === 'ok12' ? .026 : .014 + ratio * .004, now + .018);
        gain.gain.exponentialRampToValueAtTime(.0001, now + (kind === 'ok12' ? .38 : .32));
        gain.connect(audioContext.destination);
        for (const [frequency, offset] of notes) {
          const oscillator = audioContext.createOscillator();
          oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, now + offset);
          oscillator.connect(gain); oscillator.start(now + offset); oscillator.stop(now + offset + .14);
        }
        if (fullSong && ratio >= 2/3 && audioContext.createBuffer && audioContext.createBufferSource) {
          const duration = .24, frames = Math.max(1, Math.floor(audioContext.sampleRate * duration));
          const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate), data = buffer.getChannelData(0);
          for (let index = 0; index < frames; index++) {
            const burst = (index % Math.max(1, Math.floor(audioContext.sampleRate * .027))) < audioContext.sampleRate * .005;
            data[index] = burst ? (Math.random() * 2 - 1) * Math.exp(-index / frames * 2.8) : 0;
          }
          const source = audioContext.createBufferSource(), applauseGain = audioContext.createGain();
          source.buffer = buffer; applauseGain.gain.setValueAtTime(.0001, now);
          applauseGain.gain.exponentialRampToValueAtTime(.002 + Math.min(1, (ratio - 2/3) * 3) * .006, now + .025);
          applauseGain.gain.exponentialRampToValueAtTime(.0001, now + duration);
          source.connect(applauseGain); applauseGain.connect(audioContext.destination); source.start(now); source.stop(now + duration);
        }
      } catch (_) { /* Tutorial feedback must not block progression. */ }
    };
    const clearRoundTraining = () => {
      clearTimeout(ok12Timer); ok12Timer = null;
      if (ok12Toast) ok12Toast.hidden = true;
      roundTraining = { active: false, started: false, valid: false, passes: 0, successfulRounds: new Set(), feedbackPending: false };
      runtime?.playback?.roundBoard?.setTraining?.(false, 0);
      runtime?.playback?.setPracticeTimingStrict?.(true);
    };
    const invalidateRoundTraining = () => {
      if (state.practiceGuideStage !== 'round-practice' || !roundTraining.active) return;
      roundTraining.started = false; roundTraining.valid = false; roundTraining.successfulRounds.clear();
      runtime?.playback?.roundBoard?.clearTrainingSuccess?.();
    };
    const showOk12 = after => {
      if (roundTraining.feedbackPending) return;
      roundTraining.feedbackPending = true;
      clearHints();
      if (ok12Toast) ok12Toast.hidden = false;
      playRoundFeedback('ok12');
      clearTimeout(ok12Timer);
      ok12Timer = global.setTimeout(() => {
        if (ok12Toast) ok12Toast.hidden = true;
        roundTraining.feedbackPending = false;
        after?.();
      }, 950);
    };
    const setRoundGuideStage = next => {
      state.practiceGuideStage = next;
      state.metronomeUnlocked = true; state.roundUnlocked = true;
      state.highestUnlockedStep = Math.max(state.highestUnlockedStep || 1, 5);
      syncProgress(); saveState(storage, state); syncPracticeGuide();
    };
    const completeRoundControlTask = next => showOk12(() => setRoundGuideStage(next));
    const prepareRoundPractice = () => {
      clearRoundTraining();
      roundTraining = { active: true, started: false, valid: false, passes: 0, successfulRounds: new Set(), feedbackPending: false };
      state.practiceModeEnabled = true; state.practiceLeftHandEnabled = false; state.practiceRightHandEnabled = true;
      runtime.playback.setPracticeSettings({practiceModeEnabled:true,practiceLeftHandEnabled:false,practiceRightHandEnabled:true});
      runtime.playback.setPracticeTimingStrict?.(false);
      runtime.playback.loopInput.checked = true;
      runtime.playback.loopStartInput.value = '1'; runtime.playback.loopEndInput.value = '3';
      runtime.playback.pauseImmediate(runtime.playback.rounds?.[1]?.start ?? 0);
      runtime.playback.roundBoard?.setTraining?.(true, 0, {rounds:[2,3,4],totalPasses:null});
      setRoundGuideStage('round-practice');
    };

    const beginFinalPractice = () => {
      if (!runtime || state.onboardingCompleted) return;
      clearRoundTraining();
      clearHints();
      state.practiceGuideStage = 'final-practice';
      state.practiceModeEnabled = true;
      state.practiceLeftHandEnabled = false;
      state.practiceRightHandEnabled = true;
      finalAttempt = { active: false, valid: false, successfulRounds: new Set() };
      runtime.playback.loopInput.checked = false;
      runtime.playback.loopInput.dispatchEvent?.(new Event('change'));
      runtime.playback.setPracticeSettings({
        practiceModeEnabled: true,
        practiceLeftHandEnabled: false,
        practiceRightHandEnabled: true
      });
      runtime.playback.setPracticeTimingStrict?.(false);
      runtime.playback.pauseImmediate(0);
      runtime.playback.roundBoard?.setTraining?.(true, 0, {label:t('Whole song'),rounds:runtime.playback.rounds.map((_,index)=>index+1),totalPasses:null});
      syncProgress();
      saveState(storage, state);
      syncPracticeGuide();
    };

    const completeTutorial = () => {
      if (state.onboardingCompleted) return;
      state.onboardingStarted = true;
      state.onboardingStep = 'ONBOARDING_COMPLETE';
      state.onboardingCompleted = true;
      state.practiceGuideStage = 'completed';
      state.highestUnlockedStep = 6;
      finalAttempt = { active: false, valid: false, successfulRounds: new Set() };
      runtime?.playback?.roundBoard?.setTraining?.(false, 0);
      runtime?.playback?.setPracticeTimingStrict?.(true);
      saveState(storage, state);
      showStep('ONBOARDING_COMPLETE');
      showCompletionCelebration();
    };

    const advancePracticeInstruction = (skipped = false) => {
      if (state.practiceGuideStage === 'final-instruction') { beginFinalPractice(); return; }
      clearHints();
      const next = {enable: 'hand', hand: 'explain', explain: 'ready', ready: 'playing', playing: 'metronome-on', 'metronome-playing': 'round-info', 'metronome-on': 'metronome-tempo', 'metronome-tempo': 'metronome-play', 'metronome-play': 'round-info', 'round-info':'round-go4', 'round-go4':'round-loop-info', 'round-loop-info':'round-loop', 'round-loop':'round-range', 'round-range':'round-precount-info', 'round-precount-info':'round-precount', 'round-precount':'round-practice'};
      const freeNext = state.metronomeUnlocked ? (state.roundUnlocked ? 'free' : 'round-info') : 'metronome-on';
      state.practiceGuideStage = skipped && state.practiceGuideStage === 'round-practice' ? 'final-instruction'
        : next[state.practiceGuideStage] || (skipped && state.practiceGuideStage === 'free' ? freeNext : 'free');
      if (state.practiceGuideStage.startsWith('metronome-') || state.practiceGuideStage.startsWith('round-')) state.metronomeUnlocked = true;
      if (state.practiceGuideStage.startsWith('round-')) state.roundUnlocked = true;
      state.highestUnlockedStep = Math.max(state.highestUnlockedStep || 1, guideStageNumber());
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
      if (state.practiceGuideStage === 'round-practice' && !roundTraining.active) { prepareRoundPractice(); return; }
      if (state.practiceGuideStage === 'final-practice' && !runtime.playback.roundBoard?.root?.classList.contains('is-training')) runtime.playback.roundBoard?.setTraining?.(true, 0, {label:t('Whole song'),rounds:runtime.playback.rounds.map((_,index)=>index+1),totalPasses:null});
      const settings = runtime.playback.getPracticeSettings();
      practiceModeButton.setAttribute('aria-pressed', String(settings.practiceModeEnabled));
      leftHandButton.setAttribute('aria-pressed', String(settings.practiceLeftHandEnabled));
      rightHandButton.setAttribute('aria-pressed', String(settings.practiceRightHandEnabled));
      state.practiceGuideStage ||= 'enable';
      if (state.practiceGuideStage === 'metronome-on' && runtime.playback.metronomeInput.checked) {
        state.practiceGuideStage = 'metronome-tempo'; saveState(storage, state);
      }
      const stage = state.practiceGuideStage;
      const controls = runtime.playback.roundBoard?.controlState?.();
      if (!roundTraining.feedbackPending && stage === 'round-loop' && controls?.loop === true) { completeRoundControlTask('round-range'); return; }
      if (!roundTraining.feedbackPending && stage === 'round-range' && controls?.loop === true && controls.from === 2 && controls.to === 4) { completeRoundControlTask('round-precount-info'); return; }
      if (!roundTraining.feedbackPending && stage === 'round-precount' && controls?.precount === true) { showOk12(prepareRoundPractice); return; }
      practiceBoard.dataset.guideStage = stage;
      practiceBoard.hidden = false;
      practiceModeButton.classList.toggle('is-guided', stage === 'enable');
      leftHandButton.classList.toggle('is-guided', stage === 'hand');
      if (stage === 'enable') showActionCoach(`${t('Now try it yourself')}<br>${t('Turn on Practice')}`, 'practice-board-mode');
      else if (stage === 'hand') showActionCoach(`${t('Let’s start with your right hand')}<br>${t('Turn off Left Hand')}`, 'practice-left-hand');
      else if (stage === 'explain') showCoach(`${t('Watch the Note Field and play the keys it shows you')}<br><small>${t('The music will wait until you press the right key')}</small>`, 'explain', false, advancePracticeInstruction);
      else if (stage === 'ready') showActionCoach(t("Press Play when you're ready"), 'play');
      else if (stage === 'metronome-on') showActionCoach(`${t('Let’s add a steady beat')}<br>${t('Turn on the metronome')}`, 'metronome-toggle');
      else if (stage === 'metronome-tempo') showActionCoach(`${t('Slow down or speed up the piece')}<br><small>${t('Type a BPM, or use − / + to change it by 10')}</small>`, 'metronome-tempo-controls');
      else if (stage === 'metronome-play') showActionCoach(`${t('Play it again with a steady beat')}<br>${t('Press Play')}`, 'play');
      else if (stage === 'round-info') showCoach(`${t('Rounds divide the piece into sections.')}<br><small>${t('You can jump directly to the section you want to practise.')}</small>`, 'round-navigation', false, () => setRoundGuideStage('round-go4'));
      else if (stage === 'round-go4') showActionCoach(t('Go to Round 4'), 'round-navigation');
      else if (stage === 'round-loop-info') showCoach(t('Loop repeats the section you choose.'), 'round-loop-toggle', false, () => setRoundGuideStage('round-loop'));
      else if (stage === 'round-loop') showActionCoach(t('Turn on Loop'), 'round-loop-toggle');
      else if (stage === 'round-range') showActionCoach(t('Set the Loop from Round 2 to Round 4'), 'round-range');
      else if (stage === 'round-precount-info') showCoach(t('Pre-count gives you a moment to get ready before each attempt.'), 'round-precount-toggle', false, () => setRoundGuideStage('round-precount'));
      else if (stage === 'round-precount') showActionCoach(t('Turn on Pre-count'), 'round-precount-toggle');
      else if (stage === 'round-practice') {
        if (roundTraining.started || roundTraining.feedbackPending) showCoach('');
        else showActionCoach(`${t('Play Rounds 2–4 cleanly')}<br><small>${t("Press Play when you're ready.")}</small>`, 'play');
      }
      else if (stage === 'final-instruction') showCoach(`${t('Now try to play the whole melody with your right hand from beginning to end.')}<br><br>${t('Take your time. If you lose your place, try again.')}`, 'explain', false, beginFinalPractice);
      else showCoach('');
    };
    const isRu = () => i18n.isRu();
    global.addEventListener('play12:metronome-change', event => {
      if (state.onboardingStep === 'TRY_IT_YOURSELF' && state.practiceGuideStage === 'metronome-on' && event.detail.enabled) advancePracticeInstruction();
    });
    global.addEventListener('play12:tempo-change', () => {
      if (state.onboardingStep === 'TRY_IT_YOURSELF' && state.practiceGuideStage === 'metronome-tempo') advancePracticeInstruction();
    });

    global.addEventListener('play12:musical-attempt-start', event => {
      if (state.onboardingStep !== 'TRY_IT_YOURSELF' || returnAfterZero) return;
      const position = Number(event.detail?.position);
      if (state.practiceGuideStage === 'round-practice') {
        const loop = runtime?.playback?.currentLoop?.();
        const settings = runtime?.playback?.getPracticeSettings?.();
        const exactSetup = loop && Number(runtime.playback.loopStartInput?.value) === 1 && Number(runtime.playback.loopEndInput?.value) === 3 &&
          runtime.playback.loopInput?.checked === true && settings?.practiceModeEnabled === true &&
          settings.practiceLeftHandEnabled === false && settings.practiceRightHandEnabled === true;
        if (!roundTraining.feedbackPending && exactSetup && Math.abs(position - loop.start) <= 1e-4) {
          roundTraining.started = true; roundTraining.valid = true; roundTraining.successfulRounds.clear();
          runtime.playback.roundBoard?.clearTrainingSuccess?.(); clearHints(); syncPracticeGuide();
        }
      } else if (state.practiceGuideStage === 'final-practice' && position <= 1e-4 && finalPracticeSettingsReady()) {
        finalAttempt = { active: true, valid: true, successfulRounds: new Set() };
        runtime.playback.roundBoard?.clearTrainingSuccess?.(); syncPracticeGuide();
      }
    });

    global.addEventListener('play12:round-control', event => {
      if (state.onboardingStep !== 'TRY_IT_YOURSELF' || returnAfterZero) return;
      const detail = event.detail || {};
      if (state.practiceGuideStage === 'round-practice' && ['navigate', 'range', 'loop-off'].includes(event.detail.action)) {
        invalidateRoundTraining();
        return;
      }
      if (state.practiceGuideStage === 'final-practice' && event.detail.action === 'navigate') {
        finalAttempt = { active: false, valid: false, successfulRounds: new Set() };
        runtime?.playback?.roundBoard?.clearTrainingSuccess?.();
        return;
      }
      if (state.practiceGuideStage === 'round-go4' && detail.currentRound === 4) completeRoundControlTask('round-loop-info');
      else if (state.practiceGuideStage === 'round-loop' && detail.loop === true) completeRoundControlTask('round-range');
      else if (state.practiceGuideStage === 'round-range' && detail.loop === true && detail.from === 2 && detail.to === 4) completeRoundControlTask('round-precount-info');
      else if (state.practiceGuideStage === 'round-precount' && detail.precount === true) showOk12(prepareRoundPractice);
    });
    global.addEventListener('play12:practice-event-complete', event => {
      const detail = event.detail || {};
      if ((detail.source !== 'user' && detail.emptyRound !== true) || detail.roundComplete !== true) return;
      if (state.practiceGuideStage === 'round-practice' && roundTraining.started && roundTraining.valid) {
        if (detail.round < 2 || detail.round > 4 || roundTraining.successfulRounds.has(detail.round)) return;
        roundTraining.successfulRounds.add(detail.round);
        runtime?.playback?.roundBoard?.setRoundSuccess?.(detail.round, true);
        playRoundFeedback('round', roundTraining.successfulRounds.size / 3, false);
        if ([2,3,4].every(number => roundTraining.successfulRounds.has(number))) {
          roundTraining.started=false;roundTraining.valid=false;
          runtime?.playback?.roundBoard?.pulseCompleteChain?.();
          showOk12(() => {
            clearRoundTraining();
            runtime.playback.pauseImmediate(runtime.playback.currentLoop()?.start ?? 0);
            state.practiceGuideStage='final-instruction';state.highestUnlockedStep=Math.max(state.highestUnlockedStep||1,6);
            syncProgress();saveState(storage,state);syncPracticeGuide();
          });
        }
      } else if (state.practiceGuideStage === 'final-practice' && finalAttempt.active && finalAttempt.valid) {
        if (detail.round < 1 || detail.round > runtime.playback.rounds.length || finalAttempt.successfulRounds.has(detail.round)) return;
        finalAttempt.successfulRounds.add(detail.round);
        runtime?.playback?.roundBoard?.setRoundSuccess?.(detail.round, true);
        playRoundFeedback('round', finalAttempt.successfulRounds.size / runtime.playback.rounds.length, true);
        if (runtime.playback.rounds.every((_,index)=>finalAttempt.successfulRounds.has(index+1))) {
          finalAttempt.active=false;runtime.playback.roundBoard?.pulseCompleteChain?.();
          global.setTimeout(()=>{if(state.practiceGuideStage==='final-practice'&&finalAttempt.valid)completeTutorial();},520);
        }
      }
    });
    global.addEventListener('play12:practice-wrong-input', () => {
      if (state.practiceGuideStage === 'round-practice') invalidateRoundTraining();
      else if (state.practiceGuideStage === 'final-practice' && finalAttempt.active) { finalAttempt.valid=false;finalAttempt.successfulRounds.clear();runtime?.playback?.roundBoard?.clearTrainingSuccess?.(); }
    });
    global.addEventListener('play12:practice-interruption', () => {
      if (state.practiceGuideStage === 'round-practice') invalidateRoundTraining();
      else if (state.practiceGuideStage === 'final-practice') { finalAttempt={active:false,valid:false,successfulRounds:new Set()};runtime?.playback?.roundBoard?.clearTrainingSuccess?.(); }
    });
    global.addEventListener('play12:practice-loop-complete', event => {
      if (state.onboardingStep !== 'TRY_IT_YOURSELF' || state.practiceGuideStage !== 'round-practice') return;
      if (roundTraining.feedbackPending) return;
      const detail = event.detail || {};
      if (detail.practice !== true || detail.from !== 1 || detail.to !== 3) { invalidateRoundTraining(); return; }
      if (!roundTraining.valid) invalidateRoundTraining();
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
      removeMidiInputInterceptor?.();
      removeCalibrationListener?.();
      removePlaybackStateListener?.();
      removeNoteListener = runtime.noteEvents?.addNoteListener?.(event => {
        if (state.zeroSetupStage?.startsWith('verify-') && event.source === 'mouse') {
          acceptCardVerificationInput(event);
          return;
        }
        if (state.onboardingStep === 'MIDI_CONNECT' && midiConnectState === 'test' &&
            event.type === 'note-on' && event.source === 'midi' && event.velocity > 0) verifyMidi();
      }) || null;
      removeMidiInputInterceptor = runtime.midiDiagnostic?.addInputInterceptor?.(acceptCardVerificationInput) || null;
      removeMidiStatusListener = runtime.midiDiagnostic?.addStatusListener?.(event => {
        if (state.inputMode === 'midi' && state.onboardingStep !== 'MIDI_CONNECT' && event.status === 'no-input') {
          recoveringMidi = true;
          if (state.practiceGuideStage === 'final-practice' && finalAttempt.active) { finalAttempt = { active: false, valid: false, successfulRounds: new Set() };runtime?.playback?.roundBoard?.clearTrainingSuccess?.(); }
          setReconnectVisible(true, event.status);
          return;
        }
        if (recoveringMidi) {
          setReconnectVisible(event.status !== 'connected', event.status);
          if (event.status === 'connected') recoveringMidi = false;
          return;
        }
        if (state.onboardingStep !== 'MIDI_CONNECT') return;
        if (event.status === 'unavailable') showMidiState(event.detail?.safari ? 'unsupported-safari' : 'unsupported');
        else if (event.status === 'permission-denied') showMidiState('permission-denied');
        else if (event.status === 'no-input' && midiConnectState !== 'recalibrate') showMidiState('device-not-found');
        else if (event.status === 'connected' && !state.midiVerified) showMidiState('test');
        else if (event.status === 'error') showMidiState('permission-help');
      }) || null;
      removeCalibrationListener = runtime.midiDiagnostic?.addCalibrationListener?.(event => {
        if (event.type === 'capture-left') showMidiState('calibrate-left');
        else if (event.type === 'capture-right') showMidiState('calibrate-right');
        else if (event.type === 'invalid') showMidiState('calibrate-invalid');
        else if (event.type === 'unusual') { syncCalibrationRange(event.range); showMidiState('calibrate-unusual'); }
        else if (event.type === 'confirm') { syncCalibrationRange(event.range); showMidiState('calibrate-confirm'); }
        else if (event.type === 'verify-function') showMidiState('function-verify');
        else if (event.type === 'verify-retry') showMidiState('function-retry');
        else if (event.type === 'complete') showMidiState('calibration-complete');
        else if (['range-changed','device-changed'].includes(event.type)) {
          if (state.inputMode === 'midi') { state.onboardingStep = 'MIDI_CONNECT'; saveState(storage, state); showStep('MIDI_CONNECT'); showMidiState('recalibrate'); }
        }
      }) || null;
      removePlaybackStateListener = runtime.playback?.addStateListener?.(snapshot => {
        if (state.onboardingStep === 'TRY_IT_YOURSELF') {
          if (returnAfterZero) return;
          if (state.practiceGuideStage === 'final-practice') {
            const active = snapshot.running || snapshot.state === 'waiting_for_input';
            if (finalAttempt.active && snapshot.ended) {
              const allRounds = runtime.playback.rounds.every((_,index)=>finalAttempt.successfulRounds.has(index+1));
              if (finalAttempt.valid && allRounds && finalPracticeSettingsReady()) {
                finalAttempt.active=false;runtime.playback.roundBoard?.pulseCompleteChain?.();
                global.setTimeout(()=>{if(state.practiceGuideStage==='final-practice'&&finalAttempt.valid)completeTutorial();},520);
              }
              else finalAttempt = { active: false, valid: false, successfulRounds: new Set() };
            } else if (finalAttempt.active && !active && !snapshot.ended) {
              finalAttempt = { active: false, valid: false, successfulRounds: new Set() };
            }
            syncPracticeGuide();
            return;
          }
          if (state.practiceGuideStage === 'round-practice') {
            const musicalActive = snapshot.running || snapshot.state === 'waiting_for_input';
            if (snapshot.state === 'count-in') {
              syncPracticeGuide();
              return;
            }
            if (roundTraining.started && !musicalActive) {
              invalidateRoundTraining();
            }
            syncPracticeGuide();
            return;
          }
          if ((['enable', 'hand', 'explain', 'ready'].includes(state.practiceGuideStage) || (state.practiceGuideStage === 'free' && !state.metronomeUnlocked)) && (snapshot.running || snapshot.state === 'waiting_for_input')) {
            clearHints();
            state.practiceGuideStage = 'playing';
            saveState(storage, state);
          }
          if (state.practiceGuideStage === 'playing' && snapshot.ended && runtime.playback.practiceEnabled()) {
            showOk12(() => {
              state.practiceGuideStage = state.metronomeUnlocked ? (state.roundUnlocked ? 'free' : 'round-info') : 'metronome-on';
              if (state.practiceGuideStage === 'round-info') state.roundUnlocked = true;
              state.metronomeUnlocked = true; syncProgress(); saveState(storage, state); syncPracticeGuide();
            });
          }
          if (state.practiceGuideStage === 'metronome-play' && (snapshot.running || snapshot.state === 'waiting_for_input')) {
            clearHints(); state.practiceGuideStage = 'metronome-playing'; saveState(storage, state);
          }
          if (state.practiceGuideStage === 'metronome-playing' && snapshot.ended) {
            showOk12(() => { state.practiceGuideStage = 'round-info'; state.roundUnlocked = true;syncProgress();saveState(storage,state);syncPracticeGuide(); });
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
      if (state.onboardingStep === 'LISTEN_AND_CONTROL' || state.onboardingStep === 'CHOOSE_ZERO' || state.onboardingStep === 'TRY_IT_YOURSELF' || state.onboardingStep === 'ONBOARDING_COMPLETE') moveStageToOnboarding();
      if (state.onboardingStep === 'CHOOSE_ZERO' && new URLSearchParams(location.search).get('onboardingPreview') === 'choose-zero') {
        global.dispatchEvent(new CustomEvent('play12:choose-zero-open'));
      }
    };

    document.body.classList.remove('play12-onboarding-boot');
    document.body.classList.add('play12-onboarding-active');
    continueButton.hidden = !returning;
    if (returning) { startButton.textContent = t('Start fresh'); continueButton.textContent = t('Continue with saved setup'); }
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
    root.querySelector('#onboarding-midi-continue').addEventListener('click', beginMidiCalibration);
    root.querySelector('#onboarding-midi-calibrate-invalid-retry').addEventListener('click', () => runtime?.midiDiagnostic?.retryCalibration());
    root.querySelector('#onboarding-midi-calibrate-unusual-retry').addEventListener('click', () => runtime?.midiDiagnostic?.retryCalibration());
    root.querySelector('#onboarding-midi-use-range').addEventListener('click', () => runtime?.midiDiagnostic?.useUnusualRange());
    root.querySelector('#onboarding-midi-calibrate-confirm').addEventListener('click', () => runtime?.midiDiagnostic?.confirmRange());
    root.querySelector('#onboarding-midi-calibrate-retry').addEventListener('click', () => runtime?.midiDiagnostic?.retryCalibration());
    root.querySelector('#onboarding-midi-function-retry').addEventListener('click', () => runtime?.midiDiagnostic?.retryFunctionVerification());
    root.querySelector('#onboarding-midi-function-recalibrate').addEventListener('click', () => runtime?.midiDiagnostic?.retryCalibration());
    root.querySelector('#onboarding-midi-calibration-continue').addEventListener('click', advanceToListen);
    root.querySelector('#onboarding-midi-recalibrate').addEventListener('click', () => runtime?.midiDiagnostic?.retryCalibration());
    root.querySelector('#onboarding-midi-keep-range').addEventListener('click', () => { runtime?.midiDiagnostic?.keepCurrentRange(); advanceToListen(); });
    global.addEventListener('play12:manual-recalibrate', () => {
      state.onboardingStep = 'MIDI_CONNECT'; state.inputMode = 'midi'; saveState(storage, state);
      showStep('MIDI_CONNECT'); runtime?.midiDiagnostic?.beginCalibration();
    });
    listenContinue.addEventListener('click', advanceToChooseZero);
    global.addEventListener('play12:zero-confirmed', handleZeroConfirmed);
    global.addEventListener('play12:zero-ui-open', () => {
      returnAfterZero ||= {destination: state.onboardingStep === 'TRY_IT_YOURSELF' ? 'practice' : 'onboarding',
        practiceGuideStage: state.practiceGuideStage};
      clearHints();
      exposeState();
      const chooser = document.getElementById('zero-chooser');
      if (chooser) {
        showHint(chooser, `zero-selection:${++zeroHintSequence}`);
        clearTimeout(hintTimers.get(chooser)); hintTimers.delete(chooser); chooser.classList.remove('has-dismiss-timer');
        spotlightHint(chooser, 'choose-zero');
      }
    });
    global.addEventListener('play12:zero-ui-candidate', () => {
      const chooser = document.getElementById('zero-chooser');
      if (chooser) {
        hideHint(chooser);
        showHint(chooser, `zero-confirmation:${++zeroHintSequence}`);
        clearTimeout(hintTimers.get(chooser)); hintTimers.delete(chooser); chooser.classList.remove('has-dismiss-timer');
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
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      const preview = new URLSearchParams(location.search).get('onboardingPreview');
      if (['final-instruction', 'reconnect', 'completion'].includes(preview)) {
        state = {
          ...state, onboardingStarted: true, onboardingStep: preview === 'completion' ? 'ONBOARDING_COMPLETE' : 'TRY_IT_YOURSELF',
          onboardingCompleted: preview === 'completion', inputMode: 'demo', midiVerified: false,
          playLearned: true, pauseLearned: true, listenFragmentCompleted: true, chooseZeroCompleted: true,
          cardsSetupCompleted: true, practiceGuideStage: preview === 'completion' ? 'completed' : 'final-instruction',
          practiceModeEnabled: true, practiceLeftHandEnabled: false, practiceRightHandEnabled: true,
          metronomeUnlocked: true, roundUnlocked: true, highestUnlockedStep: preview === 'completion' ? 4 : 3
        };
        showStep(state.onboardingStep);
        if (preview === 'reconnect') setReconnectVisible(true);
        if (preview === 'completion') showCompletionCelebration();
      }
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
