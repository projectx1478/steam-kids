#!/usr/bin/env node
// lessons/*.json のスキーマ検証。検証NGの場合は再生成する。手で通さない（docs/lesson-schema.md）。
// 検査本体は tools/lib/validate/ に機能単位で分割（Issue #448）。このファイルはエントリと再エクスポートのみ。
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLesson } from './lib/validate/lesson.mjs';
import { validateIndex, lessonKanjiMaxGrade } from './lib/validate/index-check.mjs';

export { checkBoard, checkSwitchMatters } from './lib/validate/board.mjs';
export { validateLesson } from './lib/validate/lesson.mjs';
export { validateIndex } from './lib/validate/index-check.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// LESSONS_DIR環境変数は検証シナリオ（NG例の検出確認。test/validate-repeat-box.test.mjs）用の差し替え口。
const LESSONS_DIR = process.env.LESSONS_DIR || path.join(ROOT, 'lessons');

// play/tutorialに共通の盤面検証・demo/solution 検証・れんしゅう/シーソー検証・stageGen 検査・
// スイッチの必須性・validateLesson・validateIndex は tools/lib/validate/ へ移設（Issue #448）。

// index.jsonのlongTrialIds（文字列だけ拾う。形の不正はvalidateIndexが不合格にする）。
async function readLongTrialIds() {
  try {
    const index = JSON.parse(await readFile(path.join(LESSONS_DIR, 'index.json'), 'utf-8'));
    return Array.isArray(index.longTrialIds) ? index.longTrialIds.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function main() {
  const longTrialIds = await readLongTrialIds();
  const files = (await readdir(LESSONS_DIR)).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const allErrors = [];
  const infoLines = [];
  const lessonById = new Map();
  for (const file of files) {
    const raw = await readFile(path.join(LESSONS_DIR, file), 'utf-8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      allErrors.push(`${file}: JSONパース: ${e.message}`);
      continue;
    }
    if (typeof data.lessonId === 'string') lessonById.set(data.lessonId, data);
    allErrors.push(...validateLesson(file, data, longTrialIds));
    const maxGrade = lessonKanjiMaxGrade(data);
    if (maxGrade !== null) infoLines.push(`INFO ${file}: kanjiMaxGrade=${maxGrade}`);
  }

  const indexRaw = await readFile(path.join(LESSONS_DIR, 'index.json'), 'utf-8');
  try {
    allErrors.push(...validateIndex(JSON.parse(indexRaw), lessonById, new Set(files.map((f) => path.basename(f, '.json')))));
  } catch (e) {
    allErrors.push(`index.json: JSONパース: ${e.message}`);
  }

  if (allErrors.length > 0) {
    for (const e of allErrors) console.log(e);
    process.exit(1);
  }
  for (const line of infoLines) console.log(line);
  console.log(`OK: ${files.length}件`);
}

// 直接実行されたときだけ全レッスンを検査する（test/stagegen-validate.test.mjs は validateLesson を import して使う）。
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
