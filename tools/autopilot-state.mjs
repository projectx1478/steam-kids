// autopilot-state.mjs: 自動進行の状態（review/design・review/autopilot・review/handoff-*.md）を、非公開リポジトリと同期する。
// 状態は公開リポジトリに入れられないため、手元とクラウドの作業ツリーの間をこの非公開リポジトリで受け渡す（Issue #442）。
//   node tools/autopilot-state.mjs start <local|cloud>   lock を取ってから pull（起動時）。他方が12時間以内に lock 中なら終了コード2。
//     pull の後、受け口 queue-inbox.md の行を queue.md 末尾へ移す。手元に未同期の編集（queue.md・log.md・decisions/inbox.md）があれば終了コード3（Issue #557）
//   node tools/autopilot-state.mjs finish                push してから unlock（停止時）
//   node tools/autopilot-state.mjs pull | push | lock <local|cloud> | unlock   （個別実行）
// 状態リポジトリの URL は環境変数 STEAM_KIDS_STATE_REPO（既定は下の DEFAULT_REPO）。<MAIN> は STEAM_KIDS_MAIN か、git worktree list の先頭。
// 終了コード：0 成功／1 エラー／2 lock の競合／3 手元に未同期の編集。状態リポジトリの作業コピーは <MAIN>/.worktrees/_state（.worktrees/ は git 管理外）。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_REPO = 'https://github.com/projectx1478/steam-kids-state.git';
export const LOCK_FILE = 'lock.txt';
export const LOCK_HOURS = 12;
const IDENT = ['-c', 'user.name=projectx1478', '-c', 'user.email=295812551+projectx1478@users.noreply.github.com'];
const SKIP_DIRS = new Set(['runlogs']); // 手元だけのログ
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const INBOX_FILE = 'queue-inbox.md';
export const HASH_FILE = 'autopilot-sync-hash.json'; // <MAIN>/.git/ 直下（作業ツリーの外。state の clone には入らない）
const WATCHED = ['autopilot/queue.md', 'autopilot/log.md', 'autopilot/decisions/inbox.md']; // review/ 相対

export class LockConflict extends Error {}
export class UnsyncedEdit extends Error {}

