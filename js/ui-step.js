// ステップ切替（intro/predict/play/summary）、実行アニメーション、ヘッダーのもどる・
// えらぶ がめんへ。
import { S, currentStep } from './state.js';
import { logEvent } from './events.js';
import { simulate } from './engine-grid.js';
import { GIMMICKS } from './gimmicks/index.js';
import { prefersReducedMotion } from './ui-grid.js';
import { vibrate } from './ui-commands.js';
import { play as playSfx } from './sfx.js';
import { renderInto } from './text-render.js';
import { renderGoalDemo } from './ui-demo.js';
import { renderPlay } from './ui-play.js';
import { renderSeesaw } from './ui-seesaw.js';
import { renderPredict } from './ui-predict.js';
import { renderTutorial, isTutorialDone } from './ui-tutorial.js';
import { renderSummary } from './ui-summary.js';
import { renderSeedPick } from './ui-seedpick.js';
import { generateMap } from './engine-generate.js';
import { codeToSeed } from './seed-code.js';
import { isLessonCleared } from './ui-picker.js';
import { withDev } from './dev-mode.js';
import { readResume, writeResume, clearResume } from './storage.js';

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
  seedPick: 'たね',
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

// 実行アニメーション中はもどる・えらぶ がめんへを操作させない（playAnimationの開始・終了、
// および1コマ実行の開始時にui-play.jsから呼ぶ。Issue #111）。
export function setBackDisabled(disabled) {
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
    if (!hasPlayInProgress()) {
      location.href = withDev('./index.html?view=map');
      return;
    }
    // playの途中（命令列を組みかけ）で離れると下書きを失うため、ここだけ確認を挟む。
    // 子どもが読まなくても分かるよう「つづける」を大きく目立たせる（Issue #240）。
    confirmLeave(() => (location.href = withDev('./index.html?view=map')));
  });

  // 端末の戻る（Android戻る・ブラウザ戻る）も「← もどる」と同じく1ステップ戻す。
  // 各ステップ遷移でhistoryを積み（goToStep）、ここで該当ステップを再描画する（Issue #240）。
  history.replaceState({ stepIndex: S.stepIndex }, '');
  window.addEventListener('popstate', (event) => {
    const target = event.state?.stepIndex;
    if (target == null || target === S.stepIndex) return;
    if (headerEls().back.disabled) {
      // 実行アニメーション中は動かさない。履歴だけ現在位置へ戻す。
      history.pushState({ stepIndex: S.stepIndex }, '');
      return;
    }
    enterStep(target);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) logAbandonOnce();
  });
  window.addEventListener('pagehide', logAbandonOnce);

  logEvent('step_enter', {});
  renderStep();
}

// tutorialはrenderIntroの「そうさほうほう」で明示的に入る場合（S.forceTutorial）だけ入る。
// それ以外は常に飛ばす（前進＝その先、後退＝その手前のintro。Issue #236）。
// 完了・スキップ記録（isTutorialDone）は「そうさほうほう」の強調表示の判定にだけ使う。
function resolveStepIndex(index, forward) {
  const step = S.lesson.steps[index];
  // たね未確定でgenerator付きplayへは入れない（盤面が無い）。たね入力へ戻す（Issue #69）。
  if (step?.generator && S.seed == null) return S.lesson.steps.findIndex((s) => s.kind === 'seedPick');
  if (step?.kind !== 'tutorial') return index;
  if (S.forceTutorial) {
    S.forceTutorial = false;
    return index;
  }
  return forward ? index + 1 : index - 1;
}

function enterStep(index, { resumed = false } = {}) {
  logEvent('step_leave', {});
  S.stepIndex = index;
  logEvent('step_enter', resumed ? { resumed: true } : {});
  playSfx('whoosh');
  renderStep();
}

// opts.resumed: 「つづきから」で入るときだけtrue。step_enterのpayloadに{resumed:true}を付ける（Issue #242）。
export function goToStep(nextIndex, opts = {}) {
  const resolvedIndex = resolveStepIndex(nextIndex, nextIndex > S.stepIndex);
  history.pushState({ stepIndex: resolvedIndex }, '');
  enterStep(resolvedIndex, opts);
}

// playの途中か：現在のステップがplayで、命令列の下書きが初期状態（空 or initialCommands）から
// 変わっている。クリア時は下書きが消えるため、クリア後は途中ではない（Issue #240）。
function hasPlayInProgress() {
  const step = currentStep();
  if (step.kind !== 'play') return false;
  const draft = S.drafts[step.stepId];
  if (!draft) return false;
  const initial = (step.initialCommands ?? []).map((dir) => ({ dir, times: 1 }));
  return JSON.stringify(draft) !== JSON.stringify(initial);
}

