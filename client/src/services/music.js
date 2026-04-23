// Web Audio API procedural music engine
// All synthesis happens locally; socket sync keeps beats aligned across clients

const TRACKS = {
  hype: { bpm: 128, name: 'Hype' },
  chill: { bpm: 90, name: 'Chill' },
  tension: { bpm: 140, name: 'Tension' },
};

class MusicEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.playing = false;
    this.currentTrack = 'hype';
    this.bpm = 128;
    this.beatCallbacks = [];
    this._schedulerTimer = null;
    this._nextBeatTime = 0;
    this._beatCount = 0;
    this._nodes = [];
    this._volume = 0.5;
  }

  _ensureCtx() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this._volume;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  _stopNodes() {
    for (const n of this._nodes) {
      try { n.stop(); } catch (_) {}
    }
    this._nodes = [];
    if (this._schedulerTimer) { clearTimeout(this._schedulerTimer); this._schedulerTimer = null; }
  }

  _scheduleKick(time) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.connect(this.masterGain);
    gain.gain.setValueAtTime(1.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.18);
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + 0.35);
    this._nodes.push(osc);
  }

  _scheduleSnare(time) {
    const ctx = this.ctx;
    const bufSize = ctx.sampleRate * 0.12;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.masterGain);
    src.start(time);
    src.stop(time + 0.12);
    this._nodes.push(src);
  }

  _scheduleHihat(time, open = false) {
    const ctx = this.ctx;
    const bufSize = ctx.sampleRate * (open ? 0.18 : 0.04);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 8000;
    bp.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.28, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + bufSize / ctx.sampleRate);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.masterGain);
    src.start(time);
    src.stop(time + bufSize / ctx.sampleRate + 0.01);
    this._nodes.push(src);
  }

  _scheduleBass(time, note, duration) {
    const ctx = this.ctx;
    const freqs = { C: 65.4, D: 73.4, E: 82.4, F: 87.3, G: 98.0, A: 110, Bb: 116.5, B: 123.5 };
    const freq = freqs[note] || 65.4;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, time);
    lp.frequency.linearRampToValueAtTime(800, time + 0.04);
    lp.frequency.exponentialRampToValueAtTime(200, time + duration * 0.8);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, time);
    gain.gain.linearRampToValueAtTime(0.45, time + 0.01);
    gain.gain.setValueAtTime(0.45, time + duration * 0.7);
    gain.gain.linearRampToValueAtTime(0.0, time + duration);

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + duration + 0.01);
    this._nodes.push(osc);
  }

  _schedulePad(time, duration) {
    const ctx = this.ctx;
    const chordFreqs = [261.6, 329.6, 392.0]; // C maj
    for (const freq of chordFreqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.08, time + 0.5);
      gain.gain.setValueAtTime(0.08, time + duration - 0.5);
      gain.gain.linearRampToValueAtTime(0, time + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + duration + 0.01);
      this._nodes.push(osc);
    }
  }

  _beatDuration() {
    return 60 / this.bpm;
  }

  _scheduleBar(barStart, track) {
    const bd = this._beatDuration();
    const sub = bd / 2; // 8th note

    if (track === 'hype') {
      // 4-on-the-floor kick
      for (let b = 0; b < 4; b++) this._scheduleKick(barStart + b * bd);
      // Snare on 2 and 4
      this._scheduleSnare(barStart + bd);
      this._scheduleSnare(barStart + 3 * bd);
      // 16th hi-hats
      for (let s = 0; s < 8; s++) this._scheduleHihat(barStart + s * sub, s === 6);
      // Bass arp: C C E G C E G C
      const bassNotes = ['C', 'C', 'E', 'G', 'C', 'E', 'G', 'C'];
      for (let s = 0; s < 8; s++) this._scheduleBass(barStart + s * sub, bassNotes[s], sub * 0.8);

    } else if (track === 'chill') {
      // Kick on 1 and 3
      this._scheduleKick(barStart);
      this._scheduleKick(barStart + 2 * bd);
      // Snare on 3
      this._scheduleSnare(barStart + 2 * bd);
      // Sparse hi-hat
      this._scheduleHihat(barStart, true);
      this._scheduleHihat(barStart + 2 * bd, true);
      // Pad chord whole bar
      this._schedulePad(barStart, 4 * bd);
      // Slow bass: C . G .
      this._scheduleBass(barStart, 'C', bd * 1.8);
      this._scheduleBass(barStart + 2 * bd, 'G', bd * 1.8);

    } else { // tension
      // Driving kick every beat + offbeats
      for (let b = 0; b < 4; b++) {
        this._scheduleKick(barStart + b * bd);
        this._scheduleKick(barStart + b * bd + sub * 0.75);
      }
      // Snare rolls on 3 and 4
      for (let s = 4; s < 8; s++) this._scheduleSnare(barStart + s * sub);
      // 16th hi-hats tight
      for (let s = 0; s < 8; s++) this._scheduleHihat(barStart + s * sub);
      // Staccato bass: C Bb G F C Bb G F
      const notes = ['C', 'Bb', 'G', 'F', 'C', 'Bb', 'G', 'F'];
      for (let s = 0; s < 8; s++) this._scheduleBass(barStart + s * sub, notes[s], sub * 0.5);
    }
  }

  _scheduler() {
    const ctx = this.ctx;
    const bd = this._beatDuration();
    const barDuration = bd * 4;
    const lookahead = 0.2;

    while (this._nextBeatTime < ctx.currentTime + lookahead) {
      const barIndex = this._beatCount;
      this._scheduleBar(this._nextBeatTime, this.currentTrack);

      // Fire beat callbacks on the beat (approximate via setTimeout)
      const delay = Math.max(0, (this._nextBeatTime - ctx.currentTime) * 1000);
      setTimeout(() => {
        for (const cb of this.beatCallbacks) cb(barIndex);
      }, delay);

      this._nextBeatTime += barDuration;
      this._beatCount++;
    }

    this._schedulerTimer = setTimeout(() => this._scheduler(), 100);
  }

  start(track, startedAt) {
    this._ensureCtx();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this._stopNodes();
    this.currentTrack = track || 'hype';
    this.bpm = TRACKS[this.currentTrack]?.bpm || 128;
    this.playing = true;

    const now = this.ctx.currentTime;
    if (startedAt) {
      // Sync to wall clock: calculate how far into the pattern we are
      const elapsed = (Date.now() - startedAt) / 1000;
      const barDuration = (60 / this.bpm) * 4;
      const barsElapsed = elapsed / barDuration;
      const fractionalBar = barsElapsed % 1;
      // Start at beginning of next bar
      this._nextBeatTime = now + barDuration * (1 - fractionalBar);
      this._beatCount = Math.floor(barsElapsed) + 1;
    } else {
      this._nextBeatTime = now + 0.05;
      this._beatCount = 0;
    }

    this._scheduler();
  }

  stop() {
    this._stopNodes();
    this.playing = false;
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this._volume;
  }

  onBeat(cb) {
    this.beatCallbacks.push(cb);
    return () => { this.beatCallbacks = this.beatCallbacks.filter(c => c !== cb); };
  }

  getAnalyserData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }
}

export const music = new MusicEngine();
export const TRACK_LIST = Object.entries(TRACKS).map(([id, t]) => ({ id, ...t }));
