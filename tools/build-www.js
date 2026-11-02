// รวมไฟล์เว็บไว้ใน www/ เพื่อเอาขึ้น GitHub Pages และให้ Capacitor ห่อเป็นแอป
// (ไม่เอา node_modules, ios/, tools/ ติดเข้าไปด้วย)
//
//   node tools/build-www.js [โฟลเดอร์ปลายทาง]
//
// เคยมีรายชื่อไฟล์เขียนตายตัวไว้ แล้ว order.html ที่เพิ่มทีหลังไม่ถูกเอาขึ้น
// เว็บจริงเลย 404 ทั้งที่ deploy สำเร็จ — ตอนนี้กวาดไฟล์ .html ทุกตัวเอง

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW  = path.resolve(process.argv[2] || path.join(ROOT, 'www'));

// ทุกหน้าเว็บที่อยู่ชั้นบนสุด จะได้ไม่ลืมหน้าที่เพิ่มใหม่
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
const FILES = [...pages, 'manifest.webmanifest', 'sw.js'];
const DIRS  = ['icons'];

if (!pages.includes('index.html')) { console.error('  ✗ ไม่พบ index.html'); process.exit(1); }

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

console.log(`\n  รวมไว้ที่ ${WWW} เรียบร้อย`);
