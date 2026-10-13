// レッスン1本の検証（validateLesson）。tools/lib/validate/ からの分割（Issue #448）。
import path from 'node:path';
import { simulate, shortestSteps, shortestChips, boardSpec } from '../../../js/engine-grid.js';
import { iceMustMatter, keysMustMatter, periodicMustMatter, paintMustMatter, itemsMustMatter } from '../../lib/must-matter.mjs';
import { plainSegmentsText, plainReading, parseSegments, rubyGrade, KANJI_RE } from '../../../js/text-render.js';
import {
  REQUIRED_KEYS,
  KINDS,
  COMMANDS,
  MIN_STEPS,
  MAX_STEPS,
  MIN_PLAY,
  MAX_PLAY,
  LONG_MAX_STEPS,
  LONG_MAX_PLAY,
  LONG_MINUTES,
  FORBIDDEN_WORDS,
  inGrid,
  isInt,
  isObj,
} from './common.mjs';
import { checkBoard, checkSwitchMatters } from './board.mjs';
import { checkDemo, checkSolution } from './demo-solution.mjs';
import { validatePractice, validateSeesaw } from './practice-seesaw.mjs';
import { checkStageGen } from './stagegen.mjs';

export function validateLesson(fileName, data, longTrialIds = []) {
  const errors = [];
  const add = (rule, detail) => errors.push(`${fileName}: ${rule}: ${detail}`);

  for (const key of REQUIRED_KEYS) {
    if (!(key in data)) add('必須キー', `${key} がない`);
  }
  if (errors.length > 0) return errors;

  const idFromFile = path.basename(fileName, '.json');
  if (data.lessonId !== idFromFile) {
    add('ID一致', `lessonId="${data.lessonId}" はファイル名"${idFromFile}"と不一致`);
  }

  const steps = Array.isArray(data.steps) ? data.steps : [];
  // 長尺試作＝ファイル名由来のidが longTrialIds に載るレッスン（lessonIdでは引かない）。
  const isLong = longTrialIds.includes(idFromFile);
  // stageGen の別枠（Issue #369）＝stageGen がオブジェクトで seedPick が無いレッスン。longTrialIds とは無関係で、あれば別枠を優先する。
  const isGenLong = isObj(data.stageGen) && !steps.some((s) => s.kind === 'seedPick');
  const wide = isLong || isGenLong;
  const minutes = wide ? LONG_MINUTES : 5;
  if (data.estimatedMinutes !== minutes) {
    add('所要時間', `estimatedMinutes=${data.estimatedMinutes}（${minutes}である必要がある）`);
  }
  const maxSteps = wide ? LONG_MAX_STEPS : MAX_STEPS;
  // 別枠の play 上限は stageGen.stages。stages が不正なときは検査せず、stageGen 自体の不合格に任せる。
  const sgStages = isGenLong ? data.stageGen.stages : undefined;
  const maxPlay = isGenLong
    ? (isInt(sgStages) && sgStages >= 2 && sgStages <= 8 ? sgStages : Infinity)
    : (isLong ? LONG_MAX_PLAY : MAX_PLAY);

  checkStageGen(data, steps, add);
  if (steps.some((s) => s.kind === 'seedPick')) {
    if (isLong) add('長尺試作とseedPick', 'longTrialIdsのレッスンはseedPick（れんしゅう）を持てない');
    validatePractice(steps, add);
    return errors;
  }
  if (steps.length < MIN_STEPS || steps.length > maxSteps) {
    add('ステップ数', `steps.length=${steps.length}（${MIN_STEPS}〜${maxSteps}である必要がある）`);
  }

  for (const step of steps) {
    if (!KINDS.includes(step.kind)) {
      add('kind', `stepId="${step.stepId}" の kind="${step.kind}" が不正`);
    }
    if (typeof step.text === 'string') {
      // ルビ記法 {漢字|よみ} 外に生の漢字・崩れた中括弧が残っていないか（地の文部分のみで判定）。
      const outside = plainSegmentsText(step.text);
      if (KANJI_RE.test(outside)) add('ルビ外の漢字', `stepId="${step.stepId}" の text にルビ記法外の漢字がある`);
      if (outside.includes('{') || outside.includes('}')) {
        add('ルビ記法', `stepId="${step.stepId}" の text の中括弧が壊れている（{漢字|よみ}の形式で書く）`);
      }
      // ルビ内の漢字が学年別漢字配当表（js/kanji-grades.js）に無ければNG。よみ側に漢字が
      // 混じっている（読み仮名になっていない）場合もNG。
      for (const seg of parseSegments(step.text)) {
        if (typeof seg === 'string') continue;
        if (rubyGrade(seg.kanji) === null) {
          add('配当表外の漢字', `stepId="${step.stepId}" の {${seg.kanji}|${seg.kana}} に配当表に無い漢字がある`);
        }
        if (KANJI_RE.test(seg.kana)) {
          add('ルビ記法', `stepId="${step.stepId}" の {${seg.kanji}|${seg.kana}} のよみに漢字が混じっている`);
        }
      }
      // 20字制限は全てひらがなに展開した表示（よみレベル0）で判定する（最長になる表示のため）。
      const reading = plainReading(step.text);
      if ([...reading].length > 20) add('文字数', `stepId="${step.stepId}" の text が展開後20字超`);
      for (const word of FORBIDDEN_WORDS) {
        if (reading.includes(word)) add('否定語', `stepId="${step.stepId}" の text に否定語「${word}」がある`);
      }
    }
  }

  // predictは0個でもよい（現行レッスンはIssue #104で全廃。将来の教材型のため語彙は残す）。
  const predictSteps = steps.filter((s) => s.kind === 'predict');

  // playは2〜4個（だんだん難易度を上げる複数ステージ構成。Issue #104）。長尺試作の一覧IDだけ2〜8個（Issue #319）。
  const playSteps = steps.filter((s) => s.kind === 'play');
  if (data.type === 'grid-runtime' && (playSteps.length < MIN_PLAY || playSteps.length > maxPlay)) {
    add('盤面の必須', `kind="play" が${playSteps.length}個（${MIN_PLAY}〜${maxPlay}個である必要がある）`);
  }

  // チュートリアル（tutorial）は各単元1本目のみ・0〜1個（Issue #81）。
  const tutorialSteps = steps.filter((s) => s.kind === 'tutorial');
  if (tutorialSteps.length > 1) {
    add('チュートリアルの個数', `kind="tutorial" が${tutorialSteps.length}個（0〜1個である必要がある）`);
  }

  if (data.type === 'predict-slider') {
    validateSeesaw(playSteps, add, maxPlay);
    return errors;
  }
  if (data.type !== 'grid-runtime' || playSteps.length === 0) return errors;

  checkDemo(steps.find((s) => s.kind === 'intro'), playSteps, add);

  // 各ステージの最短距離（groupRepeatsはチップ数）。難易度がステージごとに非減少であることを
  // 後段でまとめて検証する（Issue #104）。
  const stageDistances = [];
  for (const play of playSteps) {
    const grid = play.grid || {};
    const label = `stepId="${play.stepId}" の`;

    const groupNg = checkBoard(play, add, label);

    if ('groupRepeats' in play && typeof play.groupRepeats !== 'boolean') {
      add('groupRepeatsの型', `${label}groupRepeats=${JSON.stringify(play.groupRepeats)} はboolean以外`);
    }

    if ('initialCommands' in play) {
      const initial = play.initialCommands;
      if (!Array.isArray(initial) || initial.some((c) => !COMMANDS.includes(c))) {
        add('命令語彙', `${label}initialCommands=${JSON.stringify(initial)} が不正`);
      } else if (typeof play.maxCommands === 'number' && initial.length > play.maxCommands) {
        add('なおすの初期状態', `${label}initialCommands.length=${initial.length} がmaxCommands=${play.maxCommands}を超える`);
      }
    }

    if ('repeatBox' in play && typeof play.repeatBox !== 'boolean') {
      add('repeatBoxの型', `${label}repeatBox=${JSON.stringify(play.repeatBox)} はboolean以外`);
    }
    if (play.repeatBox === true && play.groupRepeats === true) {
      add('repeatBoxとgroupRepeats', `${label}repeatBoxとgroupRepeatsは同時に指定できない`);
    }

    const solutionChips = checkSolution(play, add, label);

    let dist = null;
    if (play.repeatBox === true) {
      // 箱ステージ：最短性はBFSで求めない。箱なしの最短手数がmaxCommandsを超える（箱が必須）ことと、
      // solutionが必須であること（maxCommands判定の根拠）を検証する。難易度順序はsolutionのチップ数で比較。
      if (!('solution' in play)) add('solutionの必須', `${label}repeatBoxにはsolutionが必要`);
      if (play.start && play.goal && grid.cols && grid.rows) {
        const noBox = shortestSteps(boardSpec(play));
        if (noBox <= play.maxCommands) {
          add('箱の必須性', `${label}箱なしでmaxCommands=${play.maxCommands}以内に解ける（最短${noBox}手）`);
        }
      }
      dist = typeof solutionChips === 'number' ? solutionChips : null;
    } else if (play.start && play.goal && grid.cols && grid.rows) {
      const spec = boardSpec(play);
      // groupRepeatsありのレッスンは、同方向連続をまとめた最小チップ数で判定する
      // （まとめないと手数制限に収まらないレッスンを正しく通すため）。
      dist = play.groupRepeats ? shortestChips(spec) : shortestSteps(spec);
      if (dist > play.maxCommands) {
        add(
          'ゴール到達可能性',
          `${label}最短${dist === Infinity ? '到達不能' : dist + (play.groupRepeats ? 'チップ' : '手')}` +
            `（maxCommands=${play.maxCommands}以内で到達できない）`
        );
      }
      // 氷ステージは氷を壁扱いにしても到達できるなら、氷を踏まずにクリアできてしまう。
      const iceCheck = iceMustMatter(play);
      if (!iceCheck.matters) {
        add('こおりの必須性', `${label}こおりを踏まずにmaxCommands=${play.maxCommands}以内でゴールできる（最短${iceCheck.dist}）`);
      }
    }
    // ドアは壁扱いにしても到達できるなら、かぎを取らずにクリアできてしまう（ドアが飾り）。
    if (dist !== null) {
      const keysCheck = keysMustMatter(play);
      if (!keysCheck.matters) {
        add('かぎの必須性', `${label}かぎを取らずにmaxCommands=${play.maxCommands}以内でゴールできる（最短${keysCheck.dist}）`);
      }
    }
    // 生成したステップ（gen 付き）で teach=items のとき、どんぐりを除いた盤の最短が実際の最短より短いこと（Issue #337）。
    if (dist !== null && dist !== Infinity && play.gen && data.stageGen?.teach === 'items' && !play.groupRepeats) {
      if (!itemsMustMatter(play, dist)) {
        add('どんぐりの必須性', `${label}どんぐりを除いても最短${dist}手のまま（どんぐりが最短経路に影響しない）`);
      }
    }
    // 周期ドアを「常に開」（ドアを無視）にした盤の最短と比べ、実際の最短が長くなければドアが飾り（待ち・寄り道が要らない）。
    // 「常に開の最短 <= maxCommands なら不合格」は、ドアは通行を狭めるだけで常に成立してしまうため、paintの必須性と同じ比較にした。
    const periodicCheck = periodicMustMatter(play, dist);
    if (!periodicCheck.matters) {
      add('周期ドアの必須性', `${label}周期ドアを常に開とみなした最短(${periodicCheck.dist})より最短(${dist})が長くない（待ち・寄り道が要らず、ドアが飾り）`);
    }
    // paint：目標が最短経路（塗り無しの最短）より大きいこと（塗りが飾りでない）と、maxCommands＝最短ちょうど。
    if (dist !== null && Array.isArray(play.paint) && play.paint.length > 0) {
      const paintCheck = paintMustMatter(play, dist);
      if (!paintCheck.matters) add('paintの必須性', `${label}目標の塗りが最短経路より大きくない（塗り無しの最短${paintCheck.dist}、塗りありの最短${dist}）`);
      if (dist !== Infinity && play.maxCommands !== dist) add('paintの手数', `${label}maxCommands=${play.maxCommands} が最短${dist}手と一致しない`);
    }
    if (!groupNg) checkSwitchMatters(play, dist, add, label);
    stageDistances.push(dist);

    if (
      Array.isArray(play.initialCommands) &&
      play.initialCommands.every((c) => COMMANDS.includes(c)) &&
      play.start &&
      play.goal
    ) {
      const result = simulate(play.initialCommands, boardSpec(play));
      if (result.reachedGoal && result.remainingItems.length === 0 && result.blockedAt.length === 0) {
        add('なおすの初期状態', `${label}initialCommandsがそのまま実行してもゴールに到達してしまう（直す必要が無い）`);
      }
    }
  }

  for (let i = 1; i < stageDistances.length; i += 1) {
    const prev = stageDistances[i - 1];
    const cur = stageDistances[i];
    if (prev !== null && cur !== null && cur !== Infinity && prev !== Infinity && cur < prev) {
      add(
        '難易度の順序',
        `stepId="${playSteps[i].stepId}" の最短(${cur})がstepId="${playSteps[i - 1].stepId}"の最短(${prev})より短い` +
          '（ステージが進むほど難易度は非減少である必要がある）'
      );
    }
  }

  // 予想向けの検証は最初のplayステージの盤面を基準にする（predictは現行レッスンでは未使用。Issue #104）。
  const referencePlay = playSteps[0];
  const refGrid = referencePlay.grid || {};

  if (tutorialSteps.length === 1) {
    const tutorial = tutorialSteps[0];
    const tutorialIdx = steps.indexOf(tutorial);
    const prevStep = steps[tutorialIdx - 1];
    if (!prevStep || prevStep.kind !== 'intro') {
      add('チュートリアルの位置', `stepId="${tutorial.stepId}" の直前がintroでない`);
    }
    const firstPlayIdx = steps.findIndex((s) => s.kind === 'play');
    if (firstPlayIdx !== -1 && tutorialIdx > firstPlayIdx) {
      add('チュートリアルの位置', `stepId="${tutorial.stepId}" が最初のplayより後にある`);
    }

    checkBoard(tutorial, add, `stepId="${tutorial.stepId}" の`);

    if ('groupRepeats' in tutorial && typeof tutorial.groupRepeats !== 'boolean') {
      add('groupRepeatsの型', `stepId="${tutorial.stepId}" のgroupRepeats=${JSON.stringify(tutorial.groupRepeats)} はboolean以外`);
    }
    if ('repeatBox' in tutorial && typeof tutorial.repeatBox !== 'boolean') {
      add('repeatBoxの型', `stepId="${tutorial.stepId}" のrepeatBox=${JSON.stringify(tutorial.repeatBox)} はboolean以外`);
    }
    if (tutorial.repeatBox === true && tutorial.groupRepeats === true) {
      add('repeatBoxの併用', `stepId="${tutorial.stepId}" のrepeatBoxとgroupRepeatsが同時にtrue`);
    }
    if ('initialCommands' in tutorial) {
      const initial = tutorial.initialCommands;
      if (!Array.isArray(initial) || initial.some((c) => !COMMANDS.includes(c))) {
        add('命令語彙', `stepId="${tutorial.stepId}" のinitialCommands=${JSON.stringify(initial)} が不正`);
      } else if (
        initial.every((c) => COMMANDS.includes(c)) &&
        tutorial.start &&
        tutorial.goal
      ) {
        const freshResult = simulate(initial, boardSpec(tutorial));
        if (freshResult.reachedGoal && freshResult.remainingItems.length === 0 && freshResult.blockedAt.length === 0) {
          add('なおすの初期状態', `stepId="${tutorial.stepId}" のinitialCommandsがそのまま実行してもゴールに到達してしまう（直す必要が無い）`);
        }
      }
    }

    if (!Array.isArray(tutorial.script) || tutorial.script.length === 0) {
      add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscriptが空`);
    } else {
      // tap語彙: allowedCommandsの方向・'run'（最後のみ）・'remove'（積んだチップのindexを消す。
      // initialCommands付きの「なおす」れんしゅう用。Issue #98）。
      // box/times/closeは箱のれんしゅう用（repeatBox時のみ。Issue #139）。
      const tapVocab = [...(Array.isArray(tutorial.allowedCommands) ? tutorial.allowedCommands : []), 'run', 'remove', 'box', 'times', 'close'];
      tutorial.script.forEach((entry, i) => {
        if (entry && 'text' in entry) {
          add(
            'チュートリアルのscript',
            `stepId="${tutorial.stepId}" のscript[${i}]にtextがある（文字を読ませない方針のため持たない）`
          );
        }
        if (!entry || !tapVocab.includes(entry.tap)) {
          add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscript[${i}].tap=${JSON.stringify(entry?.tap)} が不正`);
        }
        if (entry?.tap === 'run' && i !== tutorial.script.length - 1) {
          add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscript[${i}]がrunだが最後ではない`);
        }
        if (entry?.tap === 'remove' && !Number.isInteger(entry.index)) {
          add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscript[${i}].index=${JSON.stringify(entry?.index)} が不正`);
        }
      });
      if (tutorial.script.at(-1)?.tap !== 'run') {
        add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscriptの最後がrunでない`);
      }

      // script（initialCommands→remove/tap（groupRepeats考慮）→run）を逐次再生し、最終的な
      // 命令列がゴール到達＋全item回収になるか確認する。removeのindexが範囲外なら消し過ぎとして
      // NGにする（Issue #98）。
      const initial = Array.isArray(tutorial.initialCommands) ? tutorial.initialCommands : [];
      let chips = initial.every((c) => COMMANDS.includes(c)) ? initial.map((dir) => ({ dir, times: 1 })) : null;
      let replayOk = chips !== null;
      let boxOpen = -1;
      const ngScript = (i, msg) => {
        add('チュートリアルのscript', `stepId="${tutorial.stepId}" のscript[${i}] ${msg}`);
        replayOk = false;
      };
      if (replayOk) {
        for (const [i, entry] of tutorial.script.entries()) {
          const tap = entry?.tap;
          if (['box', 'times', 'close'].includes(tap) && tutorial.repeatBox !== true) {
            ngScript(i, `のtap=${tap}はrepeatBox無しでは使えない`);
            break;
          }
          if (tap === 'run') {
            if (boxOpen >= 0) ngScript(i, 'のrunの時点で箱が開いたまま');
            break;
          }
          if (tap === 'box') {
            if (boxOpen >= 0) { ngScript(i, 'のboxが箱を開いている間に押される'); break; }
            chips.push({ box: [], times: 2 });
            boxOpen = chips.length - 1;
          } else if (tap === 'times') {
            if (boxOpen < 0) { ngScript(i, 'のtimesが箱の閉じている時に押される'); break; }
            const box = chips[boxOpen];
            box.times = box.times >= 4 ? 2 : box.times + 1;
          } else if (tap === 'close') {
            if (boxOpen < 0) { ngScript(i, 'のcloseが箱の閉じている時に押される'); break; }
            if (chips[boxOpen].box.length === 0) { ngScript(i, 'のcloseで空の箱を閉じている'); break; }
            boxOpen = -1;
          } else if (tap === 'remove') {
            if (boxOpen >= 0) { ngScript(i, 'のremoveが箱を開いている間に使われている'); break; }
            if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= chips.length) {
              add(
                'チュートリアルのscript',
                `stepId="${tutorial.stepId}" のscriptのremove.index=${entry.index} が範囲外（チップ${chips.length}個・消し過ぎ）`
              );
              replayOk = false;
              break;
            }
            chips.splice(entry.index, 1);
          } else if (COMMANDS.includes(tap)) {
            if (boxOpen >= 0) {
              chips[boxOpen].box.push(tap);
              continue;
            }
            const last = chips.at(-1);
            if (tutorial.groupRepeats && last && last.dir === tap) last.times += 1;
            else chips.push({ dir: tap, times: 1 });
          }
          if (!replayOk) break;
        }
      }

      if (replayOk && tutorial.start && tutorial.goal) {
        const result = simulate(chips, boardSpec(tutorial));
        if (!result.reachedGoal || result.remainingItems.length > 0 || result.blockedAt.length > 0) {
          add(
            'チュートリアルの到達可能性',
            `stepId="${tutorial.stepId}" のscriptを実行してもゴール到達＋全item回収にならない、または壁にぶつかる`
          );
        }
      }
    }
  }

  for (const predict of predictSteps) {
    const options = Array.isArray(predict.options) ? predict.options : [];
    const optionCells = Array.isArray(predict.optionCells) ? predict.optionCells : [];
    const optionIds = new Set(options);
    const cellIds = new Set(optionCells.map((c) => c.id));

    if (!optionIds.has(predict.answer)) {
      add('予想の選択肢', `stepId="${predict.stepId}" の answer="${predict.answer}" が options にない`);
    }
    if (optionIds.size !== cellIds.size || [...optionIds].some((id) => !cellIds.has(id))) {
      add('予想の選択肢', `stepId="${predict.stepId}" の optionCells の id が options と不一致`);
    }
    for (const cell of optionCells) {
      if (!inGrid(refGrid, cell)) add('座標範囲', `stepId="${predict.stepId}" optionCells id="${cell.id}" が盤外`);
    }

    const predictCommands = Array.isArray(predict.commands) ? predict.commands : [];
    if (predictCommands.some((c) => !COMMANDS.includes(c))) {
      add('命令語彙', `stepId="${predict.stepId}" の commands=${JSON.stringify(predictCommands)} が不正`);
    } else if (referencePlay?.start) {
      const result = simulate(predictCommands, boardSpec(referencePlay));
      const end = result.path[result.path.length - 1];
      const answerCell = optionCells.find((c) => c.id === predict.answer);
      if (answerCell && (end.x !== answerCell.x || end.y !== answerCell.y)) {
        add(
          '予想の整合',
          `stepId="${predict.stepId}" commandsの終点(${end.x},${end.y})がanswer="${predict.answer}"の座標(${answerCell.x},${answerCell.y})と不一致`
        );
      }
    }
  }

  return errors;
}
