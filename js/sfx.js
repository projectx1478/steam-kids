// Web Audio APIで合成する効果音。音声ファイル・BGMなし（Issue #54）。
// 単一API play(name, opts)。optsは stack の count、step の index のみ使用する。
const STORAGE_KEY = 'steamkids.sound';
const MASTER_VOLUME = 0.3;

// 各音の長さ上限（ms）。PROJECT.mdの表に合わせる。
export const DURATIONS_MS = {
  tap: 80,
  stack: 120,
  remove: 120,
  run: 300,
  step: 150,
  bump: 250,
  pickup: 200,
  reveal: 200,
  clear: 1200,
  whoosh: 200,
};

const SCALE = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77]; // ドレミファソラシ(C5基準)

let audioCtx = null;
let masterGain = null;
let muted = loadInitialMuted();

function loadInitialMuted() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'on') return false;
  if (stored === 'off') return true;
  return new URLSearchParams(location.search).get('sound') === 'off';
}

function ensureContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = MASTER_VOLUME;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

document.addEventListener(
  'pointerdown',
  () => {
    const ctx = ensureContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  },
  { once: true }
);

window.__sfxLog = window.__sfxLog || [];

export function isMuted() {
  return muted;
}

export function setMuted(next) {
  muted = next;
  localStorage.setItem(STORAGE_KEY, next ? 'off' : 'on');
}

// initSoundToggle(button): ミュート切替ボタンの配線。dataset.mutedをDOM判定用に反映する。
export function initSoundToggle(button) {
  const sync = () => {
    button.dataset.muted = String(muted);
    button.setAttribute('aria-pressed', String(!muted));
  };
  sync();
  button.addEventListener('click', () => {
    setMuted(!muted);
    sync();
  });
}

function tone(ctx, start, { freq, freqEnd, duration, type = 'sine', peak = 1 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd) osc.frequency.linearRampToValueAtTime(freqEnd, start + duration);

  const gain = ctx.createGain();
  const attack = Math.min(0.012, duration / 4);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.linearRampToValueAtTime(0, start + duration);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noiseSweep(ctx, start, { duration, freqStart, freqEnd, peak = 1 }) {
  const bufferSize = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1;
  filter.frequency.setValueAtTime(freqStart, start);
  filter.frequency.linearRampToValueAtTime(freqEnd, start + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.02);
  gain.gain.linearRampToValueAtTime(0, start + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  src.start(start);
  src.stop(start + duration + 0.02);
}

const SOUND = {
  tap(ctx, now) {
    tone(ctx, now, { freq: 880, duration: 0.08, type: 'sine' });
  },
  stack(ctx, now, opts) {
    const count = opts.count ?? 2;
    const freq = 660 * 2 ** ((count - 2) / 12);
    tone(ctx, now, { freq, duration: 0.04, type: 'sine' });
    tone(ctx, now + 0.05, { freq: freq * 1.05, duration: 0.05, type: 'sine' });
  },
  remove(ctx, now) {
    tone(ctx, now, { freq: 500, freqEnd: 300, duration: 0.12, type: 'sine' });
  },
  run(ctx, now) {
    tone(ctx, now, { freq: 400, freqEnd: 900, duration: 0.3, type: 'triangle', peak: 0.8 });
  },
  step(ctx, now, opts) {
    const idx = opts.index ?? 0;
    const octave = Math.floor(idx / SCALE.length);
    const freq = SCALE[idx % SCALE.length] * 2 ** octave;
    tone(ctx, now, { freq, duration: 0.15, type: 'sine' });
  },
  bump(ctx, now) {
    // ブザー禁止: 矩形波・鋸波は使わず、柔らかいsineで下降させる
    tone(ctx, now, { freq: 300, freqEnd: 200, duration: 0.25, type: 'sine', peak: 0.6 });
  },
  pickup(ctx, now) {
    tone(ctx, now, { freq: 900, duration: 0.08, type: 'sine' });
    tone(ctx, now + 0.08, { freq: 1200, duration: 0.12, type: 'sine' });
  },
  reveal(ctx, now) {
    // 一致・不一致で同じ音（正誤を音で示さない）
    tone(ctx, now, { freq: 600, duration: 0.2, type: 'sine', peak: 0.8 });
  },
  clear(ctx, now) {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // ド・ミ・ソ・ド
    notes.forEach((freq, i) => tone(ctx, now + i * 0.3, { freq, duration: 0.28, type: 'sine' }));
  },
  whoosh(ctx, now) {
    noiseSweep(ctx, now, { duration: 0.2, freqStart: 3000, freqEnd: 600, peak: 0.5 });
  },
};

export function play(name, opts = {}) {
  if (muted) return;
  window.__sfxLog.push(name);
  const ctx = ensureContext();
  SOUND[name]?.(ctx, ctx.currentTime, opts);
}
