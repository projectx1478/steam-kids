// donguri-02-mawarimichi（Issue #215）: 全stageで直進だけでは解けず、solutionでクリアできる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate } from '../js/engine-grid.js';

const lesson = JSON.parse(readFileSync(new URL('../lessons/donguri-02-mawarimichi.json', import.meta.url), 'utf8'));
const stages = lesson.steps.filter((s) => s.kind === 'play');

// startからgoalへ、横→縦の順に障害物を考えず直進するだけの命令列
function straightCommands({ start, goal }) {
  const h = goal.x >= start.x ? 'right' : 'left';
  const v = goal.y >= start.y ? 'down' : 'up';
  return [...Array(Math.abs(goal.x - start.x)).fill(h), ...Array(Math.abs(goal.y - start.y)).fill(v)];
}

test('まわりみち: 各stageは直進のみだと壁にぶつかる', () => {
  for (const stage of stages) {
    const result = simulate(straightCommands(stage), stage);
    assert.ok(result.blockedAt.length > 0, `${stage.stepId}: 直進でblockedAtが空`);
  }
});

test('まわりみち: 各stageのsolutionで壁に当たらずゴール・全回収できる', () => {
  for (const stage of stages) {
    const result = simulate(stage.solution, stage);
    assert.equal(result.blockedAt.length, 0, `${stage.stepId}: solutionが壁に当たる`);
    assert.equal(result.reachedGoal, true, `${stage.stepId}: ゴール未到達`);
    assert.equal(result.remainingItems.length, 0, `${stage.stepId}: どんぐり取り残し`);
    assert.ok(stage.solution.length <= stage.maxCommands, `${stage.stepId}: maxCommands超過`);
  }
});
