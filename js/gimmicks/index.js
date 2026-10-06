// 盤面ギミックの登録表。追加時はここへ1行足す（新規ギミックは js/gimmicks/<name>.js に作る。
// フックIFは docs/gimmicks.md、追加手順は docs/gimmicks.md「追加手順・検証規則」。Issue #123）。
import { items } from './items.js';
import { ice } from './ice.js';
import { cushion } from './cushion.js';
import { keys } from './keys.js';
import { switches } from './switches.js';
import { paint } from './paint.js';
import { periodic } from './periodic.js';

export const GIMMICKS = [items, ice, cushion, keys, switches, paint, periodic];
