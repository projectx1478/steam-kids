// parallel-check.mjs: 並行実装の着手ロック確認と、オープンPRとの変更ファイル重複確認。
//   node tools/parallel-check.mjs <Issue番号> [--claim env=<値> branch=<値>]
//   node tools/parallel-check.mjs --pr <PR番号>   （ロックは見ない。重複警告のみ）
// 終了コード: 0=問題なし / 2=ロック有効（重なりも同時のときは2）/ 3=重なりのみ / 1=引数・gh の失敗
// 詳細は docs/parallel-ops.md。外部コマンドは deps.gh / deps.git で差し替えられる（テスト用）。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ALL_LIMIT = 200;
export const OPEN_LIMIT = 100;
const CLAIM_RE = /^(着手|解除):\s+env=(\S+)\s+branch=(\S+)(?:\s+(.*))?$/;

// コメント配列から着手・解除を createdAt 順に取り出す。行頭一致のみ。
export function parseClaims(comments) {
  const out = [];
  for (const c of comments || []) {
    for (const line of String(c.body || '').split(/\r?\n/)) {
      const m = CLAIM_RE.exec(line);
      if (!m) continue;
      out.push({ type: m[1] === '着手' ? 'claim' : 'release', env: m[2], branch: m[3], createdAt: c.createdAt, reason: m[4] || '' });
    }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

// PR が Issue N に紐づくか。#N は直後が数字でないものだけ（#63 は #639 に当たらない）。
export function isLinked(pr, n) {
  if ((pr.closingIssuesReferences || []).some((r) => r.number === n)) return true;
  if (String(pr.headRefName || '').includes(`issue-${n}-`)) return true;
  return new RegExp(`#${n}(?!\\d)`).test(String(pr.body || ''));
}

// 有効な着手（解除されていないもの）を返す。
export function activeClaims(claims) {
  let active = [];
  for (const c of claims) {
    if (c.type === 'claim') active.push(c);
    else active = active.filter((a) => !(a.env === c.env && a.branch === c.branch));
  }
  return active;
}

// ロック判定。{ locked, blockers, ownClaim, incomplete }
export function lockStatus(claims, allPrs, me, n, { allLimit = ALL_LIMIT } = {}) {
  const active = activeClaims(claims);
  const ownClaim = active.some((a) => a.env === me.env && a.branch === me.branch);
  const linked = allPrs.filter((p) => isLinked(p, n));
  const oldest = allPrs.reduce((m, p) => (m === null || p.createdAt < m ? p.createdAt : m), null);
  const reached = allPrs.length >= allLimit;
  const blockers = [];
  let incomplete = false;
  for (const a of active) {
    if (a.env === me.env && a.branch === me.branch) continue;
    if (linked.some((p) => p.createdAt > a.createdAt)) continue;
    blockers.push(a);
    if (reached && oldest !== null && oldest > a.createdAt) incomplete = true;
  }
  return { locked: blockers.length > 0, blockers, ownClaim, incomplete, reached };
}

// 自分の変更ファイルとオープンPR(自分を除く)の積。[{ number, files }]
export function overlapFiles(myFiles, openPrs, excludeNumber, excludeBranch) {
  const mine = new Set(myFiles);
  const out = [];
  for (const p of openPrs) {
    if (p.number === excludeNumber) continue;
    if (excludeBranch && p.headRefName === excludeBranch) continue;
    const files = (p.files || []).map((f) => f.path).filter((f) => mine.has(f));
    if (files.length) out.push({ number: p.number, files });
  }
  return out;
}

function parseArgs(argv) {
  const a = { issue: null, pr: null, claim: null, error: null };
  const rest = argv.slice();
  while (rest.length) {
    const t = rest.shift();
    if (t === '--pr') {
      const v = rest.shift();
      if (!/^\d+$/.test(v || '')) a.error = 'PR番号が整数ではありません';
      else a.pr = Number(v);
    } else if (t === '--claim') {
      a.claim = {};
      while (rest.length && /^(env|branch)=/.test(rest[0])) {
        const [k, ...v] = rest.shift().split('=');
        a.claim[k] = v.join('=');
      }
      if (!a.claim.env || !a.claim.branch) a.error = '--claim には env=<値> branch=<値> が必要です';
    } else if (/^\d+$/.test(t) && a.issue === null) {
      a.issue = Number(t);
    } else {
      a.error = `引数を解釈できません: ${t}`;
    }
  }
  if (!a.error) {
    if (a.pr !== null && a.claim) a.error = '--claim と --pr は併用できません';
    else if (a.pr === null && a.issue === null) a.error = 'Issue番号（整数）が必要です';
    else if (a.pr !== null && a.issue !== null) a.error = '--pr のときは Issue番号を付けません';
  }
  return a;
}

const USAGE = '使い方: node tools/parallel-check.mjs <Issue番号> [--claim env=<値> branch=<値>] | --pr <PR番号>';

// deps: { gh(args)->string, git(args)->string, env, out(line), err(line) }。gh/git は失敗で throw する。
export function run(argv, deps) {
  const { gh, git, env = {}, out = () => {}, err = () => {} } = deps;
  const a = parseArgs(argv);
  if (a.error) {
    err(a.error);
    err(USAGE);
    return 1;
  }
  const json = (args) => JSON.parse(gh(args));
  try {
    if (a.pr !== null) return runPr(a.pr, { json, out, err });

    const me = {
      env: a.claim ? a.claim.env : env.PARALLEL_ENV || 'unknown',
      branch: a.claim ? a.claim.branch : git(['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
    };
    const { comments } = json(['issue', 'view', String(a.issue), '--json', 'comments']);
    const allPrs = json(['pr', 'list', '--state', 'all', '--limit', String(ALL_LIMIT), '--json', 'number,headRefName,body,createdAt,closingIssuesReferences']);
    const lock = lockStatus(parseClaims(comments), allPrs, me, a.issue);

    let locked = lock.locked;
    if (locked) {
      for (const b of lock.blockers) out(`ロック: env=${b.env} branch=${b.branch} が着手中（${b.createdAt}）`);
    }
    if (lock.reached) err(`警告: PR（上限${ALL_LIMIT}件）: 件数が上限に達した。結果が不完全な可能性${lock.incomplete ? '。ロックありとして扱う' : ''}`);

    const openPrs = json(['pr', 'list', '--state', 'open', '--limit', String(OPEN_LIMIT), '--json', 'number,headRefName,files']);
    if (openPrs.length >= OPEN_LIMIT) err(`警告: オープンPR（上限${OPEN_LIMIT}件）: 件数が上限に達した。結果が不完全な可能性`);
    const myFiles = git(['diff', '--name-only', 'origin/main...']).split(/\r?\n/).filter(Boolean);
    const overlaps = overlapFiles(myFiles, openPrs, null, me.branch);
    reportOverlaps(overlaps, out);

    if (a.claim && !locked && !lock.ownClaim) {
      gh(['issue', 'comment', String(a.issue), '--body', `着手: env=${me.env} branch=${me.branch}`]);
      out(`着手を記録した: env=${me.env} branch=${me.branch}`);
    }
    if (locked) return 2;
    return overlaps.length ? 3 : 0;
  } catch (e) {
    err(String(e && e.stderr ? e.stderr : e && e.message ? e.message : e).trimEnd());
    return 1;
  }
}

function runPr(prNumber, { json, out, err }) {
  const openPrs = json(['pr', 'list', '--state', 'open', '--limit', String(OPEN_LIMIT), '--json', 'number,headRefName,files']);
  if (openPrs.length >= OPEN_LIMIT) err(`警告: オープンPR（上限${OPEN_LIMIT}件）: 件数が上限に達した。結果が不完全な可能性`);
  let self = openPrs.find((p) => p.number === prNumber);
  if (!self) self = { number: prNumber, ...json(['pr', 'view', String(prNumber), '--json', 'headRefName,files']) };
  const overlaps = overlapFiles((self.files || []).map((f) => f.path), openPrs, prNumber, null);
  reportOverlaps(overlaps, out);
  return overlaps.length ? 3 : 0;
}

function reportOverlaps(overlaps, out) {
  for (const o of overlaps) out(`重なり: PR #${o.number}: ${o.files.join(', ')}`);
}

function exec(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Object.assign(new Error(`${cmd} ${args.join(' ')} が失敗した`), { stderr: r.stderr || `${cmd} が終了コード ${r.status}` });
  return r.stdout;
}

function main() {
  const code = run(process.argv.slice(2), {
    gh: (args) => exec('gh', args),
    git: (args) => exec('git', args),
    env: process.env,
    out: (l) => console.log(l),
    err: (l) => console.error(l),
  });
  process.exitCode = code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
