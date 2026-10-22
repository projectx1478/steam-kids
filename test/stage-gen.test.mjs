// stage-gen: 1盤の生成（Issue #337 段2）。受理した盤が solution の再生でクリアでき、必須性が真で、最短が範囲内。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoard, canonicalKey, metrics, itemsMustMatter, GEN_VERSION, GEN_ABORTED, MAX_WORK } from '../tools/gen/stage-gen.mjs';
import { simulate, isRunCleared, shortestSteps } from '../js/engine-grid.js';
import { mattersFor } from '../js/gimmicks/index.js';
import { iceMustMatter, keysMustMatter, warpsMustMatter, periodicMustMatter, paintMustMatter, waterMustMatter } from '../tools/lib/must-matter.mjs';
import { checkStageGen } from '../tools/lib/validate/stagegen.mjs';

const base = {
  ver: GEN_VERSION,
  grid: { cols: { min: 4, max: 6 }, rows: { min: 4, max: 6 } },
  walls: { min: 2, max: 6 },
  shortestPath: { min: 4, max: 12 },
  minTurns: 1,
};
const cases = {
  items: { ...base, gimmicks: { items: { min: 1, max: 3 } }, teach: 'items' },
  ice: { ...base, gimmicks: { ice: { min: 1, max: 2 } }, teach: 'ice' },
  keys: { ...base, gimmicks: { keys: { min: 1, max: 1 } }, teach: 'keys' },
  cushion: { ...base, gimmicks: { ice: { min: 1, max: 2 }, cushion: { min: 1, max: 2 } }, teach: 'cushion' },
  switches: { ...base, gimmicks: { switches: { min: 1, max: 2 } }, teach: 'switches' },
  warps: { ...base, gimmicks: { warps: { min: 1, max: 2 } }, teach: 'warps' },
  periodic: { ...base, gimmicks: { periodic: { min: 1, max: 2 } }, teach: 'periodic' },
  paint: { ...base, gimmicks: { paint: { min: 4, max: 8 } }, teach: 'paint' },
  water: { ...base, gimmicks: { water: { min: 2, max: 4 } }, teach: 'water' },
};
const SEEDS = 30;

