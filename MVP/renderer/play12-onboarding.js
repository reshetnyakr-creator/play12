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
        metronomeSuccessFeedback: value.metronomeSuccessFeedback === true || ['metronome-tempo','metronome-play','metronome-playing','round-info','round-go4','round-loop-info','round-loop','round-range','round-precount-info','round-precount','round-practice','final-instruction','final-practice','completed'].includes(value.practiceGuideStage),
        playLearned: value.playLearned === true,
        pauseLearned: value.pauseLearned === true,
        listenFragmentCompleted: value.listenFragmentCompleted === true,
        chooseZeroCompleted: value.chooseZeroCompleted === true,
        cardsSetupCompleted: value.cardsSetupCompleted === true || value.zeroChangeHintShown === true ||
          (value.cardsSetupCompleted === undefined && value.onboardingStep === 'TRY_IT_YOURSELF' && value.practiceGuideStage !== 'cards'),
        zeroSetupStage: ['intro', 'button', 'select', 'confirm', 'cards', 'verify-yellow', 'verify-green'].includes(value.zeroSetupStage) ? value.zeroSetupStage
          : value.practiceGuideStage === 'cards' ? 'cards' : null,
        metronomeUnlocked: value.metronomeUnlocked === true,
        roundUnlocked: value.roundUnlocked === true,
        practiceModeEnabled: value.practiceModeEnabled === true,
        practiceLeftHandEnabled: value.practiceLeftHandEnabled !== false,
        practiceRightHandEnabled: value.practiceRightHandEnabled !== false,
        oneSkillMode: false, activeSkillId: null,
        listenGuideStage: ['initial', 'pause', 'continue', 'listening'].includes(value.listenGuideStage) ? value.listenGuideStage : null,
        successes: {...(!value.successes&&value.metronomeSuccessFeedback?{'metronome-on':true}:{}),...(value.successes||{}),...(!value.successes&&value.playLearned?{'listen-play':true}:{}),...(!value.successes&&value.chooseZeroCompleted?{'zero-confirmed':true}:{})},
        introducedPanels: value.introducedPanels||{},
        roundPasses: Math.max(0,Math.min(2,Number(value.roundPasses)||0)),
        practiceGuideStage: ['practice-info','metronome-info','enable', 'hand', 'explain', 'ready', 'playing', 'metronome-on', 'metronome-tempo', 'metronome-play', 'metronome-playing', 'round-info', 'round-go4', 'round-loop-info', 'round-loop', 'round-range', 'round-precount-info', 'round-precount', 'round-practice', 'round-nav', 'final-instruction', 'final-practice', 'completed', 'free'].includes(value.practiceGuideStage) ? value.practiceGuideStage : value.practiceGuideStage === 'complete' ? 'free' : 'enable'
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
    const practiceBoard = document.getElementById('practice-board');
    const practiceModeButton = document.getElementById('practice-board-mode');
    const leftHandButton = document.getElementById('practice-left-hand');
    const rightHandButton = document.getElementById('practice-right-hand');
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
    let resetRuntimeOnConnect = false;
    let completionCardTimer = null;
    let celebrationFired = false;
    let finalAttempt = { active: false, valid: false, successfulRounds: new Set() };
    let roundTraining = { active: false, started: false, valid: false, passes: 0, successfulRounds: new Set(), feedbackPending: false };
    let metronomeAttempt={active:false,count:0,seen:new Set()};
    let visualAttempt={active:false,start:0,signature:'',seen:new Map(),invalid:new Set()};
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
    let runtime = null, practiceBindingDispose=null, alignedLayout=null;
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
    const spotlight = global.Play12Coach.create(root,{padding:3,feather:3,portal:true,avoidTargets:true,avoidTargetsFor:card=>!card.classList.contains('tutorial-coach-centered')||global.Play12Responsive?.state==='phone-landscape',dock:(card,target)=>card.id==='onboarding-listen-coach'&&alignedLayout?.dockCoach(card,target,card.classList.contains('tutorial-coach-centered')),reveal:target=>alignedLayout?.reveal(target)});
    // Targets describe WHERE for each instruction; card positioning is independent.
    const targetsFor = instruction => {
      const element = id => document.getElementById(id);
      const piano = runtime?.pianoView?.mount;
      if (instruction === 'choose-zero') return [element('onboarding-choose-zero')];
      if (instruction === 'zero-keyboard') return [piano];
      if (instruction === 'verify-cards') return [piano?.querySelector('.piano-visible-card-region'), piano];
      if (instruction === 'cards') return [piano?.querySelector('.piano-visible-card-region')];
      if (instruction === 'round-range') return [element('round-range-controls'), element('round-timeline')];
      if (instruction === 'explain' || instruction === 'final-explain') return [element('play12-score'), piano];
      return instruction ? [element(instruction)] : [];
    };
    const spotlightHint = (element, instruction, pulse = false, onReveal = null) => {
      alignedLayout?.reveal(targetsFor(instruction).find(Boolean));
      if (!element.hidden) spotlight.show(element, () => targetsFor(instruction), pulse ? runtime?.pianoView?.mount : null,
        document.getElementById('play12-score'), onReveal);
    };
    let returnAfterZero = null;
    let skippingInstruction = false;
    let zeroHintSequence = 0, cardGeometryFrame = 0;
    const hintTimers = new Map();
    const hintKeys = new Map();
    const dismissedHints = new Set();
    const hideHint = element => {
      if(element===listenCoach)alignedLayout?.dockCoach?.(null);
      spotlight.stop(element);
      clearTimeout(hintTimers.get(element));
      hintTimers.delete(element);
      if (hintKeys.has(element)) dismissedHints.add(hintKeys.get(element));
      hintKeys.delete(element);
      element.hidden = true;
      element.classList.remove('has-dismiss-timer', 'is-entering', 'is-visible');
    };
    const armHintTimer = (element, afterDismiss) => {
      element.classList.add('has-dismiss-timer');
      hintTimers.set(element, global.setTimeout(() => { hideHint(element); afterDismiss?.(); }, INFO_CARD_DURATION_MS));
    };
    const showHint = (element, key, afterDismiss = null, deferTimer = false) => {
      if (hintKeys.get(element) === key) return;
      hideHint(element);
      if (dismissedHints.has(key)) { afterDismiss?.(); return; }
      hintKeys.set(element, key);
      element.hidden = false;
      if (!deferTimer) armHintTimer(element, afterDismiss);
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
      listenCoach.classList.toggle('tutorial-coach-centered', control === 'final-explain');
      listenCoach.dataset.copy = text;
      listenPrompt.innerHTML = text;
      const deferTimer = Boolean(afterDismiss && alignedLayout);
      showHint(listenCoach, key, afterDismiss, deferTimer);
      spotlightHint(listenCoach, control, pulse, deferTimer ? () => armHintTimer(listenCoach, afterDismiss) : null);
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
      if(global.Play12TrainingShell) return global.Play12TrainingShell.syncFixedPiano({runtime,root,playbackHost});
    };

    const keepPianoFixed = () => {
      if(alignedLayout&&document.body.classList.contains('tutorial-main-aligned')){alignedLayout.resize();return;}
      const mount = runtime?.pianoView?.mount;
      if (!mount) return;
      global.Play12TrainingShell.keepFixed(mount);
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
      const tempoNavigator=runtime?.playback?.tempoNavigator;
      if(tempoNavigator){
        tempoNavigator.root.hidden=!boards.metronome;
        if(boards.metronome)tempoNavigator.layout();
      }
      root.classList.toggle('has-metronome-board', boards.metronome);
      const roundBoard = document.getElementById('round-loop-board');
      if (roundBoard) {
        roundBoard.hidden = !boards.practice;
        roundBoard.inert = !boards.rounds;
      }
      const combinedBoard=document.getElementById('practice-loop-board');
      if(combinedBoard)combinedBoard.hidden=!boards.practice&&!boards.rounds;
      if (songStep) songStep.textContent = t('Step {current} of 6', { current: activeStep });
      if (skipButton) {
        skipButton.hidden = !['LISTEN_AND_CONTROL', 'CHOOSE_ZERO', 'TRY_IT_YOURSELF'].includes(visibleStep);
        skipButton.disabled = visibleStep === 'TRY_IT_YOURSELF' && skipDisabled(state.practiceGuideStage);
      }
      alignedLayout?.resize();
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
      global.Play12TrainingShell.placePiano(mount,pianoHost);
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
      if(runtime&&global.Play12TutorialLayout){alignedLayout ||= global.Play12TutorialLayout.create({runtime,root});alignedLayout.mount();return;}
      const stage = runtime?.stage;
      if (!stage || !playbackHost) return;
      if (!stageHome) stageHome = { parent: stage.parentElement, nextSibling: stage.nextSibling };
      const transport = document.getElementById('playline');
      const row = document.getElementById('onboarding-control-row');
      if(transport&&row) transportHome ||= transport.parentElement;
      const mount=runtime?.pianoView?.mount;
      if(mount&&listenPianoHost&&!pianoHome) pianoHome={parent:mount.parentElement,nextSibling:mount.nextSibling};
      global.Play12TrainingShell.place({stage,playbackHost,transport,controlRow:row,roundBoard:document.getElementById('practice-loop-board')||document.getElementById('round-loop-board'),piano:mount,pianoHost:listenPianoHost});
      global.Play12TrainingShell.mountWorkspace(stage,playbackHost,transport);
      if(mount&&listenPianoHost){keepPianoFixed();runtime.pianoView.syncContainer?.();}
      document.body.classList.add('play12-onboarding-listen');
      global.dispatchEvent(new Event('resize'));
      requestAnimationFrame(() => runtime?.playback?.layoutCoreGeometry?.());
    };

    const restoreStage = () => {
      if(alignedLayout){alignedLayout.dispose();return;}
      const stage = runtime?.stage;
      if (!stage || !stageHome) return;
      const transport = document.getElementById('playline');
      global.Play12TrainingShell.restore({stage,stageHome,transport,transportHome});
      document.body.classList.remove('play12-onboarding-listen');
      global.dispatchEvent(new Event('resize'));
      requestAnimationFrame(() => runtime?.playback?.layoutCoreGeometry?.());
    };

    const syncListenCopy = () => {
      listenContinue.hidden = true;
      const stage = state.listenGuideStage || (state.pauseLearned ? 'continue' : state.playLearned ? 'pause' : 'initial');
      if (state.listenFragmentCompleted) { showCoach(''); listenContinue.hidden = false; }
      else if (stage === 'initial') showActionCoach(t('Listen to how the melody sounds. Press Play or the P key.'), 'play');
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
          // clearHints above owns visibility; mounting can synchronously show the
          // new instruction, which must not be hidden behind its live hint key.
          if (listenContinue) listenContinue.hidden = true;
        }
      }
      syncProgress();
      if(step==='CHOOSE_ZERO'&&!state.zeroSetupStage){state.zeroSetupStage='intro';saveState(storage,state);}
      if(step==='CHOOSE_ZERO'&&['intro','button'].includes(state.zeroSetupStage))syncZeroGuide();
      if (step === 'CHOOSE_ZERO' && state.zeroSetupStage === 'cards') showCardsSetup();
      if (step === 'CHOOSE_ZERO' && state.zeroSetupStage?.startsWith('verify-')) showCardVerificationPrompt();
      if (step === 'TRY_IT_YOURSELF') syncPracticeGuide();
      if (step === 'ONBOARDING_COMPLETE') {
        hideHint(listenCoach);
        completionCard.hidden = true;
        requestAnimationFrame(syncOverlayGeometry);
      }
      alignedLayout?.resize();
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
      resetRuntimeOnConnect = !runtime;
      metronomeAttempt={active:false,count:0,seen:new Set()};
      visualAttempt.active = false;
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
        successes:{},introducedPanels:{},roundPasses:0,metronomeStreak:0,practiceModeEnabled:false,practiceLeftHandEnabled:true,practiceRightHandEnabled:true,
        cardsSetupCompleted: false, zeroSetupStage: null
      };
      runtime?.resetLearningSetup?.();
      syncProgress();
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
        state.practiceGuideStage = ({3:state.introducedPanels?.practice?'enable':'practice-info', 4:state.introducedPanels?.metronome?'metronome-on':'metronome-info', 5:'round-info', 6:'final-instruction'})[number];
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
      // Step 2 opens the existing chooser only after the learner presses 0.
    };
    for (const [number, element] of progressItems) {
      element.addEventListener('click', () => navigateStep(number));
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigateStep(number); }
      });
    }
    root.querySelector('#returning-midi-retry').addEventListener('click', recoverMidi);

    const actionStages = new Set(['enable','hand','ready','playing','metronome-tempo','metronome-on','metronome-play','metronome-playing','round-go4','round-loop','round-range','round-precount','round-practice','final-practice']);
    const musicalStages = new Set(['ready', 'playing', 'metronome-play', 'metronome-playing', 'round-practice', 'final-practice']);
    const canSkipMusic = stage => state.inputMode === 'demo' && musicalStages.has(stage);
    const skipDisabled = stage => actionStages.has(stage) && !canSkipMusic(stage);

    skipButton.addEventListener('click', () => {
      if (state.onboardingStep === 'TRY_IT_YOURSELF' && skipDisabled(state.practiceGuideStage)) return;
      const skippingMusic = state.onboardingStep === 'TRY_IT_YOURSELF' && canSkipMusic(state.practiceGuideStage);
      if (skippingMusic) {
        visualAttempt.active = false;
        metronomeAttempt.active = false;
        resetMetronomeSeries();
        finalAttempt.active = false;
        clearRoundTraining();
      }
      skippingInstruction=true;
      clearTimeout(ok12Timer); ok12Timer=null;
      if(ok12Toast)ok12Toast.hidden=true;
      roundTraining.feedbackPending=false;
      clearHints();
      runtime?.playback?.pauseImmediate?.();
      skippingInstruction=false;
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
      // Preserve an already enabled metronome; state-based tasks may credit it.
      if (state.onboardingCompleted) { state.onboardingStep = 'ONBOARDING_COMPLETE'; showStep('ONBOARDING_COMPLETE'); }
      else if (highestUnlocked() > activeProgressStep() && !(state.onboardingStep==='CHOOSE_ZERO'&&state.zeroSetupStage)) navigateStep(highestUnlocked());
      else if (['LISTEN_AND_CONTROL', 'CHOOSE_ZERO', 'TRY_IT_YOURSELF'].includes(state.onboardingStep)) {
        if (state.onboardingStep === 'TRY_IT_YOURSELF') restorePracticeSettings();
        runtime?.restoreLearningSetup?.();
        showStep(state.onboardingStep);
        if (state.onboardingStep === 'CHOOSE_ZERO' && ['select','confirm'].includes(state.zeroSetupStage)) global.dispatchEvent(new CustomEvent('play12:choose-zero-open'));
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
      if(global.Play12TrainingZones?.physicalKeyboard(runtime.midiDiagnostic).range){advanceToListen();return;}
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
      // Preview the detected instrument with Main’s uniform full-piano scale.
      // Calibration data and acceptance remain owned by the MIDI controller.
      runtime?.pianoView?.setWorkspaceKeyboard?.('desktop',{min:range.leftMidi,max:range.rightMidi});
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
      if(cardGeometryFrame)global.cancelAnimationFrame(cardGeometryFrame);cardGeometryFrame=0;
      // Piano View rebuilds its key map on the next frame after a zero/range change.
      // Defer only the visual instruction, without changing its expected note or lesson state.
      if(runtime?.pianoView?.keys?.size===0){const stage=state.zeroSetupStage;cardGeometryFrame=global.requestAnimationFrame(()=>{if(state.zeroSetupStage===stage&&stage?.startsWith('verify-'))showCardVerificationPrompt(retry);});return;}
      const yellow = state.zeroSetupStage === 'verify-yellow';
      const target = expectedCardMidi();
      const retryCopy = retry ? `${t('Check that the cards are placed correctly and try again.')}<br>` : '';
      showCoach(target == null
        ? t(yellow ? 'The yellow 1 card is not visible on this keyboard range.' : 'The green 2 card is not visible on this keyboard range.')
        : `${retryCopy}${t(yellow ? 'Press the key under the <strong>yellow 1</strong> card' : 'Press the key under the <strong>green 2</strong> card')}`, 'verify-cards', true);
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
        const pendingStage=state.zeroSetupStage;
        global.setTimeout(()=>{if(state.onboardingStep==='CHOOSE_ZERO'&&state.zeroSetupStage===pendingStage)finishCardsSetup();},650);
      }
      return true;
    };
    const finishCardsSetup = () => {
      state.cardsSetupCompleted = true;
      state.zeroSetupStage = null;
      state.practiceGuideStage = 'practice-info';
      state.highestUnlockedStep = Math.max(state.highestUnlockedStep||1,3);
      navigateStep(3);
    };
    const finishZero = confirmed => {
      // Capture the entry context before closing the selection UI cancels it.
      const context = returnAfterZero || {destination: 'onboarding'};
      returnAfterZero = null;
      global.dispatchEvent(new CustomEvent('play12:choose-zero-close'));
      clearHints();
      if (confirmed) state.chooseZeroCompleted = true;
      state.highestUnlockedStep = Math.max(state.highestUnlockedStep||1,3);
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
    const handleZeroConfirmed = () => {
      if(returnAfterZero?.destination==='ordinary'){
        returnAfterZero=null;global.dispatchEvent(new CustomEvent('play12:choose-zero-close'));exposeState();syncPracticeGuide();return;
      }
      finishZero(true);rewardSuccess('zero-confirmed',null,true);
    };
    const syncZeroGuide = () => {
      if(state.zeroSetupStage==='intro')showCoach(t('You can choose your own starting point — your 0. You can change it later.'),null,false,()=>{state.zeroSetupStage='button';saveState(storage,state);syncZeroGuide();});
      else if(state.zeroSetupStage==='button')showActionCoach(t('Press 0 to choose your starting point.'),'choose-zero');
    };

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
      roundTraining.started = false; roundTraining.valid = false; roundTraining.successfulRounds.clear();roundTraining.preparingNext=roundTraining.passes>0;updatePassCaption();
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
    const showEarlyOk12 = () => {
      if(roundTraining.feedbackPending||!ok12Toast)return;
      ok12Toast.hidden=false;playRoundFeedback('ok12');clearTimeout(ok12Timer);
      ok12Timer=global.setTimeout(()=>{ok12Toast.hidden=true;},950);
    };
    const rewardSuccess = (id,after=null,nonBlocking=false) => {
      state.successes ||= {};
      if(roundTraining.feedbackPending&&!nonBlocking)return;
      if(state.successes[id]){after?.();return;}
      state.successes[id]=true;saveState(storage,state);
      if(nonBlocking){showEarlyOk12();return;}
      showOk12(after);
    };
    const setGuideStage = next => {state.practiceGuideStage=next;syncProgress();saveState(storage,state);syncPracticeGuide();};
    const panelInfo = (panel,text,target,next) => showCoach(t(text),target,false,()=>{state.introducedPanels ||= {};state.introducedPanels[panel]=true;setGuideStage(next);});
    const setRoundGuideStage = next => {
      state.practiceGuideStage = next;
      state.metronomeUnlocked = true; state.roundUnlocked = true;
      state.highestUnlockedStep = Math.max(state.highestUnlockedStep || 1, 5);
      syncProgress(); saveState(storage, state); syncPracticeGuide();
    };
    const completeRoundControlTask = next => rewardSuccess(({'round-loop-info':'round-go4','round-range':'round-loop','round-precount-info':'round-range'})[next]||next,() => setRoundGuideStage(next));
    const prepareRoundPractice = () => {
      clearRoundTraining();
      state.practiceGuideStage = 'round-practice';
      state.roundPasses=state.roundPasses===1?1:0;
      roundTraining = { active: true, started: false, valid: false, passes: state.roundPasses===1?1:0, preparingNext:state.roundPasses===1, successfulRounds: new Set(), feedbackPending: false };
      state.practiceModeEnabled = true; state.practiceLeftHandEnabled = false; state.practiceRightHandEnabled = true;
      runtime.playback.setPracticeSettings({practiceModeEnabled:true,practiceLeftHandEnabled:false,practiceRightHandEnabled:true});
      runtime.playback.setPracticeTimingStrict?.(false);
      runtime.playback.loopInput.checked = true;
      runtime.playback.loopStartInput.value = '1'; runtime.playback.loopEndInput.value = '3';
      runtime.playback.pauseImmediate(runtime.playback.rounds?.[1]?.start ?? 0);
      runtime.playback.roundBoard?.setTraining?.(true, roundTraining.passes, {rounds:[2,3,4],totalPasses:2});
      updatePassCaption();
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
      if (skipped && state.practiceGuideStage === 'final-practice') { completeTutorial(); return; }
      if (state.practiceGuideStage === 'final-instruction') { beginFinalPractice(); return; }
      clearHints();
      if(state.practiceGuideStage==='practice-info'){state.introducedPanels ||= {};state.introducedPanels.practice=true;}
      if(state.practiceGuideStage==='metronome-info'){state.introducedPanels ||= {};state.introducedPanels.metronome=true;}
      const next = {'practice-info':'enable','metronome-info':'metronome-tempo',enable: 'hand', hand: 'ready', explain: 'ready', ready: 'playing', playing: state.introducedPanels?.metronome?'metronome-on':'metronome-info', 'metronome-playing': 'round-info', 'metronome-on': 'metronome-play', 'metronome-tempo': 'metronome-on', 'metronome-play': 'round-info', 'round-info':'round-go4', 'round-go4':'round-loop-info', 'round-loop-info':'round-loop', 'round-loop':'round-range', 'round-range':'round-precount-info', 'round-precount-info':'round-precount', 'round-precount':'round-practice'};
      const freeNext = state.metronomeUnlocked ? (state.roundUnlocked ? 'free' : 'round-info') : 'metronome-on';
      if (skipped && state.practiceGuideStage === 'ready') state.practiceGuideStage = 'playing';
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
      if (state.onboardingStep !== 'TRY_IT_YOURSELF' || visibleStep !== 'TRY_IT_YOURSELF' || !runtime || returnAfterZero || skippingInstruction) return;
      if (state.practiceGuideStage === 'round-practice' && !roundTraining.active) { prepareRoundPractice(); return; }
      if (state.practiceGuideStage === 'final-practice' && !runtime.playback.roundBoard?.root?.classList.contains('is-training')) runtime.playback.roundBoard?.setTraining?.(true, 0, {label:t('Whole song'),rounds:runtime.playback.rounds.map((_,index)=>index+1),totalPasses:null});
      const settings = runtime.playback.getPracticeSettings();
      practiceModeButton.setAttribute('aria-pressed', String(settings.practiceModeEnabled));
      leftHandButton.setAttribute('aria-pressed', String(settings.practiceLeftHandEnabled));
      rightHandButton.setAttribute('aria-pressed', String(settings.practiceRightHandEnabled));
      state.practiceGuideStage ||= 'practice-info';
      if(roundTraining.feedbackPending)return;
      if(state.practiceGuideStage==='enable'&&!state.introducedPanels?.practice)state.practiceGuideStage='practice-info';
      if(state.practiceGuideStage==='metronome-on'&&!state.introducedPanels?.metronome)state.practiceGuideStage='metronome-info';

      const stage = state.practiceGuideStage;
      updatePassCaption();
      if (skipButton) skipButton.disabled = skipDisabled(stage);
      // An action recorded before the feedback timer is valid across a reload.
      const proven = {
        enable:['practice-enable','hand',settings.practiceModeEnabled],
        hand:['practice-hand','ready',settings.practiceModeEnabled && !settings.practiceLeftHandEnabled && settings.practiceRightHandEnabled],
        'metronome-on':['metronome-on','metronome-play',runtime.playback.metronomeInput.checked],
      }[stage];
      if(proven && proven[2] && state.successes?.[proven[0]]){setGuideStage(proven[1]);return;}
      practiceBoard.dataset.guideStage = stage;
      practiceBoard.hidden = false;
      const combinedBoard=document.getElementById('practice-loop-board');
      if(combinedBoard)combinedBoard.hidden=false;
      practiceModeButton.classList.toggle('is-guided', stage === 'enable');
      leftHandButton.classList.toggle('is-guided', stage === 'hand');
      if(stage==='practice-info')panelInfo('practice','This is the Practice panel. Here you can choose which hand to practise with: right, left, or both.','practice-loop-board','enable');
      else if (stage === 'enable') showActionCoach(t('Now turn on Practice.'), 'practice-board-mode');
      else if (stage === 'hand') showActionCoach(t('Let’s play with your right hand. Turn off Left Hand.'), 'practice-left-hand');
      else if (stage === 'explain') showCoach(`${t('Watch the Note Field and play the keys it shows you')}<br><small>${t('The music will wait until you press the right key')}</small>`, 'explain', false, advancePracticeInstruction);
      else if (stage === 'ready') showActionCoach(t('Now press Play and try to play the melody with your right hand.'), 'play');
      else if(stage==='metronome-info')panelInfo('metronome','Here you can change the tempo to learn at a comfortable speed. The metronome helps you keep the rhythm.','tempo-navigator','metronome-tempo');
      else if (stage === 'metronome-on') showActionCoach(t('Try turning on the metronome.'), 'tempo-metronome');
      else if (stage === 'metronome-tempo') showActionCoach(t('Change the tempo using the arrow buttons or drag the panel up and down. Up to play faster, down to play slower.'),'tempo-navigator');
      else if (stage === 'metronome-play') showActionCoach(`${t('Try playing five notes in a row with the metronome.')}<br>${t('Press Play')}`, 'play');
      else if (stage === 'round-info') showCoach(`<strong>${t('Round Navigation')}</strong><br>${t('Use the arrows to move between rounds. Drag the panel up or down to quickly navigate through the piece. Tap the round number to jump directly to a specific section.')}`, 'round-navigator', false, () => {state.introducedPanels ||= {};state.introducedPanels.rounds=true;setGuideStage('round-go4');});
      else if (stage === 'round-go4') showActionCoach(`${t('Choose the section you want to practise.')}<br>${t('Go to Round 4')}`, 'round-navigator');
      else if (stage === 'round-loop-info') showCoach(`<strong>${t('Practice Range')}</strong><br>${t('Select the From and To rounds to repeat a section of the piece. Until you set a range, these values follow the current round.')}`, 'round-loop-board', false, () => setRoundGuideStage('round-loop'));
      else if (stage === 'round-loop') showActionCoach(t('Turn on Loop'), 'round-loop-toggle');
      else if (stage === 'round-range') showActionCoach(t('Set the Loop from Round 2 to Round 4'), 'round-range');
      else if (stage === 'round-precount-info') showCoach(t('Pre-count gives you a moment to get ready before each attempt.'), 'round-precount-toggle', false, () => setRoundGuideStage('round-precount'));
      else if (stage === 'round-precount') showActionCoach(t('Turn on Pre-count'), 'round-precount-toggle');
      else if (stage === 'round-practice') {
        if (roundTraining.started || roundTraining.feedbackPending) showCoach('');
        else showActionCoach(`${t('Play Rounds 2–4 correctly twice')}<br><small>${t("Press Play when you're ready.")}</small>`, 'play');
      }
      else if (stage === 'final-instruction') showCoach(`${t('Now try to play the whole melody with your right hand from beginning to end.')}<br><br>${t('Take your time. If you lose your place, try again.')}`, 'final-explain', false, beginFinalPractice);
      else showCoach('');
    };
    const isRu = () => i18n.isRu();
    global.addEventListener('play12:metronome-change', event => {
      if(!runtime?.playback?.metronomeInput.checked){resetMetronomeSeries();metronomeAttempt.active=false;}
      if (state.onboardingStep !== 'TRY_IT_YOURSELF') return;
      if (state.practiceGuideStage==='metronome-on' && event.detail?.enabled && runtime.playback.metronomeInput.checked)
        rewardSuccess('metronome-on',()=>setGuideStage('metronome-play'));
    });
    global.addEventListener('play12:tempo-change', event => {
      if(state.onboardingStep==='TRY_IT_YOURSELF'&&state.practiceGuideStage==='metronome-tempo'&&event.detail?.changed)
        setGuideStage('metronome-on');
    });

    const updatePassCaption = () => {
      let caption=document.getElementById('tutorial-pass-caption');
      const board=document.getElementById('round-loop-board');
      if(!caption&&board?.ownerDocument){caption=document.createElement('span');caption.id='tutorial-pass-caption';caption.setAttribute('role','status');board.appendChild(caption);}
      if(caption){caption.hidden=state.practiceGuideStage!=='round-practice';caption.textContent=t('Pass {current} of 2',{current:roundTraining.passes===1&&!roundTraining.started&&!roundTraining.preparingNext?1:Math.min(2,(state.roundPasses||0)+1)});}
    };
    const resetMetronomeSeries = () => {metronomeAttempt.count=0;metronomeAttempt.seen.clear();state.metronomeStreak=0;};
    const verifyVisualRound = detail => {
      const p=runtime.playback,signature=JSON.stringify(p.getPracticeSettings());
      if(!p.practiceEnabled()||!visualAttempt.active||visualAttempt.signature!==signature||detail.source!=='user'||!Number.isInteger(detail.round)||visualAttempt.invalid.has(detail.round))return false;
      const round=p.rounds[detail.round-1];if(!round||visualAttempt.start>round.start+1e-5)return false;
      const expected=p.practiceEvents.filter(e=>e.start>=round.start-1e-5&&e.start<round.end-1e-5);
      if(!expected.length||!expected.some(e=>Math.abs(e.start-detail.position)<1e-5))return false;
      let seen=visualAttempt.seen.get(detail.round);if(!seen){seen=new Set();visualAttempt.seen.set(detail.round,seen);}seen.add(detail.position);
      const complete=detail.roundComplete===true&&expected.every(e=>[...seen].some(q=>Math.abs(q-e.start)<1e-5));
      if(complete)p.roundBoard?.setRoundSuccess?.(detail.round,true);
      return complete;
    };
    let userPlayIntent=false;
    const armUserPlay = event => {
      if(event.isTrusted!==true||event.repeat||returnAfterZero||!['LISTEN_AND_CONTROL','TRY_IT_YOURSELF'].includes(visibleStep))return;
      if(runtime?.playback?.commandAvailable?.('play')===false)return;
      const key=event.type==='keydown'&&(event.code==='KeyP'||event.key?.toLowerCase()==='p')&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target?.closest?.('input,select,textarea,[contenteditable]');
      if((key||event.type==='click'&&event.target?.closest?.('#play'))&&!runtime?.playback?.clock.running&&!runtime?.playback?.waitingForInput)userPlayIntent=true;
    };
    document.addEventListener('click',armUserPlay,true);document.addEventListener('keydown',armUserPlay,true);
    global.addEventListener('play12:musical-attempt-start', event => {
      const requested=userPlayIntent;userPlayIntent=false;
      if(runtime?.playback?.practiceEnabled()){visualAttempt={active:true,start:Number(event.detail?.position)||0,signature:JSON.stringify(runtime.playback.getPracticeSettings()),seen:new Map(),invalid:new Set()};runtime.playback.roundBoard?.clearTrainingSuccess?.();}
      if(['metronome-play','metronome-playing'].includes(state.practiceGuideStage)){resetMetronomeSeries();metronomeAttempt.active=runtime.playback.metronomeInput.checked===true;}
      if(state.onboardingStep==='LISTEN_AND_CONTROL'&&visibleStep==='LISTEN_AND_CONTROL'&&requested&&runtime?.playback?.clock.running)rewardSuccess('listen-play',null,true);
      if (state.onboardingStep !== 'TRY_IT_YOURSELF' || returnAfterZero) return;
      if(requested&&['ready','playing'].includes(state.practiceGuideStage)&&runtime.playback.practiceEnabled())rewardSuccess('practice-start',null,true);
      const position = Number(event.detail?.position);
      if (state.practiceGuideStage === 'round-practice') {
        const loop = runtime?.playback?.currentLoop?.();
        const settings = runtime?.playback?.getPracticeSettings?.();
        const exactSetup = loop && Number(runtime.playback.loopStartInput?.value) === 1 && Number(runtime.playback.loopEndInput?.value) === 3 &&
          runtime.playback.loopInput?.checked === true && settings?.practiceModeEnabled === true &&
          settings.practiceLeftHandEnabled === false && settings.practiceRightHandEnabled === true;
        if (!roundTraining.feedbackPending && exactSetup && Math.abs(position - loop.start) <= 1e-4) {
          roundTraining.started = true; roundTraining.preparingNext=false;roundTraining.valid = true; roundTraining.successfulRounds.clear();updatePassCaption();
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
      const stage=state.practiceGuideStage;
      if(stage==='round-go4'&&detail.action==='navigate'&&detail.currentRound===4)completeRoundControlTask('round-loop-info');
      if(stage==='round-loop'&&detail.action==='loop-on'&&detail.loop)completeRoundControlTask('round-range');
      if(stage==='round-range'&&detail.action==='range'&&detail.loop&&detail.from===2&&detail.to===4)completeRoundControlTask('round-precount-info');
      if(stage==='round-precount'&&detail.action==='precount'&&detail.precount)rewardSuccess('round-precount',prepareRoundPractice);
      if(['metronome-play','metronome-playing'].includes(state.practiceGuideStage)){resetMetronomeSeries();metronomeAttempt.active=false;}
      if (state.practiceGuideStage === 'round-practice' && ['navigate', 'range', 'loop-off'].includes(event.detail.action)) {
        invalidateRoundTraining();
        return;
      }
      if (state.practiceGuideStage === 'final-practice' && event.detail.action === 'navigate') {
        finalAttempt = { active: false, valid: false, successfulRounds: new Set() };
        runtime?.playback?.roundBoard?.clearTrainingSuccess?.();
        return;
      }
      syncPracticeGuide();
    });
    global.addEventListener('play12:practice-event-complete', event => {
      const detail = event.detail || {};
      if(state.onboardingStep==='TRY_IT_YOURSELF'&&state.practiceGuideStage==='metronome-playing'&&metronomeAttempt.active&&runtime.playback.metronomeInput.checked&&runtime.playback.practiceEnabled()&&detail.source==='user'&&Number.isFinite(detail.position)&&!metronomeAttempt.seen.has(detail.position)){
        metronomeAttempt.seen.add(detail.position);state.metronomeStreak=++metronomeAttempt.count;saveState(storage,state);
        if(metronomeAttempt.count===5){metronomeAttempt.active=false;rewardSuccess('metronome-song',()=>{runtime.playback.pauseImmediate();state.practiceGuideStage='round-info';state.roundUnlocked=true;syncProgress();saveState(storage,state);syncPracticeGuide();});}
      }
      const visualComplete=verifyVisualRound(detail);
      if (!global.Play12TrainingShell.isSuccessfulRound(detail) && !(detail.emptyRound===true&&detail.roundComplete===true)) return;
      if (state.practiceGuideStage === 'round-practice' && roundTraining.started && roundTraining.valid && (visualComplete||detail.emptyRound===true)) {
        if (detail.round < 2 || detail.round > 4 || roundTraining.successfulRounds.has(detail.round)) return;
        roundTraining.successfulRounds.add(detail.round);
        if(visualComplete)runtime?.playback?.roundBoard?.setRoundSuccess?.(detail.round, true);
        playRoundFeedback('round', roundTraining.successfulRounds.size / 3, false);
        if ([2,3,4].every(number => roundTraining.successfulRounds.has(number))) {
          roundTraining.started=false;
          roundTraining.passes++;state.roundPasses=roundTraining.passes;saveState(storage,state);
          runtime.playback.roundBoard?.setPasses?.(roundTraining.passes);updatePassCaption();
          runtime?.playback?.roundBoard?.pulseCompleteChain?.();
          if(roundTraining.passes<2)return;
          roundTraining.valid=false;
          rewardSuccess('round-song',() => {
            // Publish the destination before pauseImmediate emits a synchronous
            // snapshot; otherwise it can prepare the completed lesson again.
            state.practiceGuideStage='final-instruction';
            clearRoundTraining();
            runtime.playback.pauseImmediate(runtime.playback.currentLoop()?.start ?? 0);
            state.practiceGuideStage='final-instruction';state.highestUnlockedStep=Math.max(state.highestUnlockedStep||1,6);
            syncProgress();saveState(storage,state);syncPracticeGuide();
          });
        }
      } else if (state.practiceGuideStage === 'final-practice' && finalAttempt.active && finalAttempt.valid && (visualComplete||detail.emptyRound===true)) {
        if (detail.round < 1 || detail.round > runtime.playback.rounds.length || finalAttempt.successfulRounds.has(detail.round)) return;
        finalAttempt.successfulRounds.add(detail.round);
        if(visualComplete)runtime?.playback?.roundBoard?.setRoundSuccess?.(detail.round, true);
        playRoundFeedback('round', finalAttempt.successfulRounds.size / runtime.playback.rounds.length, true);
        if (runtime.playback.rounds.every((_,index)=>finalAttempt.successfulRounds.has(index+1))) {
          finalAttempt.active=false;runtime.playback.roundBoard?.pulseCompleteChain?.();
          global.setTimeout(()=>{if(state.practiceGuideStage==='final-practice'&&finalAttempt.valid)rewardSuccess('final-song',completeTutorial);},520);
        }
      }
    });
    global.addEventListener('play12:practice-wrong-input', event => {
      resetMetronomeSeries();
      const n=runtime?.playback?.rounds.findIndex(r=>(event.detail?.expectedStart??runtime.playback.clock.position)>=r.start&&(event.detail?.expectedStart??runtime.playback.clock.position)<r.end)+1;
      if(n>0){visualAttempt.invalid.add(n);runtime.playback.roundBoard?.setRoundSuccess?.(n,false);}
      if (state.practiceGuideStage === 'round-practice') {invalidateRoundTraining();visualAttempt.active=false;}
      else if (state.practiceGuideStage === 'final-practice' && finalAttempt.active) { visualAttempt.active=false;finalAttempt.valid=false;finalAttempt.successfulRounds.clear();runtime?.playback?.roundBoard?.clearTrainingSuccess?.(); }
    });
    global.addEventListener('play12:practice-interruption', () => {
      resetMetronomeSeries();metronomeAttempt.active=false;visualAttempt.active=false;
      if (state.practiceGuideStage === 'round-practice') invalidateRoundTraining();
      else if (state.practiceGuideStage === 'final-practice') { finalAttempt={active:false,valid:false,successfulRounds:new Set()};runtime?.playback?.roundBoard?.clearTrainingSuccess?.(); }
    });
    global.addEventListener('play12:practice-loop-complete', event => {
      if (state.onboardingStep !== 'TRY_IT_YOURSELF' || state.practiceGuideStage !== 'round-practice') return;
      if (roundTraining.feedbackPending) return;
      const detail = event.detail || {};
      if (detail.practice !== true || detail.from !== 1 || detail.to !== 3) { invalidateRoundTraining(); return; }
      if (!roundTraining.valid) invalidateRoundTraining();
      if(state.roundPasses===1&&!roundTraining.started){roundTraining.preparingNext=true;runtime.playback.roundBoard?.clearTrainingSuccess?.();updatePassCaption();}
    });

    global.addEventListener('play12:practice-input-rejected',()=>{if(metronomeAttempt.active)resetMetronomeSeries();});

    const changePracticeSetting = (key, button, applied=false) => {
      if (!runtime) return;
      const current = runtime.playback.getPracticeSettings();
      if (!applied && !runtime.playback.setPracticeSettings({ [key]: !current[key] })) {
        button.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 220 });
        return;
      }
      visualAttempt.active=false;runtime.playback.roundBoard?.clearTrainingSuccess?.();resetMetronomeSeries();metronomeAttempt.active=false;
      const settings=runtime.playback.getPracticeSettings();
      Object.assign(state, settings);
      saveState(storage, state);
      if(state.practiceGuideStage==='enable'&&key==='practiceModeEnabled'&&settings.practiceModeEnabled)
        rewardSuccess('practice-enable',()=>setGuideStage('hand'));
      if(state.practiceGuideStage==='hand'&&key==='practiceLeftHandEnabled'&&settings.practiceModeEnabled&&settings.practiceRightHandEnabled&&!settings.practiceLeftHandEnabled)
        rewardSuccess('practice-hand',()=>setGuideStage('ready'));
      syncPracticeGuide();
    };




    const connectRuntime = nextRuntime => {
      runtime = nextRuntime;
      if(resetRuntimeOnConnect){runtime.resetLearningSetup?.();resetRuntimeOnConnect=false;}
      practiceBindingDispose?.();
      practiceBindingDispose=global.Play12TrainingShell.bindPractice({playback:runtime.playback,root:practiceBoard,onChange:(_state,key)=>changePracticeSetting(key,({practiceModeEnabled:practiceModeButton,practiceLeftHandEnabled:leftHandButton,practiceRightHandEnabled:rightHandButton})[key],true),onReject:button=>button.animate([{transform:'translateX(0)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}],{duration:220})});
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
          if(state.practiceGuideStage==='metronome-playing'&&metronomeAttempt.active&&!snapshot.running&&snapshot.state!=='waiting_for_input'&&snapshot.state!=='count-in'){resetMetronomeSeries();metronomeAttempt.active=false;}
          if (state.practiceGuideStage === 'final-practice') {
            const active = snapshot.running || snapshot.state === 'waiting_for_input';
            if (finalAttempt.active && snapshot.ended) {
              const allRounds = runtime.playback.rounds.every((_,index)=>finalAttempt.successfulRounds.has(index+1));
              if (finalAttempt.valid && allRounds && finalPracticeSettingsReady()) {
                finalAttempt.active=false;runtime.playback.roundBoard?.pulseCompleteChain?.();
                global.setTimeout(()=>{if(state.practiceGuideStage==='final-practice'&&finalAttempt.valid)rewardSuccess('final-song',completeTutorial);},520);
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
          if ((state.practiceGuideStage === 'ready' && finalPracticeSettingsReady()) && (snapshot.running || snapshot.state === 'waiting_for_input')) {
            clearHints();
            state.practiceGuideStage = 'playing';
            saveState(storage, state);
          }
          if (state.practiceGuideStage === 'playing' && snapshot.ended && runtime.playback.practiceEnabled()) {
            rewardSuccess('practice-song',() => {
              state.practiceGuideStage = state.metronomeUnlocked ? (state.roundUnlocked ? 'free' : 'round-info') : (state.introducedPanels?.metronome?'metronome-on':'metronome-info');
              if (state.practiceGuideStage === 'round-info') state.roundUnlocked = true;
              state.metronomeUnlocked = true; syncProgress(); saveState(storage, state); syncPracticeGuide();
            });
          }
          if (state.practiceGuideStage === 'metronome-play' && (snapshot.running || snapshot.state === 'waiting_for_input')) {
            clearHints(); state.practiceGuideStage = 'metronome-playing'; saveState(storage, state);
          }
          if (state.practiceGuideStage === 'metronome-playing' && snapshot.ended) {resetMetronomeSeries();metronomeAttempt.active=false;}
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
          return;
        }
        syncListenCopy();
      }) || null;
      if (resumeRequested) {
        if (state.onboardingStep === 'TRY_IT_YOURSELF') restorePracticeSettings();
        runtime.restoreLearningSetup?.();
        if (state.onboardingStep === 'CHOOSE_ZERO' && ['select','confirm'].includes(state.zeroSetupStage)) global.dispatchEvent(new CustomEvent('play12:choose-zero-open'));
        recoverMidi();
      }
      if(global.__PLAY12_TUTORIAL_LOCALE_RESUME__){global.__PLAY12_TUTORIAL_LOCALE_RESUME__=false;continueSession();}
      // Restored lesson progress is data, not the visible screen. Do not mount
      // TrainingZones or its dock while the user is still choosing Start/Continue.
      if (visibleStep === 'MIDI_CONNECT') movePianoToOnboarding();
      if (visibleStep === 'LISTEN_AND_CONTROL' || visibleStep === 'CHOOSE_ZERO' || visibleStep === 'TRY_IT_YOURSELF' || visibleStep === 'ONBOARDING_COMPLETE') {
        moveStageToOnboarding();
        // A user can choose Continue before the asynchronous score is ready.
        // Mounting must retain the lesson's existing visibility/unlock decisions.
        syncProgress();
        if (visibleStep === 'TRY_IT_YOURSELF') syncPracticeGuide();
      }
      if (visibleStep === 'CHOOSE_ZERO' && new URLSearchParams(location.search).get('onboardingPreview') === 'choose-zero') {
        global.dispatchEvent(new CustomEvent('play12:choose-zero-open'));
      }
    };

    document.body.classList.remove('play12-onboarding-boot');
    document.body.classList.add('play12-onboarding-active');
    continueButton.hidden = !returning;
    startButton.textContent=t('Start over');
    continueButton.textContent=t('Continue');
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
      const ordinary=['TRY_IT_YOURSELF','ONBOARDING_COMPLETE'].includes(state.onboardingStep);
      returnAfterZero ||= {destination:ordinary?'ordinary':state.onboardingStep==='TRY_IT_YOURSELF'?'practice':'onboarding',practiceGuideStage:state.practiceGuideStage};
      // Ordinary zero changes suspend the visible coach, not its information
      // timer; cancelling that timer would strand the current lesson.
      if(ordinary)listenCoach.hidden=true;else hideHint(listenCoach);
      spotlight.stop();exposeState();
      const chooser=document.getElementById('zero-chooser');if(!chooser)return;
      chooser.hidden=false;
      if(ordinary)return;
      state.zeroSetupStage='select';saveState(storage,state);
      document.getElementById('zero-prompt').textContent=t('Now press a comfortable key on your keyboard, or select one on the on-screen piano.');
      showHint(chooser,`zero-selection:${++zeroHintSequence}`);clearTimeout(hintTimers.get(chooser));hintTimers.delete(chooser);chooser.classList.remove('has-dismiss-timer');spotlightHint(chooser,'zero-keyboard');
    });
    global.addEventListener('play12:zero-ui-candidate', () => {
      if(returnAfterZero?.destination==='ordinary')return;
      state.zeroSetupStage='confirm';saveState(storage,state);
      const chooser=document.getElementById('zero-chooser');if(!chooser)return;
      hideHint(chooser);showHint(chooser,`zero-confirmation:${++zeroHintSequence}`);clearTimeout(hintTimers.get(chooser));hintTimers.delete(chooser);chooser.classList.remove('has-dismiss-timer');spotlightHint(chooser,'use-zero');
    });
    global.addEventListener('play12:choose-zero-close', () => {
      returnAfterZero=null;exposeState();const chooser=document.getElementById('zero-chooser');if(chooser)hideHint(chooser);
    });
    global.addEventListener('pagehide',()=>{
      if(cardGeometryFrame)global.cancelAnimationFrame(cardGeometryFrame);
      document.removeEventListener?.('click',armUserPlay,true);document.removeEventListener?.('keydown',armUserPlay,true);
      spotlight.stop();alignedLayout?.dispose();
      for(const timer of hintTimers.values())global.clearTimeout(timer);
      hintTimers.clear();global.clearTimeout(ok12Timer);global.clearTimeout(completionCardTimer);
      practiceBindingDispose?.();removeNoteListener?.();removeMidiStatusListener?.();removeMidiInputInterceptor?.();removeCalibrationListener?.();removePlaybackStateListener?.();
    },{once:true});
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

