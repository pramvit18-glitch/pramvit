// ขยับเลขรุ่นของเว็บ แล้วพาเลขในหน้าลูกค้าไปด้วย
//
//   node tools/bump-ver.js          ขยับขึ้นหนึ่ง
//   node tools/bump-ver.js --sync   ไม่ขยับ แค่ทำให้ order.html ตรงกับ sw.js
//
// เลขนี้ทำสองหน้าที่:
//   1. บอก service worker ให้ทิ้งของเก่าที่เก็บไว้ เครื่องที่ติดตั้งแอปจะได้ของใหม่
//   2. ให้หน้าลูกค้าที่เปิดค้างไว้ระหว่างรอคิว รู้ว่ามีของใหม่แล้ว แล้วโหลดหน้าใหม่ให้เอง
// ทั้งสองไฟล์จึงต้องเขียนเลขเดียวกันเสมอ — check-build คอยคุมอยู่

const fs   = require('fs');
const path = require('path');

const ROOT  = path.join(__dirname, '..');
const SW    = path.join(ROOT, 'sw.js');
const ORDER = path.join(ROOT, 'order.html');
const sync  = process.argv.includes('--sync');

const RE_SW    = /crepe-cost-v(\d+)/;
const RE_ORDER = /(const PAGE_VER = ')crepe-cost-v\d+(')/;

let sw = fs.readFileSync(SW, 'utf8');
const cur = sw.match(RE_SW);
if(!cur){ console.error('  ✗ หาเลขรุ่นใน sw.js ไม่เจอ'); process.exit(1); }

const ver = sync ? cur[0] : 'crepe-cost-v' + (Number(cur[1]) + 1);

if(!sync){
  fs.writeFileSync(SW, sw.replace(RE_SW, ver));
}

let order = fs.readFileSync(ORDER, 'utf8');
if(!RE_ORDER.test(order)){ console.error('  ✗ หา PAGE_VER ใน order.html ไม่เจอ'); process.exit(1); }
fs.writeFileSync(ORDER, order.replace(RE_ORDER, `$1${ver}$2`));

console.log(`  ✓ เลขรุ่นของเว็บ: ${ver} (sw.js + order.html)`);
