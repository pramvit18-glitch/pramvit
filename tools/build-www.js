// รวมไฟล์เว็บไว้ใน www/ เพื่อให้ Capacitor เอาไปห่อเป็นแอป
// (ไม่เอา node_modules, ios/, tools/ ติดเข้าไปด้วย)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW  = path.join(ROOT, 'www');

const FILES = ['index.html', 'manifest.webmanifest', 'sw.js'];
const DIRS  = ['icons'];

fs.rmSync(WWW, {recursive: true, force: true});
fs.mkdirSync(WWW, {recursive: true});

for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) { console.error(`  ✗ ไม่พบ ${f}`); process.exit(1); }
  fs.copyFileSync(src, path.join(WWW, f));
  console.log(`  ✓ ${f}`);
}

for (const d of DIRS) {
  const src = path.join(ROOT, d);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(WWW, d), {recursive: true});
  console.log(`  ✓ ${d}/ (${fs.readdirSync(src).length} ไฟล์)`);
}

console.log(`\n  รวมไว้ที่ www/ เรียบร้อย`);
