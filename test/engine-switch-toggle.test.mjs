// switches mode:"toggle"（Issue #388）のエンジン段：入るたびに入れ替え、壁ごとの初期、stateKey、併用禁止のvalidate。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, shortestSteps } from '../js/engine-grid.js';
import { switches } from '../js/gimmicks/switches.js';

const lane = (extra) => ({
  grid: { cols: 5, rows: 3 },
  start: { x: 2, y: 1 },
  goal: { x: 4, y: 1 },
  walls: [0, 1, 2, 3, 4].flatMap((x) => [{ x, y: 0 }, { x, y: 2 }]),
  items: [{ x: 0, y: 1 }],
  ...extra,
});
const meaningful = lane({ switches: [{ x: 1, y: 1, mode: 'toggle', targets: [{ x: 3, y: 1 }] }] });
const mixed = {
  grid: { cols: 6, rows: 3 },
  start: { x: 3, y: 1 },
  goal: { x: 5, y: 1 },
  walls: [0, 1, 2, 4, 5].map((x) => ({ x, y: 0 })).concat([0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 2 }))),
  items: [{ x: 0, y: 1 }],
  switches: [{ x: 3, y: 0, mode: 'toggle', targets: [{ x: 4, y: 1 }, { x: 1, y: 1, initial: 'open' }] }],
};
const last = (r) => r.path[r.path.length - 1];

test('toggle: 奇数回踏むと開き、偶数回で閉じる。最短は踏んで戻って踏む8手', () => {
  const odd = simulate(['left', 'right', 'right'], meaningful);
  assert.deepEqual([odd.blockedAt, last(odd)], [[], { x: 3, y: 1 }], '1回踏むと対象を通れる');
  const three = simulate(['left', 'left', 'right', 'left', 'right', 'right', 'right', 'right'], meaningful);
  assert.deepEqual([three.blockedAt, three.reachedGoal, three.remainingItems], [[], true, []], '3回目（奇数）で開いてゴール（アイテム回収込み8手）');
  const closed = simulate(['left', 'right', 'left', 'right', 'right'], meaningful);
  assert.deepEqual([closed.blockedAt, last(closed)], [[4], { x: 2, y: 1 }], '2回踏む（偶数）と閉じて当たる');
  assert.equal(shortestSteps(meaningful), 8);
});

test('toggle: 壁ごとの初期（initial:open）の混在。最短10手', () => {
  const pre = simulate(['right'], mixed);
  assert.deepEqual([pre.blockedAt, last(pre)], [[0], { x: 3, y: 1 }], '踏む前、初期closedの壁は通れない');
  const free = simulate(['left', 'left'], mixed);
  assert.deepEqual([free.blockedAt, last(free)], [[], { x: 1, y: 1 }], '踏む前、初期openの壁は通れる');
  const after = simulate(['up', 'down', 'left', 'left'], mixed);
  assert.deepEqual([after.blockedAt, last(after)], [[3], { x: 2, y: 1 }], '踏んだ後、初期openの壁は閉じる');
  assert.equal(shortestSteps(mixed), 10);
});

test('toggle: initialの壁ごとの開閉（踏む前後で逆）', () => {
  const sw = mixed.switches;
  const st0 = switches.initState();
  const st1 = switches.enter(st0, { x: 3, y: 0 }, mixed);
  assert.equal(switches.blocks(st0, { x: 4, y: 1 }, mixed), true, '初期closedは壁');
  assert.equal(switches.blocks(st0, { x: 1, y: 1 }, mixed), false, '初期openは床');
  assert.equal(switches.blocks(st1, { x: 4, y: 1 }, mixed), false, '奇数回でclosed→開く');
  assert.equal(switches.blocks(st1, { x: 1, y: 1 }, mixed), true, '奇数回でopen→閉じる');
  const st2 = switches.enter(st1, { x: 3, y: 0 }, mixed);
  assert.deepEqual(st2, st0, '偶数回で初期に戻る');
  assert.equal(sw.length, 1);
});

