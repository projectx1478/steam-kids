// BGMのE2E用ダミー音源（Issue #378 段2）。
// MusMus の実音源は規約上 AI が読み込み・解析・変換してはならないため、E2Eでは無音のWAVを
// 生成して `audio/*.ogg` のURLに対して Service Worker キャッシュへ投入する（実音源には触れない。
// ブラウザは内容でフォーマットを判別するため、ogg のURLにWAVペイロードを返しても再生できる。
// 投入先の .verify/ 実験で確認済み）。
// リポジトリ内に音声ファイル（.ogg/.wav等）を置くと check:static が失敗するため、ファイルは作らず
// base64文字列を返すだけにする。

// 無音WAV（8kHz・モノラル・16bit・PCM）のbase64を返す。
export function silentWavBase64(seconds = 0.5, rate = 8000) {
  const n = Math.floor(seconds * rate);
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // モノラル
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  // データ部は0のまま（無音）
  return buf.toString('base64');
}

// js/config.js の BGM_TRACKS のURLと同名のファイル名（audio/<name>.ogg）。
export const DUMMY_TRACK_NAMES = ['title', 'lesson_logic', 'play_logic', 'clear_logic'];