// confirmLeave(onLeave): 「やめる？」の確認。つづける（既定・大）／やめる（小）。
function confirmLeave(onLeave) {
  const overlay = document.createElement('div');
  overlay.className = 'leave-confirm';
  overlay.setAttribute('role', 'dialog');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4)';
  const card = document.createElement('div');
  card.className = 'bg-white rounded-2xl shadow p-6 text-center';
  card.style.cssText = 'max-width:90vw';
  const msg = document.createElement('p');
  msg.className = 'text-xl mb-4';
  msg.textContent = 'ここで やめる？';
  const keep = createPrimaryButton('つづける', () => overlay.remove(), 'leave-cancel');
  const leave = document.createElement('button');
  leave.type = 'button';
  leave.dataset.action = 'leave-ok';
  leave.className = 'btn-tactile block mx-auto mt-3 min-w-[64px] min-h-[64px] px-6 bg-slate-200 text-slate-700 text-base';
  leave.textContent = 'やめる';
  leave.addEventListener('click', () => {
    overlay.remove();
    onLeave();
  });
  card.append(msg, keep, leave);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

// 区分ごとの短い記号（文字を読ませない方針のため、既存のじっこう「▶」等と同じ記法。Issue #104）。
function stepGlyph(step, stageIdx) {
  if (step.kind === 'intro') return '▶';
  if (step.kind === 'tutorial') return '✎';
  if (step.kind === 'play') return stageIdx === null ? '▶' : String(stageIdx + 1);
  if (step.kind === 'summary') return '★';
  if (step.kind === 'seedPick') return '✿';
  return '';
}