test('toggle: stateKeyは奇数回踏まれたスイッチ番号。非toggleは従来どおり1回で固定', () => {
  const two = lane({
    switches: [
      { x: 1, y: 1, mode: 'toggle', targets: [{ x: 3, y: 1 }] },
      { x: 0, y: 1, mode: 'toggle', targets: [{ x: 4, y: 1 }] },
    ],
  });
  let st = switches.initState();
  assert.equal(switches.stateKey(st), 'switches:');
  st = switches.enter(st, { x: 0, y: 1 }, two);
  assert.equal(switches.stateKey(st), 'switches:1');
  st = switches.enter(st, { x: 1, y: 1 }, two);
  assert.equal(switches.stateKey(st), 'switches:0,1');
  st = switches.enter(st, { x: 0, y: 1 }, two);
  assert.equal(switches.stateKey(st), 'switches:0');
  const open = lane({ switches: [{ x: 1, y: 1, targets: [{ x: 3, y: 1 }] }] });
  const o1 = switches.enter(switches.initState(), { x: 1, y: 1 }, open);
  assert.equal(switches.stateKey(switches.enter(o1, { x: 1, y: 1 }, open)), 'switches:0', 'openは再入場で戻らない');
});

test('toggle: stripしても落ちず、対象は床になる', () => {
  const stripped = switches.strip(meaningful);
  assert.equal(shortestSteps(stripped) < shortestSteps(meaningful), true);
});

const errs = (board) => {
  const out = [];
  switches.validate(board, (_k, msg) => out.push(msg), '');
  return out;
};
const has = (board, text) => errs(board).some((m) => m.includes(text));

test('toggle validate: 合格盤（meaningful・mixed）はエラーなし', () => {
  assert.deepEqual(errs(meaningful), []);
  assert.deepEqual(errs(mixed), []);
});

test('toggle validate: 併用禁止・initialの不正・氷の上', () => {
  const toggle = { x: 1, y: 1, mode: 'toggle', targets: [{ x: 3, y: 1 }] };
  assert.equal(has(lane({ switches: [toggle, { x: 0, y: 1, mode: 'close', targets: [{ x: 4, y: 1 }] }] }), '併用できない'), true, 'closeとの併用');
  assert.equal(has(lane({ switches: [toggle, { x: 0, y: 1, targets: [{ x: 4, y: 1 }] }] }), '併用できない'), true, 'open（省略）との併用');
  assert.equal(has(lane({ switches: [toggle, { x: 0, y: 1, mode: 'toggle', targets: [{ x: 3, y: 1 }] }] }), '対象を共有できない'), true, 'toggle同士の対象共有');
  assert.equal(has(lane({ switches: [{ ...toggle, targets: [{ x: 3, y: 1, initial: 'x' }] }] }), 'initial'), true, 'initialが2語以外');
  assert.equal(has(lane({ switches: [{ x: 1, y: 1, targets: [{ x: 3, y: 1, initial: 'open' }] }] }), 'toggleでのみ'), true, 'toggle以外のinitial');
  assert.equal(has(lane({ switches: [{ x: 1, y: 1, mode: 'close', targets: [{ x: 3, y: 1, initial: 'closed' }] }] }), 'toggleでのみ'), true, 'closeのinitial');
  assert.equal(has(lane({ switches: [{ ...toggle, mode: 'flip' }] }), 'mode'), true, '未知のmode');
  assert.equal(has(lane({ ice: [{ x: 1, y: 1 }], switches: [toggle] }), '氷の上に置けない'), true, '氷の上のtoggle');
  assert.equal(has(lane({ cushion: [{ x: 1, y: 1 }], switches: [toggle] }), 'cushionと重なる'), true, 'クッションの上のtoggle');
  [['ice', 'iceと重なる'], ['cushion', 'cushionと重なる'], ['water', 'waterと重なる'], ['doors', 'doorsと重なる']].forEach(([key, text]) => {
    assert.equal(has(lane({ [key]: [{ x: 3, y: 1 }], switches: [toggle] }), text), true, `対象が${key}と重なる`);
  });
});
