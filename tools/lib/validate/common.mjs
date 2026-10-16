// lessons/*.json のスキーマ検証で共通の定数・ユーティリティ（tools/lib/validate/ 共通）。
export const REQUIRED_KEYS = ['lessonId', 'unitId', 'title', 'type', 'estimatedMinutes', 'steps'];
export const KINDS = ['intro', 'predict', 'play', 'tutorial', 'summary', 'seedPick'];
export const COMMANDS = ['up', 'down', 'left', 'right'];
export const MIN_STEPS = 4;
export const MAX_STEPS = 7;
export const MIN_PLAY = 2;
export const MAX_PLAY = 4;
// 長尺試作（lessons/index.json の longTrialIds。Issue #319）と、stageGen を持つレッスン（seedPick なし。Issue #369）だけに許す上限。MIN_*は共通。
export const LONG_MAX_STEPS = 12;
export const LONG_MAX_PLAY = 8;
export const LONG_MINUTES = 8;
// docs/authoring-rules.md「禁止事項」で確定した否定語リスト。
export const FORBIDDEN_WORDS = ['ちがう', 'まちがい', 'ざんねん'];
// gimmicks＝その単元をクリアすると解放されるギミックの種類（Issue #266）。省略時は空。
export const UNIT_GIMMICKS = ['items', 'ice', 'keys'];

export function inGrid(grid, p) {
  return p.x >= 0 && p.x < grid.cols && p.y >= 0 && p.y < grid.rows;
}

export const GROUP_MAX_LEN = 8;
export const validGroup = (g) => typeof g === 'string' && g.length >= 1 && g.length <= GROUP_MAX_LEN;
export const isPoint = (p) => p && typeof p.x === 'number' && typeof p.y === 'number';
export const isInt = (v) => Number.isInteger(v);
export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
