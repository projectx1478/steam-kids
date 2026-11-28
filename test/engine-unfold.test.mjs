// unfold-cube（てんかいず・はこ）：エンジン純関数と validate（Issue #289 段1）。盤は test/fixtures/unfold/（設計の29盤）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { foldTree, isCubeNet, firstOverlap, disconnectedCells, solutionsOf, countSolutions, gridNets, CUBE_CELLS, COLOR_IDS, isOpenBoxNet, baseCell, oppositePairs, firstColorMismatch, colorSolutionCount, netShapeKey } from '../js/engine-unfold.js';
import { validateUnfoldFace, validateUnfold, checkUnfoldDemo } from '../tools/lib/validate/unfold.mjs';
import { validateLesson } from '../tools/validate-lessons.mjs';

const DIR = 'test/fixtures/unfold';
const load = (n) => JSON.parse(readFileSync(`${DIR}/${n}.json`, 'utf-8'));
const names = readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('color-')).map((f) => f.replace('.json', ''));
const key = (c) => c.x + ',' + c.y;
const fmt = (cells) => cells.map((c) => `(${c.x},${c.y})`).join('');
const collect = () => { const errs = []; return [errs, (rule, detail) => errs.push(`${rule}: ${detail}`)]; };
const playsOf = (b) => b.stages.map((s, i) => ({ stepId: `p${i + 1}`, kind: 'play', ...s }));

// 盤1枚の合否（approved.md の「合格盤・不合格盤」の表の検査を、盤の種類ごとに振り分ける）。
function judge(name) {
  const b = load(name);
  const [errs, add] = collect();
  if (b.stages) validateUnfold(playsOf(b), b.intro, add, true);
  else if (b.intro) checkUnfoldDemo(b.intro.demo, playsOf(load('lesson-ok')), add);
  else if (b.paint) {
    const cells = b.unfold.preset.concat(b.paint);
    if (disconnectedCells(cells).length > 0 || firstOverlap(cells) !== null || !isCubeNet(cells)) add('塗り', '6マスが展開図でない');
  } else {
    validateUnfoldFace({ unfold: b.unfold }, add, '');
    if (b.answer) {
      const s = new Set(b.answer.map(key));
      if (!isCubeNet(b.answer) || !b.unfold.preset.every((c) => s.has(key(c)))) add('answer', 'answer が展開図でない');
    }
  }
  return errs;
}
const EXPECT_PASS = (n) => /^(pass|stage)-|^lesson-ok$/.test(n);

test('validate: 盤29枚（合格11・不合格18）が期待どおり', () => {
  assert.equal(names.length, 29);
  const pass = names.filter((n) => judge(n).length === 0);
  assert.equal(pass.length, 11);
  for (const n of names) assert.equal(judge(n).length === 0, EXPECT_PASS(n), `${n}: ${judge(n).join(' / ')}`);
});

test('validate: 面の正解数は 1,2,4,6,8,16,22,54（stage-1〜8）', () => {
  const got = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => countSolutions(5, 3, load(`stage-${i}`).unfold.preset));
  assert.deepEqual(got, [1, 2, 4, 6, 8, 16, 22, 54]);
  assert.equal(countSolutions(5, 3, []), 64);
});

// 正準形（回転・反転・平行移動を同一視）。
const T = [
  ([x, y]) => [x, y], ([x, y]) => [-y, x], ([x, y]) => [-x, -y], ([x, y]) => [y, -x],
  ([x, y]) => [-x, y], ([x, y]) => [y, x], ([x, y]) => [x, -y], ([x, y]) => [-y, -x],
];
const norm = (pts) => {
  const mx = Math.min(...pts.map((p) => p[0]));
  const my = Math.min(...pts.map((p) => p[1]));
  return pts.map((p) => [p[0] - mx, p[1] - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
const canon = (pts) => T.map((f) => norm(pts.map(f)).map((p) => p.join(',')).join(';')).sort()[0];
function hexominoes() {
  let cur = new Map([[canon([[0, 0]]), [[0, 0]]]]);
  for (let n = 2; n <= 6; n += 1) {
    const nxt = new Map();
    for (const pts of cur.values()) {
      const s = new Set(pts.map((p) => p.join(',')));
      for (const [x, y] of pts) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const p = [x + dx, y + dy];
          if (s.has(p.join(','))) continue;
          const np = [...pts, p];
          const k = canon(np);
          if (!nxt.has(k)) nxt.set(k, norm(np));
        }
      }
    }
    cur = nxt;
  }
  return [...cur.values()];
}

test('isCubeNet: ヘキソミノ35種のうち11種だけが展開図', () => {
  const hex = hexominoes();
  assert.equal(hex.length, 35);
  const nets = hex.filter((pts) => isCubeNet(pts.map(([x, y]) => ({ x, y }))));
  assert.equal(nets.length, 11);
  // 8通りの向きすべてで同じ判定（回転・反転で変わらない）
  for (const pts of hex) {
    const want = isCubeNet(pts.map(([x, y]) => ({ x, y })));
    for (const f of T) assert.equal(isCubeNet(norm(pts.map(f)).map(([x, y]) => ({ x, y }))), want);
  }
  // 5×3 の正解集合64通りは11種すべてを含む
  const types = new Set(gridNets(5, 3).map((n) => canon(n.map((c) => [c.x, c.y]))));
  assert.equal(types.size, 11);
});

test('isCubeNet: 6マス以外・重複・非連結・2×2を含む形は偽', () => {
  assert.equal(isCubeNet([{ x: 0, y: 0 }]), false);
  assert.equal(isCubeNet(Array.from({ length: 6 }, () => ({ x: 0, y: 0 }))), false);
  assert.equal(isCubeNet([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]), false);
  assert.equal(isCubeNet([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 }]), false);
});

