import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, parseClaims, lockStatus, overlapFiles } from '../tools/parallel-check.mjs';

const T0 = '2026-11-01T00:00:00Z';
const T1 = '2026-11-01T01:00:00Z';
const T2 = '2026-11-01T02:00:00Z';
const claim = (env, branch, createdAt = T1) => ({ body: `着手: env=${env} branch=${branch}`, createdAt });
const release = (env, branch, createdAt = T2) => ({ body: `解除: env=${env} branch=${branch} 中断`, createdAt });
const pr = (o) => ({ number: 1, headRefName: 'x', body: '', createdAt: T2, closingIssuesReferences: [], ...o });

// gh/git のスタブ。calls に gh の呼び出しを記録する。
function stub({ comments = [], allPrs = [], openPrs = [], diff = '', branch = 'feature/issue-639-a', ghFail = false, prView = null } = {}) {
  const calls = [];
  const out = [];
  const err = [];
  const gh = (args) => {
    calls.push(args);
    if (ghFail) throw Object.assign(new Error('boom'), { stderr: 'gh: not logged in' });
    if (args[0] === 'issue' && args[1] === 'view') return JSON.stringify({ comments });
    if (args[0] === 'issue' && args[1] === 'comment') return '';
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(args.includes('all') ? allPrs : openPrs);
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify(prView);
    throw new Error('unexpected ' + args.join(' '));
  };
  const git = (args) => (args[0] === 'rev-parse' ? branch + '\n' : diff);
  return { calls, out, err, deps: (env = {}) => ({ gh, git, env, out: (l) => out.push(l), err: (l) => err.push(l) }) };
}
const writes = (s) => s.calls.filter((c) => c[0] === 'issue' && c[1] === 'comment');
const ME = { PARALLEL_ENV: 'local' };
const go = (s, argv, env = ME) => run(argv, s.deps(env));

