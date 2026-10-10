// paint（色ぬり）ギミック（Issue #286）：クリア判定・別解・dead枝刈りの等価性・既存ギミックの挙動不変。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { simulate, shortestSteps, shortestChips, shortestPath, boardSpec, isRunCleared } from '../js/engine-grid.js';
import { GIMMICKS } from '../js/gimmicks/index.js';

const lesson = JSON.parse(readFileSync('lessons/paint-01-nuru.json', 'utf-8'));
const stage = (id) => lesson.steps.find((s) => s.stepId === id);
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// 盤上（壁・盤外を避け、目標内だけを歩く）で長さnの全経路のうち、simulate+isRunClearedでクリアするものを数える。
// 目標外へ出る列は上書き不可（はみ出し＝失敗）なので、列挙から除いても数は変わらない（下のtestで全列挙と一致を確認）。
function countWalks(spec, n) {
  const cells = new Set(spec.paint.map((c) => `${c.x},${c.y}`));
  const found = [];
  const go = (x, y, seq) => {
    if (seq.length === n) {
      const r = simulate(seq, spec);
      if (isRunCleared(r)) found.push(seq.join(','));
      return;
    }
    for (const [d, [dx, dy]] of Object.entries(DIRS)) if (cells.has(`${x + dx},${y + dy}`)) go(x + dx, y + dy, [...seq, d]);
  };
  go(spec.start.x, spec.start.y, []);
  return found;
}

// 全列挙（枝刈り無し）で長さnのクリア列の数。
function bruteCount(spec, n) {
  let count = 0;
  const go = (seq) => {
    if (seq.length === n) {
      if (isRunCleared(simulate(seq, spec))) count += 1;
      return;
    }
    for (const d of Object.keys(DIRS)) go([...seq, d]);
  };
  go([]);
  return count;
}

test('paint: 3ステージの最短手数=6/10/12・maxCommands=最短・別解は2/2/4本で全てクリア(solution非共有)', () => {
  const expected = { p1: [6, 2], p2: [10, 2], p3: [12, 4] };
  for (const [id, [dist, alts]] of Object.entries(expected)) {
    const spec = boardSpec(stage(id));
    assert.equal(shortestSteps(spec), dist, `${id}の最短`);
    assert.equal(stage(id).maxCommands, dist, `${id}のmaxCommands`);
    assert.ok(shortestSteps({ ...spec, paint: [] }) < dist, `${id}: 目標が最短経路より大きい`);
    assert.equal(shortestPath(spec).length, dist);
    const walks = countWalks(spec, dist);
    assert.equal(walks.length, alts, `${id}の別解数`);
    assert.ok(walks.length >= 2, '別解2本以上');
    // 目標一致の列より1手短い列ではクリアしない。
    assert.equal(countWalks(spec, dist - 1).length, 0);
    assert.ok(walks.includes(stage(id).solution.join(',')), `${id}のsolutionも別解の1つ`);
  }
});

test('paint: はみ出し・塗り残し・未到達はクリアしない。overCellsは目標外のマス', () => {
  const spec = boardSpec(stage('p1'));
  const ok = simulate(['left', 'right', 'right', 'left', 'down', 'down'], spec);
  assert.deepEqual([isRunCleared(ok), ok.unmet, ok.paintOver], [true, [], []]);
  const over = simulate(['up', 'down', 'down', 'down'], spec);
  assert.equal(isRunCleared(over), false);
  assert.deepEqual(over.paintOver, [{ x: 1, y: 0 }]);
  const left = simulate(['down', 'down'], spec);
  assert.deepEqual([isRunCleared(left), left.unmet, left.paintOver], [false, ['paint'], []]);
});

