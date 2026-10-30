// 小鳥（js/ui-bird.js）の吹き出し文言テーブルと選び方（Issue #468 段3）。
// 文言の正本は承認済みの review/design/468/phrases-v2.md（#468-14A）。このファイルのテーブルがコード側の正本。
// 事実の手がかりだけを返す（答え・方向・手順・個数は言わない。#340）。1文20字以内（空白を数えない）・ひらがな／カタカナのみ（漢字なし）。
// 静的チェックは test/bird-phrases.test.mjs。

export const SCENES = ['start', 'fail', 'stop', 'clear', 'go'];
export const TONES = ['gentle', 'genki', 'mono', 'ask'];
const TONE_BY_KEY = { g: 'gentle', k: 'genki', m: 'mono', a: 'ask' };

// 1行 = [id, scene, gimmick, 口調(g|k|m|a), 本文, 追加項目(topic / when)]。gimmick が null は汎用。
// when：mode（その mode のスイッチが盤にある）／keyMode／needs（すべて盤にある）／minSwitches／and／noGroup。
const ROWS = [
  // ① レッスン開始の問い（start）
  ['1', 'start', null, 'k', 'ゴールまで いこう'],
  ['2', 'start', null, 'g', 'ロボットを ゴールへ とどけよう'],
  ['3', 'start', null, 'a', 'ゴールは どこかな'],
  ['4', 'start', null, 'g', 'ゴールへ いく みちを さがそう'],
  ['5', 'start', null, 'g', 'ゴールに ついたら おしまい'],
  ['6', 'start', null, 'a', 'どこを とおれば ゴールかな'],
  ['7', 'start', null, 'k', 'ロボットと いっしょに ゴールへ'],
  ['8', 'start', null, 'k', 'さあ、ゴールまで いこう'],
  ['9', 'start', null, 'k', 'どんぐりを ぜんぶ あつめよう'],
  ['10', 'start', null, 'g', 'おちている ものを ひろおう'],
  ['S1', 'start', null, 'g', 'どんぐりも わすれずに ね'],
  ['12', 'start', null, 'a', 'どんぐりは どこに あるかな'],
  ['13', 'start', null, 'a', 'ひろいわすれは ないかな'],
  ['14', 'start', null, 'k', 'あつめながら ゴールへ いこう'],
  ['15', 'start', null, 'g', 'きらきら したものを さがそう'],
  ['16', 'start', null, 'k', 'どんぐり あつめ、はじめよう'],
  ['17', 'start', null, 'g', 'みほんと おなじに ぬろう'],
  ['18', 'start', null, 'g', 'ぬる ところを えらぼう'],
  ['19', 'start', null, 'g', 'みほんを よく みてみよう'],
  ['20', 'start', null, 'g', 'とおった ところが ぬれるよ'],
  ['21', 'start', null, 'a', 'おなじ かたちに なるかな'],
  ['22', 'start', null, 'g', 'ぬらない ところも あるよ'],
  ['23', 'start', null, 'k', 'みほんの かたちを つくろう'],
  ['24', 'start', null, 'k', 'ぬって かたちを つくろう'],
  ['25', 'start', null, 'k', 'しかけを つかって ゴールへ'],
  ['26', 'start', null, 'g', 'この ステージの しかけを みてみよう'],
  ['27', 'start', null, 'a', 'しかけに のると どうなるかな'],
  ['S2', 'start', null, 'g', 'しかけを さがしてみよう'],
  ['30', 'start', null, 'g', 'しかけと なかよく なろう'],
  ['31', 'start', null, 'g', 'ふしぎな ものが あるよ'],
  ['32', 'start', null, 'a', 'つかえる ものは ないかな'],
  ['33', 'start', null, 'g', 'おなじ うごきは まとめられるよ', { when: { needs: ['repeatBox'] } }],
  ['34', 'start', null, 'g', 'ならべる じゅんばんを かんがえよう'],
  ['35', 'start', null, 'k', 'ブロックを ならべて うごかそう'],
  ['36', 'start', null, 'g', 'ならべたら スタートを おそう'],

  // ② 失敗2回目などの汎用ヒント（fail）
  ['39', 'fail', null, 'g', 'もういちど ようすを みてみよう'],
  ['40', 'fail', null, 'a', 'ロボットは どこで とまったかな', { topic: 'fail-look' }],
  ['41', 'fail', null, 'g', 'とまった ところを みてみよう'],
  ['42', 'fail', null, 'a', 'ロボットの まわりに なにが あるかな'],
  ['45', 'fail', null, 'g', 'ちがう みちも あるかもしれないよ'],
  ['S3', 'fail', null, 'g', 'はじまりを かんがえてみよう'],
  ['47', 'fail', null, 'g', 'ゆびで みちを なぞってみよう'],
  ['48', 'fail', null, 'g', 'ならべた ブロックを みなおしてみよう'],
  ['49', 'fail', null, 'a', 'とちゅうで かわった ところは ないかな'],
  ['50', 'fail', null, 'g', 'いちど ゆっくり みてみよう'],
  ['51', 'fail', null, 'g', 'おちついて いこう、だいじょうぶ'],
  ['S4', 'fail', null, 'g', 'ブロックを じゅんに みてみよう'],
  ['53', 'fail', null, 'a', 'おなじ ところを ぐるぐる してないかな'],
  ['54', 'fail', null, 'g', 'かべが あるところを さがしてみよう'],
  ['S5', 'fail', null, 'g', 'ひとやすみ してもいいよ'],
  ['S6', 'fail', null, 'g', 'ならべかたは いろいろ あるよ'],
  ['S7', 'fail', null, 'g', 'うごきを もういちど みてみよう'],

  // ③ 「とめる」ヒント（stop）
  ['63', 'stop', null, 'g', 'とちゅうで とめられるよ'],
  ['64', 'stop', null, 'g', '「とめる」を おすと ようすが みられる'],
  ['65', 'stop', null, 'g', 'うごきが きになったら とめてみよう'],
  ['66', 'stop', null, 'g', 'とめてから もういちど かんがえよう'],
  ['67', 'stop', null, 'g', 'とまった ところで よく みよう'],
  ['68', 'stop', null, 'g', '「とめる」は いつでも おせるよ'],
  ['69', 'stop', null, 'g', 'やりなおしたい ときは とめてみよう'],
  ['70', 'stop', null, 'k', 'ロボットを とめて ならべなおそう'],
  ['71', 'stop', null, 'g', 'とめると ブロックも みなおせる'],
  ['S8', 'stop', null, 'g', 'ゆっくり みたい ときは とめてね'],
  ['73', 'stop', null, 'g', 'とめたら ひとやすみ してもいいよ'],
  ['74', 'stop', null, 'g', '「とめる」で ゆっくり みられるよ'],

  // ④ はげまし：クリア後（clear）
  ['75', 'clear', null, 'k', 'やったね'],
  ['77', 'clear', null, 'k', 'ゴール、おめでとう'],
  ['78', 'clear', null, 'g', 'よく かんがえたね'],
  ['80', 'clear', null, 'm', 'ロボットも うれしそう'],
  ['S9', 'clear', null, 'g', 'ゴールに ついたね'],
  ['83', 'clear', null, 'g', 'じぶんで みつけたね'],
  ['S10', 'clear', null, 'g', 'おつかれさま、よかったね'],
  ['87', 'clear', null, 'k', 'ロボットも うれしそうだよ'],
  ['89', 'clear', null, 'g', 'さいごまで できたね'],
  ['91', 'clear', null, 'g', 'ほっと したね、よかった'],
  // 最短超過でクリアしたときだけ、結果ダイアログの後に明示的に使う（Issue #491。通常の clear の選び方には混ぜない）。
  ['SH1', 'clear', null, 'a', 'もっと みじかく できる？', { only: 'shorter' }],
  // ④ はげまし：失敗後（fail）
  ['93', 'fail', null, 'g', 'だいじょうぶ、ゆっくりで いいよ'],
  ['S11', 'fail', null, 'g', 'いろいろ ためして いいよ'],
  ['95', 'fail', null, 'g', 'いっしょに みてみようか'],
  ['96', 'fail', null, 'g', 'あせらなくて いいよ'],
  ['97', 'fail', null, 'g', 'かんがえてるの、えらいね'],
  ['S12', 'fail', null, 'g', 'ヒントは とりを おしてね'],

  // ⑤ 「スタート！」（go）
  ['101', 'go', null, 'k', 'スタート！', { topic: 'go-start' }],
  ['102', 'go', null, 'k', 'さあ、いくよ'],
  ['103', 'go', null, 'g', 'ロボット、いってらっしゃい'],
  ['104', 'go', null, 'g', 'うごき はじめるよ'],
  ['105', 'go', null, 'a', 'よういは いいかな'],
  ['106', 'go', null, 'g', 'では、スタート'],
  ['107', 'go', null, 'g', 'どうなるか みてみよう'],
  ['108', 'go', null, 'k', 'しゅっぱつ！'],
  ['109', 'go', null, 'k', 'いってみよう'],
  ['110', 'go', null, 'm', 'さあ、どうかな'],
  ['112', 'go', null, 'k', 'ようい、ドン'],
  ['113', 'go', null, 'g', 'ならべた とおりに うごくよ'],
  ['114', 'go', null, 'k', 'ロボット、がんばれ'],
  ['115', 'go', null, 'g', 'はじまるよ'],
  ['116', 'go', null, 'g', 'わくわくするね'],

  // ⑥ ギミック別ヒント（fail のみ。今あるレッスンに出るギミックだけ）
  // items（どんぐり）
  ['117', 'fail', 'items', 'a', 'どんぐりは のこってないかな'],
  ['120', 'fail', 'items', 'g', 'ひろいわすれが ないか みてみよう'],
  ['121', 'fail', 'items', 'g', 'どんぐりを とおる みちを かんがえよう'],
  ['122', 'fail', 'items', 'g', 'ゴールに ついても どんぐりは のこるよ'],
  ['124', 'fail', 'items', 'g', 'どんぐりを ゆびで しめしてみよう'],
  ['125', 'fail', 'items', 'a', 'とおらなかった ところは ないかな'],
  ['126', 'fail', 'items', 'g', 'どんぐりの ちかくを みてみよう'],
  // ice（こおり）
  ['S13', 'fail', 'ice', 'g', 'こおりは つるつる だよ'],
  ['128', 'fail', 'ice', 'a', 'こおりに のると どうなるかな'],
  ['129', 'fail', 'ice', 'g', 'すべって とまる ところを みてみよう'],
  ['S14', 'fail', 'ice', 'a', 'こおりが おわる ところは どこかな'],
  ['131', 'fail', 'ice', 'g', 'すべる ことを かんがえてみよう'],
  ['133', 'fail', 'ice', 'a', 'すべったあと どこに いるかな'],
  ['S15', 'fail', 'ice', 'g', 'こおりは すべり つづけるよ'],
  ['135', 'fail', 'ice', 'g', 'すべると いっきに うごくよ'],
  ['136', 'fail', 'ice', 'g', 'こおりの はしを よく みてみよう'],
  ['S16', 'fail', 'ice', 'g', 'クッションで すべりも とまるよ', { when: { needs: ['ice', 'cushion'] } }],
  ['S17', 'fail', 'ice', 'm', 'すべると クッションで とまるかなあ', { when: { needs: ['ice', 'cushion'] } }],
  ['S18', 'fail', 'ice', 'a', 'すべりながら ふむと どうなるかな', { when: { needs: ['ice', 'switches'] } }],
  ['S19', 'fail', 'ice', 'm', 'すべりながら スイッチを ふめるかなあ', { when: { needs: ['ice', 'switches'] } }],
  // cushion
  ['137', 'fail', 'cushion', 'g', 'ふわふわの クッションが あるよ'],
  ['138', 'fail', 'cushion', 'a', 'クッションに ぶつかると どうなるかな'],
  ['139', 'fail', 'cushion', 'g', 'クッションは やさしく うけとめるよ'],
  ['S20', 'fail', 'cushion', 'g', 'クッションに あたると とまるよ'],
  ['141', 'fail', 'cushion', 'a', 'クッションは とおれる ところかな'],
  ['142', 'fail', 'cushion', 'g', 'クッションの ならびを みてみよう'],
  ['143', 'fail', 'cushion', 'g', 'ぶつかっても へいきな ものが あるよ'],
  ['144', 'fail', 'cushion', 'k', 'クッションを うまく つかおう'],
  // keys（かぎとドア）
  ['157', 'fail', 'keys', 'g', 'かぎの いろを みてみよう'],
  ['158', 'fail', 'keys', 'a', 'ドアと おなじ いろの かぎは どこかな'],
  ['S21', 'fail', 'keys', 'a', 'かぎを とると ドアは どうなるかな', { when: { keyMode: 'remote' } }],
  ['S22', 'fail', 'keys', 'a', 'ドアに あう かぎは あるかな'],
  ['162', 'fail', 'keys', 'a', 'どの ドアに どの かぎかな'],
  ['S23', 'fail', 'keys', 'g', 'もっている かぎを みてみよう', { when: { keyMode: 'carry' } }],
  ['165', 'fail', 'keys', 'g', 'ドアは かぎが ないと あかないよ'],
  ['166', 'fail', 'keys', 'g', 'かぎの ばしょを たしかめよう'],
  // switches（スイッチ）
  ['167', 'fail', 'switches', 'g', 'スイッチを ふむと なにかが かわるよ'],
  ['168', 'fail', 'switches', 'g', 'スイッチの いろと かたちを みよう'],
  ['169', 'fail', 'switches', 'g', 'おなじ しるしの かべを さがそう', { when: { noGroup: true } }],
  ['S24', 'fail', 'switches', 'g', 'かべが でてくる ところを みよう', { when: { mode: ['close', 'toggle'] } }],
  ['171', 'fail', 'switches', 'a', 'スイッチを ふむと かべは どうなるかな', { topic: 'sw-wall' }],
  ['173', 'fail', 'switches', 'g', 'ふむ じゅんばんも ヒントだよ', { when: { minSwitches: 2 } }],
  ['S25', 'fail', 'switches', 'g', 'しるしが ならんだ かべを よく みよう', { when: { and: true } }],
  ['175', 'fail', 'switches', 'g', 'かべが たつことも あるよ', { when: { mode: ['close', 'toggle'] } }],
  ['S26', 'fail', 'switches', 'g', 'レバーの ようすに きをつけよう', { when: { mode: ['toggle'] } }],
  ['177', 'fail', 'switches', 'a', 'もう いちど ふむと どうなるかな', { when: { mode: ['toggle'] } }],
  ['179', 'fail', 'switches', 'a', 'きになる かべは ないかな'],
  ['S27', 'fail', 'switches', 'a', 'ふむたびに かべは どうなるかな', { when: { mode: ['toggle'] } }],
  ['S28', 'fail', 'switches', 'a', 'ふんだら どこが かわったかな', { when: { mode: ['close'] } }],
  // repeatBox（くりかえし。すべて needs=repeatBox）
  ['211', 'fail', 'repeatBox', 'a', 'おなじ うごきが ならんでいないかな', { when: { needs: ['repeatBox'] } }],
  ['212', 'fail', 'repeatBox', 'g', 'くりかえしの はこを みてみよう', { when: { needs: ['repeatBox'] } }],
  ['213', 'fail', 'repeatBox', 'a', 'まとめられる ところは ないかな', { when: { needs: ['repeatBox'] } }],
  ['214', 'fail', 'repeatBox', 'g', 'はこの なかを たしかめよう', { when: { needs: ['repeatBox'] } }],
  ['S29', 'fail', 'repeatBox', 'g', 'くりかえしは まとめて つかうよ', { when: { needs: ['repeatBox'] } }],
  ['216', 'fail', 'repeatBox', 'm', 'ブロックが すくなく なるかも', { when: { needs: ['repeatBox'] } }],
  ['217', 'fail', 'repeatBox', 'g', 'おなじ ところを さがしてみよう', { when: { needs: ['repeatBox'] } }],
  ['218', 'fail', 'repeatBox', 'g', 'はこに いれる ものを かんがえよう', { when: { needs: ['repeatBox'] } }],

  // 口調バリエーション（同じ内容を4口調。同じ topic でひもづけ）
  // 内容A：スイッチ・かべへの気づき
  ['S30', 'fail', 'switches', 'g', 'スイッチを ふむと かべが かわるよ', { topic: 'sw-wall' }],
  ['S31', 'fail', 'switches', 'k', 'スイッチの かべを よく みよう', { topic: 'sw-wall' }],
  ['S32', 'fail', 'switches', 'm', 'あの かべ、つながってるのかな', { topic: 'sw-wall' }],
  // 内容B：こおりでの滑り
  ['S33', 'fail', 'ice', 'g', 'こおりは すべるから ようすを みようね', { topic: 'ice-slide' }],
  ['S34', 'fail', 'ice', 'k', 'こおりは すべるよ、よく みよう', { topic: 'ice-slide' }],
  ['239', 'fail', 'ice', 'm', 'こおり、すべって とまれるかなあ', { topic: 'ice-slide' }],
  ['S35', 'fail', 'ice', 'a', 'こおりで ロボットは どうなるかな', { topic: 'ice-slide' }],
  // 内容C：失敗後の汎用
  ['241', 'fail', null, 'g', 'いっしょに ようすを みてみようね', { topic: 'fail-look' }],
  ['S36', 'fail', null, 'k', 'ようすを みて いこう', { topic: 'fail-look' }],
  ['243', 'fail', null, 'm', 'どこで とまったのかなあ', { topic: 'fail-look' }],
  // 内容D：「とめる」の案内
  ['245', 'stop', null, 'g', 'きになったら 「とめる」を おしてみてね', { topic: 'stop-btn' }],
  ['246', 'stop', null, 'k', '「とめる」で ストップだ', { topic: 'stop-btn' }],
  ['S37', 'stop', null, 'm', 'とめて みようかなあ', { topic: 'stop-btn' }],
  ['248', 'stop', null, 'a', '「とめる」を おすと どうなるかな', { topic: 'stop-btn' }],
  // 内容E：どんぐりのひろい忘れ
  ['249', 'fail', 'items', 'g', 'どんぐりが のこって いないか みてね', { topic: 'item-left' }],
  ['S38', 'fail', 'items', 'k', 'どんぐり、さがしに いこう', { topic: 'item-left' }],
  ['251', 'fail', 'items', 'm', 'ひろいわすれは ないかなあ', { topic: 'item-left' }],
  ['252', 'fail', 'items', 'a', 'どんぐりは ぜんぶ ひろえたかな', { topic: 'item-left' }],
  // 内容F：スタート
  ['253', 'go', null, 'g', 'じゅんびが できたら スタートしようね', { topic: 'go-start' }],
  ['255', 'go', null, 'm', 'さて、どう うごくかなあ', { topic: 'go-start' }],
  ['256', 'go', null, 'a', 'じゅんびは いいかな', { topic: 'go-start' }],
];

