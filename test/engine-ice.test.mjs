// 移行元: .claude/verify/scenarios/g-ice-engine.mjs（ブラウザ不要）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, shortestSteps } from '../js/engine-grid.js';

const base = { grid: { cols: 5, rows: 3 }, start: { x: 0, y: 1 }, goal: { x: 4, y: 1 }, walls: [] };
const last = (r) => r.path[r.path.length - 1];

test('engine-grid: iceの滑走・停止位置・blockedAt・pickups・BFS(Issue #61)', () => {
  // 単独のこおりは1マス滑って通常マスで止まる（Issue #61 修正）
  const single = simulate(['right'], { ...base, ice: [{ x: 1, y: 1 }] });
  assert.deepEqual(last(single), { x: 2, y: 1 }, 'こおり1マスなら次の通常マスで止まる');
  assert.deepEqual(single.slid, [false, true], '滑走したマスだけslidがtrue');
  const iceRun = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }];
  const edge = simulate(['right'], { ...base, ice: iceRun });
  assert.deepEqual(last(edge), { x: 4, y: 1 }, 'こおりの連続を滑りきり盤端で停止する');
  assert.equal(edge.path.length, 5, '滑走は1マスずつpathへ展開される');
  assert.deepEqual(edge.stepOwner, [0, 0, 0, 0], '滑走の各マスは同一stepOwner');
  assert.equal(edge.blockedAt.length, 0, '盤端での滑走停止はblockedAtに入らない');
  assert.equal(edge.reachedGoal, true, '滑走後の位置がゴールならreachedGoal');

  // 壁の手前で止まり、失敗になる（Issue #136）
  const wall = simulate(['right'], { ...base, walls: [{ x: 3, y: 1 }], ice: [{ x: 1, y: 1 }, { x: 2, y: 1 }] });
  assert.deepEqual(last(wall), { x: 2, y: 1 }, '壁の手前で停止する');
  assert.deepEqual(wall.blockedAt, [0], '滑走中に壁へ当たるとblockedAtに入る');
  assert.deepEqual(wall.bumped, [false, false, true], '滑走で壁に当たった最後のpathだけbumped');

  const pass = simulate(['right'], { ...base, goal: { x: 2, y: 1 }, ice: [{ x: 1, y: 1 }] });
  assert.deepEqual([last(pass), pass.reachedGoal], [{ x: 2, y: 1 }, true], 'こおりの次の通常マスがゴールならそこで止まりクリア');

  const onStart = simulate(['up'], { ...base, ice: [{ x: 0, y: 1 }] });
  assert.deepEqual(last(onStart), { x: 0, y: 0 }, 'start上では滑らない（最初の移動のみ）');

  const bump = simulate(['left'], { ...base, ice: [{ x: 1, y: 1 }] });
  assert.deepEqual(bump.blockedAt, [0], '盤外への手は従来どおりblockedAt');

  const acorn = simulate(['right'], { ...base, items: [{ x: 3, y: 1 }], ice: [{ x: 1, y: 1 }, { x: 2, y: 1 }] });
  assert.equal(acorn.remainingItems.length, 0, '滑走中に通過したどんぐりを回収する');
  assert.deepEqual(acorn.pickups, [[], [], [0]], '回収はそのマスのpickupsに入る');

  // {dir,times}：滑走後の位置から次の反復。壁際では次はbump
  const rep = simulate([{ dir: 'right', times: 2 }], { ...base, ice: iceRun });
  assert.deepEqual([last(rep), rep.blockedAt], [{ x: 4, y: 1 }, [0]], 'times反復は滑走後の位置から行い、壁際ではblockedAt');

  assert.deepEqual(
    [shortestSteps(base), shortestSteps({ ...base, ice: iceRun })],
    [4, 1],
    'shortestStepsがiceの滑走を反映する（4手→1手）'
  );
  // (1,0)〜(3,0)がこおり。停止できるのは両端(0,0)/(4,0)のみで、goal(2,0)には止まれない
  const unreachable = shortestSteps({ grid: { cols: 5, rows: 1 }, start: { x: 0, y: 0 }, goal: { x: 2, y: 0 }, walls: [], ice: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] });
  assert.equal(String(unreachable), 'Infinity', '滑ってゴールへ止まれない盤面はInfinity');
});