test('stage-gen: 受理した盤は solution でクリアでき、必須性が真で、最短が範囲内', () => {
  for (const [teach, sg] of Object.entries(cases)) {
    let accepted = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const b = generateBoard(sg, seed);
      if (!b) continue;
      accepted += 1;
      const tag = `${teach} seed=${seed}`;
      assert.ok(isRunCleared(simulate(b.solution, b)), `${tag}: solution でクリアできない`);
      assert.equal(b.maxCommands, b.solution.length, tag);
      assert.equal(shortestSteps(b), b.solution.length, tag);
      assert.ok(b.solution.length >= 4 && b.solution.length <= 12, `${tag}: 最短が範囲外`);
      assert.ok(metrics(b).turns >= 1, `${tag}: 曲がり角が足りない`);
      assert.ok(b.grid.cols <= 6 && b.grid.rows <= 6, tag);
      if (teach === 'items') assert.ok(itemsMustMatter(b, b.solution.length), `${tag}: どんぐり必須でない`);
      if (teach === 'ice') assert.ok(iceMustMatter(b).matters && b.ice.length > 0, `${tag}: こおり必須でない`);
      if (teach === 'keys') assert.ok(keysMustMatter(b).matters && b.doors.length > 0, `${tag}: かぎ必須でない`);
      if (teach === 'cushion') assert.ok(mattersFor('cushion', b, b.solution.length) && b.cushion.length > 0 && b.ice.length > 0, `${tag}: クッション必須でない`);
      if (teach === 'switches') {
        assert.ok(mattersFor('switches', b, b.solution.length) && b.switches.length > 0, `${tag}: スイッチ必須でない`);
        assert.ok(b.switches.every((sw) => sw.targets.length === 1 && !sw.mode), `${tag}: open・1組=スイッチ1+対象1`);
      }
      if (teach === 'warps') {
        assert.ok(warpsMustMatter(b).matters && b.warps.length >= 2, `${tag}: ワープ必須でない`);
        const pairs = [...new Set(b.warps.map((w) => w.pair))];
        assert.ok(pairs.length >= 1 && pairs.length <= 2, tag);
        for (const pr of pairs) assert.equal(b.warps.filter((w) => w.pair === pr).length, 2, `${tag}: pair ${pr} は2個`);
        const cells = new Set(b.warps.map((w) => `${w.x},${w.y}`));
        assert.equal(cells.size, b.warps.length, `${tag}: 穴が重なる`);
        assert.ok(b.warps.every((w) => !(w.x === b.start.x && w.y === b.start.y) && !(w.x === b.goal.x && w.y === b.goal.y)
          && !b.walls.some((q) => q.x === w.x && q.y === w.y)), `${tag}: 穴が start・goal・壁に重なる`);
      }
      if (teach === 'periodic') {
        assert.ok(periodicMustMatter(b, b.solution.length).matters && b.periodic.length >= 1 && b.periodic.length <= 2, `${tag}: 周期ドア必須でない`);
        assert.ok(b.periodic.every((d) => d.period === 3 || d.period === 4), `${tag}: period は 3・4 のみ`);
        const cells = new Set(b.periodic.map((d) => `${d.x},${d.y}`));
        assert.equal(cells.size, b.periodic.length, `${tag}: ドアが重なる`);
        assert.ok(b.periodic.every((d) => !(d.x === b.start.x && d.y === b.start.y) && !(d.x === b.goal.x && d.y === b.goal.y)
          && !b.walls.some((q) => q.x === d.x && q.y === d.y)), `${tag}: ドアが start・goal・壁に重なる`);
        assert.ok(!('repeatBox' in b) && !('groupRepeats' in b) && !('paint' in b), `${tag}: repeatBox・groupRepeats・paint は生成しない`);
      }
      if (teach === 'paint') {
        assert.ok(paintMustMatter(b, b.solution.length).matters, `${tag}: 色ぬり必須でない`);
        assert.ok(b.paint.length >= 4 && b.paint.length <= 8, `${tag}: 目標マス数が 4〜8 でない`);
        const set = new Set(b.paint.map((c) => `${c.x},${c.y}`));
        assert.equal(set.size, b.paint.length, `${tag}: 目標が重なる`);
        assert.ok(set.has(`${b.start.x},${b.start.y}`) && set.has(`${b.goal.x},${b.goal.y}`), `${tag}: 目標に start・goal がない`);
        assert.ok(b.paint.every((c) => !b.walls.some((q) => q.x === c.x && q.y === c.y)), `${tag}: 目標が壁に重なる`);
        // 細い経路型：2×2 の塊を作らない
        assert.ok(b.paint.every((c) => !(set.has(`${c.x + 1},${c.y}`) && set.has(`${c.x},${c.y + 1}`) && set.has(`${c.x + 1},${c.y + 1}`))), `${tag}: 2×2 の塊がある`);
        assert.equal(b.maxCommands, b.solution.length);
        for (const k of ['items', 'ice', 'cushion', 'keys', 'doors', 'switches', 'warps', 'periodic', 'repeatBox', 'groupRepeats']) {
          assert.ok(!(b[k]?.length || b[k] === true), `${tag}: ${k} を持つ`);
        }
      }
      if (teach === 'water') {
        assert.ok(waterMustMatter(b, b.solution.length).matters, `${tag}: 水必須でない`);
        assert.ok(b.water.length >= 2 && b.water.length <= 4, `${tag}: 水マス数が範囲外`);
        assert.equal(b.waterMode, 'cushion', tag);
        const cells = new Set(b.water.map((c) => `${c.x},${c.y}`));
        assert.equal(cells.size, b.water.length, `${tag}: 水が重なる`);
        assert.ok(b.water.every((c) => !(c.x === b.start.x && c.y === b.start.y) && !(c.x === b.goal.x && c.y === b.goal.y)
          && !b.walls.some((q) => q.x === c.x && q.y === c.y)), `${tag}: 水が start・goal・壁に重なる`);
        // 迂回が +2 以上
        const noWater = shortestSteps({ ...b, water: [], bridge: [] });
        assert.ok(b.solution.length >= noWater + 2, `${tag}: 迂回が +2 未満`);
        // 橋は無いか1つ。あれば反対側の2辺が水で、水・壁と重ならない
        assert.ok((b.bridge ?? []).length <= 1, tag);
        for (const br of b.bridge ?? []) {
          const w = (dx, dy) => cells.has(`${br.x + dx},${br.y + dy}`);
          assert.ok((w(-1, 0) && w(1, 0)) || (w(0, -1) && w(0, 1)), `${tag}: 橋の反対側が水でない`);
          assert.ok(!cells.has(`${br.x},${br.y}`) && !b.walls.some((q) => q.x === br.x && q.y === br.y), `${tag}: 橋が水・壁に重なる`);
        }
        for (const k of ['items', 'ice', 'cushion', 'keys', 'doors', 'switches', 'warps', 'periodic', 'paint', 'repeatBox', 'groupRepeats']) {
          assert.ok(!(b[k]?.length || b[k] === true), `${tag}: ${k} を持つ`);
        }
      }
    }
    assert.ok(accepted >= SEEDS / 2, `${teach}: 受理が少ない (${accepted}/${SEEDS})`);
  }
});