export const PHRASES = ROWS.map(([id, scene, gimmick, t, text, extra = {}]) => ({
  id,
  scene,
  gimmick,
  tone: TONE_BY_KEY[t],
  text,
  ...extra,
}));

// ある盤から文言の条件に使う事実だけを取り出す（step は元のレッスン段。group 展開前の形を想定）。
export function boardFacts(step) {
  const s = step ?? {};
  const has = (a) => Array.isArray(a) && a.length > 0;
  const switches = Array.isArray(s.switches) ? s.switches : [];
  const gimmicks = new Set();
  if (has(s.items)) gimmicks.add('items');
  if (has(s.ice)) gimmicks.add('ice');
  if (has(s.cushion)) gimmicks.add('cushion');
  if (has(s.keys)) gimmicks.add('keys');
  if (switches.length > 0) gimmicks.add('switches');
  if (s.repeatBox) gimmicks.add('repeatBox');
  const hits = new Map();
  let and = false;
  for (const sw of switches) {
    for (const t of Array.isArray(sw?.targets) ? sw.targets : []) {
      const k = `${t.x},${t.y}`;
      hits.set(k, (hits.get(k) ?? 0) + 1);
      if (hits.get(k) >= 2) and = true;
    }
  }
  return {
    paint: has(s.paint),
    gimmicks,
    modes: new Set(switches.map((sw) => sw?.mode ?? 'open')),
    keyMode: s.keyMode === 'remote' ? 'remote' : 'carry',
    switchCount: switches.length,
    and,
    noGroup: !switches.some((sw) => typeof sw?.group === 'string'),
  };
}