test('solutionsOf: 別の6マスでも正解（solution を共有しない形）／決定的', () => {
  const p = load('stage-8').unfold.preset;
  const sols = solutionsOf(5, 3, p);
  assert.equal(sols.length, 54);
  assert.notDeepEqual(sols[0], sols[sols.length - 1]);
  for (const s of [sols[0], sols[sols.length - 1]]) {
    assert.equal(isCubeNet(s), true);
    assert.equal(p.every((c) => s.some((d) => key(d) === key(c))), true);
  }
  assert.deepEqual(solutionsOf(5, 3, p), sols);
});

test('firstOverlap: 規約（先頭マス＝y最小・x最小、上右下左の幅優先）と決定性', () => {
  const six = load('fail-six-notnet').unfold.preset;
  const r = firstOverlap(six);
  assert.equal(fmt(r), '(0,1)(1,1)');
  assert.equal(fmt(firstOverlap([...six].reverse())), '(0,1)(1,1)', '入力順によらない');
  assert.equal(fmt(firstOverlap(six)), fmt(r), '毎回同じ');
  assert.equal(firstOverlap(load('pass-a').answer), null);
});

test('disconnectedCells: 最大成分に入らないマス（同数なら先頭マスの成分を最大とみなす）', () => {
  const d = load('fail-disconnect-paint');
  assert.equal(fmt(disconnectedCells(d.unfold.preset.concat(d.paint))), '(0,0)(4,0)(0,2)(4,2)');
  assert.deepEqual(disconnectedCells(load('pass-a').answer), []);
  // 3マス＋3マス：先頭マス(0,0)の成分が最大とみなされ、もう一方が返る
  const two = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }];
  assert.equal(fmt(disconnectedCells(two)), '(0,2)(1,2)(2,2)');
});

test('枚数≠6 は判定対象外（stage-1 の5枚は「ためす」で進まず点滅なし。UI が CUBE_CELLS で弾く）', () => {
  const p = load('stage-1').unfold.preset;
  assert.equal(p.length, 5);
  assert.notEqual(p.length, CUBE_CELLS);
  assert.equal(isCubeNet(p), false);
});

test('validateLesson: type unfold-cube の分岐が呼ばれる（8面でないと不合格）', () => {
  const b = load('lesson-ok');
  const steps = [
    { stepId: 'i', kind: 'intro', text: 'あ', demo: b.intro.demo },
    ...playsOf(b).map((p) => ({ ...p, text: 'あ' })),
    { stepId: 's', kind: 'summary', text: 'あ' },
  ];
  const data = { lessonId: 'unfold-test', unitId: 'u', title: 'あ', type: 'unfold-cube', estimatedMinutes: 8, steps };
  assert.deepEqual(validateLesson('unfold-test.json', data, ['unfold-test']), []);
  const bad = { ...data, steps: steps.filter((s) => s.stepId !== 'p3') };
  assert.ok(validateLesson('unfold-test.json', bad, ['unfold-test']).length > 0);
});

// --- foldTree（Issue #713 段A） ---
const P1 = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }];
const xy = (cs) => cs.map((c) => `${c.x},${c.y}`);

test('foldTree: p1＋(1,1) は重なり (0,0)(4,1)・穴 [5]', () => {
  const r = foldTree([...P1, { x: 1, y: 1 }]);
  assert.deepEqual(r.over, [{ x: 0, y: 0 }, { x: 4, y: 1 }]);
  assert.deepEqual(r.holes, [5]);
});