test('stage-gen: 同じ seed で同じ盤。ver は GEN_VERSION', () => {
  for (const sg of Object.values(cases)) {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      assert.deepEqual(generateBoard(sg, seed), generateBoard(sg, seed));
    }
  }
  assert.equal(GEN_VERSION, 1);
});

test('stage-gen: canonicalKey は回転・鏡写しで不変、別の盤では異なる', () => {
  const b = generateBoard(cases.items, 1);
  const { cols, rows } = b.grid;
  const mirror = (p) => ({ ...p, x: cols - 1 - p.x });
  const m = {
    ...b, start: mirror(b.start), goal: mirror(b.goal), walls: b.walls.map(mirror), items: b.items.map(mirror),
  };
  assert.equal(canonicalKey(m), canonicalKey(b));
  const t = (p) => ({ ...p, x: p.y, y: p.x });
  const tr = {
    ...b, grid: { cols: rows, rows: cols }, start: t(b.start), goal: t(b.goal),
    walls: b.walls.map(t), items: b.items.map(t),
  };
  assert.equal(canonicalKey(tr), canonicalKey(b));
  assert.notEqual(canonicalKey(generateBoard(cases.items, 2)), canonicalKey(b));
});

test('stage-gen: cushion・switches を指定しない盤は従来どおり（層を持たない）', () => {
  for (const sg of [cases.items, cases.ice, cases.keys]) {
    const b = generateBoard(sg, 1);
    assert.equal(b.cushion, undefined);
    assert.equal(b.switches, undefined);
    assert.ok(!/\|u:|\|x:|\|t:/.test(canonicalKey(b)));
  }
});

test('stage-gen: keyMode は指定したときだけ盤に付き、盤・解は keyMode の有無で変わらない(Issue #391)', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const plain = generateBoard(cases.keys, seed);
    const remote = generateBoard({ ...cases.keys, keyMode: 'remote' }, seed);
    const carry = generateBoard({ ...cases.keys, keyMode: 'carry' }, seed);
    assert.equal(Boolean(plain), Boolean(remote));
    if (!plain) continue;
    assert.equal('keyMode' in plain, false, '無指定なら付かない');
    assert.equal(remote.keyMode, 'remote');
    assert.equal(carry.keyMode, 'carry');
    const { keyMode: _r, ...r } = remote;
    const { keyMode: _c, ...c } = carry;
    assert.deepEqual(r, plain, 'remote 指定でも盤・解は同じ');
    assert.deepEqual(c, plain, 'carry 指定でも盤・解は同じ');
  }
});

test('stage-gen: 探索量の上限を超えたら GEN_ABORTED（null と区別）。上限内なら従来どおり', () => {
  assert.equal(generateBoard({ ...cases.items, shortestPath: { min: 16, max: 16 }, minTurns: 8 }, 1, { maxWork: 100 }), GEN_ABORTED);
  assert.equal(generateBoard({ ...cases.items, shortestPath: { min: 16, max: 16 }, minTurns: 8 }, 1, { maxAttempts: 3 }), null);
  assert.deepEqual(generateBoard(cases.items, 1), generateBoard(cases.items, 1, { maxWork: MAX_WORK }));
});

test('stage-gen: warps を指定しない盤は warps キーを持たず、canonicalKey に warps の層が出ない', () => {
  for (const sg of [cases.items, cases.ice, cases.keys, cases.cushion, cases.switches]) {
    for (let seed = 0; seed < 5; seed += 1) {
      const b = generateBoard(sg, seed);
      if (!b) continue;
      assert.equal('warps' in b, false);
      assert.ok(!/\|p:/.test(canonicalKey(b)));
    }
  }
  const w = generateBoard(cases.warps, 1);
  assert.ok(/\|p:/.test(canonicalKey(w)));
});

