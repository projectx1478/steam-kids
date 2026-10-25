// docs/ui-rules.md の「ヘッダ・⚙メニュー構成表」を読む（Issue #574 段A）。
// 列＝画面／ヘッダ要素／⚙位置／メニュー行／アイコン・ひらがな。セレクタはバッククォートで囲む。
// 突き合わせシナリオ（.claude/verify/scenarios/ui-gear-table.mjs）と単体テスト（test/ui-gear-table.test.mjs）が使う。

const HEADING = /^##\s*ヘッダ・⚙メニュー構成表\s*(（.*）)?\s*$/;

const selectors = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

// markdown 全文 → [{ screen, header: string[], gear: string, menu: string[] }]
export function parseGearTable(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => HEADING.test(l));
  if (start < 0) throw new Error('ヘッダ・⚙メニュー構成表の見出しが見つからない');
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line)) break;
    if (!line.startsWith('|')) continue;
    const cells = line.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim());
    if (cells[0] === '画面' || /^-+$/.test(cells[0])) continue;
    rows.push({
      screen: cells[0],
      header: selectors(cells[1]),
      gear: selectors(cells[2])[0] ?? '',
      menu: selectors(cells[3]),
    });
  }
  return rows;
}