function git(args, cwd, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} 失敗: ${(r.stderr || r.error?.message || '').trim()}`);
  }
  return r.stdout;
}

export function findMain() {
  if (process.env.STEAM_KIDS_MAIN) return path.resolve(process.env.STEAM_KIDS_MAIN);
  const out = git(['worktree', 'list', '--porcelain'], ROOT);
  const line = out.split(/\r?\n/).find((l) => l.startsWith('worktree '));
  return path.resolve(line.slice('worktree '.length));
}

// 状態リポジトリの作業コピーを作る／最新にする。リモートが空なら空のまま main を指す。
export function ensureClone(main, repo = process.env.STEAM_KIDS_STATE_REPO || DEFAULT_REPO) {
  const dir = path.join(main, '.worktrees', '_state');
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    git(['clone', repo, dir], main);
  } else {
    git(['fetch', 'origin'], dir);
  }
  git(['config', 'core.autocrlf', 'false'], dir); // 改行を変換しない（Windows の手元とクラウドで内容を一致させる）
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'], dir);
  if (git(['rev-parse', '--verify', '-q', 'origin/main'], dir, { allowFail: true })) git(['reset', '--hard', 'origin/main'], dir);
  return dir;
}

function listFiles(dir, rel = '', skipFiles = []) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : listFiles(path.join(dir, e.name), r, skipFiles);
    if (skipFiles.includes(r)) return [];
    return e.name === LOCK_FILE ? [] : [r];
  });
}

function copyChanged(srcDir, dstDir, files) {
  let n = 0;
  for (const f of files) {
    const s = path.join(srcDir, f);
    const d = path.join(dstDir, f);
    if (fs.existsSync(d) && fs.readFileSync(s).equals(fs.readFileSync(d))) continue;
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(s, d);
    n++;
  }
  return n;
}

const handoffs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^handoff-.*\.md$/.test(f)) : []);

// 同期する対象。状態リポジトリ側の名前は design/・autopilot/・handoff/。コピーは追加と上書きだけで、削除はしない。
function targets(main, clone) {
  const review = path.join(main, 'review');
  return {
    review,
    pairs: [
      [path.join(review, 'design'), path.join(clone, 'design')],
      [path.join(review, 'autopilot'), path.join(clone, 'autopilot')],
    ],
    handoffLocal: review,
    handoffState: path.join(clone, 'handoff'),
  };
}

const hashPath = (main) => path.join(main, '.git', HASH_FILE);
const fileHash = (f) => (fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null);
const currentHashes = (main) => Object.fromEntries(WATCHED.map((r) => [r, fileHash(path.join(main, 'review', r))]));

function saveHashes(main) {
  fs.mkdirSync(path.dirname(hashPath(main)), { recursive: true });
  fs.writeFileSync(hashPath(main), JSON.stringify(currentHashes(main)));
}

// 前回の pull／push の後に、手元の queue.md・log.md・decisions/inbox.md が変わっていれば、変わったファイル名を返す。記録が無ければ（初回）空。
export function unsyncedFiles(main) {
  if (!fs.existsSync(hashPath(main))) return [];
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(hashPath(main), 'utf8'));
  } catch {
    return [];
  }
  const cur = currentHashes(main);
  return WATCHED.filter((r) => r in saved && saved[r] !== cur[r]);
}

const NL = String.fromCharCode(10);
const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim()) : []);

// 受け口は上書きせず、state 側と手元の行を重複なしで結合して手元へ書く。
function mergeInbox(stateDir, localDir) {
  const merged = [...new Set([...lines(path.join(stateDir, INBOX_FILE)), ...lines(path.join(localDir, INBOX_FILE))])];
  if (!merged.length) return;
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(path.join(localDir, INBOX_FILE), merged.join(NL) + NL);
}

export function pull(main, repo) {
  const bad = unsyncedFiles(main);
  if (bad.length) throw new UnsyncedEdit(`STOP（手元に未同期の編集）: ${bad.join('・')}`);
  const clone = ensureClone(main, repo);
  const t = targets(main, clone);
  let n = 0;
  for (const [local, state] of t.pairs) n += copyChanged(state, local, listFiles(state, '', [INBOX_FILE]));
  mergeInbox(t.pairs[1][1], t.pairs[1][0]);
  n += copyChanged(t.handoffState, t.handoffLocal, handoffs(t.handoffState));
  saveHashes(main);
  return n;
}

// 受け口の行を queue.md の末尾へ移し、受け口を空にする。移した行数を返す。
export function drainInbox(main) {
  const dir = path.join(main, 'review', 'autopilot');
  const inbox = path.join(dir, INBOX_FILE);
  const rows = lines(inbox);
  if (!rows.length) return 0;
  const q = path.join(dir, 'queue.md');
  const cur = fs.existsSync(q) ? fs.readFileSync(q, 'utf8') : '';
  fs.writeFileSync(q, (cur && !cur.endsWith(NL) ? cur + NL : cur) + rows.join(NL) + NL);
  fs.writeFileSync(inbox, '');
  return rows.length;
}

export function start(main, owner, repo) {
  lock(main, owner, repo);
  const n = pull(main, repo);
  return { pulled: n, drained: drainInbox(main) };
}

function commitPush(clone, message) {
  git(['add', '-A'], clone);
  if (!git(['status', '--porcelain'], clone).trim()) return false;
  git([...IDENT, 'commit', '-m', message], clone);
  git(['push', '-u', 'origin', 'main'], clone);
  return true;
}

export function push(main, repo, now = new Date()) {
  const clone = ensureClone(main, repo);
  const t = targets(main, clone);
  for (const [local, state] of t.pairs) copyChanged(local, state, listFiles(local));
  copyChanged(t.handoffLocal, t.handoffState, handoffs(t.handoffLocal));
  const r = commitPush(clone, `state ${now.toISOString()}`);
  saveHashes(main);
  return r;
}

export function lock(main, owner, repo, now = new Date()) {
  const clone = ensureClone(main, repo);
  const f = path.join(clone, LOCK_FILE);
  if (fs.existsSync(f)) {
    const [cur, at] = fs.readFileSync(f, 'utf8').trim().split(/\s+/);
    const ageH = (now - new Date(at)) / 3600000;
    if (cur !== owner && !(ageH >= LOCK_HOURS)) throw new LockConflict(`${cur} が lock 中（${at}。${LOCK_HOURS}時間たつまで取れない）`);
  }
  fs.writeFileSync(f, `${owner} ${now.toISOString()}\n`);
  commitPush(clone, `lock ${owner}`);
}

export function unlock(main, repo) {
  const clone = ensureClone(main, repo);
  fs.rmSync(path.join(clone, LOCK_FILE), { force: true });
  commitPush(clone, 'unlock');
}

function cli(argv) {
  const [cmd, arg] = argv;
  const main = findMain();
  const need = () => {
    if (arg !== 'local' && arg !== 'cloud') throw new Error('持ち主は local か cloud');
    return arg;
  };
  switch (cmd) {
    case 'start': {
      const r = start(main, need());
      console.log(`pull: ${r.pulled} ファイル／受け口から queue.md へ: ${r.drained} 行`);
      break;
    }
    case 'finish': console.log(`push: ${push(main) ? '更新あり' : '差分なし'}`); unlock(main); break;
    case 'pull': console.log(`pull: ${pull(main)} ファイル`); break;
    case 'push': console.log(`push: ${push(main) ? '更新あり' : '差分なし'}`); break;
    case 'lock': lock(main, need()); break;
    case 'unlock': unlock(main); break;
    default: throw new Error('使い方: start|finish|pull|push|lock|unlock（start と lock は local か cloud を付ける）');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    cli(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(e instanceof LockConflict ? 2 : e instanceof UnsyncedEdit ? 3 : 1);
  }
}