test('stage-gen: periodic を指定しない盤は periodic キーを持たず、canonicalKey に周期ドアの層が出ない', () => {
  for (const sg of [cases.items, cases.ice, cases.keys, cases.cushion, cases.switches, cases.warps]) {
    for (let seed = 0; seed < 5; seed += 1) {
      const b = generateBoard(sg, seed);
      if (!b) continue;
      assert.equal('periodic' in b, false);
      assert.ok(!/\|q:/.test(canonicalKey(b)));
    }
  }
  const w = generateBoard(cases.periodic, 1);
  assert.ok(/\|q:/.test(canonicalKey(w)));
});

// boards の断片（review/design/488/boards・531/boards）。warps は items・ice 等と併用できる。warps・periodic・water は同時に1種まで（#531）。stageGen の検査に通した結果を確かめる。
const specOf = (gimmicks) => ({
  ver: 1, stages: 4, grid: { cols: { min: 4, max: 6 }, rows: { min: 4, max: 6 } }, walls: { min: 1, max: 4 },
  gimmicks, teach: 'warps', shortestPath: { min: 4, max: 12 },
});
const errorsOf = (gimmicks) => {
  const errs = [];
  checkStageGen({ stageGen: specOf(gimmicks) }, [], (name, msg) => errs.push(`${name}: ${msg}`));
  return errs;
};
const one = { min: 1, max: 1 };

test('stage-gen: stagegen 検査 warps は items・ice 等と併用できる。periodic・water・paint・groupRepeats との併用は NG', () => {
  assert.deepEqual(errorsOf({ warps: { min: 1, max: 2 } }), []);
  assert.deepEqual(errorsOf({ warps: one }), []);
  for (const other of ['ice', 'keys', 'switches', 'cushion', 'items']) {
    assert.deepEqual(errorsOf({ warps: one, [other]: one }), [], `${other} との併用が OK でない`);
  }
  for (const other of ['groupRepeats', 'paint', 'periodic', 'water']) {
    assert.ok(errorsOf({ warps: one, [other]: one }).length > 0, `${other} との併用が NG でない`);
  }
  assert.ok(errorsOf({ warps: one, water: one }).some((e) => e === 'stageGen: warps・water は同時に指定できない（warps・periodic・water は1種まで）'));
  assert.ok(errorsOf({ warps: one, periodic: one, water: one }).some((e) => e.includes('warps・periodic・water は同時に指定できない')));
});

test('stage-gen: stagegen 検査 warps の個数は 1〜2 の整数。単数形 warp は NG', () => {
  for (const bad of [{ min: 0, max: 1 }, { min: 1, max: 3 }, { min: 3, max: 3 }, { min: 1.5, max: 2 }, { min: 2, max: 1 }]) {
    assert.ok(errorsOf({ warps: bad }).length > 0, JSON.stringify(bad));
  }
  assert.ok(errorsOf({ warp: one }).length > 0);
});

// 周期ドア（review/design/494-495-496/boards）。ok は単独、ng は 1 つの理由だけで NG。
const periodicErrors = (gimmicks, teach = 'periodic') => {
  const errs = [];
  checkStageGen({ stageGen: { ...specOf(gimmicks), teach } }, [], (name, msg) => errs.push(`${name}: ${msg}`));
  return errs;
};

test('stage-gen: stagegen 検査 periodic は 1〜2 の整数なら OK（items 併用も OK）。範囲外・非整数・別名は NG（各1理由）', () => {
  assert.deepEqual(periodicErrors({ periodic: { min: 1, max: 2 } }), []);
  assert.deepEqual(periodicErrors({ periodic: { min: 1, max: 2 }, items: { min: 1, max: 2 } }), []);
  for (const bad of [{ min: 0, max: 2 }, { min: 1, max: 3 }, { min: 1.5, max: 2 }]) {
    const e = periodicErrors({ periodic: bad });
    assert.equal(e.length, 1, JSON.stringify(bad));
    assert.ok(e[0].startsWith('stageGen: '));
  }
  const singular = periodicErrors({ periodics: { min: 1, max: 2 } }, 'periodics');
  assert.equal(singular.length, 1);
  assert.ok(singular[0].startsWith('stageGen 未対応のギミック'));
});

test('stage-gen: paint を指定しない盤は paint キーを持たず、canonicalKey に色ぬりの層が出ない', () => {
  for (const sg of [cases.items, cases.ice, cases.keys, cases.cushion, cases.switches, cases.warps, cases.periodic]) {
    for (let seed = 0; seed < 5; seed += 1) {
      const b = generateBoard(sg, seed);
      if (!b) continue;
      assert.equal('paint' in b, false);
      assert.ok(!/\|n:/.test(canonicalKey(b)));
    }
  }
  assert.ok(/\|n:/.test(canonicalKey(generateBoard(cases.paint, 1))));
});