test('foldTree: p1＋(2,0) は展開図（重なり・穴なし）で face と dir が決まった列', () => {
  const r = foldTree([...P1, { x: 2, y: 0 }]);
  assert.deepEqual(r.over, []);
  assert.deepEqual(r.holes, []);
  assert.deepEqual(r.nodes.map((n) => n.face), [0, 4, 1, 3, 5, 2]);
  assert.deepEqual(r.nodes.map((n) => n.dir), [null, 'E', 'E', 'S', 'E', 'E']);
  assert.equal(r.nodes[0].parent, null);
  assert.deepEqual(r.nodes[1].parent, { x: 0, y: 0 });
});

test('foldTree: p1＋(0,2) は離れたマスを除く（nodes は (2,1)(3,1)(4,1)・穴 [2,3,5]）', () => {
  const r = foldTree([...P1, { x: 0, y: 2 }]);
  assert.deepEqual(xy(r.nodes), ['2,1', '3,1', '4,1']);
  assert.deepEqual(r.holes, [2, 3, 5]);
});

test('foldTree: 2×2 を含む形は重なり (0,1)(1,1)・穴 [5]', () => {
  const r = foldTree([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
  assert.deepEqual(r.over, [{ x: 0, y: 1 }, { x: 1, y: 1 }]);
  assert.deepEqual(r.holes, [5]);
});

test('foldTree: 空・非配列は穴が全6面', () => {
  for (const v of [[], null, undefined, 'x']) assert.deepEqual(foldTree(v), { nodes: [], over: [], holes: [0, 1, 2, 3, 4, 5] });
});

test('foldTree: 5×3 の6マス集合 5005 通り全件で isCubeNet・firstOverlap と整合', () => {
  const all = [];
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 5; x += 1) all.push({ x, y });
  let n = 0;
  const pick = [];
  const rec = (i) => {
    if (pick.length === 6) {
      n += 1;
      const c = pick.map((j) => all[j]);
      const r = foldTree(c);
      assert.equal(isCubeNet(c), r.over.length === 0 && r.holes.length === 0, fmt(c));
      if (disconnectedCells(c).length === 0 && !isCubeNet(c)) {
        assert.ok(r.over.length >= 2, fmt(c));
        const ov = new Set(r.over.map(key));
        for (const m of firstOverlap(c)) assert.ok(ov.has(key(m)), fmt(c));
      }
      return;
    }
    if (i >= all.length) return;
    pick.push(i); rec(i + 1); pick.pop(); rec(i + 1);
  };
  rec(0);
  assert.equal(n, 5005);
});

// --- 色ぬり（Issue #811 段B1） ---
const cs = (...p) => p.map(([x, y]) => ({ x, y }));
const X5 = cs([2, 0], [1, 1], [2, 1], [3, 1], [2, 2]);
const T5 = cs([1, 0], [2, 0], [3, 0], [2, 1], [2, 2]);
const CROSS6 = cs([1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]);
const grid5x3 = () => { const a = []; for (let y = 0; y < 3; y += 1) for (let x = 0; x < 5; x += 1) a.push({ x, y }); return a; };
const subsets = (all, k) => {
  const out = [];
  const pick = [];
  const rec = (i) => {
    if (pick.length === k) { out.push(pick.map((j) => all[j])); return; }
    if (i >= all.length) return;
    pick.push(i); rec(i + 1); pick.pop(); rec(i + 1);
  };
  rec(0);
  return out;
};

test('COLOR_IDS は a・b・c', () => assert.deepEqual(COLOR_IDS, ['a', 'b', 'c']));

test('isOpenBoxNet: X・T は真、I・P・U・V・6マス・不正入力は偽', () => {
  assert.equal(isOpenBoxNet(X5), true);
  assert.equal(isOpenBoxNet(T5), true);
  assert.equal(isOpenBoxNet(cs([0, 0], [1, 0], [2, 0], [3, 0], [4, 0])), false);
  assert.equal(isOpenBoxNet(cs([0, 0], [1, 0], [0, 1], [1, 1], [0, 2])), false);
  assert.equal(isOpenBoxNet(cs([0, 0], [2, 0], [0, 1], [1, 1], [2, 1])), false);
  assert.equal(isOpenBoxNet(cs([0, 0], [0, 1], [0, 2], [1, 2], [2, 2])), false);
  assert.equal(isOpenBoxNet(CROSS6), false);
  assert.equal(isOpenBoxNet(cs([2, 0], [1, 1], [2, 1], [3, 1], [3, 1])), false);
  assert.equal(isOpenBoxNet(cs([2, 0], [1, 1], [2, 1], [3, 1], [4, 2])), false);
  for (const v of [null, undefined, 'x', [], [1, 2, 3, 4, 5]]) assert.equal(isOpenBoxNet(v), false);
});

test('5×3 の5マス全件：ふたのない箱の展開図は111通り・8型、立方体の展開図は64通り・11型', () => {
  const boxes = subsets(grid5x3(), 5).filter(isOpenBoxNet);
  assert.equal(boxes.length, 111);
  assert.equal(new Set(boxes.map(netShapeKey)).size, 8);
  const cubes = gridNets(5, 3);
  assert.equal(cubes.length, 64);
  assert.equal(new Set(cubes.map(netShapeKey)).size, 11);
});

test('baseCell: X・T は (2,1)、立方体の展開図・展開図でない形は null', () => {
  assert.deepEqual(baseCell(X5), { x: 2, y: 1 });
  assert.deepEqual(baseCell(T5), { x: 2, y: 1 });
  assert.equal(baseCell(CROSS6), null);
  assert.equal(baseCell(cs([0, 0], [1, 0], [2, 0], [3, 0], [4, 0])), null);
});

test('oppositePairs: X・十字6マス・展開図でない形', () => {
  assert.deepEqual(oppositePairs(X5), [cs([2, 0], [2, 2]), cs([1, 1], [3, 1])]);
  assert.deepEqual(oppositePairs(CROSS6), [cs([1, 0], [1, 2]), cs([1, 1], [3, 1]), cs([0, 1], [2, 1])]);
  const p1 = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 1, y: 1 }];
  assert.deepEqual(oppositePairs(p1), []);
  assert.deepEqual(oppositePairs(null), []);
});

