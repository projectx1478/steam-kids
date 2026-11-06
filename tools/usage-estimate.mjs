// usage-estimate.mjs: review/autopilot/usage.jsonl から、週間・5時間の使用率を推定して標準出力に1行出す（Issue #640）。
//   node tools/usage-estimate.mjs [--now <ISO日時>] [--file <パス>]
//   出力：週間 <n|不明> 5時間 <n> 出典 推定（省略）
// 終了コード：0 出力あり（週間が不明でも0。記録なし・ファイル無しも0）／1 ファイルを読めない／2 引数の誤り。
// 上限 80 への切り替えは呼び出し側（run-issues.md）で行う。ここでは素の推定値を出す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_FILE = path.join(ROOT, 'review', 'autopilot', 'usage.jsonl');
const FIVE_MS = 5 * 3600 * 1000;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const REQUIRED = ['at', 'five', 'week', 'fiveSource', 'weekSource'];

const pct = (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100);
const isNum = (v) => typeof v === 'number';

// 行を読み、使える行だけ { t, rec } で返す（読み飛ばしてもエラーにしない）。
export function parseRows(text, nowMs) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    if (!REQUIRED.every((k) => k in rec)) continue;
    if (!pct(rec.five) || !pct(rec.week)) continue;
    if (typeof rec.at !== 'string') continue;
    const t = Date.parse(rec.at);
    if (Number.isNaN(t) || t > nowMs) continue;
    rows.push({ t, rec });
  }
  return rows;
}

const addOf = (rec) => (Number.isInteger(rec.estAdded) && rec.estAdded >= 0 ? rec.estAdded : 0);

export function estimate(text, nowMs) {
  const rows = parseRows(text, nowMs);
  let five = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const { t, rec } = rows[i];
    if (!isNum(rec.five)) continue;
    if (nowMs - t < FIVE_MS) {
      five = rec.five + addOf(rec);
    }
    break;
  }
  // 週間：最後の引数の行の week ＋ その行以降の estAdded の合計（#690）。
  let week = '不明';
  for (let i = rows.length - 1; i >= 0; i--) {
    const { t, rec } = rows[i];
    if (rec.weekSource !== '引数' || !isNum(rec.week)) continue;
    if (nowMs - t < WEEK_MS) {
      let sum = rec.week;
      for (let j = i; j < rows.length; j++) sum += addOf(rows[j].rec);
      week = sum;
    }
    break;
  }
  return { week, five };
}

function main(argv) {
  let nowMs = Date.now();
  let file = DEFAULT_FILE;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--now' || a === '--file') {
      const v = argv[++i];
      if (v === undefined) { console.error(`${a} に値がありません`); return 2; }
      if (a === '--file') file = path.resolve(v);
      else {
        nowMs = Date.parse(v);
        if (Number.isNaN(nowMs)) { console.error(`--now が日時として読めません: ${v}`); return 2; }
      }
    } else { console.error(`不明な引数: ${a}`); return 2; }
  }
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code !== 'ENOENT') { console.error(`読めません: ${file} (${e.code})`); return 1; }
  }
  const { week, five } = estimate(text, nowMs);
  console.log(`週間 ${week} 5時間 ${five} 出典 推定（省略）`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
