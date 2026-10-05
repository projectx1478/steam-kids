// Web Audio APIで合成する効果音。音声ファイル・BGMなし（Issue #54）。
// 単一API play(name, opts)。optsは stack の count、step の index のみ使用する。
const STORAGE_KEY = 'steamkids.sound';
const MASTER_VOLUME = 0.3;

// 各音の長さ上限（ms）。PROJECT.mdの表に合わせる。
export const DURATIONS_MS = {
  tap: 50,
  snap: 30,
  stack: 120,
  remove: 120,
  reset: 80,
  run: 300,
  step: 150,
  slide: 150,
  tryAgain: 500,
  bump: 1350,
  cushion: 200,
  pickup: 200,
  itemsLeft: 300,
  pickupLast: 450,
  key: 450,
  door: 400,
  wallSink: 600,
  reveal: 200,
  clear: 460,
  whoosh: 200,
  fanfare: 860,
  lessonClear: 860,
  grandFanfare: 2030,
  start: 100,
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

function tone(ctx, start, { freq, freqEnd, duration, type = 'sine', peak = 1, exp = false }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd) osc.frequency.linearRampToValueAtTime(freqEnd, start + duration);

  const gain = ctx.createGain();
  const attack = Math.min(0.012, duration / 4);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  // exp: 金属・衝撃の余韻用に指数減衰（直線減衰より消え際が自然。Issue #158）
  if (exp) gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  else gain.gain.linearRampToValueAtTime(0, start + duration);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noiseSweep(ctx, start, { duration, freqStart, freqEnd, peak = 1, q = 1 }) {
  const bufferSize = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
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

// ringTone: 金属の余韻。非整数倍のsine部分音を指数減衰させ、amRateHzのAMで揺らす（Issue #158）。
function ringTone(ctx, start, { freq, duration, peak, amRate }) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  if (amRate) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = amRate;
    const depth = ctx.createGain();
    depth.gain.value = peak * 0.4;
    lfo.connect(depth);
    depth.connect(gain.gain);
    lfo.start(start);
    lfo.stop(start + duration + 0.02);
  }

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// metalClick: 金属同士が当たる小さなクリック音。peakで音量倍率を調整する（Issue #158）。
function metalClick(ctx, start, peak = 1) {
  noiseSweep(ctx, start, { duration: 0.025, freqStart: 4000, freqEnd: 4000, peak: 1.6 * peak, q: 1.5 });
  tone(ctx, start, { freq: 2900, duration: 0.05, peak: 0.7 * peak });
  tone(ctx, start, { freq: 4300, duration: 0.04, peak: 0.4 * peak });
}

const SOUND = {
  tap(ctx, now) {
    tone(ctx, now, { freq: 400, freqEnd: 800, duration: 0.05, type: 'sine' });
  },
  // snap: ドラッグで命令列に吸着した時の音（Issue #95）。
  snap(ctx, now) {
    tone(ctx, now, { freq: 1200, duration: 0.03, type: 'triangle', peak: 0.9 });
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
  // reset: ぜんぶ けす専用の音。removeより速いピッチダウンで「一気に戻した」感を出す（Issue #95）。
  reset(ctx, now) {
    tone(ctx, now, { freq: 450, freqEnd: 150, duration: 0.08, type: 'sine', peak: 0.7 });
  },
  run(ctx, now) {
    tone(ctx, now, { freq: 400, freqEnd: 900, duration: 0.3, type: 'triangle', peak: 0.8 });
  },
  // tryAgain: 未達成（未到達。取り残しはitemsLeft・壁はbump）で鳴らす「しょんぼり」の下降3音。
  // ブザーではなく罰則感を出さない（Issue #106）。triangleの下降メロディでbump（金属のガツン）と
  // 聞き分ける（Issue #158）。〜300Hzはタブレットのスピーカーで鳴らないため高域にする。
  tryAgain(ctx, now) {
    [783.99, 659.25, 523.25].forEach((freq, i) =>
      tone(ctx, now + i * 0.14, { freq, duration: 0.18, type: 'triangle', peak: 0.5 })
    );
  },
  step(ctx, now, opts) {
    const idx = opts.index ?? 0;
    const octave = Math.floor(idx / SCALE.length);
    const freq = SCALE[idx % SCALE.length] * 2 ** octave;
    tone(ctx, now, { freq, duration: 0.15, type: 'sine' });
  },
  // slide: こおりの上を滑っている間の1マス分の音。stepと区別できる高めの上昇スイープ。
  slide(ctx, now) {
    tone(ctx, now, { freq: 1200, freqEnd: 1800, duration: 0.15, type: 'triangle', peak: 0.6 });
  },
  // bump: 壁衝突の「ガツン」。バンドパスノイズ＋低いsineの指数減衰で衝撃を出し、非整数倍の
  // 部分音＋6HzのAMで金属の余韻「キーン」を出す。+0.45sからぴよぴよ（高いtriangleの上下）で
  // 目を回す様子を添える。ブザー禁止（矩形波・鋸波は使わない。Issue #158）。
  bump(ctx, now) {
    noiseSweep(ctx, now, { duration: 0.06, freqStart: 3000, freqEnd: 3000, peak: 0.9 });
    noiseSweep(ctx, now, { duration: 0.09, freqStart: 900, freqEnd: 900, peak: 0.7 });
    tone(ctx, now, { freq: 700, freqEnd: 350, duration: 0.15, peak: 0.8, exp: true });
    tone(ctx, now, { freq: 160, freqEnd: 80, duration: 0.2, peak: 0.7, exp: true });
    [430, 1130, 1890, 2670, 3520].forEach((freq, i) =>
      ringTone(ctx, now, { freq, duration: 0.9 - 0.1 * i, peak: [1, 0.8, 0.55, 0.4, 0.25][i] * 0.6, amRate: 6 })
    );
    for (let n = 0; n < 4; n += 1) {
      const t = now + 0.45 + n * 0.22;
      tone(ctx, t, { freq: 1500, freqEnd: 1900, duration: 0.1, type: 'triangle', peak: 0.5 });
      tone(ctx, t + 0.1, { freq: 1900, freqEnd: 1500, duration: 0.1, type: 'triangle', peak: 0.5 });
    }
  },
  // cushion: クッションにぽよんと当たった音。失敗ではないので、bumpより高く軽い上下の丸い音。
  cushion(ctx, now) {
    tone(ctx, now, { freq: 420, freqEnd: 620, duration: 0.1, type: 'sine', peak: 0.6 });
    tone(ctx, now + 0.1, { freq: 620, freqEnd: 400, duration: 0.1, type: 'sine', peak: 0.5 });
  },
  pickup(ctx, now) {
    tone(ctx, now, { freq: 900, duration: 0.08, type: 'sine' });
    tone(ctx, now + 0.08, { freq: 1200, duration: 0.12, type: 'sine' });
  },
  // itemsLeft: どんぐり取り残しの「コロン、コロン」。2回目は0.16s後（Issue #158）。
  itemsLeft(ctx, now) {
    [0, 0.16].forEach((t) => {
      tone(ctx, now + t, { freq: 1000, freqEnd: 700, duration: 0.12, peak: 0.7 });
      tone(ctx, now + t, { freq: 1500, duration: 0.09, peak: 0.4 });
    });
  },
  // pickupLast: 最後の1個の回収。pickupに3音のちょっとした達成感を添える（Issue #158）。
  pickupLast(ctx, now) {
    SOUND.pickup(ctx, now);
    [1568, 1976, 2349].forEach((freq, i) =>
      tone(ctx, now + 0.2 + i * 0.06, { freq, duration: 0.12, peak: 0.6 })
    );
  },
  // key: かぎ取得の「チャリン」。高いsineをずらして重ね、指数減衰で鳴らす（Issue #158）。
  key(ctx, now) {
    tone(ctx, now, { freq: 2400, duration: 0.3, peak: 0.7, exp: true });
    tone(ctx, now, { freq: 3600, duration: 0.25, peak: 0.4, exp: true });
    tone(ctx, now + 0.06, { freq: 1800, duration: 0.35, peak: 0.5, exp: true });
  },
  // door: ドア開放の「ガチャッ→キィ」。ラッチのノイズ→金属クリック→上昇のきしみ（Issue #158）。
  door(ctx, now) {
    noiseSweep(ctx, now, { duration: 0.05, freqStart: 1200, freqEnd: 1200, peak: 1.6 });
    tone(ctx, now, { freq: 650, freqEnd: 390, duration: 0.08, peak: 0.9, exp: true });
    metalClick(ctx, now + 0.07, 0.9);
    tone(ctx, now + 0.12, { freq: 1400, freqEnd: 1900, duration: 0.22, peak: 0.3 });
  },
  // wallSink: スイッチ踏下で壁が沈む音。金属クリック→沈み込むノイズ→着地の「コトン」（Issue #158）。
  wallSink(ctx, now) {
    metalClick(ctx, now, 1.3);
    noiseSweep(ctx, now + 0.08, { duration: 0.35, freqStart: 1400, freqEnd: 500, peak: 0.7, q: 1.2 });
    tone(ctx, now + 0.08, { freq: 900, freqEnd: 450, duration: 0.35, peak: 0.35 });
    tone(ctx, now + 0.45, { freq: 700, freqEnd: 420, duration: 0.1, peak: 0.8, exp: true });
    noiseSweep(ctx, now + 0.45, { duration: 0.05, freqStart: 1500, freqEnd: 1500, peak: 0.8 });
  },
  reveal(ctx, now) {
    // 一致・不一致で同じ音（正誤を音で示さない）
    tone(ctx, now, { freq: 600, duration: 0.2, type: 'sine', peak: 0.8 });
  },
  clear(ctx, now) {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // ド・ミ・ソ・ド
    notes.forEach((freq, i) => tone(ctx, now + i * 0.08, { freq, duration: 0.2, type: 'sine' }));
  },
  whoosh(ctx, now) {
    noiseSweep(ctx, now, { duration: 0.2, freqStart: 3000, freqEnd: 600, peak: 0.5 });
  },
  // fanfare: ステージクリアで鳴らす、clearより長い達成音（Issue #104）。
  // 音階をかけあがり（ド〜シ）、高いドと高いミを重ねてのばす（Issue #268で分散和音から変更）。
  fanfare(ctx, now) {
    const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77]; // ド・レ・ミ・ファ・ソ・ラ・シ
    scale.forEach((freq, i) => tone(ctx, now + i * 0.07, { freq, duration: 0.14, type: 'sine', peak: 0.89 }));
    tone(ctx, now + 0.49, { freq: 1046.5, duration: 0.37, type: 'sine', peak: 0.89 }); // ド(高)
    tone(ctx, now + 0.49, { freq: 1318.5, duration: 0.37, type: 'sine', peak: 0.445 }); // ミ(高)
  },
  // lessonClear: レッスンクリア専用。fanfare（音階のかけあがり）と聞き分けられるよう、
  // 和音を4回重ねて終わる（ドミソ→ファラド→ソシレ→高いドミソ）。長さ・音量は fanfare に合わせる（Issue #268）。
  lessonClear(ctx, now) {
    const chords = [
      [523.25, 659.25, 783.99],
      [698.46, 880, 1046.5],
      [783.99, 987.77, 1174.66],
      [1046.5, 1318.5, 1568.0],
    ];
    chords.forEach((freqs, i) =>
      freqs.forEach((freq) => tone(ctx, now + i * 0.2, { freq, duration: 0.26, type: 'sine', peak: 0.56 }))
    );
  },
  // grandFanfare: 単元ぜんぶクリアだけで鳴らす、さらに長い達成音（Issue #104）。
  grandFanfare(ctx, now) {
    const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1318.5];
    notes.forEach((freq, i) => tone(ctx, now + i * 0.14, { freq, duration: 0.22, type: 'sine' }));
    const chordAt = now + notes.length * 0.14 + 0.05;
    [1046.5, 1318.5, 1568.0].forEach((freq) => tone(ctx, chordAt, { freq, duration: 1.0, type: 'sine', peak: 0.7 }));
  },
  // start: デモ前1秒の間の終わりに鳴らす合図音（Issue #107）。
  start(ctx, now) {
    tone(ctx, now, { freq: 440, freqEnd: 880, duration: 0.1, type: 'sine', peak: 0.7 });
  },
};

export function play(name, opts = {}) {
  if (muted) return;
  window.__sfxLog.push(name);
  const ctx = ensureContext();
  SOUND[name]?.(ctx, ctx.currentTime, opts);
}
