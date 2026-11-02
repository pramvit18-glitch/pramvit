// ตรวจว่าไฟล์ที่ต้องขึ้นเว็บจริง ถูกรวมเข้า www/ ครบ
//
// เคยพังมาแล้ว: build-www.js มีรายชื่อไฟล์เขียนตายตัว พอเพิ่ม order.html
// (หน้าลูกค้า) เข้ามา มันไม่ถูกเอาขึ้น เว็บจริงเลย 404 ทั้งที่ deploy สำเร็จ
// และชุดตรวจเดิมก็ผ่านหมด เพราะไม่มีใครดูขั้นตอน deploy

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT  = fs.mkdtempSync(path.join(os.tmpdir(), 'www-check-'));

const out  = [];
const push = (name, v) => out.push([name, !!v]);

try{
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-www.js'), OUT],
               { stdio:'ignore' });
}catch(e){
  console.log('  ✗ รวมไฟล์เข้า www/ ไม่สำเร็จ');
  process.exit(1);
}

const has = f => fs.existsSync(path.join(OUT, f));

// ทุกหน้าเว็บที่อยู่ชั้นบนสุดของโปรเจกต์ ต้องได้ขึ้นเว็บจริงทั้งหมด
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
pages.forEach(p => push(`${p} ถูกเอาขึ้นเว็บด้วย`, has(p)));

push('มีหน้าลูกค้า (order.html) อยู่ในโปรเจกต์', pages.includes('order.html'));
push('มี sw.js (ไม่งั้นแอปที่ติดตั้งไว้จะไม่ได้ของใหม่)', has('sw.js'));
push('มี manifest.webmanifest (ไม่งั้นติดตั้งเป็นแอปไม่ได้)', has('manifest.webmanifest'));
push('มีโฟลเดอร์ไอคอน', fs.existsSync(path.join(OUT, 'icons')));

// ของที่ไม่ควรหลุดขึ้นเว็บ
push('ไม่มีโฟลเดอร์ tools หลุดขึ้นไป', !fs.existsSync(path.join(OUT, 'tools')));
push('ไม่มี node_modules หลุดขึ้นไป', !fs.existsSync(path.join(OUT, 'node_modules')));
push('ไม่มี CLAUDE.md หลุดขึ้นไป', !has('CLAUDE.md'));

fs.rmSync(OUT, {recursive:true, force:true});

let bad = 0;
out.forEach(([n, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n}`); if(!v) bad++; });
console.log(bad ? `\n  ตก ${bad} ข้อ\n` : '  ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
