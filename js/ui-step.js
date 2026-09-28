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
import { isLessonCleared } from './ui-picker.js';

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
// 現在のステップが持つ実行アニメーション（js/ui-demo.jsの再生等）。ステップ離脱時に止める
// （画面遷移後も裏でアニメーション・効果音が続く事故を防ぐ。Issue #104）。
let activeAnimation = null;

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

// setActiveAnimation(anim): { cancel() }を持つ実行アニメーションを登録する（js/ui-demo.js用）。
// setActiveNudgeと同じ形の窓口。停止はrenderStep冒頭で一括して行う（Issue #104）。
export function setActiveAnimation(anim) {
  activeAnimation = anim;
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

// 区分チップの文言。playが複数ステージ(だんだん難易度を上げる構成)を持つ時は
// 「うごかす 2/3」のように現在ステージ位置を添える（Issue #104）。
function stepChipLabel(step) {
  const base = KIND_CHIP_LABEL[step.kind] ?? '';
  if (step.kind !== 'play') return base;
  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  if (playSteps.length <= 1) return base;
  const idx = playSteps.findIndex((s) => s.stepId === step.stepId);
  return `${base} ${idx + 1}/${playSteps.length}`;
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
  chip.textContent = stepChipLabel(currentStep());
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
    location.href = './index.html?view=map';
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) logAbandonOnce();
  });
  window.addEventListener('pagehide', logAbandonOnce);

  logEvent('step_enter', {});
  renderStep();
}

// tutorialが完了・スキップ済みの単元では、前進時のみ自動でその先へ進める。ただしrenderIntroの
// 「れんしゅう する」で明示的に入る場合（S.forceTutorial）は飛ばさない（Issue #93）。
// 後退時（← もどる）はスキップしない。よそう全廃でtutorialの直後がplayになった結果
// （Issue #104）、完了直後にplayから← もどるを押すと自動スキップでplayへ押し戻され、
// ボタンが効かないように見えてしまうため（もう一度れんしゅうを見られるようにする）。
function resolveStepIndex(index, forward) {
  const step = S.lesson.steps[index];
  if (step?.kind !== 'tutorial') return index;
  if (S.forceTutorial) {
    S.forceTutorial = false;
    return index;
  }
  if (!forward) return index;
  return isTutorialDone(S.lesson.unitId) ? index + 1 : index;
}

export function goToStep(nextIndex) {
  const resolvedIndex = resolveStepIndex(nextIndex, nextIndex > S.stepIndex);
  logEvent('step_leave', {});
  S.stepIndex = resolvedIndex;
  logEvent('step_enter', {});
  playSfx('whoosh');
  renderStep();
}

// 区分ごとの短い記号（文字を読ませない方針のため、既存のじっこう「▶」等と同じ記法。Issue #104）。
function stepGlyph(step, stageIdx) {
  if (step.kind === 'intro') return '▶';
  if (step.kind === 'tutorial') return '✎';
  if (step.kind === 'play') return stageIdx === null ? '▶' : String(stageIdx + 1);
  if (step.kind === 'summary') return '★';
  return '';
}

// レッスン全体のロードマップ（Issue #104）。旧仕様の進行ドット（.step-dot・data-current）は
// 既存シナリオとの互換のため維持し、見た目だけ区分アイコン付きのノード＋接続線にする。
// クリア済みレッスンではplayステージのノードがボタン化し、goToStepで直接そのステージへ移動できる
// （よそうはIssue #104で全廃したため対象はplayのみ）。
function renderStepDots(root) {
  const wrap = document.createElement('div');
  wrap.className = 'step-roadmap flex justify-center items-center gap-0.5 mb-2';
  const isIntro = currentStep().kind === 'intro';
  const nodeSizeClass = isIntro ? 'w-12 h-12 text-base' : 'w-8 h-8 text-xs';
  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const lessonCleared_ = isLessonCleared(S.lesson.lessonId);

  S.lesson.steps.forEach((step, i) => {
    if (i > 0) {
      const line = document.createElement('span');
      line.className = `step-roadmap-line flex-1 h-0.5 ${i - 1 < S.stepIndex ? 'bg-emerald-400' : 'bg-slate-200'}`;
      line.setAttribute('aria-hidden', 'true');
      wrap.appendChild(line);
    }

    const isCurrent = i === S.stepIndex;
    const isDone = i < S.stepIndex;
    const stageIdx = step.kind === 'play' ? playSteps.findIndex((p) => p.stepId === step.stepId) : null;
    const clickable = step.kind === 'play' && lessonCleared_;

    const node = document.createElement(clickable ? 'button' : 'span');
    if (clickable) node.type = 'button';
    const sizeClass = clickable ? 'min-w-[64px] min-h-[64px] px-2' : nodeSizeClass;
    const stateClass = isCurrent
      ? 'bg-sky-500 text-white ring-2 ring-sky-300 ring-offset-1'
      : isDone
        ? 'bg-emerald-400 text-white'
        : 'bg-slate-200 text-slate-500';
    node.className = `step-dot relative inline-flex items-center justify-center rounded-full font-bold shrink-0 ${sizeClass} ${stateClass}`;
    if (isCurrent) node.dataset.current = 'true';
    node.textContent = isDone ? '✓' : stepGlyph(step, stageIdx);
    if (clickable) {
      node.addEventListener('click', () => {
        vibrate();
        goToStep(i);
      });
    }
    wrap.appendChild(node);
  });
  root.appendChild(wrap);
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
  activeAnimation?.cancel();
  activeAnimation = null;
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
// 第5引数{lockHeader = true}: trueの間はもどる・えらぶ がめんへを操作できなくする（play/predict/
// tutorialの実行中と同じ挙動）。js/ui-demo.jsのデモ再生はfalseを渡し、再生中もヘッダー操作を
// 塞がない（Issue #104）。戻り値{cancel()}は保留中のタイマーを止め、以後の効果音・onDoneを
// 発火させない（ステップ離脱後も裏で音が鳴り続ける事故を防ぐ。js/ui-step.jsのsetActiveAnimation経由）。
export function playAnimation(commands, spec, view, { onTick, onDone, onPickup }, { lockHeader = true } = {}) {
  const result = simulate(commands, spec);
  playSfx('run');
  if (lockHeader) setBackDisabled(true);
  let i = 0;
  let cancelled = false;
  let timer = null;
  const step = () => {
    if (cancelled) return;
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
      timer = setTimeout(() => {
        timer = null;
        if (cancelled) return;
        if (lockHeader) setBackDisabled(false);
        onDone(result);
      }, STEP_DELAY_MS);
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      if (cancelled) return;
      i += 1;
      step();
    }, STEP_DELAY_MS);
  };
  step();
  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (lockHeader) setBackDisabled(false);
    },
  };
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