test('oppositePairs: 64通り（3組）と111通り（2組）の全件で、各組の面が {0,1}・{2,3}・{4,5}', () => {
  const all = [...gridNets(5, 3), ...subsets(grid5x3(), 5).filter(isOpenBoxNet)];
  assert.equal(all.length, 175);
  for (const net of all) {
    const pairs = oppositePairs(net);
    assert.equal(pairs.length, net.length === 6 ? 3 : 2, fmt(net));
    const face = new Map(foldTree(net).nodes.map((n) => [key(n), n.face]));
    const seen = new Set();
    for (const [a, b] of pairs) {
      const f = [face.get(key(a)), face.get(key(b))].sort();
      assert.equal(f[1], f[0] + 1, fmt(net));
      assert.equal(f[0] % 2, 0, fmt(net));
      seen.add(f[0]);
    }
    assert.equal(seen.size, pairs.length);
  }
});

test('firstColorMismatch: X の例・十字6マスの例', () => {
  const c = { '2,0': 'a', '1,1': 'b', '2,2': 'a', '3,1': 'a' };
  assert.deepEqual(firstColorMismatch(X5, c), cs([1, 1], [3, 1]));
  assert.equal(firstColorMismatch(X5, { ...c, '3,1': 'b' }), null);
  assert.deepEqual(firstColorMismatch(X5, { '1,1': 'b', '3,1': 'b' }), cs([2, 0], [2, 2]));
  const six = { '1,0': 'a', '1,1': 'b', '2,1': 'c', '1,2': 'b', '3,1': 'a', '0,1': 'c' };
  assert.deepEqual(firstColorMismatch(CROSS6, six), cs([1, 0], [1, 2]));
  assert.equal(firstColorMismatch(CROSS6, { '1,0': 'a', '1,2': 'a', '1,1': 'b', '3,1': 'b', '0,1': 'c', '2,1': 'c' }), null);
});

test('colorSolutionCount: X は1、p7 の net は3', () => {
  assert.equal(colorSolutionCount(X5, { '2,0': 'a', '1,1': 'b' }), 1);
  const p7 = cs([0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [4, 1]);
  assert.equal(colorSolutionCount(p7, { '0,0': 'a', '1,0': 'b' }), 3);
});

test('netShapeKey: X の型と、平行移動・90°回転・左右反転で不変', () => {
  assert.equal(netShapeKey(X5), '1,0|0,1|1,1|2,1|1,2');
  assert.equal(netShapeKey(X5.map((c) => ({ x: c.x + 2, y: c.y }))), netShapeKey(X5));
  const t = cs([0, 0], [0, 1], [1, 1], [2, 1], [0, 2]);
  assert.equal(netShapeKey(t), '0,0|0,1|1,1|2,1|0,2');
  assert.equal(netShapeKey(T5), netShapeKey(t));
  assert.equal(netShapeKey(T5.map((c) => ({ x: -c.x, y: c.y }))), netShapeKey(T5));
  assert.equal(netShapeKey(T5.map((c) => ({ x: -c.y, y: c.x }))), netShapeKey(T5));
});
