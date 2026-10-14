// エディタの「ためしあそび」（Issue #403）。エディタが sessionStorage['editor-trial'] に {stage, ts} を書き、
// index.html?dev=1&trial=1 を開く。ここは合成レッスンの組み立てと trial 判定だけ（記録は一切しない）。
export const TRIAL_KEY = 'editor-trial';
export const TRIAL_LESSON_ID = '__trial__';
export const TRIAL_MISSING_MESSAGE = 'ためしあそびの盤面がありません';

// isTrialSearch(search): dev=1 と trial=1 の併用だけ true。?lesson=ID 併用は無視（通常起動）。
export function isTrialSearch(search) {
  const p = new URLSearchParams(search);
  return p.get('dev') === '1' && p.get('trial') === '1' && !p.get('lesson');
}

export function isTrial() {
  return isTrialSearch(globalThis.location?.search ?? '');
}

const isCell = (c) => c != null && Number.isFinite(c.x) && Number.isFinite(c.y);

// composeTrialLesson(stage): エディタ盤面（play ステージ）→ play 1枚の合成レッスン。不正なら例外を投げる。
export function composeTrialLesson(stage) {
  if (stage == null || typeof stage !== 'object' || Array.isArray(stage)) throw new Error('stage が不正');
  if (stage.kind !== 'play') throw new Error('stage.kind が play でない');
  const g = stage.grid;
  if (!g || !Number.isInteger(g.cols) || !Number.isInteger(g.rows) || g.cols < 1 || g.rows < 1) throw new Error('stage.grid が不正');
  if (!isCell(stage.start) || !isCell(stage.goal)) throw new Error('stage.start・goal が不正');
  return {
    lessonId: TRIAL_LESSON_ID,
    title: 'ためしあそび',
    type: 'grid-runtime',
    steps: [{ ...stage, stepId: 'trial', kind: 'play', isFinalStage: true }],
  };
}

// readTrialStage(storage): sessionStorage の値から stage を取り出す。無い・JSON 不正は null。
export function readTrialStage(storage) {
  try {
    const raw = storage.getItem(TRIAL_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && v.stage ? v.stage : null;
  } catch {
    return null;
  }
}

// closeTrialTab(): 「とじる」。window.close が効かない（直接開いた）ときは案内を結果ダイアログに出す。
export function closeTrialTab() {
  window.close();
  setTimeout(() => {
    if (document.querySelector('[data-trial-close-note]')) return;
    const note = document.createElement('p');
    note.dataset.trialCloseNote = 'true';
    note.className = 'text-center text-base font-bold text-slate-700';
    note.textContent = 'エディタのタブへ戻ってください';
    (document.querySelector('dialog[open] > div') ?? document.getElementById('stage'))?.appendChild(note);
  }, 300);
}
