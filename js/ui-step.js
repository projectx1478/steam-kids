// ステップ切替（intro/predict/play/summary）、実行アニメーション、ヘッダーのもどる・
// えらぶ がめんへ。
import { S, currentStep } from './state.js';
import { logEvent } from './events.js';
import { simulate } from './engine-grid.js';
import { prefersReducedMotion } from './ui-grid.js';
import { vibrate } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { renderInto } from './text-render.js';
import { renderGoalDemo } from './ui-demo.js';
import { renderPlay } from './ui-play.js';
import { renderPredict } from './ui-predict.js';
import { renderTutorial, isTutorialDone } from './ui-tutorial.js';
import { renderSummary } from './ui-summary.js';

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
// 現在のステップが持つ指ガイド（js/ui-hand.js）。ステップ離脱時に消す（Issue #95）。
let activeHandHint = null;

// renderPlay/renderPredict/renderTutorial（別モジュール）から現在の無操作促し・指ガイド・
// クリア済みフラグを更新するための窓口。
export function setActiveNudge(nudge) {
  activeNudge = nudge;
}

// setActiveHandHint(hint): 前の指ガイドを消してから新しいものに差し替える。hint=nullで消すだけ。
export function setActiveHandHint(hint) {
  activeHandHint?.remove();
  activeHandHint = hint ?? null;
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
    home: document.getElementById('home-btn'),
    title: document.getElementById('lesson-title'),
    chip: document.getElementById('step-kind-chip'),
  };
}

// ヘッダー（#stageの外）：タイトル・区分チップ・もどる/えらぶ がめんへボタン。
// renderStepのたびに更新する（Issue #91）。
function renderHeader() {
  const { wrap, back, home, title, chip } = headerEls();
  wrap.style.display = 'flex';
  // home-btnは#lesson-headerの外（ヘッダー右側）にあるため、ここで表示を切り替える
  // （←ともどるを分けて誤タップを防ぐ配置。Issue #95）。
  home.style.display = '';
  title.textContent = S.unit ? `${S.unit.title} ・ ${S.lesson.title}` : S.lesson.title;
  chip.textContent = KIND_CHIP_LABEL[currentStep().kind] ?? '';
  // Tailwindの`flex`ユーティリティ(back.classListが持つ)はUA既定の[hidden]より強いため、
  // hidden属性ではなくinline style.displayで確実に隠す。
  back.style.display = S.stepIndex === 0 ? 'none' : '';
}

// 実行アニメーション中はもどる・えらぶ がめんへを操作させない（playAnimationの開始・終了で呼ぶ）。
function setBackDisabled(disabled) {
  const { back, home } = headerEls();
  back.disabled = disabled;
  home.disabled = disabled;
}

// app.jsが単元情報(S.unit)を非同期取得した後、ヘッダーのタイトルだけ再描画するための窓口。
// initSteps()自体は単元情報の取得を待たずに進める（visibilitychange等のリスナー登録を
// 遅らせないため。P2のabandon記録タイミングに影響していた）。
export function refreshHeader() {
  if (!S.lesson) return;
  renderHeader();
}

export function initSteps() {
  // もどる・えらぶ がめんへは確認ダイアログを挟まず即座に遷移する。誤タップの保険は
  // 確認ダイアログではなく、playの命令列の下書き保持（S.drafts）で行う（Issue #95）。
  headerEls().back.addEventListener('click', () => {
    if (headerEls().back.disabled || S.stepIndex === 0) return;
    goToStep(S.stepIndex - 1);
  });

  headerEls().home.addEventListener('click', () => {
    if (headerEls().home.disabled) return;
    location.href = './index.html';
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) logAbandonOnce();
  });
  window.addEventListener('pagehide', logAbandonOnce);

  logEvent('step_enter', {});
  renderStep();
}

// tutorialが完了・スキップ済みの単元では自動でその先へ進める。ただしrenderIntroの
// 「れんしゅう する」で明示的に戻る場合（S.forceTutorial）は飛ばさない（Issue #93）。
function resolveStepIndex(index) {
  const step = S.lesson.steps[index];
  if (step?.kind !== 'tutorial') return index;
  if (S.forceTutorial) {
    S.forceTutorial = false;
    return index;
  }
  return isTutorialDone(S.lesson.unitId) ? index + 1 : index;
}

export function goToStep(nextIndex) {
  const resolvedIndex = resolveStepIndex(nextIndex);
  logEvent('step_leave', {});
  S.stepIndex = resolvedIndex;
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
  setActiveHandHint(null);
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
  else if (step.kind === 'tutorial') renderTutorial(root, step);
  else if (step.kind === 'summary') renderSummary(root);
  applyStepTransition(root);
}

export function createPrimaryButton(label, onClick, action) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'primary-btn btn-tactile block mx-auto px-6 py-3 mt-4 bg-sky-500 text-white text-lg';
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
  // ロボットが正解の道をたどってゴールへ到達する完成イメージ（本番とは別のstart/goal。
  // Issue #97）。demoが無い教材型は対象外。
  if (step.demo) renderGoalDemo(root, step.demo);
  root.appendChild(createPrimaryButton('はじめる', () => goToStep(S.stepIndex + 1), 'start'));

  // tutorialが完了・スキップ済み（自動で飛ばされる）の単元だけ、やり直す入口を小さく出す（Issue #93）。
  const tutorialIndex = S.lesson.steps.findIndex((s) => s.kind === 'tutorial');
  if (tutorialIndex !== -1 && isTutorialDone(S.lesson.unitId)) {
    const redoBtn = document.createElement('button');
    redoBtn.type = 'button';
    redoBtn.dataset.action = 'redo-tutorial';
    redoBtn.textContent = 'れんしゅう する';
    redoBtn.className = 'block mx-auto mt-2 min-w-[64px] min-h-[64px] px-4 rounded-lg bg-white shadow text-sm text-slate-600';
    redoBtn.addEventListener('click', () => {
      vibrate();
      S.forceTutorial = true;
      goToStep(tutorialIndex);
    });
    root.appendChild(redoBtn);
  }
}
