// ステップ切替（intro/predict/play/summary）、実行アニメーション、ふりがなトグル。
import { S, currentStep } from './state.js';
import { logEvent } from './events.js';
import { simulate } from './engine-grid.js';
import { prefersReducedMotion } from './ui-grid.js';
import { vibrate } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { renderInto, refreshRubyText } from './text-render.js';
import { renderDemo } from './ui-demo.js';
import { renderPlay } from './ui-play.js';
import { renderPredict } from './ui-predict.js';
import { renderSummary } from './ui-summary.js';

// predict/playの区分バナー文言（Issue #91）。tutorialには出さない。
const CATEGORY_LABEL = { predict: 'もんだい1 よそう', play: 'もんだい2 うごかす' };

const STEP_DELAY_MS = 600;
const STEP_TRANSITION_MS = 220;
const STEP_SLIDE_PX = 24;
// ヘッダーの区分チップ文言（Issue #91）。
const KIND_CHIP_LABEL = {
  intro: 'はじめに',
  tutorial: 'れんしゅう',
  predict: 'よそう',
  play: 'うごかす',
  summary: 'まとめ',
};

// clear到達後は離脱してもabandonを記録しない。1セッションにつき1回だけ記録する。
let lessonCleared = false;
let abandonLogged = false;
// 現在のステップが持つ無操作促し。ステップ離脱時（renderStep冒頭）に止める（Issue #89）。
let activeNudge = null;

// renderPlay/renderPredict（別モジュール）から現在の無操作促し・クリア済みフラグを更新するための窓口。
export function setActiveNudge(nudge) {
  activeNudge = nudge;
}

export function markLessonCleared() {
  lessonCleared = true;
}

function logAbandonOnce() {
  if (abandonLogged || lessonCleared) return;
  abandonLogged = true;
  logEvent('abandon', {});
}

function stage() {
  return document.getElementById('stage');
}

function headerEls() {
  return {
    wrap: document.getElementById('lesson-header'),
    back: document.getElementById('back-btn'),
    title: document.getElementById('lesson-title'),
    chip: document.getElementById('step-kind-chip'),
  };
}

// ヘッダー（#stageの外）：タイトル・区分チップ・もどるボタン。renderStepのたびに更新する（Issue #91）。
function renderHeader() {
  const { wrap, back, title, chip } = headerEls();
  wrap.style.display = 'flex';
  title.textContent = S.unit ? `${S.unit.title} ・ ${S.lesson.title}` : S.lesson.title;
  chip.textContent = KIND_CHIP_LABEL[currentStep().kind] ?? '';
  back.hidden = S.stepIndex === 0;
}

// 実行アニメーション中はもどるを操作させない（playAnimationの開始・終了で呼ぶ）。
function setBackDisabled(disabled) {
  headerEls().back.disabled = disabled;
}

// app.jsが単元情報(S.unit)を非同期取得した後、ヘッダーのタイトルだけ再描画するための窓口。
// initSteps()自体は単元情報の取得を待たずに進める（visibilitychange等のリスナー登録を
// 遅らせないため。P2のabandon記録タイミングに影響していた）。
export function refreshHeader() {
  if (!S.lesson) return;
  renderHeader();
}

export function initSteps() {
  const toggle = document.getElementById('furigana-toggle');
  toggle.addEventListener('click', () => {
    S.furigana = !S.furigana;
    toggle.setAttribute('aria-pressed', String(S.furigana));
    refreshRubyText(S.readingLevel, S.furigana);
  });

  headerEls().back.addEventListener('click', () => {
    if (headerEls().back.disabled || S.stepIndex === 0) return;
    goToStep(S.stepIndex - 1);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) logAbandonOnce();
  });
  window.addEventListener('pagehide', logAbandonOnce);

  logEvent('step_enter', {});
  renderStep();
}

export function goToStep(nextIndex) {
  logEvent('step_leave', {});
  S.stepIndex = nextIndex;
  logEvent('step_enter', {});
  playSfx('whoosh');
  renderStep();
}

// ステップ進行ドット。数＝S.lesson.steps.length、現在位置のみdata-current。
function renderStepDots(root) {
  const dots = document.createElement('div');
  dots.className = 'step-dots flex justify-center gap-1 mb-2';
  S.lesson.steps.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'step-dot w-2 h-2 rounded-full bg-slate-200';
    if (i === S.stepIndex) {
      dot.dataset.current = 'true';
      dot.classList.add('bg-sky-500');
    }
    dots.appendChild(dot);
  });
  root.appendChild(dots);
}

