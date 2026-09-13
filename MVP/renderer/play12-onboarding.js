(function (global) {
  'use strict';

  const STEPS = Object.freeze([
    'WELCOME',
    'MIDI_CONNECT',
    'CHOOSE_ZERO',
    'AUDIO_CHECK',
    'LEARN_PLAY',
    'LEARN_PAUSE',
    'LEARN_TEMPO',
    'LEARN_METRONOME',
    'RIGHT_HAND_PLAY',
    'TEMPO_CHECK',
    'LEARN_LOOP',
    'LEFT_HAND_PLAY',
    'BOTH_HANDS_PLAY',
    'ONBOARDING_COMPLETE'
  ]);

  const STORAGE_KEYS = Object.freeze({
    state: 'play12.onboarding.state.v1',
    sessionExists: 'play12.session.exists.v1'
  });

  const EXISTING_SESSION_KEYS = Object.freeze([
    'play12.zero_note.midi',
    'play12.zero_note.pitch_class',
    'play12.loop-gap',
    'play12.metronome-volume'
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
        lastSessionExists: true
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
    const savedState = readSavedState(storage);
    const returning = hasExistingSession(storage);
    let state = savedState || {
      onboardingStarted: false,
      onboardingStep: 'WELCOME',
      onboardingCompleted: false,
      lastSessionExists: returning
    };

    const exposeState = () => {
      root.dataset.onboardingStarted = String(state.onboardingStarted);
      root.dataset.onboardingStep = state.onboardingStep;
      root.dataset.onboardingCompleted = String(state.onboardingCompleted);
      root.dataset.lastSessionExists = String(state.lastSessionExists);
    };

    const showMvp = () => {
      root.hidden = true;
      document.body.classList.remove('play12-onboarding-boot', 'play12-onboarding-active');
      document.body.classList.add('play12-onboarding-dismissed');
    };

    const startNew = () => {
      state = {
        onboardingStarted: true,
        onboardingStep: 'MIDI_CONNECT',
        onboardingCompleted: false,
        lastSessionExists: true
      };
      saveState(storage, state);
      exposeState();
      showMvp();
      return { ...state };
    };

    const continueSession = () => {
      const restored = readSavedState(storage);
      if (restored) state = restored;
      else state = { ...state, lastSessionExists: true };
      saveState(storage, state);
      exposeState();
      showMvp();
      return { ...state };
    };

    document.body.classList.remove('play12-onboarding-boot');
    document.body.classList.add('play12-onboarding-active');
    continueButton.hidden = !returning;
    exposeState();
    startButton.addEventListener('click', startNew);
    continueButton.addEventListener('click', continueSession);

    return Object.freeze({
      steps: STEPS,
      storageKeys: STORAGE_KEYS,
      getState: () => ({ ...state }),
      startNew,
      continueSession
    });
  }

  global.Play12Onboarding = Object.freeze({ STEPS, STORAGE_KEYS, create });
})(window);
