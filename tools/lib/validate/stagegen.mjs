// stageGen・gen の検査（Issue #337。docs/lesson-schema.md）。実行時は読まない開発用の設定。
// tools/lib/validate/ からの分割（Issue #448）。
import { KEY_MODES } from '../../../js/gimmicks/keys.js';
import { COMMANDS, isInt, isObj } from './common.mjs';

const SG_KEYS = ['ver', 'stages', 'keepHandwritten', 'grid', 'walls', 'gimmicks', 'teach', 'shortestPath', 'minTurns', 'allowedCommands', 'seedBase', 'keyMode'];
const SG_GIMMICK_RANGES = { items: [1, 4], ice: [1, 4], keys: [1, 2], cushion: [1, 4], switches: [1, 2], warps: [1, 2], periodic: [1, 2], paint: [4, 8], water: [2, 8] };

// 他のギミックと併用できない（単独で指定する）ギミック。要素を足せば同じ検査が働く。
export const SG_SOLO_GIMMICKS = ['paint'];
// 同時に1種までしか指定できないギミック（他の items・ice 等とは併用できる。#531）。
export const SG_ONE_OF_GIMMICKS = ['warps', 'periodic', 'water'];

function checkStageGen(data, steps, add, soloGimmicks = SG_SOLO_GIMMICKS, oneOfGimmicks = SG_ONE_OF_GIMMICKS) {
  const sg = data.stageGen;
  const label = 'stageGen';
  const unknown = (obj, allowed, where) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) add('stageGen の未知のキー', `${where}の ${k} は受け付けない`);
  };
  // {min,max} の検査。範囲 [lo,hi] 内の整数で min<=max。形が正しければ true。
  const range = (v, lo, hi, where) => {
    if (!isObj(v)) { add(label, `${where} が {min,max} でない`); return false; }
    unknown(v, ['min', 'max'], where);
    if (!isInt(v.min) || !isInt(v.max) || v.min < lo || v.max > hi || v.min > v.max) {
      add(label, `${where}=${JSON.stringify(v)} が不正（整数の min<=max で ${lo}〜${hi}）`);
      return false;
    }
    return true;
  };
  if (isObj(sg) && steps.some((s) => s.kind === 'seedPick')) {
    add(label, 'れんしゅう型（seedPick）のレッスンには置けない');
  }
  if (sg !== undefined) {
    if (!isObj(sg)) {
      add(label, 'stageGen がオブジェクトでない');
    } else {
      unknown(sg, SG_KEYS, 'stageGen');
      if (!isInt(sg.ver) || sg.ver < 1) add(label, `ver=${JSON.stringify(sg.ver)} は 1 以上の整数でない`);
      const plays = steps.filter((s) => s.kind === 'play').map((s) => s.stepId);
      const keep = sg.keepHandwritten ?? [];
      let keepOk = Array.isArray(keep) && keep.every((k) => typeof k === 'string');
      if (!keepOk) add(label, 'keepHandwritten が stepId の配列でない');
      if (keepOk) {
        if (new Set(keep).size !== keep.length) add(label, 'keepHandwritten に重複がある');
        for (const k of keep) if (!plays.includes(k)) add(label, `keepHandwritten の ${k} は play の stepId にない`);
        if (!keep.every((k, i) => k === plays[i])) add(label, 'keepHandwritten が先頭の play から連続していない');
      }
      if (!isInt(sg.stages) || sg.stages < 2 || sg.stages > 8) {
        add(label, `stages=${JSON.stringify(sg.stages)} は 2〜8 の整数でない`);
      } else {
        if (keepOk && sg.stages < keep.length + 1) add(label, `stages=${sg.stages} が keepHandwritten.length+1 (${keep.length + 1}) 未満`);
      }
      if (!isObj(sg.grid)) {
        add(label, 'grid がオブジェクトでない');
      } else {
        unknown(sg.grid, ['cols', 'rows'], 'grid');
        range(sg.grid.cols, 3, 20, 'grid.cols');
        range(sg.grid.rows, 3, 20, 'grid.rows');
      }
      if ('walls' in sg) range(sg.walls, 0, 60, 'walls');
      const gim = sg.gimmicks ?? {};
      if (!isObj(gim)) {
        add(label, 'gimmicks がオブジェクトでない');
      } else {
        for (const [k, v] of Object.entries(gim)) {
          if (!(k in SG_GIMMICK_RANGES)) add('stageGen 未対応のギミック', `gimmicks の ${k} は未対応（items・ice・keys・cushion・switches・warps・periodic・paint・water のみ）`);
          else range(v, SG_GIMMICK_RANGES[k][0], SG_GIMMICK_RANGES[k][1], `gimmicks.${k}`);
        }
        const names = Object.keys(gim);
        if (names.length === 0 && 'teach' in sg) add(label, 'gimmicks が空なのに teach がある');
        else if (names.length > 0 && !('teach' in sg)) add(label, 'gimmicks があるのに teach がない');
        else if ('teach' in sg && !names.includes(sg.teach)) add(label, `teach=${JSON.stringify(sg.teach)} が gimmicks にない`);
        if ('keyMode' in sg) {
          if (!KEY_MODES.includes(sg.keyMode)) add(label, `keyMode=${JSON.stringify(sg.keyMode)} が不正（${KEY_MODES.join('・')}のどちらか）`);
          if (!('keys' in gim)) add(label, 'keyMode は gimmicks.keys があるときだけ指定できる');
        }
        if ('switches' in gim && 'keys' in gim) add(label, 'switches と keys は併用できない');
        for (const solo of soloGimmicks) {
          if (!(solo in gim)) continue;
          const others = Object.keys(gim).filter((k) => k !== solo);
          if (others.length > 0) add(label, `${solo} は単独で指定する（${others.join('・')} と併用できない）`);
        }
        const oneOfOn = oneOfGimmicks.filter((k) => k in gim);
        if (oneOfOn.length > 1) add(label, `${oneOfOn.join('・')} は同時に指定できない（${oneOfGimmicks.join('・')} は1種まで）`);
        if (sg.teach === 'cushion' && !(isObj(gim.ice) && isInt(gim.ice.max) && gim.ice.max >= 1)) add(label, 'teach=cushion には gimmicks.ice（最大1以上）の併用が必要');
      }
      range(sg.shortestPath, 2, 60, 'shortestPath');
      if ('minTurns' in sg && (!isInt(sg.minTurns) || sg.minTurns < 0 || sg.minTurns > 8)) {
        add(label, `minTurns=${JSON.stringify(sg.minTurns)} は 0〜8 の整数でない`);
      }
      if ('allowedCommands' in sg) {
        const a = sg.allowedCommands;
        if (!Array.isArray(a) || a.length === 0 || a.some((c) => !COMMANDS.includes(c)) || new Set(a).size !== a.length) {
          add(label, `allowedCommands=${JSON.stringify(a)} は上下左右の部分集合（1個以上・重複なし）でない`);
        }
      }
      if ('seedBase' in sg && (!isInt(sg.seedBase) || sg.seedBase < 0)) {
        add(label, `seedBase=${JSON.stringify(sg.seedBase)} は 0 以上の整数でない`);
      }
    }
  }
  for (const step of steps) {
    if (!('gen' in step)) continue;
    const where = `stepId="${step.stepId}" の gen`;
    if (!isObj(step.gen)) { add('gen', `${where} がオブジェクトでない`); continue; }
    unknown(step.gen, ['seed', 'ver'], where);
    if (!isInt(step.gen.seed) || step.gen.seed < 0) add('gen', `${where}.seed=${JSON.stringify(step.gen.seed)} は 0 以上の整数でない`);
    if (!isObj(sg)) { add('gen', `${where} があるのに stageGen が無い`); continue; }
    if (step.gen.ver !== sg.ver) add('gen', `${where}.ver=${JSON.stringify(step.gen.ver)} が stageGen.ver=${JSON.stringify(sg.ver)} と違う`);
    if (Array.isArray(sg.keepHandwritten) && sg.keepHandwritten.includes(step.stepId)) {
      add('gen', `${where} が keepHandwritten の stepId にある`);
    }
  }
}

export { checkStageGen };