// ステップ遷移の横スライド。reduced-motion時は即表示（Issue #57）。
function applyStepTransition(root) {
  if (prefersReducedMotion()) return;
  root.style.transition = 'none';
  root.style.transform = `translateX(${STEP_SLIDE_PX}px)`;
  root.style.opacity = '0';
  requestAnimationFrame(() => {
    root.style.transition = `transform ${STEP_TRANSITION_MS}ms ease, opacity ${STEP_TRANSITION_MS}ms ease`;
    root.style.transform = 'translateX(0)';
    root.style.opacity = '1';
  });
}

function renderStep() {
  activeNudge?.stop();
  activeNudge = null;
  const step = currentStep();
  const root = stage();
  root.innerHTML = '';
  root.dataset.step = step.kind;
  root.dataset.stepId = step.stepId;

  renderHeader();
  renderStepDots(root);
  if (step.kind === 'intro') renderIntro(root, step);
  else if (step.kind === 'predict') renderPredict(root, step);
  else if (step.kind === 'play') renderPlay(root, step);
  else if (step.kind === 'tutorial') renderPlay(root, step, { guide: step.script });
  else if (step.kind === 'summary') renderSummary(root);
  applyStepTransition(root);
}

export function createPrimaryButton(label, onClick, action) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    'primary-btn block mx-auto min-w-[48px] min-h-[48px] px-6 py-3 mt-4 rounded-xl bg-sky-500 text-white text-lg transition-transform duration-100 active:scale-95';
  if (action) btn.dataset.action = action;
  btn.textContent = label;
  btn.addEventListener('click', () => {
    vibrate();
    onClick();
  });
  return btn;
}

function dirAt(commands, idx) {
  const entry = commands[idx];
  return typeof entry === 'string' ? entry : entry.dir;
}

// 命令列を1手600msで再生する。engine-gridの純粋計算結果(simulate)を時間軸に沿って見せるだけ。
// まとめ命令（times>=2）は複数コマ分の時間をかけて再生し、その間onTickには元の命令
// （チップ）のインデックスをstepOwner経由で渡し続ける。
// viewはui-grid.jsのrenderGridが返す差分更新API（プレイヤー駒の移動・バウンス・足あと）。
export function playAnimation(commands, spec, view, { onTick, onDone, onPickup }) {
  const result = simulate(commands, spec);
  playSfx('run');
  setBackDisabled(true);
  let i = 0;
  const step = () => {
    const from = result.path[i];
    const to = result.path[i + 1];
    const bumped = from.x === to.x && from.y === to.y;
    playSfx(bumped ? 'bump' : 'step', { index: i });
    if (bumped) {
      view.bounce(dirAt(commands, result.stepOwner[i]));
    } else {
      view.footprint(from);
      view.moveTo(to);
    }
    result.pickups[i].forEach((idx) => {
      view.collectItem(spec.items[idx]);
      playSfx('pickup');
      onPickup?.(idx);
    });
    onTick(result.stepOwner[i], to);
    if (i === result.path.length - 2) {
      setTimeout(() => {
        setBackDisabled(false);
        onDone(result);
      }, STEP_DELAY_MS);
      return;
    }
    setTimeout(() => {
      i += 1;
      step();
    }, STEP_DELAY_MS);
  };
  step();
}

function renderIntro(root, step) {
  const p = document.createElement('p');
  p.className = 'text-2xl text-center py-8';
  renderInto(p, step.text, S.readingLevel, S.furigana);
  root.appendChild(p);
  // このレッスンで何をするかの簡易デモ（Issue #91）。playステップが無い教材型は対象外。
  if (S.lesson.steps.some((s) => s.kind === 'play')) renderDemo(root, 'play');
  root.appendChild(createPrimaryButton('はじめる', () => goToStep(S.stepIndex + 1), 'start'));
}

// predict/playの先頭に区分バナー＋デモを表示する（tutorialには出さない。Issue #91）。
// 最初の操作でデモを畳んで見出し1行だけ残す（collapseは呼び出し側の最初の操作ハンドラで呼ぶ）。
export function renderCategoryBanner(root, kind) {
  const banner = document.createElement('div');
  banner.className = 'category-banner mb-2 flex flex-col items-center gap-1';
  const heading = document.createElement('h2');
  heading.className = 'text-sm font-bold text-slate-700';
  heading.textContent = CATEGORY_LABEL[kind];
  banner.appendChild(heading);
  const demoEl = renderDemo(banner, kind);
  root.appendChild(banner);

  let collapsed = false;
  return {
    collapse() {
      if (collapsed) return;
      collapsed = true;
      demoEl.remove();
    },
  };
}
