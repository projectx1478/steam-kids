// 公開ダイアログ（#685 段3）。GET /api/publish/preview で差分を見せ、POST /api/publish → GET /api/publish/status（1秒ごと）で進捗を出す。
import { layoutHasUnsaved, hideLayoutPanel } from './layout-panel.js';

const $ = (id) => document.getElementById(id);
const CATEGORIES = ['単元名', 'アイコン・色', '大項目', '公開／非公開', '並び', 'その他'];
const MSG_UNSAVED = '配置パネルに保存していない変更があります。保存するか捨ててから公開してください';

let running = false;
let opening = false;
let timer = null;

const show = (v) => (typeof v === 'string' ? v : v === undefined ? '（なし）' : JSON.stringify(v));

function line(parent, text) {
  const d = document.createElement('div');
  d.textContent = text;
  parent.append(d);
  return d;
}

function setNg(messages, cls = '') {
  const el = $('publish-ng');
  el.className = cls;
  el.replaceChildren(...messages.map((m) => { const d = document.createElement('div'); d.textContent = m; return d; }));
}

function setRunning(v) {
  running = v;
  $('publish-close').disabled = v;
  $('publish-back').disabled = v;
  if (v) $('publish-go').disabled = true;
}

function renderPreview(pv) {
  const body = $('publish-body');
  body.replaceChildren();
  const msgs = [];
  if (pv.conflicts && pv.conflicts.length > 0) {
    msgs.push(...pv.conflicts.map((c) => `${c.file} ${c.item}：base=${c.base} / main=${c.main} / 仮保存=${c.drafts}`));
  }
  const lead = (pv.messages || []).slice();
  setNg([...lead, ...msgs]);
  for (const cat of CATEGORIES) {
    const items = (pv.changes || []).filter((c) => c.category === cat);
    if (items.length === 0) continue;
    const h = document.createElement('h3');
    h.textContent = cat;
    body.append(h);
    for (const it of items) line(body, `${it.label}：${show(it.before)} → ${show(it.after)}`);
  }
  if (pv.faces && pv.faces.length > 0) {
    const h = document.createElement('h3');
    h.textContent = '面';
    body.append(h);
    line(body, `面${pv.faces.length}件変更（${pv.faces.join(', ')}）`);
  }
  $('publish-go').disabled = !pv.publishable || running;
}

async function poll() {
  try {
    const st = await (await fetch('/api/publish/status')).json();
    const log = $('publish-log');
    log.replaceChildren();
    for (const s of st.log || []) line(log, s);
    if (st.running) { timer = setTimeout(poll, 1000); return; }
    setRunning(false);
    if (st.ok) {
      setNg([st.url ? `PRを作りました。CIが緑になると自動で公開されます ${st.url}` : 'PRを作りました。CIが緑になると自動で公開されます'], 'ok');
      $('publish-go').disabled = true;
    } else if (st.error) {
      setNg([st.error.summary, st.error.message]);
      $('publish-go').disabled = false;
    }
  } catch {
    timer = setTimeout(poll, 1000);
  }
}

async function go() {
  if (running) return;
  setRunning(true);
  setNg([]);
  $('publish-log').replaceChildren();
  try {
    const res = await fetch('/api/publish', { method: 'POST' });
    if (res.status === 409) { setNg(['公開は実行中です']); setRunning(false); $('publish-go').disabled = true; return; }
    if (!res.ok) throw new Error('post');
  } catch {
    setNg(['公開を始められません（サーバーに接続できません）']);
    setRunning(false);
    $('publish-go').disabled = false;
    return;
  }
  poll();
}

export async function openPublishDialog() {
  const panel = $('publish-panel');
  if (!panel.hidden || opening) return;
  if (layoutHasUnsaved()) { $('layout-msg').textContent = MSG_UNSAVED; return; }
  opening = true;
  $('layout-msg').textContent = '';
  try {
    const res = await fetch('/api/publish/preview');
    if (!res.ok) throw new Error('read');
    const pv = await res.json();
    hideLayoutPanel();
    $('publish-log').replaceChildren();
    panel.hidden = false;
    renderPreview(pv);
  } catch {
    $('layout-msg').textContent = '公開の差分を読めません';
  } finally {
    opening = false;
  }
}

export function closePublishDialog() {
  if (running) return;
  clearTimeout(timer);
  $('publish-panel').hidden = true;
}

$('publish-open').addEventListener('click', openPublishDialog);
$('publish-close').addEventListener('click', closePublishDialog);
$('publish-back').addEventListener('click', closePublishDialog);
$('publish-go').addEventListener('click', go);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('publish-panel').hidden) closePublishDialog();
});
