// クリア判定の汎用化（Issue #286）の回帰：既存レッスン全ステージ・全solutionと、その打ち切り・1手差し替え列で、
// isRunCleared(simulate結果) が従来の直書き式（到達・全回収・壁衝突なし）と常に一致し、unmet・paintOverが空であること。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { simulate, boardSpec, isRunCleared } from '../js/engine-grid.js';

const legacy = (r) => r.reachedGoal && r.remainingItems.length === 0 && r.blockedAt.length === 0;
const DIRS = ['up', 'down', 'left', 'right'];

function stageQueues(step) {
  const sol = step.solution;
  if (!sol) return [];
  const obj = Array.isArray(sol) ? { commands: sol } : sol;
  const queue = [...(step.initialCommands ?? [])];
  if (obj.removeIndex !== undefined) queue.splice(obj.removeIndex, 1);
  queue.push(...(obj.commands ?? []));
  return queue.every((c) => DIRS.includes(c)) ? [queue] : [];
}

test('isRunCleared: 既存レッスンの全ステージで従来式と一致する(Issue #286)', () => {
  let checked = 0;
  let cleared = 0;
  for (const file of readdirSync('lessons').filter((f) => f.endsWith('.json') && f !== 'index.json' && !f.startsWith('paint-'))) {
    const lesson = JSON.parse(readFileSync(`lessons/${file}`, 'utf-8'));
    for (const step of lesson.steps ?? []) {
      if (step.kind !== 'play' || !step.start || !step.goal) continue;
      const spec = boardSpec(step);
      for (const queue of stageQueues(step)) {
        const variants = [queue];
        for (let n = 0; n < queue.length; n += 1) {
          variants.push(queue.slice(0, n));
          for (const d of DIRS) if (d !== queue[n]) variants.push(queue.map((c, i) => (i === n ? d : c)));
        }
        for (const cmds of variants) {
          const r = simulate(cmds, spec);
          assert.equal(isRunCleared(r), legacy(r), `${file} ${step.stepId} ${cmds.join(',')}`);
          assert.deepEqual([r.unmet, r.paintOver], [[], []], `${file} ${step.stepId}: paint無しでunmet/paintOverが空`);
          checked += 1;
          if (legacy(r)) cleared += 1;
        }
      }
    }
  }
  assert.ok(checked > 500, `検査数 ${checked}`);
  assert.ok(cleared > 20, `クリア例が十分ある(${cleared})`);
});