// レッスン全体のロードマップ（Issue #104）。旧仕様の進行ドット（.step-dot・data-current）は
// 既存シナリオとの互換のため維持し、見た目だけ区分アイコン付きのノード＋接続線にする。
// クリア済みレッスンではplayステージのノードがボタン化し、goToStepで直接そのステージへ移動できる
// （よそうはIssue #104で全廃したため対象はplayのみ）。
function renderStepDots(root) {
  const wrap = document.createElement('div');
  const isIntro = currentStep().kind === 'intro';
  const nodeSizeClass = isIntro ? 'w-12 h-12 text-base' : 'w-8 h-8 text-xs';
  const playSteps = S.lesson.steps.filter((s) => s.kind === 'play');
  const lessonCleared_ = isLessonCleared(S.lesson.lessonId);
  // 描画ノード数（tutorial除外を反映）。クリア済みで7以上なら折返し・48px・線なしにする（Issue #320）。
  const drawnCount = S.lesson.steps.filter((s, i) => !(s.kind === 'tutorial' && i !== S.stepIndex)).length;
  const wrapMode = lessonCleared_ && drawnCount >= 7;
  wrap.className = wrapMode
    ? 'step-roadmap flex flex-wrap justify-center items-center gap-x-2 gap-y-2 mb-2'
    : 'step-roadmap flex justify-center items-center gap-0.5 mb-2';

  let drawn = 0;
  S.lesson.steps.forEach((step, i) => {
    // tutorialの点はtutorial中だけ出す（飛ばしたtutorialに✓が付いて「やった扱い」に見えるのを防ぐ。Issue #236）。
    if (step.kind === 'tutorial' && i !== S.stepIndex) return;
    if (drawn > 0 && !wrapMode) {
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
    const clickableSize = wrapMode ? 'min-w-[48px] min-h-[48px] px-0' : 'min-w-[64px] min-h-[64px] px-2';
    const sizeClass = clickable ? clickableSize : nodeSizeClass;
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
    drawn += 1;
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
  // generator付きplay：確定したたねから盤面を作ってステップへ差し込む（同じたね→同じ盤面。Issue #69）。
  if (step.generator && S.seed != null) Object.assign(step, generateMap(step.generator, codeToSeed(S.seed)));
  const root = stage();
  root.innerHTML = '';
  root.dataset.step = step.kind;
  root.dataset.stepId = step.stepId;

  renderHeader();
  renderStepDots(root);
  if (step.kind === 'intro') renderIntro(root, step);
  else if (step.kind === 'predict') renderPredict(root, step);
  else if (step.kind === 'play') (S.lesson.type === 'predict-slider' ? renderSeesaw : renderPlay)(root, step);
  else if (step.kind === 'tutorial') renderTutorial(root, step);
  else if (step.kind === 'summary') renderSummary(root);
  else if (step.kind === 'seedPick') renderSeedPick(root, step);
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

const WATER_DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function dirAt(commands, idx, inner) {
  const entry = commands[idx];
  if (typeof entry === 'string') return entry;
  return entry.box ? entry.box[inner] : entry.dir;
}

// createStepper(commands, spec, view, {onTick, onPickup}): 命令列の1手分を進める最小単位。
// engine-gridの純粋計算結果(simulate)を保持し、advance()を呼ぶたびに1手だけ時間軸に沿って見せる。
// まとめ命令（times>=2）は1コマ=1手として進み、その間onTickには元の命令（チップ）のインデックスを
// stepOwner経由で渡し続ける。viewはui-grid.jsのrenderGridが返す差分更新API。
// onTick(chipIndex, to, innerIndex, round)：roundは箱のくりかえしの周回（0始まり。箱の外は-1。
// 周回の点表示用。Issue #167）。
// autoAdvance（じっこう）・ui-play.jsの「1コマ」ボタン（タップごとにadvance()を呼ぶ）の
// 両方から共通で使う（Issue #111）。
export function createStepper(commands, spec, view, { onTick, onPickup }) {
  const result = simulate(commands, spec);
  // ギミックのonStep（開閉などUI更新）用の、実行1回ごとの作業領域（Issue #62）。
  const runStates = {};
  let i = 0;
  let finished = false;
  return {
    result,
    isDone: () => finished,
    advance() {
      if (finished) return;
      const from = result.path[i];
      const to = result.path[i + 1];
      const bumped = result.bumped[i];
      const cushioned = !bumped && from.x === to.x && from.y === to.y;
      // 水で止まったか：手前で止まった手（cushioned）の進行方向の先が盤の water か。engineの戻り値は増やさない。
      const dir = dirAt(commands, result.stepOwner[i], result.innerOwner[i]);
      const [ddx, ddy] = WATER_DELTA[dir] ?? [0, 0];
      const watered = cushioned && (spec.water ?? []).some((c) => c.x === from.x + ddx && c.y === from.y + ddy);
      playSfx(bumped ? 'bump' : watered ? 'splash' : cushioned ? 'cushion' : result.slid[i] ? 'slide' : 'step', { index: i });
      if (bumped || cushioned) {
        view.bounce(dir, watered ? 'water' : cushioned ? 'cushion' : 'wall');
      } else {
        view.footprint(from);
        view.moveTo(to);
      }
      const totalItems = (spec.items ?? []).length;
      let collected = result.pickups.slice(0, i).reduce((n, arr) => n + arr.length, 0);
      result.pickups[i].forEach((idx) => {
        view.collectItem(spec.items[idx]);
        collected += 1;
        // 最後の1個で全部回収できた時だけpickupLast（Issue #158）
        playSfx(collected === totalItems ? 'pickupLast' : 'pickup');
        onPickup?.(idx);
      });
      if (!bumped) {
        for (const g of GIMMICKS) {
          const sfx = g.onStep?.({ pos: to, spec, view, run: (runStates[g.key] ??= {}), result, index: i });
          if (sfx) playSfx(sfx);
        }
      }
      onTick(result.stepOwner[i], to, result.innerOwner[i], result.roundOwner[i]);
      // 壁・盤外にぶつかった手で実行を止める。残りの手は再生しない（Issue #136）。クッションは止まらない。
      if (bumped || i === result.path.length - 2) {
        finished = true;
      } else {
        i += 1;
      }
    },
  };
}

// autoAdvance(stepper, {onDone}, {lockHeader = true}): stepperを1手600msで最後まで自動再生する。
// 第3引数{lockHeader = true}: trueの間はもどる・えらぶ がめんへを操作できなくする（play/predict/
// tutorialの実行中と同じ挙動）。js/ui-demo.jsのデモ再生はfalseを渡し、再生中もヘッダー操作を
// 塞がない（Issue #104）。戻り値{cancel()}は保留中のタイマーを止め、以後の効果音・onDoneを
// 発火させない（ステップ離脱後も裏で音が鳴り続ける事故を防ぐ。js/ui-step.jsのsetActiveAnimation経由）。
// ui-play.jsの「1コマ実行の途中でじっこう」でも、進行中のstepperをそのまま渡して残りを続行する
// （Issue #111）。
export function autoAdvance(stepper, { onDone }, { lockHeader = true } = {}) {
  if (lockHeader) setBackDisabled(true);
  let cancelled = false;
  let timer = null;
  const tick = () => {
    if (cancelled) return;
    stepper.advance();
    if (stepper.isDone()) {
      timer = setTimeout(() => {
        timer = null;
        if (cancelled) return;
        if (lockHeader) setBackDisabled(false);
        onDone(stepper.result);
      }, STEP_DELAY_MS);
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      if (cancelled) return;
      tick();
    }, STEP_DELAY_MS);
  };
  tick();
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

// playAnimation(commands, spec, view, {onTick, onDone, onPickup}, opts): createStepper +
// autoAdvanceを組み合わせた従来通りの一括実行（新規stepperを作って最初から最後まで自動再生する）。
export function playAnimation(commands, spec, view, { onTick, onDone, onPickup }, opts = {}) {
  playSfx('run');
  const stepper = createStepper(commands, spec, view, { onTick, onPickup });
  return autoAdvance(stepper, { onDone }, opts);
}

// 途中ステージのstage_clear後に、次のstepIdを再開位置として保存する（Issue #242）。
// 先頭がintroでないレッスン（renderIntroを通らない）と、再開に向かないstep（tutorial等）は保存しない。
export function saveResumePoint() {
  const steps = S.lesson.steps;
  if (steps[0]?.kind !== 'intro') return;
  const next = steps[S.stepIndex + 1];
  if (!next || !['play', 'predict', 'seedPick'].includes(next.kind)) return;
  writeResume(S.lesson.lessonId, next.stepId);
}

// 再開先のステップ位置。保存なし・レッスンに無いstepId（保存は破棄）・クリア済みは-1（Issue #242）。
function findResumeIndex() {
  const lessonId = S.lesson.lessonId;
  const saved = readResume(lessonId);
  if (!saved) return -1;
  const index = S.lesson.steps.findIndex((s) => s.stepId === saved.stepId);
  if (index <= 0) {
    clearResume(lessonId);
    return -1;
  }
  if (isLessonCleared(lessonId)) return -1;
  return index;
}

function renderIntro(root, step) {
  const p = document.createElement('p');
  p.className = 'text-2xl text-center py-8';
  renderInto(p, step.text, S.readingLevel, S.furigana);
  root.appendChild(p);
  // ロボットが正解の道をたどってゴールへ到達する完成イメージ（本番とは別のstart/goal。
  // Issue #97）。demoが無い教材型は対象外。
  if (step.demo) renderGoalDemo(root, step.demo);
  // 途中再開（Issue #242）：保存があり、そのstepIdがレッスンにあり、未クリアのときだけ
  // 主ボタンを「つづきから」にし、「はじめから」（保存は触らない）を控えめに添える。
  const resumeIndex = findResumeIndex();
  if (resumeIndex !== -1) {
    const resumeBtn = createPrimaryButton('つづきから', () => goToStep(resumeIndex, { resumed: true }), 'resume');
    resumeBtn.classList.add('min-h-[64px]');
    root.appendChild(resumeBtn);
    const restartBtn = document.createElement('button');
    restartBtn.type = 'button';
    restartBtn.dataset.action = 'start';
    restartBtn.textContent = 'はじめから';
    restartBtn.className =
      'block mx-auto mt-6 min-w-[64px] min-h-[64px] px-6 rounded-lg bg-white shadow text-base text-slate-600';
    restartBtn.addEventListener('click', () => {
      vibrate();
      goToStep(S.stepIndex + 1);
    });
    root.appendChild(restartBtn);
  } else {
    root.appendChild(createPrimaryButton('はじめる', () => goToStep(S.stepIndex + 1), 'start'));
  }

  // tutorialがあるレッスンは「そうさほうほう」でだけtutorialへ入れる。未見の間は光らせて誘導する
  // （Issue #236。完了・スキップ済みなら控えめ表示）。再開位置があるときは「つづきから」を
  // 優先して光らせない（Issue #242）。
  const tutorialIndex = S.lesson.steps.findIndex((s) => s.kind === 'tutorial');
  if (tutorialIndex !== -1) {
    const unseen = resumeIndex === -1 && !isTutorialDone(S.lesson.lessonId);
    const howBtn = document.createElement('button');
    howBtn.type = 'button';
    howBtn.dataset.action = 'how-to';
    howBtn.textContent = 'そうさほうほう';
    howBtn.className = unseen
      ? 'block mx-auto mt-2 min-w-[64px] min-h-[64px] px-6 rounded-lg bg-amber-100 shadow text-base font-bold text-amber-900 ring-4 ring-amber-400 ring-offset-2 motion-safe:animate-pulse'
      : 'block mx-auto mt-2 min-w-[64px] min-h-[64px] px-4 rounded-lg bg-white shadow text-sm text-slate-600';
    if (unseen) howBtn.dataset.highlight = 'true';
    howBtn.addEventListener('click', () => {
      vibrate();
      S.forceTutorial = true;
      goToStep(tutorialIndex);
    });
    root.appendChild(howBtn);
  }
}
