// 盤面ギミックの登録表。追加時はここへ1行足す（新規ギミックは js/gimmicks/<name>.js に作る。
// フックIFは docs/gimmicks.md、追加手順は docs/gimmicks.md「追加手順・検証規則」。Issue #123）。
import { items } from './items.js';
import { ice } from './ice.js';
import { cushion } from './cushion.js';
import { keys } from './keys.js';
import { switches } from './switches.js';
import { paint } from './paint.js';
import { periodic } from './periodic.js';
import { water } from './water.js';

import { shortestSteps } from '../engine-grid.js';

export const GIMMICKS = [items, ice, cushion, keys, switches, paint, periodic, water];

// 解法関与（必須性）の判定を1か所にまとめる（Issue #371）。strip(spec)＝そのギミックを除いた盤の最短手数と
// 実際の最短手数 dist を比べる。比較の向きは (ギミック, 向き) の表。盤面を動かさないため、現行の食い違い
// （ice だけ「変わる」、items・keys は「短くなる」）をそのまま持つ。
//   'shorter'：除くと短くならなければ不要　'changed'：除いても変わらなければ不要
const MATTER = { items: 'shorter', ice: 'changed', keys: 'shorter', cushion: 'changed', switches: 'shorter' };

export function mattersFor(key, spec, dist) {
  const steps = shortestSteps(GIMMICKS.find((g) => g.key === key).strip(spec));
  return MATTER[key] === 'changed' ? steps !== dist : steps < dist;
}
