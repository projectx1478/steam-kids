// 盤面エディタのたたき台生成（worker_threads で実行し、呼び出し側が安全弁のタイムアウトで打ち切る）。開発者用・手元専用。
// 入力 workerData = { stageGen, count, seed, maxWork? }。候補 i は generateBoard(stageGen, seed + i)。
// 出力 postMessage({ ok:true, result:{ status:'ok'|'empty'|'aborted', candidates:[{seed, board, shortestPath}] } })。
import { parentPort, workerData } from 'node:worker_threads';
import { generateBoard, GEN_ABORTED } from '../gen/stage-gen.mjs';

export function generateCandidates({ stageGen, count, seed, maxWork }) {
  const candidates = [];
  const opts = maxWork === undefined ? {} : { maxWork };
  for (let i = 0; i < count; i += 1) {
    const board = generateBoard(stageGen, seed + i, opts);
    // 探索量の上限で止まったら、そこまでの候補を添えて未完了にする
    if (board === GEN_ABORTED) return { status: 'aborted', candidates };
    if (board) candidates.push({ seed: seed + i, board, shortestPath: board.solution.length });
  }
  return { status: candidates.length > 0 ? 'ok' : 'empty', candidates };
}

if (parentPort && workerData && workerData.stageGen) {
  try {
    parentPort.postMessage({ ok: true, result: generateCandidates(workerData) });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String(e && e.message ? e.message : e) });
  }
}
