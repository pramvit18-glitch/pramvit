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

/* ตัวอ่าน QR บนสลิป — หน้าลูกค้าโหลดจาก lib/jsqr.js ตอนแนบสลิป
   ถ้าไม่ได้ขึ้นเว็บ หน้าลูกค้าอ่าน QR ไม่ได้เงียบ ๆ (ส่งออเดอร์ได้ แต่ไม่มีเลขอ้างอิง)
   แล้วฝั่งร้านก็กลับไปจับสลิปซ้ำด้วยการเทียบรูปอย่างเดียว โดยไม่มีใครรู้ */
const orderSrc = fs.readFileSync(path.join(ROOT, 'order.html'), 'utf8');
push('หน้าลูกค้าโหลดตัวอ่าน QR จาก lib/jsqr.js', orderSrc.includes("'lib/jsqr.js'"));
push('ตัวอ่าน QR (lib/jsqr.js) ถูกเอาขึ้นเว็บด้วย', has('lib/jsqr.js'));
push('ตัวอ่าน QR ที่ขึ้นเว็บไม่ใช่ไฟล์เปล่า', has('lib/jsqr.js')
  && fs.statSync(path.join(OUT, 'lib/jsqr.js')).size > 100000);
push('สัญญาอนุญาตของตัวอ่าน QR ไปด้วย (Apache-2.0)', has('lib/LICENSE-jsqr.txt'));

// ของที่ไม่ควรหลุดขึ้นเว็บ
push('ไม่มีโฟลเดอร์ tools หลุดขึ้นไป', !fs.existsSync(path.join(OUT, 'tools')));
push('ไม่มี node_modules หลุดขึ้นไป', !fs.existsSync(path.join(OUT, 'node_modules')));
push('ไม่มี CLAUDE.md หลุดขึ้นไป', !has('CLAUDE.md'));

/* เลขรุ่นของเว็บต้องตรงกันระหว่าง sw.js กับ order.html
   sw.js ใช้ทิ้งแคชเก่า · order.html ใช้รู้ว่ามีของใหม่แล้วค่อยโหลดหน้าใหม่
   ถ้าสองเลขนี้ไม่ตรงกัน หน้าลูกค้าจะรีเฟรชตัวเองทิ้ง ๆ ขว้าง ๆ ทันทีที่เปิด */
const swTxt  = fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8');
const ordTxt = fs.readFileSync(path.join(OUT, 'order.html'), 'utf8');
const swVer  = (swTxt.match(/const CACHE = '(crepe-cost-v\d+)'/)   || [])[1];
const ordVer = (ordTxt.match(/const PAGE_VER = '(crepe-cost-v\d+)'/) || [])[1];

push('sw.js บอกเลขรุ่นของเว็บไว้', !!swVer);
/* จากรีวิวโค้ด: หน้าลูกค้าไม่ได้อยู่ในแคช และตัวสำรองตอนเน็ตหลุดชี้ไป index.html ให้ทุกหน้า
   ลูกค้าที่เน็ตหลุดแล้วรีเฟรช จะได้แอปแม่ค้า (เห็นต้นทุน ยอดขาย) ขึ้นมาแทนหน้าสั่งของ */
push('sw.js เก็บหน้าลูกค้า (order.html) ไว้ในแคชด้วย', /['"]\.\/order\.html['"]/.test(swTxt));
push('หน้าลูกค้าเน็ตหลุดแล้วไม่หล่นไปเป็นแอปร้าน', swTxt.indexOf("endsWith('/order.html') ? './order.html'") >= 0);
push('order.html บอกเลขรุ่นของเว็บไว้', !!ordVer);
push(`เลขรุ่นตรงกันทั้งสองไฟล์ (${swVer || '?'} / ${ordVer || '?'})`,
     !!swVer && swVer === ordVer);

/* กฎของที่เก็บออเดอร์ต้องอนุญาตทุกช่องที่แอปเขียนลงไปจริง
   ถ้าโค้ดเพิ่มช่องใหม่ (เช่น slips) แต่ลืมเพิ่มในกฎ ของจริงจะโดนปฏิเสธ 401
   แล้วลูกค้าแนบสลิปไม่ได้/สั่งไม่ได้ ทั้งที่ชุดตรวจอื่นผ่านหมด
   เทสต์จับไม่ได้ด้วย เพราะที่เก็บจำลองไม่มีกฎ ปล่อยผ่านทุกอย่าง */
const codeTxt = ['index.html', 'order.html']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const nodes = [...new Set([...codeTxt.matchAll(/s\/\$\{[^}]+\}\/([a-zA-Z]+)/g)]
  .map(m => m[1]))];
let rules = null;
try{ rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase-rules.json'), 'utf8')); }catch(e){}
const shop = rules && rules.rules && rules.rules.s && rules.rules.s.$shop;
push('มีไฟล์กฎของที่เก็บออเดอร์ และอ่านเป็น JSON ได้', !!shop);
push('โค้ดเขียนลงที่เก็บออเดอร์อยู่จริง (เจอช่องที่ใช้)', nodes.length > 0);
nodes.forEach(k => push(`กฎอนุญาตช่อง "${k}" ที่แอปใช้จริง`,
  !!(shop && shop[k] && shop[k]['.read'] === true && shop[k]['.write'] === true)));
push('กฎไม่เปิดอ่านทั้งฐานข้อมูลทิ้งไว้',
  !!rules && rules.rules && rules.rules['.read'] === false && rules.rules['.write'] === false);

fs.rmSync(OUT, {recursive:true, force:true});

let bad = 0;
out.forEach(([n, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n}`); if(!v) bad++; });
console.log(bad ? `\n  ตก ${bad} ข้อ\n` : '  ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