// 色ぬり（review/design/494-495-496/boards）。ok は単独、ng は 1 つの理由だけで NG。
const paintErrors = (gimmicks, teach = 'paint') => {
  const errs = [];
  checkStageGen({ stageGen: { ...specOf(gimmicks), teach } }, [], (name, msg) => errs.push(`${name}: ${msg}`));
  return errs;
};

test('stage-gen: stagegen 検査 paint は単独・4〜8 の整数なら OK。他ギミック併用・範囲外・非整数・別名は NG（各1理由）', () => {
  assert.deepEqual(paintErrors({ paint: { min: 4, max: 6 } }), []);
  assert.deepEqual(paintErrors({ paint: { min: 4, max: 8 } }), []);
  for (const other of ['items', 'ice', 'keys', 'switches', 'cushion', 'warps', 'periodic']) {
    const e = paintErrors({ paint: { min: 4, max: 6 }, [other]: one });
    assert.ok(e.some((m) => m.includes('paint は単独')), `${other} との併用`);
  }
  // water とだけ併用できる（#531 段2）。water に別のギミックを足すと、そちらの名前で NG
  assert.deepEqual(paintErrors({ paint: { min: 4, max: 6 }, water: { min: 2, max: 4 } }), []);
  assert.deepEqual(paintErrors({ paint: { min: 4, max: 6 }, water: { min: 2, max: 4 } }, 'water'), []);
  assert.deepEqual(paintErrors({ paint: { min: 4, max: 6 }, water: { min: 2, max: 4 }, items: one }), ['stageGen: paint は単独で指定する（items と併用できない）']);
  // groupRepeats・repeatBox は gimmicks の未対応キー（併用すると未対応で NG）
  for (const other of ['groupRepeats', 'repeatBox']) {
    assert.ok(paintErrors({ paint: { min: 4, max: 6 }, [other]: one }).length > 0, other);
  }
  for (const bad of [{ min: 3, max: 6 }, { min: 4, max: 9 }, { min: 4.5, max: 6 }, { min: 6, max: 4 }]) {
    const e = paintErrors({ paint: bad });
    assert.equal(e.length, 1, JSON.stringify(bad));
    assert.ok(e[0].startsWith('stageGen: '));
  }
  const singular = paintErrors({ paints: { min: 4, max: 6 } }, 'paints');
  assert.equal(singular.length, 1);
  assert.ok(singular[0].startsWith('stageGen 未対応のギミック'));
});

test('stage-gen: water を指定しない盤は water・bridge・waterMode を持たず、canonicalKey に水の層が出ない', () => {
  for (const sg of [cases.items, cases.ice, cases.keys, cases.cushion, cases.switches, cases.warps, cases.periodic, cases.paint]) {
    for (let seed = 0; seed < 5; seed += 1) {
      const b = generateBoard(sg, seed);
      if (!b) continue;
      assert.equal('water' in b, false);
      assert.equal('bridge' in b, false);
      assert.equal('waterMode' in b, false);
      assert.ok(!/\|e:/.test(canonicalKey(b)));
    }
  }
  assert.ok(/\|e:/.test(canonicalKey(generateBoard(cases.water, 1))));
});

test('stage-gen: water は橋を置ける盤が少なくとも1つあり、橋は最短経路上にある', () => {
  let withBridge = 0;
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const b = generateBoard(cases.water, seed);
    if (!b?.bridge) continue;
    withBridge += 1;
    const path = simulate(b.solution, b).path.map((p) => `${p.x},${p.y}`);
    assert.ok(path.includes(`${b.bridge[0].x},${b.bridge[0].y}`), `seed=${seed}: 橋が最短経路上にない`);
  }
  assert.ok(withBridge > 0);
});

// 水（review/design/494-495-496/boards）。ok は単独、ng は 1 つの理由だけで NG。waterMode は stageGen の入力にしない。
const waterErrors = (gimmicks, teach = 'water', extra = {}) => {
  const errs = [];
  checkStageGen({ stageGen: { ...specOf(gimmicks), teach, ...extra } }, [], (name, msg) => errs.push(`${name}: ${msg}`));
  return errs;
};