test('paint: dead枝刈りあり(BFS)と枝刈りなし(全列挙)で最短手数・別解数が一致する(3x3前後)', () => {
  const boards = [
    { grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 }, walls: [], paint: [[0, 0], [1, 0], [2, 0]] },
    { grid: { cols: 3, rows: 3 }, start: { x: 1, y: 1 }, goal: { x: 1, y: 2 }, walls: [], paint: [[1, 0], [1, 1], [0, 1], [1, 2]] },
    { grid: { cols: 3, rows: 3 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 2 }, walls: [], paint: [[0, 0], [1, 0], [2, 0], [1, 1], [2, 1], [2, 2]] },
    { grid: { cols: 3, rows: 3 }, start: { x: 0, y: 1 }, goal: { x: 2, y: 1 }, walls: [{ x: 1, y: 1 }], paint: [[0, 1], [0, 0], [1, 0], [2, 0], [2, 1]] },
  ].map((b) => ({ ...b, paint: b.paint.map(([x, y]) => ({ x, y })) }));
  for (const spec of boards) {
    let n = 1;
    while (bruteCount(spec, n) === 0) n += 1;
    assert.equal(shortestSteps(spec), n, '最短手数');
    assert.equal(shortestChips(spec) <= n, true);
    assert.equal(shortestPath(spec).length, n);
    assert.equal(countWalks(spec, n).length, bruteCount(spec, n), '別解数');
  }
});

test('dead未定義の既存ギミックはdead?を持たず、既存レッスン全ステージの最短(手数・チップ・経路)が変更前と一致する(Issue #286)', () => {
  assert.deepEqual(GIMMICKS.filter((g) => g.dead).map((g) => g.key), ['paint']);
  const expected = {"cmd-01-susumu/p1":[4,2,"up,up,left,left"],"cmd-01-susumu/p2":[6,2,"up,up,up,right,right,right"],"cmd-01-susumu/p3":[8,3,"up,up,right,right,right,right,up,up"],"cmd-02-mijikaku/p1":[5,2,"down,down,down,left,left"],"cmd-02-mijikaku/p2":[7,2,"down,down,down,down,down,right,right"],"cmd-02-mijikaku/p3":[7,3,"right,down,down,down,down,right,right"],"cmd-03-naosu/p1":[2,1,"right,right"],"cmd-03-naosu/p2":[3,1,"right,right,right"],"cmd-03-naosu/p3":[8,2,"down,down,down,down,right,right,right,right"],"ice-01-suberu/p1":[4,3,"right,up,left,left"],"ice-01-suberu/p2":[4,3,"right,right,up,right"],"ice-02-kabe/p1":[4,2,"right,down,down,down"],"ice-02-kabe/p2":[6,3,"right,right,right,down,left,left"],"key-01-kagi/p1":[6,4,"up,right,down,right,right,right"],"key-01-kagi/p2":[8,4,"up,left,left,down,right,right,right,right"],"switch-01-suicchi/p1":[6,4,"down,right,up,right,right,right"],"switch-01-suicchi/p2":[8,5,"left,left,down,up,right,right,down,down"],"switch-02-futatsu/p1":[8,6,"up,down,right,right,down,right,up,up"],"switch-02-futatsu/p2":[9,5,"right,right,down,down,right,down,left,left,left"],"switch-03-suicchi-kagi/p1":[5,1,"right,right,right,right,right"],"switch-03-suicchi-kagi/p2":[8,3,"down,down,right,right,right,right,up,up"],"switch-04-ryouhou/p1":[8,5,"up,right,down,down,up,right,right,right"],"switch-04-ryouhou/p2":[10,6,"right,down,down,down,left,up,right,right,right,down"],"switch-05-koori/p1":[4,3,"right,down,down,right"],"switch-05-koori/p2":[8,3,"up,right,right,right,right,down,down,down"],"switch-06-kabe-deru/p1":[6,3,"up,right,right,right,right,down"],"switch-06-kabe-deru/p2":[8,4,"right,up,up,right,right,right,down,down"]};
  const actual = {};
  for (const f of readdirSync('lessons').filter((f) => f.endsWith('.json') && f !== 'index.json' && !f.startsWith('paint-') && f !== 'switch-07-shuuki-door.json' && f !== 'cmd-01-susumu-long.json' && f !== 'donguri-01-hirou.json' && f !== 'donguri-02-mawarimichi.json' && f !== 'key-02-iro.json')) {
    const l = JSON.parse(readFileSync(`lessons/${f}`, 'utf-8'));
    for (const s of l.steps ?? []) {
      if (s.kind !== 'play' || !s.start || !s.goal || s.repeatBox) continue;
      const spec = boardSpec(s);
      actual[`${l.lessonId}/${s.stepId}`] = [shortestSteps(spec), shortestChips(spec), (shortestPath(spec) ?? []).join(',')];
    }
  }
  assert.deepEqual(actual, expected);
});
