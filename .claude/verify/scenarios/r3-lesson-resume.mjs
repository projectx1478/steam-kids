// レッスンの途中再開（Issue #242）：途中ステージのクリアで次のstepIdが保存され、introの「つづきから」で
// その位置から始まる。最終クリア・クリア済み・レッスンに無いstepId・resetSlotでは出ない。360pxで64px以上。外部APIなし。
import { routeLesson, enterPlay, clearStage } from '../helpers.mjs';

export const name = 'R3 レッスンの途中再開: つづきから・はじめから・最終クリアで消去・不明stepIdの破棄・resetSlot(Issue #242)';

const stage = (stepId) => ({
  stepId,
  kind: 'play',
  text: 'ゴールへ いこう',
  grid: { cols: 4, rows: 4 },
  start: { x: 0, y: 0 },
  goal: { x: 2, y: 0 },
  walls: [],
  allowedCommands: ['up', 'down', 'left', 'right'],
  solution: ['right', 'right'],
  maxCommands: 4,
});
const lesson = {
  lessonId: 'r3-resume',
  unitId: 'r3-resume',
  title: 'resume',
  type: 'grid-runtime',
  estimatedMinutes: 3,
  steps: [{ stepId: 's1', kind: 'intro', text: 'つづきの テスト' }, stage('p1'), stage('p2'), stage('p3'), { stepId: 's2', kind: 'summary', text: 'おわり' }],
};
const RESUME_KEY = 'steamkids.resume.r3-resume';
const SOL = ['right', 'right'];

const readResume = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), RESUME_KEY);
const readStepId = (page) => page.getAttribute('#stage', 'data-step-id');
const hasResumeBtn = async (page) => (await page.$$('[data-action="resume"]')).length;
const openIntro = async (page) => {
  await page.goto(`/index.html?lesson=${lesson.lessonId}`);
  await page.waitForSelector('#stage[data-step="intro"]');
};
const enterEvents = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('steamkids.events') ?? '[]').filter((e) => e.type === 'step_enter'));

