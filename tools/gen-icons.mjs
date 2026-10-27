// gen-icons.mjs: PWAアイコン（icons/*.png）を作る使い捨てスクリプト（Issue #381）。
//   node tools/gen-icons.mjs
// ロボットのSVGは js/ui-grid.js の ROBOT_FRONT（非export）を写したもの。目は開、口は MOUTH_PATH.front.normal。
// まぶた(data-eyelid)は scaleY(0) で見えないので省く。背景は空色で全面を塗る（透明にしない）。
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const BG = '#e0f2fe';
const OUT_DIR = 'icons';

// 出典: js/ui-grid.js の ROBOT_SHADOW + ROBOT_FRONT（viewBox 0 0 64 64）
const ROBOT = `<ellipse cx="32" cy="58" rx="17" ry="4.5" fill="#1e293b" opacity="0.28" />
  <rect x="17" y="49" width="10" height="8" rx="3" fill="#334155" />
  <rect x="37" y="49" width="10" height="8" rx="3" fill="#334155" />
  <rect x="30" y="4" width="4" height="10" fill="#0284c7" />
  <circle cx="32" cy="5" r="4" fill="#fbbf24" />
  <rect x="11" y="18" width="42" height="34" rx="11" fill="#0369a1" />
  <rect x="11" y="12" width="42" height="34" rx="11" fill="#38bdf8" stroke="#0284c7" stroke-width="2.5" />
  <rect x="16" y="14" width="32" height="7" rx="4" fill="#bae6fd" opacity="0.7" />
  <circle cx="19" cy="37" r="3" fill="#f472b6" opacity="0.5" />
  <circle cx="45" cy="37" r="3" fill="#f472b6" opacity="0.5" />
  <circle cx="24" cy="28" r="6" fill="#f0f9ff" />
  <circle cx="40" cy="28" r="6" fill="#f0f9ff" />
  <circle cx="24" cy="30" r="2.6" fill="#0f172a" />
  <circle cx="40" cy="30" r="2.6" fill="#0f172a" />
  <path d="M26 38 Q32 38 38 38" fill="none" stroke="#0f172a" stroke-width="2" stroke-linecap="round" />`;

// ratio: ロボットが占める一辺の割合（通常=0.8で周囲約10%の余白、maskable=0.6で中央に縮める）
const ICONS = [
  { file: 'icon-192.png', size: 192, ratio: 0.8 },
  { file: 'icon-512.png', size: 512, ratio: 0.8 },
  { file: 'apple-touch-icon-180.png', size: 180, ratio: 0.8 },
  { file: 'icon-maskable-512.png', size: 512, ratio: 0.6 },
];

const html = ({ size, ratio }) => {
  const r = size * ratio;
  const o = (size - r) / 2;
  return `<!doctype html><html><body style="margin:0;background:${BG}">
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
<rect width="${size}" height="${size}" fill="${BG}" />
<svg x="${o}" y="${o}" width="${r}" height="${r}" viewBox="0 0 64 64">${ROBOT}</svg>
</svg></body></html>`;
};

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
    await page.setContent(html(icon));
    const path = `${OUT_DIR}/${icon.file}`;
    await page.screenshot({ path, clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
    await page.close();
    const buf = readFileSync(path); // IHDR: 幅は16バイト目、高さは20バイト目（big endian）
    console.log(`${path}: ${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`);
  }
} finally {
  await browser.close();
}
