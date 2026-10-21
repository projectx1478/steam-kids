// BGM（Issue #378 段2）。ファイル再生・ループ・約0.5秒のフェード切替。効果音（js/sfx.js、
// Web Audio合成）とは別系統のため新設。音源は MusMus（docs/credits-audio.md。公開リポジトリに置かず
// Pagesデプロイ時に audio/ へ配置。ogg のみ）。
// 鳴らし始めは最初のタップ（startOnGesture）。タブ非表示で停止。ミュートは steamkids.sound と
// 連動する1スイッチ（sfx.js の購読口。BGM専用スイッチは作らない。既定はオン）。
// 曲が読めない（404・未取得）ときは無音のまま、エラーを出さない。
// Service Worker未対応環境では読み込み自体を試みない（曲なしで動作。初回再生の404を防ぐため。
// SWキャッシュへの遅延保存が前提のため、SW非対応＝曲なしという仕様に寄せている）。
import { BGM_TRACKS, BGM_FADE_MS } from './config.js';
import { isMuted, subscribeMuted } from './sfx.js';

const FADE_STEP_MS = 50;

// E2E判定用（window.__sfxLog と同じ考え）。['scene','title'] ['load','title'] ['play','title']
// ['error','title'] ['pause','hidden'|'mute'] ['resume'] ['skip','no-sw'|'muted'] が入る。
window.__bgmLog = window.__bgmLog || [];
function log(event, detail) {
  window.__bgmLog.push([event, detail]);
}

// SWが使える環境か。ブロック・非対応なら false（曲なし）。swOk は非同期的に確定し、
// crossfadeTo（start()以外の経路：場面切替・ミュート解除・タブ復帰）でも参照する。
const swReady = ('serviceWorker' in navigator)
  ? navigator.serviceWorker.ready.then(() => true).catch(() => false)
  : Promise.resolve(false);
let swOk = false;
swReady.then((ok) => {
  swOk = ok;
});

let scene = null; // 現在の場面（'title'|'map'|'play'|'clear'。未設定はnull）
let started = false; // 最初のジェスチャーがあったか
let active = null; // 再生中 { name, audio, target }
let fadeTimer = null;

function createTrack(name) {
  const def = BGM_TRACKS[name];
  if (!def) return null;
  const audio = new Audio(def.url);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;
  audio.addEventListener('error', () => {
    log('error', name);
    if (active?.audio === audio) active = null;
  });
  audio.addEventListener('playing', () => log('play', name));
  log('load', name);
  return { name, audio, target: def.volume };
}

function stopFade() {
  if (fadeTimer !== null) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

// crossfadeTo(name): 場面の曲へ約0.5秒でクロスフェード。nullならフェードアウトだけ。
// 前の曲はフェード後に止めて解放する。曲の読み込み失敗は error イベントで無音のまま扱う。
function crossfadeTo(name) {
  stopFade();
  if (!swOk) return;
  const prev = active;
  if (name && prev?.name === name) return;
  const next = name ? createTrack(name) : null;
  if (!next) {
    active = null;
    if (!prev) return;
    const from = prev.audio.volume;
    let t = 0;
    fadeTimer = setInterval(() => {
      t += FADE_STEP_MS;
      const p = Math.min(t / BGM_FADE_MS, 1);
      prev.audio.volume = Math.max(0, from * (1 - p));
      if (p >= 1) {
        stopFade();
        prev.audio.pause();
        prev.audio.removeAttribute('src');
        prev.audio.load();
      }
    }, FADE_STEP_MS);
    return;
  }
  active = next;
  next.audio.play().catch(() => {});
  const from = prev ? prev.audio.volume : 0;
  let t = 0;
  fadeTimer = setInterval(() => {
    t += FADE_STEP_MS;
    const p = Math.min(t / BGM_FADE_MS, 1);
    if (prev) prev.audio.volume = Math.max(0, from * (1 - p));
    next.audio.volume = next.target * p;
    if (p >= 1) {
      stopFade();
      if (prev) {
        prev.audio.pause();
        prev.audio.removeAttribute('src');
        prev.audio.load();
      }
    }
  }, FADE_STEP_MS);
}

// start(): 最初のジェスチャーで呼ぶ。SW未対応・ミュート中は曲なし（ログだけ残す）。
async function start() {
  started = true;
  if (!(await swReady)) {
    log('skip', 'no-sw');
    return;
  }
  if (isMuted()) {
    log('skip', 'muted');
    return;
  }
  if (scene && !active) crossfadeTo(scene);
}

// setScene(name): 場面の切替。ジェスチャー前は記憶だけ（startで鳴らす）。曲未定義の場面名は無音。
export function setScene(name) {
  if (scene === name) return;
  scene = name;
  log('scene', name);
  if (started && !isMuted() && !document.hidden) crossfadeTo(name);
}

function pauseActive(reason) {
  log('pause', reason);
  stopFade();
  active?.audio.pause();
}

// initBgm(): app.js（index.html）から一度だけ呼ぶ。最初のタップ・ミュート・タブの不可視で制御する。
export function initBgm() {
  document.addEventListener('pointerdown', start, { once: true });
  subscribeMuted((muted) => {
    if (muted) {
      pauseActive('mute');
    } else if (started && !document.hidden) {
      log('resume', '');
      if (scene && !active) crossfadeTo(scene);
      else active?.audio.play().catch(() => {});
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseActive('hidden');
    } else if (started && !isMuted()) {
      log('resume', '');
      if (scene && !active) crossfadeTo(scene);
      else active?.audio.play().catch(() => {});
    }
  });
}