test('他環境の着手のみ -> 2', () => {
  const s = stub({ comments: [claim('cloud', 'b1')] });
  assert.equal(go(s, ['639']), 2);
});
test('着手+解除(env・branch一致) -> 0', () => {
  const s = stub({ comments: [claim('cloud', 'b1'), release('cloud', 'b1')] });
  assert.equal(go(s, ['639']), 0);
});
test('解除の env が違う -> 2', () => {
  const s = stub({ comments: [claim('cloud', 'b1'), release('local', 'b1')] });
  assert.equal(go(s, ['639']), 2);
});
test('解除の branch が違う -> 2', () => {
  const s = stub({ comments: [claim('cloud', 'b1'), release('cloud', 'b2')] });
  assert.equal(go(s, ['639']), 2);
});
test('着手より後に作られた紐づくPR -> 0', () => {
  const s = stub({ comments: [claim('cloud', 'b1', T1)], allPrs: [pr({ body: 'Closes #639', createdAt: T2 })] });
  assert.equal(go(s, ['639']), 0);
});
test('着手より前のPRは無視して2', () => {
  const s = stub({ comments: [claim('cloud', 'b1', T1)], allPrs: [pr({ body: 'Closes #639', createdAt: T0 })] });
  assert.equal(go(s, ['639']), 2);
});
test('自分の着手のみ -> 0', () => {
  const s = stub({ comments: [claim('local', 'feature/issue-639-a')] });
  assert.equal(go(s, ['639']), 0);
});
test('env だけ同じで branch が違う -> 2', () => {
  const s = stub({ comments: [claim('local', 'other')] });
  assert.equal(go(s, ['639']), 2);
});
test('branch だけ同じで env が違う -> 2', () => {
  const s = stub({ comments: [claim('cloud', 'feature/issue-639-a')] });
  assert.equal(go(s, ['639']), 2);
});
test('#63 は #639 に紐づかず、#639 は紐づく', () => {
  const c = [claim('cloud', 'b1', T1)];
  assert.equal(go(stub({ comments: c, allPrs: [pr({ body: 'refs #63 and #6390' })] }), ['639']), 2);
  assert.equal(go(stub({ comments: c, allPrs: [pr({ body: 'refs #639.' })] }), ['639']), 0);
});
test('closingIssuesReferences と headRefName でも紐づく', () => {
  const c = [claim('cloud', 'b1', T1)];
  assert.equal(go(stub({ comments: c, allPrs: [pr({ closingIssuesReferences: [{ number: 639 }] })] }), ['639']), 0);
  assert.equal(go(stub({ comments: c, allPrs: [pr({ headRefName: 'feature/issue-639-x' })] }), ['639']), 0);
});
test('重なりあり -> 3 (自分のブランチのPRは除く)', () => {
  const s = stub({
    diff: 'a.js\nb.js\n',
    openPrs: [
      { number: 5, headRefName: 'other', files: [{ path: 'b.js' }] },
      { number: 6, headRefName: 'feature/issue-639-a', files: [{ path: 'a.js' }] },
    ],
  });
  assert.equal(go(s, ['639']), 3);
  assert.ok(s.out.some((l) => l.includes('#5') && l.includes('b.js')));
  assert.ok(!s.out.some((l) => l.includes('#6:')));
});
test('ロックと重なりの両方 -> 2', () => {
  const s = stub({ comments: [claim('cloud', 'b1')], diff: 'a.js', openPrs: [{ number: 5, headRefName: 'o', files: [{ path: 'a.js' }] }] });
  assert.equal(go(s, ['639']), 2);
});
test('--pr はロックを見ず、重なりだけで 0/3', () => {
  const comments = [claim('cloud', 'b1')];
  const open = [
    { number: 10, headRefName: 'me', files: [{ path: 'a.js' }] },
    { number: 11, headRefName: 'o', files: [{ path: 'z.js' }] },
  ];
  const s0 = stub({ comments, openPrs: open });
  assert.equal(go(s0, ['--pr', '10']), 0);
  assert.ok(!s0.calls.some((c) => c[0] === 'issue'));
  const s3 = stub({ comments, openPrs: [...open, { number: 12, headRefName: 'p', files: [{ path: 'a.js' }] }] });
  assert.equal(go(s3, ['--pr', '10']), 3);
});
test('PARALLEL_ENV 未設定は unknown で照合', () => {
  const s = stub({ comments: [claim('unknown', 'feature/issue-639-a')] });
  assert.equal(go(s, ['639'], {}), 0);
  const s2 = stub({ comments: [claim('unknown', 'zzz')] });
  assert.equal(go(s2, ['639'], {}), 2);
});
test('--claim: ロックなしなら書き込む / ロック有りなら書かない', () => {
  const s = stub();
  assert.equal(go(s, ['639', '--claim', 'env=cloud', 'branch=b9']), 0);
  assert.deepEqual(writes(s)[0], ['issue', 'comment', '639', '--body', '着手: env=cloud branch=b9']);
  const s2 = stub({ comments: [claim('local', 'other')] });
  assert.equal(go(s2, ['639', '--claim', 'env=cloud', 'branch=b9']), 2);
  assert.equal(writes(s2).length, 0);
});
test('--claim: 同一の着手が既にあれば追記しない', () => {
  const s = stub({ comments: [claim('cloud', 'b9')] });
  assert.equal(go(s, ['639', '--claim', 'env=cloud', 'branch=b9']), 0);
  assert.equal(writes(s).length, 0);
});
test('--claim で env/branch 欠け -> 1', () => {
  assert.equal(go(stub(), ['639', '--claim', 'env=cloud']), 1);
});
test('gh 失敗 -> 1 (標準エラーをそのまま出す)', () => {
  const s = stub({ ghFail: true });
  assert.equal(go(s, ['639']), 1);
  assert.ok(s.err.some((l) => l.includes('gh: not logged in')));
});
test('不正な引数 -> 1', () => {
  assert.equal(go(stub(), ['abc']), 1);
  assert.equal(go(stub(), ['639', '--pr', '1']), 1);
  assert.equal(go(stub(), ['--pr', '1', '--claim', 'env=a', 'branch=b']), 1);
});
test('--limit 付きで呼び、31件目以降の紐づくPRを拾う', () => {
  const filler = Array.from({ length: 50 }, (_, i) => pr({ number: 100 + i, body: 'none', createdAt: `2026-11-01T0${3 + (i % 5)}:00:00Z` }));
  const target = pr({ number: 999, body: 'Closes #639', createdAt: T2 });
  const s = stub({ comments: [claim('cloud', 'b1', T1)], allPrs: [...filler, target] });
  assert.equal(go(s, ['639']), 0);
  const all = s.calls.find((c) => c[0] === 'pr' && c.includes('all'));
  assert.equal(all[all.indexOf('--limit') + 1], '200');
  const open = s.calls.find((c) => c[0] === 'pr' && c.includes('open'));
  assert.equal(open[open.indexOf('--limit') + 1], '100');
});
test('上限到達で警告を出し 2', () => {
  const prs = Array.from({ length: 200 }, (_, i) => pr({ number: 100 + i, body: 'none', createdAt: T2 }));
  const s = stub({ comments: [claim('cloud', 'b1', T1)], allPrs: prs });
  assert.equal(go(s, ['639']), 2);
  assert.ok(s.err.some((l) => l.includes('上限に達した')));
});
test('上限到達で他環境の着手が無くても警告を出し 0', () => {
  const prs = Array.from({ length: 200 }, (_, i) => pr({ number: 100 + i, body: 'none', createdAt: T2 }));
  const s = stub({ allPrs: prs });
  assert.equal(go(s, ['639']), 0);
  assert.ok(s.err.some((l) => l.includes('上限に達した')));
});
test('--pr はオープンPR上限到達で警告のみ (0 のまま)', () => {
  const open = [{ number: 10, headRefName: 'me', files: [{ path: 'a.js' }] }];
  for (let i = 0; i < 99; i++) open.push({ number: 200 + i, headRefName: 'o' + i, files: [{ path: 'q' + i }] });
  const s = stub({ openPrs: open });
  assert.equal(go(s, ['--pr', '10']), 0);
  assert.ok(s.err.some((l) => l.includes('上限に達した')));
});

test('parseClaims は行頭一致のみ読む', () => {
  const r = parseClaims([{ body: '説明 着手: env=a branch=b\n着手: env=x branch=y\n解除: env=x branch=y', createdAt: T1 }]);
  assert.deepEqual(r.map((c) => c.type + c.env), ['claimx', 'releasex']);
});
test('lockStatus / overlapFiles の単体', () => {
  const l = lockStatus(parseClaims([claim('cloud', 'b1')]), [], { env: 'local', branch: 'b' }, 639);
  assert.equal(l.locked, true);
  assert.deepEqual(overlapFiles(['a'], [{ number: 1, headRefName: 'h', files: [{ path: 'a' }] }], null, null), [{ number: 1, files: ['a'] }]);
});
