// 盤面エディタの「考えどころ」K1〜K3（Issue #782。#720 段2）。worker_threads で実行し、呼び出し側（serve.mjs）が打ち切る。
// 入力 workerData = { spec }。出力 postMessage({ ok:true, result:{ k1, k2, k3 } })。
// 判定は tools/lib/board-metrics.mjs の kangaedokoro をそのまま呼ぶ（allowedCommands が無ければ4方向）。
import { parentPort, workerData } from 'node:worker_threads';
import { kangaedokoro } from '../lib/board-metrics.mjs';

const DEFAULT_COMMANDS = ['up', 'down', 'left', 'right'];

export function kangaeOfSpec(spec) {
  return kangaedokoro({ ...spec, allowedCommands: spec.allowedCommands ?? DEFAULT_COMMANDS });
}

if (parentPort) {
  try {
    parentPort.postMessage({ ok: true, result: kangaeOfSpec(workerData.spec) });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: e.message });
  }
}