test('stage-gen: stagegen 検査 water は 2〜8 の整数なら OK（items・ice・paint 等との併用も OK）。warps・periodic 併用・範囲外・非整数・別名・waterMode は NG', () => {
  assert.deepEqual(waterErrors({ water: { min: 2, max: 4 } }), []);
  assert.deepEqual(waterErrors({ water: { min: 2, max: 8 } }), []);
  for (const other of ['items', 'ice', 'keys', 'switches', 'cushion']) {
    assert.deepEqual(waterErrors({ water: { min: 2, max: 4 }, [other]: one }), [], `${other} との併用`);
  }
  for (const other of ['warps', 'periodic']) {
    const e = waterErrors({ water: { min: 2, max: 4 }, [other]: one });
    assert.ok(e.some((m) => m.includes('は同時に指定できない（warps・periodic・water は1種まで）')), `${other} との併用`);
  }
  assert.deepEqual(waterErrors({ water: { min: 2, max: 4 }, paint: { min: 4, max: 6 } }), []); // paint とは併用できる（#531 段2）
  // groupRepeats・repeatBox は gimmicks の未対応キー（併用すると未対応で NG）
  for (const other of ['groupRepeats', 'repeatBox']) {
    assert.ok(waterErrors({ water: { min: 2, max: 4 }, [other]: one }).length > 0, other);
  }
  for (const bad of [{ min: 1, max: 4 }, { min: 2, max: 9 }, { min: 2.5, max: 4 }, { min: 4, max: 2 }]) {
    const e = waterErrors({ water: bad });
    assert.equal(e.length, 1, JSON.stringify(bad));
    assert.ok(e[0].startsWith('stageGen: '));
  }
  const singular = waterErrors({ waters: { min: 2, max: 4 } }, 'waters');
  assert.equal(singular.length, 1);
  assert.ok(singular[0].startsWith('stageGen 未対応のギミック'));
  assert.ok(waterErrors({ water: { min: 2, max: 4 } }, 'water', { waterMode: 'bump' }).length > 0);
});

// ぬり×水の混在（#531 段2）。単独 paint の経路は変えず、混在時だけ新経路（目標は水・壁を踏まず、橋の1マスを通る）。
test('stage-gen: paint×water は目標が水に重ならず橋のマスを通り、解ける。水と塗りの必須性は橋の有無で見る', () => {
  const sgPW = (teach) => ({ ...base, grid: { cols: { min: 5, max: 7 }, rows: { min: 5, max: 7 } }, gimmicks: { paint: { min: 4, max: 8 }, water: { min: 2, max: 5 } }, teach });
  let made = 0;
  for (const teach of ['paint', 'water']) {
    for (let seed = 0; seed < 20; seed += 1) {
      const b = generateBoard(sgPW(teach), seed);
      if (!b) continue;
      made += 1;
      const tag = `teach=${teach} seed=${seed}`;
      const key = (p) => `${p.x},${p.y}`;
      const paint = new Set(b.paint.map(key));
      assert.ok(b.paint.every((c) => !b.water.some((w) => key(w) === key(c))), `${tag}: 目標が水に重なる`);
      assert.ok(b.paint.every((c) => !b.walls.some((w) => key(w) === key(c))), `${tag}: 目標が壁に重なる`);
      assert.ok(paint.has(key(b.start)) && paint.has(key(b.goal)), `${tag}: start・goal が目標に含まれない`);
      assert.ok(b.bridge?.length === 1 && paint.has(key(b.bridge[0])), `${tag}: 橋が目標に含まれない`);
      assert.ok(!b.items?.length && !b.ice?.length, `${tag}: どんぐり・氷がある`);
      assert.ok(isRunCleared(simulate(b.solution, b)), `${tag}: solution でクリアできない`);
      assert.ok(paintMustMatter(b, b.solution.length).matters, `${tag}: 塗りが飾り`);
      assert.equal(b.solution.length, b.paint.length - 1, `${tag}: 最短が目標の細い経路でない`);
    }
  }
  assert.ok(made >= 30, `混在盤が十分に生成できない（${made}/40）`);
});

test('stage-gen: paint×water の seed 掃引で成功率が半分以上', () => {
  const sg = { ...base, grid: { cols: { min: 4, max: 6 }, rows: { min: 4, max: 6 } }, gimmicks: { paint: { min: 4, max: 8 }, water: { min: 2, max: 4 } }, teach: 'paint' };
  let ok = 0;
  for (let seed = 0; seed < 40; seed += 1) if (generateBoard(sg, seed)) ok += 1;
  assert.ok(ok >= 20, `成功 ${ok}/40`);
});
