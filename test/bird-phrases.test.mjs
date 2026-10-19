// 小鳥の吹き出し文言テーブル（js/bird-phrases.js。Issue #468 段3）の静的チェックと選び方の確認。ブラウザ不要。実行: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHRASES, TONES, SCENES, boardFacts, pickPhrase, createPhraseState, nextTapHint } from '../js/bird-phrases.js';

const compact = (t) => t.replace(/[ 　]/g, '');
// ひらがな・カタカナ・長音・空白と「」、！…のみ（漢字・？禁止）
const ALLOWED = /^[ぁ-ゖァ-ヺー 　「」、！…]+$/;
const FORBIDDEN = ['だめ', 'まちがい', 'ざんねん', 'さびしい', 'またきてね', 'つうち', 'れんぞく', 'しっぱい', 'できない', 'かいすう'];
const DIRECTION = ['うえ', 'した', 'みぎ', 'ひだり', 'まえ', 'てまえ', 'うしろ', 'よこ', 'たて', 'むこう', 'さき', 'むき'];
const NUMERAL = ['ひとつ', 'ふたつ', 'みっつ', 'いっぽ', 'にほ'];
const PROCEDURE = ['まず', 'つぎに', 'さいしょに', 'それから'];
const COMPARE = ['くらべ', 'より', 'さっきと', 'いちばん', 'もっと', 'みんな', 'すごい', 'すばらしい', 'じょうず', 'さすが'];
const PARTICLES = ['', 'を', 'に', 'へ', 'は', 'が', 'の', 'で', 'も', 'と'];
// 方向語は単語として使われたときだけ数える（「したものを」の「した」は動詞なので対象外）。
const hasDirection = (t) =>
  t.split(/[ 　、「」！…]+/).some((seg) => DIRECTION.some((w) => seg.startsWith(w) && PARTICLES.includes(seg.slice(w.length))));

const byId = (id) => PHRASES.find((x) => x.id === id);

test('テーブル：id の重複なし・場面と口調は定義内', () => {
  assert.equal(new Set(PHRASES.map((p) => p.id)).size, PHRASES.length);
  for (const p of PHRASES) {
    assert.ok(SCENES.includes(p.scene), `${p.id} scene`);
    assert.ok(TONES.includes(p.tone), `${p.id} tone`);
    assert.ok(p.text && typeof p.text === 'string', `${p.id} text`);
  }
});

test('文言：ひらがな／カタカナのみ（漢字・？なし）', () => {
  for (const p of PHRASES) assert.match(p.text, ALLOWED, `${p.id}: ${p.text}`);
});

test('文言：1文20字以内（空白を数えない）', () => {
  for (const p of PHRASES) assert.ok(compact(p.text).length <= 20, `${p.id}: ${p.text} (${compact(p.text).length})`);
});

test('文言：禁止表現・方向語・数詞・手順語・比較評価語を含まない（答えを言わない。#340）', () => {
  for (const p of PHRASES) {
    const c = compact(p.text);
    for (const w of [...FORBIDDEN, ...NUMERAL, ...PROCEDURE, ...COMPARE]) assert.ok(!c.includes(w), `${p.id}: ${p.text} に「${w}」`);
    assert.ok(!hasDirection(p.text), `${p.id}: ${p.text} に方向語`);
  }
});

test('文言：同文の重複なし／同じ topic の口調は重ならない／「！」は少ない', () => {
  const texts = PHRASES.map((p) => p.text);
  assert.equal(new Set(texts).size, texts.length);
  const seen = new Set();
  for (const p of PHRASES.filter((x) => x.topic)) {
    const k = `${p.topic}/${p.tone}`;
    assert.ok(!seen.has(k), `topic の口調が重なる: ${k}`);
    seen.add(k);
  }
  const bang = PHRASES.filter((p) => p.text.includes('！'));
  assert.ok(bang.length / PHRASES.length <= 0.1);
  const go = PHRASES.filter((p) => p.scene === 'go');
  assert.ok(bang.filter((p) => p.scene === 'go').length / go.length <= 0.5);
});

test('文言：when のキーは定義内・ギミック別は fail のみ', () => {
  const KEYS = ['mode', 'keyMode', 'needs', 'minSwitches', 'and', 'noGroup'];
  const GIMMICKS = ['items', 'ice', 'cushion', 'keys', 'switches', 'repeatBox'];
  for (const p of PHRASES) {
    for (const k of Object.keys(p.when ?? {})) assert.ok(KEYS.includes(k), `${p.id} when.${k}`);
    if (p.gimmick) {
      assert.ok(GIMMICKS.includes(p.gimmick), `${p.id} gimmick`);
      assert.equal(p.scene, 'fail', `${p.id}: ギミック別は fail のみ`);
    }
  }
});

test('選び方：同セッションで使い切るまで重複せず、使い切ったら一巡リセット', () => {
  const state = createPhraseState();
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pool = PHRASES.filter((p) => p.scene === 'stop' && p.tone !== 'genki');
  const ids = [];
  for (let i = 0; i < pool.length; i += 1) ids.push(pickPhrase({ scene: 'stop', facts: boardFacts({}), state, rng }).id);
  assert.equal(new Set(ids).size, pool.length);
  const again = pickPhrase({ scene: 'stop', facts: boardFacts({}), state, rng });
  assert.ok(again && again.id !== ids[ids.length - 1]);
});

test('選び方：fail は genki を使わない／最初の数回は同じ口調が続かない', () => {
  const state = createPhraseState();
  const rng = Math.random;
  let last = null;
  for (let i = 0; i < 60; i += 1) {
    const p = byId(pickPhrase({ scene: 'fail', facts: boardFacts({}), state, rng }).id);
    assert.notEqual(p.tone, 'genki');
    if (i < 4) assert.notEqual(p.tone, last); // 候補に他の口調が残る間は続けない
    last = p.tone;
  }
});

test('選び方：paint 盤は fail で出さない／ギミック条件（when）を守る', () => {
  assert.equal(pickPhrase({ scene: 'fail', facts: boardFacts({ paint: [{ x: 0, y: 0 }] }) }), null);
  assert.equal(nextTapHint({ fails: 3, facts: boardFacts({ paint: [{ x: 0, y: 0 }] }) }), null);
  const iceOnly = boardFacts({ ice: [{ x: 1, y: 1 }] });
  for (let i = 0; i < 80; i += 1) {
    const p = byId(pickPhrase({ scene: 'fail', facts: iceOnly, state: createPhraseState() }).id);
    assert.ok(!p.gimmick || p.gimmick === 'ice');
    assert.ok(!p.when?.needs || p.when.needs.every((g) => g === 'ice'));
  }
  const remote = boardFacts({ keys: [{}], keyMode: 'remote' });
  for (let i = 0; i < 80; i += 1) {
    const p = byId(pickPhrase({ scene: 'fail', facts: remote, state: createPhraseState() }).id);
    assert.notEqual(p.when?.keyMode, 'carry');
  }
});

test('nextTapHint：状況に合う場面だけ（とめる無し・失敗0回なら null）', () => {
  const facts = boardFacts({});
  assert.equal(nextTapHint({ facts }), null);
  const stop = nextTapHint({ maxPauses: 1, facts, state: createPhraseState() });
  assert.ok(PHRASES.some((p) => p.scene === 'stop' && p.text === stop));
  const fail = nextTapHint({ fails: 1, facts, state: createPhraseState() });
  assert.ok(PHRASES.some((p) => p.scene === 'fail' && p.text === fail));
});
