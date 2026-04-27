import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_RATE = 1.22;
const DEFAULT_PITCH = 1;
const DEFAULT_VOLUME = 1;

function canSpeak() {
  return typeof window !== 'undefined' && window.speechSynthesis && window.SpeechSynthesisUtterance;
}

function makeUtterance(text, options = {}) {
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.rate = options.rate ?? DEFAULT_RATE;
  utterance.pitch = options.pitch ?? DEFAULT_PITCH;
  utterance.volume = options.volume ?? DEFAULT_VOLUME;
  return utterance;
}

export function useGameAnnouncer({ rate = DEFAULT_RATE } = {}) {
  const spokenKeysRef = useRef(new Set());
  const queueRef = useRef([]);
  const speakingRef = useRef(false);

  const cancel = useCallback(() => {
    if (!canSpeak()) return;
    queueRef.current = [];
    speakingRef.current = false;
    window.speechSynthesis.cancel();
  }, []);

  const speakNext = useCallback(() => {
    if (!canSpeak()) return;
    if (speakingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    speakingRef.current = true;
    const utterance = makeUtterance(next.text, { rate: next.rate ?? rate, pitch: next.pitch, volume: next.volume });
    utterance.onend = () => {
      speakingRef.current = false;
      speakNext();
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      speakNext();
    };
    window.speechSynthesis.speak(utterance);
  }, [rate]);

  const speak = useCallback((text, key, options = {}) => {
    if (!text) return false;
    if (!canSpeak()) {
      if (options.debug) console.info('Audio narration unavailable', text);
      return false;
    }
    if (key && spokenKeysRef.current.has(key)) return false;
    if (key) spokenKeysRef.current.add(key);
    if (options.interrupt) {
      queueRef.current = [];
      speakingRef.current = false;
      window.speechSynthesis.cancel();
    }
    queueRef.current.push({ text, ...options });
    speakNext();
    return true;
  }, [speakNext]);

  const speakSequence = useCallback((items, key, options = {}) => {
    if (!Array.isArray(items) || items.length === 0) return false;
    if (key && spokenKeysRef.current.has(key)) return false;
    if (key) spokenKeysRef.current.add(key);
    if (!canSpeak()) {
      if (options.debug) console.info('Audio narration unavailable', items.join(' '));
      return false;
    }
    if (options.interrupt) {
      queueRef.current = [];
      speakingRef.current = false;
      window.speechSynthesis.cancel();
    }
    for (const text of items.filter(Boolean)) {
      queueRef.current.push({ text, ...options });
    }
    speakNext();
    return true;
  }, [speakNext]);

  const resetKey = useCallback((keyPrefix) => {
    if (!keyPrefix) return;
    for (const key of [...spokenKeysRef.current]) {
      if (String(key).startsWith(keyPrefix)) spokenKeysRef.current.delete(key);
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  return { speak, speakSequence, cancel, resetKey };
}

export function useAudioTurnAnnouncement({ announcer, gameKey, turnKey, playerName, isMyTurn, actionLabel = 'turn', enabled = true }) {
  useEffect(() => {
    if (!enabled || !announcer || !turnKey || !playerName) return;
    const who = isMyTurn ? `Your ${actionLabel}` : `${playerName}'s ${actionLabel}`;
    announcer.speak(who, `${gameKey}:turn:${turnKey}`, { interrupt: false });
  }, [announcer, gameKey, turnKey, playerName, isMyTurn, actionLabel, enabled]);
}

export function useAudioTimeWarnings({ announcer, gameKey, timerKey, secondsLeft, thresholds = [30, 10], enabled = true }) {
  const lastTimerKeyRef = useRef(null);
  const warnedRef = useRef(new Set());

  useEffect(() => {
    if (lastTimerKeyRef.current !== timerKey) {
      lastTimerKeyRef.current = timerKey;
      warnedRef.current = new Set();
    }
    if (!enabled || !announcer || !timerKey || typeof secondsLeft !== 'number') return;
    for (const threshold of thresholds) {
      const warningKey = `${timerKey}:${threshold}`;
      if (secondsLeft <= threshold && secondsLeft > threshold - 2 && !warnedRef.current.has(warningKey)) {
        warnedRef.current.add(warningKey);
        announcer.speak(`${threshold} seconds left. Time is running out.`, `${gameKey}:time:${warningKey}`, { interrupt: true, rate: 1.28 });
      }
    }
  }, [announcer, gameKey, timerKey, secondsLeft, thresholds, enabled]);
}

export function formatCardsForSpeech(cards = []) {
  if (!cards.length) return 'no card';
  if (cards.length === 1) return cards[0]?.text || 'blank card';
  return cards.map((card, index) => `pick ${index + 1}: ${card?.text || 'blank card'}`).join('. ');
}
