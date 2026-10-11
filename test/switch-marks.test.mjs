// スイッチ・壁・鍵・扉の「同じ色＋形」の印（Issue #387）：色の割当・validate・render の属性。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { switches, switchColor, wallColors } from '../js/gimmicks/switches.js';
import { keys } from '../js/gimmicks/keys.js';

const sw = (x, y, targets, extra = {}) => ({ x, y, targets, ...extra });
const errs = (board) => {
  const out = [];
  switches.validate(board, (_k, m) => out.push(m), '');
  return out;
};
const base = (switchList) => ({ grid: { cols: 5, rows: 5 }, start: { x: 0, y: 0 }, goal: { x: 4, y: 4 }, walls: [], switches: switchList });

// 最小のDOM代用：セルは dataset と子SVG文字列を持つ。
function fakeBoard(cellKeys, iceKeys = []) {
  const cells = new Map(
    cellKeys.map((k) => {
      const html = [];
      if (iceKeys.includes(k)) html.push('<svg class="grid-ice-svg"></svg>');
      const cell = {
        dataset: {},
        html,
        insertAdjacentHTML(pos, s) {
          if (pos === 'afterbegin') html.unshift(s);
          else if (pos === 'afterend') html.splice(html.findIndex((h) => h.includes('grid-ice-svg')) + 1, 0, s);
        },
        querySelector: (sel) => (sel === '.grid-ice-svg' && html.some((h) => h.includes('grid-ice-svg')) ? { insertAdjacentHTML: (p, s) => cell.insertAdjacentHTML(p, s) } : null),
      };
      return [k, cell];
    })
  );
  return {
    cells,
    querySelector(sel) {
      const m = sel.match(/data-x="(\d+)"\]\[data-y="(\d+)"/);
      return cells.get(`${m[1]},${m[2]}`) ?? null;
    },
  };
}

test('色の割当: 省略時は添字順 red,blue,red', () => {
  assert.equal(switchColor(sw(0, 0, []), 0), 'red');
  assert.equal(switchColor(sw(0, 0, []), 1), 'blue');
  assert.equal(switchColor(sw(0, 0, []), 2), 'red');
  assert.equal(switchColor(sw(0, 0, [], { color: 'blue' }), 0), 'blue');
});

test('壁の印: 対象にするスイッチの色を添字の昇順で最大2個', () => {
  const list = [sw(0, 1, [{ x: 2, y: 2 }]), sw(1, 1, [{ x: 2, y: 2 }]), sw(2, 1, [{ x: 3, y: 3 }], { color: 'red' })];
  assert.deepEqual(wallColors(list, { x: 2, y: 2 }), ['red', 'blue']);
  assert.deepEqual(wallColors(list, { x: 3, y: 3 }), ['red']);
});

test('validate: 合格盤（color 指定あり・AND 2スイッチ）', () => {
  assert.deepEqual(errs(base([sw(0, 1, [{ x: 2, y: 2 }], { color: 'red' }), sw(1, 1, [{ x: 2, y: 2 }], { color: 'blue' })])), []);
});

test('validate: color が red/blue 以外は不合格', () => {
  const e = errs(base([sw(0, 1, [{ x: 2, y: 2 }], { color: 'green' })]));
  assert.equal(e.length, 1);
  assert.match(e[0], /color/);
});

test('validate: 1つの壁を3スイッチが対象にすると不合格', () => {
  const t = [{ x: 3, y: 3 }];
  const e = errs(base([sw(0, 1, t), sw(1, 1, t), sw(2, 1, t)]));
  assert.equal(e.length, 1);
  assert.match(e[0], /最大2/);
});

test('render: スイッチ・壁・鍵・扉の data-color / data-mark（扉は data-color のみ）', () => {
  const board = fakeBoard(['0,1', '1,1', '2,2', '3,0', '3,1']);
  const swList = [sw(0, 1, [{ x: 2, y: 2 }]), sw(1, 1, [{ x: 2, y: 2 }])];
  switches.render({ board, switches: swList });
  assert.equal(board.cells.get('0,1').dataset.color, 'red');
  assert.equal(board.cells.get('0,1').dataset.mark, 'circle');
  assert.equal(board.cells.get('1,1').dataset.color, 'blue');
  assert.equal(board.cells.get('1,1').dataset.mark, 'triangle');
  const wall = board.cells.get('2,2');
  assert.equal(wall.dataset.switchWall, 'on');
  assert.equal(wall.dataset.color, 'red');
  assert.equal(wall.html[0].match(/data-mark="/g).length, 2);
  keys.render({ board, keys: [{ x: 3, y: 0, color: 'blue' }], doors: [{ x: 3, y: 1, color: 'blue' }] });
  assert.equal(board.cells.get('3,0').dataset.mark, 'triangle');
  assert.equal(board.cells.get('3,0').dataset.color, 'blue');
  assert.equal(board.cells.get('3,1').dataset.color, 'blue');
  assert.equal(board.cells.get('3,1').dataset.mark, undefined);
  assert.ok(!board.cells.get('3,1').html[0].includes('fef3c7'), '扉に円板が無い');
});

test('render: 氷の上のスイッチは氷SVGより後ろ（前面）に挿入される', () => {
  const board = fakeBoard(['1,1'], ['1,1']);
  switches.render({ board, switches: [sw(1, 1, [{ x: 3, y: 3 }])] });
  const html = board.cells.get('1,1').html;
  assert.ok(html[0].includes('grid-ice-svg'));
  assert.ok(html[1].includes('grid-switch-svg'));
});
