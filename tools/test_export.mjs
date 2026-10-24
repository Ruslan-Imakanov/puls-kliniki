// Проверка выгрузки в Excel: формулы должны давать те же числа, что посчитала программа.
// node tools/test_export.mjs  (нужен LibreOffice: soffice; библиотека — public/js/vendor/xlsx.min.js)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.cptable = { utils: { decode: (_, b) => Buffer.from(b).toString('latin1'), encode: (_, s) => Buffer.from(s, 'latin1') } };
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const X = require(path.join(root, 'public/js/vendor/xlsx.min.js'));
const { store, load } = await import('../public/js/store.js');
const E = await import('../public/js/export.js');
const { spanMonths, completeMonths } = await import('../public/js/calc.js');
const { addMonths, curMonth, monthsBetween } = await import('../public/js/util.js');
load();
const s = store.s, full = completeMonths(s), months = full.slice(-12), last = full[full.length - 1];
const scope = [last];
const sheets = E.sheetsAll(s, months, last, scope);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xl-'));
const withV = path.join(tmp, 'with.xlsx'), noV = path.join(tmp, 'novalues.xlsx');
X.writeFile(E.buildWorkbook(X, sheets, false), withV);
X.writeFile(E.buildWorkbook(X, sheets, true), noV);
// LibreOffice пересчитывает файл без сохранённых значений — сравниваем с тем, что записали мы
execFileSync('soffice', ['--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', path.join(tmp, 'lo'), noV], { stdio: 'ignore', timeout: 180000 });
const A = X.readFile(withV), B = X.readFile(path.join(tmp, 'lo', 'novalues.xlsx'));
let bad = 0, nF = 0, nCells = 0;
for (const name of A.SheetNames) {
  const a = A.Sheets[name], b = B.Sheets[name];
  if (!b) { console.log('нет листа в пересчёте:', name); bad++; continue; }
  for (const addr of Object.keys(a)) {
    if (addr[0] === '!') continue;
    nCells++;
    if (!a[addr].f) continue;
    nF++;
    const va = a[addr].v, vb = b[addr]?.v;
    const ok = typeof va === 'number' && typeof vb === 'number' ? Math.abs(va - vb) <= Math.max(0.51, Math.abs(va) * 1e-6) : String(va ?? '') === String(vb ?? '');
    if (!ok) { bad++; if (bad < 40) console.log(`✗ ${name}!${addr}  формула: =${a[addr].f}  программа: ${va}  Excel: ${vb}`); }
  }
  // ошибки вычисления
  for (const addr of Object.keys(b)) if (b[addr]?.t === 'e') { bad++; console.log(`✗ ошибка ${name}!${addr}: ${b[addr].w}`); }
}
console.log(`листов: ${A.SheetNames.length} (${A.SheetNames.join(', ')})\nячеек: ${nCells}, формул: ${nF}, расхождений: ${bad}`);
process.exit(bad ? 1 : 0);
