/* ปุ่มซ้ำ — ปุ่มสองอันที่เขียนเหมือนกันและทำงานเหมือนกัน อยู่บนหน้าจอเดียวกัน

   เจ้าของเจอเอง: "หน้ารายรับรายจ่าย ทำไมมีปุ่มเพิ่ม 2 อัน"
   เป็นเพราะแถวสรุปบนสุดมีปุ่ม แล้วหัวการ์ดข้างล่างมีปุ่มเดียวกันอีก
   หน้าของที่ซื้อมาก็เป็นแบบเดียวกันเป๊ะ ไม่มีใครสังเกตจนเจ้าของทัก

   **ต้องดูจากของที่มองเห็นจริงในเบราว์เซอร์ ไม่ใช่นับจากโค้ด**
   หน้ารายจ่ายมีปุ่มเพิ่มในแท็บย่อยทั้งสองอัน แต่เห็นทีละอัน ไม่ใช่ปุ่มซ้ำ
   นับจาก HTML ที่ฟังก์ชันคืนมาจะได้ 2 แล้วฟ้องผิด

   **ปุ่มหน้าตาเหมือนกันแต่ส่งคนละค่า ไม่ใช่ปุ่มซ้ำ**
   เช่นปุ่ม "ชุดไส้" ที่มีทุกแถวของเมนู ส่ง id ของเมนูตัวเอง จึงต้องเทียบ onclick ด้วย

   node tools/e2e-dup.js            (ต้องมี serve.js เปิดอยู่) */

const { chromium } = require('playwright');
const APP = process.env.APP_URL || 'http://127.0.0.1:8787';

const ok = [];
const push = (name, v) => ok.push([name, !!v]);

// ของที่กดได้ซึ่งมองเห็นอยู่ตอนนี้ จัดกลุ่มตาม "ข้อความ + สิ่งที่มันทำ"
const SCAN = `(() => {
  const seen = [];
  // ดูเฉพาะ **ในเนื้อหาหน้า** ไม่รวมแถบเมนูล่าง
  // ปุ่มย้อนกลับ '‹ ตั้งค่า' ที่หัวหน้ากับแท็บ 'ตั้งค่า' ที่แถบล่าง ชื่อเหมือนกันและไปที่เดียวกัน
  // แต่คนละที่คนละเรื่อง (อันบนคือย้อนกลับ อันล่างคือแท็บประจำ) ไม่ใช่ปุ่มซ้ำ
  document.querySelectorAll('#view button, #view .seeall')
    .forEach(el => {
      const r = el.getBoundingClientRect();
      if(r.width < 6 || r.height < 6) return;
      const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      if(!t) return;
      seen.push(t + ' @@ ' + (el.getAttribute('onclick') || ''));
    });
  const by = {};
  seen.forEach(k => { by[k] = (by[k] || 0) + 1; });
  return Object.entries(by).filter(([, n]) => n > 1)
    .map(([k, n]) => k.split(' @@ ')[0] + ' ×' + n);
})()`;

(async () => {
  const b = await chromium.launch({ args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{ width:390, height:844 }, deviceScaleFactor:1 });
  p.on('pageerror', e => push('แอปตาย: ' + e.message.slice(0, 60), false));
  await p.goto(APP + '/index.html');
  await p.waitForTimeout(900);

  // ทุกหน้า รวมแท็บที่ถูกล็อกด้วยรหัส (ยังไม่ได้ตั้งรหัสจึงเข้าได้เลย)
  const pages = [
    ['today','แดชบอร์ด'], ['sale','ขาย'], ['money','รายรับ-รายจ่าย'],
    ['hist','ย้อนหลัง'], ['setup','ตั้งค่า'],
    ['ing','ของที่ซื้อมา'], ['menu','เมนู'], ['fixed','ต้นทุนคงที่'], ['dash','ภาพรวม']
  ];

  for(const [tab, name] of pages){
    await p.evaluate(t => go(t), tab);
    await p.waitForTimeout(650);
    const subs = await p.evaluate(() => document.querySelectorAll('#view .dseg-b').length);
    for(let i = 0; i < Math.max(1, subs); i++){
      if(subs > 1){
        await p.evaluate(n => document.querySelectorAll('#view .dseg-b')[n].click(), i);
        await p.waitForTimeout(450);
      }
      const sub = subs > 1
        ? await p.evaluate(n => document.querySelectorAll('#view .dseg-b')[n].textContent.trim(), i)
        : '';
      const dups = await p.evaluate(SCAN);
      push(`${name}${sub ? ' › ' + sub : ''}: ไม่มีปุ่มซ้ำ${dups.length ? ' — เจอ ' + dups.join(', ') : ''}`,
        dups.length === 0);
      if(subs <= 1) break;
    }
  }

  await b.close();
  let bad = 0;
  ok.forEach(([n, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n}`); if(!v) bad++; });
  console.log(bad ? `\n  ตก ${bad} ข้อ\n` : `\n  ผ่านทุกข้อ (${ok.length} ข้อ)\n`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