export default async function run({ page, check }) {
  await page.setViewportSize({ width: 360, height: 640 });
  await routeLesson(page, lesson);

  // --- 進捗なしの初回：通常の「はじめる」 ---
  await openIntro(page);
  await check('進捗なしでは「つづきから」が出ない', () => hasResumeBtn(page), 0);
  await check('進捗なしの主ボタンは「はじめる」', () => page.textContent('[data-action="start"]'), 'はじめる');

  // --- p1クリアで次(p2)が保存される ---
  await enterPlay(page, lesson.lessonId);
  await clearStage(page, SOL);
  await check('p1クリア後はp2が保存される', async () => (await readResume(page))?.stepId, 'p2');
  await check('保存はstepIdとtsだけ', async () => Object.keys(await readResume(page)).sort().join(), 'stepId,ts');

  // --- 中断→戻る：つづきから ---
  await openIntro(page);
  await check('保存があれば「つづきから」が出る', () => hasResumeBtn(page), 1);
  await check('「つづきから」の文言', () => page.textContent('[data-action="resume"]'), 'つづきから');
  await check('「はじめから」が添えられる', () => page.textContent('[data-action="start"]'), 'はじめから');
  await check('360px: 「つづきから」の高さと幅が64px以上', async () => {
    const r = await page.$eval('[data-action="resume"]', (el) => el.getBoundingClientRect().toJSON());
    return r.height >= 64 && r.width >= 64;
  }, true);
  await check('360px: 「はじめから」の高さが64px以上', async () => {
    const r = await page.$eval('[data-action="start"]', (el) => el.getBoundingClientRect().toJSON());
    return r.height >= 64;
  }, true);
  await check('360px: 横スクロールなし', () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await check('縦積み：つづきから→はじめから', () =>
    page.evaluate(() => {
      const a = document.querySelector('[data-action="resume"]').getBoundingClientRect();
      const b = document.querySelector('[data-action="start"]').getBoundingClientRect();
      return b.top >= a.bottom + 20;
    }), true);
  await page.click('[data-action="resume"]');
  await page.waitForSelector('#stage[data-step="play"]');
  await check('「つづきから」でp2から始まる', () => readStepId(page), 'p2');
  await check('再開したstep_enterに{resumed:true}が付く', async () => (await enterEvents(page)).at(-1)?.payload?.resumed, true);
  await check('再開以外のstep_enterにはresumedが付かない', async () => (await enterEvents(page)).slice(0, -1).every((e) => e.payload.resumed === undefined), true);

  // --- はじめから：保存を消さず、次のclearが上書きする ---
  await clearStage(page, SOL);
  await check('p2クリア後はp3が保存される', async () => (await readResume(page))?.stepId, 'p3');
  await openIntro(page);
  await page.click('[data-action="start"]');
  await page.waitForSelector('#stage[data-step="play"]');
  await check('「はじめから」はp1から始まる', () => readStepId(page), 'p1');
  await check('「はじめから」を押しても保存は残る', async () => (await readResume(page))?.stepId, 'p3');
  await clearStage(page, SOL);
  await check('p1クリアで保存が次(p2)に戻る', async () => (await readResume(page))?.stepId, 'p2');

  // --- 最終clearで消える・クリア済みでは出ない ---
  await clearStage(page, SOL);
  await clearStage(page, SOL);
  await page.waitForSelector('#stage[data-step="summary"]');
  await check('最終clear後は保存が消える', () => readResume(page), null);
  await openIntro(page);
  await check('最終clear後は「つづきから」が出ない', () => hasResumeBtn(page), 0);
  await check('最終clear後の主ボタンは「はじめる」', () => page.textContent('[data-action="start"]'), 'はじめる');
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ stepId: 'p2', ts: 1 })), RESUME_KEY);
  await openIntro(page);
  await check('クリア済みなら保存が残っていても「つづきから」は出ない', () => hasResumeBtn(page), 0);

  // --- レッスンに無いstepIdは破棄して通常表示（未クリアの状態に戻して確認） ---
  await page.evaluate(() => localStorage.removeItem('steamkids.events'));
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ stepId: 'zzz', ts: 1 })), RESUME_KEY);
  await openIntro(page);
  await check('レッスンに無いstepIdでは「つづきから」が出ない', () => hasResumeBtn(page), 0);
  await check('不明stepIdの保存は破棄される', () => readResume(page), null);
  await check('通常の「はじめる」が出る', () => page.textContent('[data-action="start"]'), 'はじめる');

  // --- resetSlotで保存も消える ---
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ stepId: 'p2', ts: 1 })), RESUME_KEY);
  await check('保存を戻すと「つづきから」が出る', async () => {
    await openIntro(page);
    return hasResumeBtn(page);
  }, 1);
  await page.evaluate(async () => {
    const { resetSlot } = await import('/js/storage.js');
    resetSlot(0);
  });
  await check('resetSlotで保存が消える', () => readResume(page), null);

  // --- tutorialがあるレッスン：再開位置があれば「そうさほうほう」を光らせない（決定6） ---
  const tutLesson = {
    ...lesson,
    lessonId: 'r3-resume-tut',
    unitId: 'r3-resume-tut',
    steps: [{ stepId: 's1', kind: 'intro', text: 'つづきの テスト' }, { ...stage('t1'), kind: 'tutorial' }, stage('p1'), stage('p2'), { stepId: 's2', kind: 'summary', text: 'おわり' }],
  };
  await routeLesson(page, tutLesson);
  const hasHighlight = (p) => p.evaluate(() => document.querySelector('[data-action="how-to"]')?.dataset.highlight ?? null);
  await page.goto(`/index.html?lesson=${tutLesson.lessonId}`);
  await page.waitForSelector('#stage[data-step="intro"]');
  await check('tutorialあり・未見・保存なしでは「そうさほうほう」が光る', () => hasHighlight(page), 'true');
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ stepId: 'p2', ts: 1 })), 'steamkids.resume.r3-resume-tut');
  await page.goto(`/index.html?lesson=${tutLesson.lessonId}`);
  await page.waitForSelector('#stage[data-step="intro"]');
  await check('tutorialあり・保存ありでは「つづきから」が出る', () => hasResumeBtn(page), 1);
  await check('保存ありでは「そうさほうほう」に光る印が付かない', () => hasHighlight(page), null);
  await check('保存ありでも「そうさほうほう」ボタン自体は残る', async () => (await page.$$('[data-action="how-to"]')).length, 1);

  // --- 先頭がintroでないレッスンでは保存しない ---
  await check('cmd-06-practiceの先頭stepはintroではない', () =>
    page.evaluate(async () => (await (await fetch('/lessons/cmd-06-practice.json')).json()).steps[0].kind !== 'intro'), true);
  const noIntro = {
    ...lesson,
    lessonId: 'r3-resume-nointro',
    unitId: 'r3-resume-nointro',
    steps: [stage('p1'), stage('p2'), { stepId: 's2', kind: 'summary', text: 'おわり' }],
  };
  await routeLesson(page, noIntro);
  await page.goto(`/index.html?lesson=${noIntro.lessonId}`);
  await page.waitForSelector('#stage[data-step="play"]');
  await check('先頭がintroでないレッスンは操作画面から始まる', () => readStepId(page), 'p1');
  await clearStage(page, SOL);
  await check('p1をクリアして次のplayへ進む', () => readStepId(page), 'p2');
  await check('先頭がintroでないレッスンでは途中クリアでも保存が書かれない', () =>
    page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('resume') && k.includes('nointro')).length), 0);
}