function whenOk(when, f) {
  if (!when) return true;
  if (when.mode && !when.mode.some((m) => f.modes.has(m))) return false;
  if (when.keyMode && when.keyMode !== f.keyMode) return false;
  if (when.needs && !when.needs.every((g) => f.gimmicks.has(g))) return false;
  if (when.minSwitches && f.switchCount < when.minSwitches) return false;
  if (when.and && !f.and) return false;
  if (when.noGroup && !f.noGroup) return false;
  return true;
}

// セッション内の覚え（メモリのみ。端末には保存しない）。
export function createPhraseState() {
  return { used: new Set(), lastId: null, lastTone: new Map(), lastTopic: null, lastGimmick: null };
}
const SESSION = createPhraseState();

const TONE_WEIGHT = { gentle: 40, ask: 30, mono: 20, genki: 10 };
const GIMMICK_RATE = 0.7; // 失敗後はギミック別70%／汎用30%（仮値）

function pickOne(list, rng) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function pickWeighted(tones, rng) {
  const total = tones.reduce((n, t) => n + TONE_WEIGHT[t], 0);
  let r = rng() * total;
  for (const t of tones) {
    r -= TONE_WEIGHT[t];
    if (r < 0) return t;
  }
  return tones[tones.length - 1];
}

// 場面ごとに文言を1つ選ぶ。出せる文言が無ければ null。
// paint の盤では失敗後の汎用ヒントを出さない（#468-14d）。fail と stop は genki を使わない（焦らせないため）。
export function pickPhrase({ scene, facts, state = SESSION, rng = Math.random }) {
  const f = facts ?? boardFacts(null);
  if (scene === 'fail' && f.paint) return null;
  let pool = PHRASES.filter((p) => p.scene === scene && !p.only && whenOk(p.when, f));
  if (scene === 'fail' || scene === 'stop') pool = pool.filter((p) => p.tone !== 'genki');
  if (scene === 'fail') {
    // 盤にあるギミックのうち1つ（直近は避ける）を、70%の確率で優先する。
    const gimmicks = [...new Set(pool.filter((p) => p.gimmick && f.gimmicks.has(p.gimmick)).map((p) => p.gimmick))];
    const generic = pool.filter((p) => !p.gimmick);
    if (gimmicks.length > 0 && (generic.length === 0 || rng() < GIMMICK_RATE)) {
      const fresh = gimmicks.filter((g) => g !== state.lastGimmick);
      const g = pickOne(fresh.length > 0 ? fresh : gimmicks, rng);
      pool = pool.filter((p) => p.gimmick === g);
    } else {
      pool = generic;
    }
  } else {
    pool = pool.filter((p) => !p.gimmick);
  }
  if (pool.length === 0) return null;

  // 同じ文言は使い切るまで出さない。使い切ったらこのプールだけ一巡リセット（直前の文言は最初の候補から外す）。
  let cands = pool.filter((p) => !state.used.has(p.id));
  if (cands.length === 0) {
    pool.forEach((p) => state.used.delete(p.id));
    cands = pool.length > 1 ? pool.filter((p) => p.id !== state.lastId) : pool;
  }
  // 直前と同じ口調・同じ topic を続けない（候補が他にあるとき）。
  const lastTone = state.lastTone.get(scene);
  const diffTone = cands.filter((p) => p.tone !== lastTone);
  if (diffTone.length > 0) cands = diffTone;
  const diffTopic = cands.filter((p) => !p.topic || p.topic !== state.lastTopic);
  if (diffTopic.length > 0) cands = diffTopic;

  const tone = pickWeighted([...new Set(cands.map((p) => p.tone))], rng);
  const chosen = pickOne(
    cands.filter((p) => p.tone === tone),
    rng,
  );
  state.used.add(chosen.id);
  state.lastId = chosen.id;
  state.lastTone.set(scene, chosen.tone);
  state.lastTopic = chosen.topic ?? null;
  if (chosen.gimmick) state.lastGimmick = chosen.gimmick;
  return { id: chosen.id, text: chosen.text };
}

// 最短超過でクリアしたときの一言（only:'shorter' の行。Issue #491）。
export function shorterPhrase() {
  return PHRASES.find((p) => p.only === 'shorter')?.text ?? null;
}

// 「失敗の後の自動1回」用：失敗後の文言から1つ（text）。出せなければ null/undefined。
export function nextFailHint(facts, opts = {}) {
  return pickPhrase({ scene: 'fail', facts, ...opts })?.text ?? null;
}

// 顔アイコンのタップ用：その画面の状況に合う場面から1つ。
// maxPauses>0（「とめる」のあるステージ）なら stop、失敗が1回以上なら fail を候補にする。無ければ null。
export function nextTapHint({ maxPauses = 0, fails = 0, facts, ...opts }) {
  const scenes = [];
  if (maxPauses > 0) scenes.push('stop');
  if (fails > 0 && !facts?.paint) scenes.push('fail');
  if (scenes.length === 0) return null;
  const rng = opts.rng ?? Math.random;
  const scene = scenes.length === 1 ? scenes[0] : pickOne(scenes, rng);
  return pickPhrase({ scene, facts, ...opts })?.text ?? null;
}
