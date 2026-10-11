// 大項目を選ぶ画面（Issue #375）。タイトル→大項目→単元マップの「大項目」。
// 判定の純関数（isTrackCleared・playableTrackCount）はDOMに触れず、node から単体テストできる。
// shapeSvg（ui-grid.js は import 時に window を触る）は描画時に動的 import する。

// ui-picker.js の isCleared と同じ式（単元マップの旗と同じ数え方）。
function isCleared(lessonStatus, lessonId) {
  return lessonStatus?.[lessonId]?.status === 'cleared';
}

function lessonIdsOf(track) {
  return (track?.units ?? []).flatMap((u) => (Array.isArray(u?.lessonIds) ? u.lessonIds : []));
}

// 遊べる大項目: units のどれかに lessonIds が1本以上ある。
export function isTrackPlayable(track) {
  return lessonIdsOf(track).length > 0;
}

export function playableTrackCount(tracks) {
  return (tracks ?? []).filter(isTrackPlayable).length;
}

// 大項目クリア: 全 units の全 lessonIds をクリア。遊べない（0本）大項目は false。
export function isTrackCleared(track, lessonStatus) {
  const ids = lessonIdsOf(track);
  return ids.length > 0 && ids.every((id) => isCleared(lessonStatus, id));
}

// renderTrackSelect(stage, tracks, { lessonStatus, onPick(track), onBack })
export async function renderTrackSelect(stage, tracks, { lessonStatus = {}, onPick, onBack } = {}) {
  const { shapeSvg } = await import('./ui-grid.js');
  stage.innerHTML = '';
  stage.dataset.screen = 'tracks';

  const q = document.createElement('p');
  q.className = 'track-q';
  q.textContent = 'どれで あそぶ？';
  stage.appendChild(q);

  const cards = document.createElement('div');
  cards.className = 'track-cards';
  const buttons = [];
  for (const track of tracks.filter(isTrackPlayable)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'track-card wood-panel';
    btn.dataset.trackId = track.trackId;
    const robot = document.createElement('div');
    robot.className = 'track-robot';
    robot.innerHTML = shapeSvg('player');
    const name = document.createElement('span');
    name.className = 'track-name';
    name.textContent = track.title;
    const star = document.createElement('span');
    star.className = 'track-star';
    star.dataset.star = track.trackId;
    if (isTrackCleared(track, lessonStatus)) {
      star.textContent = '★';
      star.setAttribute('aria-label', 'だいこうもくたっせい');
    }
    btn.append(robot, name, star);
    btn.addEventListener('click', () => {
      buttons.forEach((b) => { b.disabled = true; });
      onPick?.(track);
    });
    buttons.push(btn);
    cards.appendChild(btn);
  }
  stage.appendChild(cards);

  if (onBack) {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col items-center gap-3 mt-6 pb-4';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'track-back';
    back.dataset.action = 'tracks-back';
    back.textContent = 'もどる';
    back.addEventListener('click', () => {
      back.disabled = true;
      onBack();
    });
    wrap.appendChild(back);
    stage.appendChild(wrap);
  }
}
