/* เทสต์ลูกเล่นหน้าลูกค้าด้วยเบราว์เซอร์จริง (เจ้าของขอเอง:
   "ฝั่งลูกค้าหลังจากใส่ตะกร้าอยากให้มีลูกเล่นด้วย แล้วก็ตอนที่สั่งสำเร็จด้วย")

   1. ใส่ตะกร้า → วง "+จำนวน" ลอยจากปุ่มไปที่ยอดเงิน แล้วยอดเงินเด้งรับ
      - ต้องอยู่ชั้นบนสุด (popover) ไม่งั้นไปอยู่ใต้ฉากหลังมืดของกล่องที่กำลังปิด มองไม่เห็น
      - **ยอดเงินต้องถูกตั้งแต่วินาทีแรก** ไม่นับขึ้นทีละนิด
      - ไม่บังการแตะ กด "สั่งเลย" ได้ทันทีระหว่างมันลอย · ลอยจบแล้วต้องหายไปจาก DOM
   2. ส่งออเดอร์สำเร็จ → การ์ด "ส่งออเดอร์แล้ว!" + เครื่องหมายถูก + กระดาษโปรย แล้วหายเอง
      - ไม่มีเสียงไม่มีสั่น (ไว้บอกตอนร้านเปลี่ยนสถานะเท่านั้น)
   3. หน้าคิววาดใหม่ทุก 4 วินาที **ต้องไม่กระพริบ** (การ์ดไม่ถูกสร้างใหม่ถ้าไม่มีอะไรเปลี่ยน)
      และกลับไปหน้าเมนูแล้วกลับมา ต้องเห็นหน้าคิวจริง ไม่ค้างหน้าเมนู
   4. เครื่องที่ตั้งลดการเคลื่อนไหว ไม่มีอะไรลอย ไม่มีกระดาษ

   node tools/fake-cloud.js &  node serve.js &  node tools/e2e-fx.js  */

const { chromium } = require('playwright');
const os = require('os');

const APP   = process.env.APP_URL || 'http://127.0.0.1:8787';
const CLOUD = 'http://127.0.0.1:8788';
const KEY   = 'fxkey1';
const SHOT  = process.env.SHOT_DIR || os.tmpdir();

const ok = [];
const push = (name, v) => ok.push([name, !!v]);

async function tap(loc, why){
  try{
    if(await loc.count() === 0){ push(why, false); return false; }
    await loc.first().click({ timeout: 4000 });
    return true;
  }catch(e){
    push(why + ' (กดไม่ได้: ' + String(e.message).split('\n')[0].slice(0,50) + ')', false);
    return false;
  }
}

(async () => {
  await fetch(CLOUD + '/__reset').catch(() => {});   // ไม่งั้นออเดอร์ของรอบก่อนค้าง ร้านไปรับใบเก่า
  const b = await chromium.launch({ args:['--no-sandbox'] });

  /* ---------- ร้านเปิดเมนูไว้ (ไม่ตั้งพร้อมเพย์ จะได้มีปุ่มส่งปุ่มเดียว) ---------- */
  const seller = await b.newPage({ viewport:{width:390,height:844} });
  seller.on('pageerror', e => push('แอปแม่ค้าตาย: ' + e.message.slice(0,60), false));
  await seller.goto(APP + '/index.html');
  await seller.evaluate(cloud => {
    localStorage.setItem('crepe-cloud', cloud);
    const d = {
      id:'sh1', shopName:'ร้านเครปทดสอบ', shopBranch:'', shopOpen:1,
      groups:[], menus:[{ id:'m1', name:'เครปกรอบ', price:15, groupIds:[], items:[] }],
      ingredients:[], expenses:[], sales:[],
      fixed:{rent:0, electric:0, gas:0, water:0, other:0, days:26, labor:0}
    };
    localStorage.setItem('crepe-hub-v1', JSON.stringify({shops:[d], active:'sh1'}));
  }, CLOUD);
  await seller.reload();
  await seller.waitForTimeout(400);
  await seller.evaluate(async key => { db.orderKey = key; db.orderOn = 1; save(); await publishMenu(); }, KEY);

  /* ---------- ลูกค้า ---------- */
  const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  const cust = await ctx.newPage();
  cust.on('pageerror', e => push('หน้าลูกค้าตาย: ' + e.message.slice(0,60), false));
  const URL = `${APP}/order.html?s=${KEY}&c=${encodeURIComponent(CLOUD)}`;
  await cust.goto(URL);
  await cust.waitForTimeout(900);

  // นับภาพที่แถบรวมเงินเล่นจริง (ดูจากชื่อภาพ ไม่ใช่คลาสที่ถูกถอดออกเมื่อเล่นจบ)
  await cust.evaluate(() => {
    window.__barAnims = [];
    document.addEventListener('animationstart', e => {
      if(e.target.closest && e.target.closest('#bar')) window.__barAnims.push(e.animationName);
    }, true);
  });
  await tap(cust.locator('#view button.li').first(), 'มีเมนูให้กด');
  await cust.waitForTimeout(900);
  await tap(cust.locator('.qbtn', { hasText:'+' }), 'มีปุ่มเพิ่มจำนวน');      // 2 ชิ้น
  await tap(cust.locator('button', { hasText:'ใส่ตะกร้า' }), 'มีปุ่มใส่ตะกร้า');
  await cust.waitForTimeout(60);

  /* ---------- 1) ใส่ตะกร้า ---------- */
  const f0 = await cust.evaluate(() => {
    const f = document.querySelector('.fly');
    if(!f) return null;
    let top = false;
    try{ top = f.matches(':popover-open'); }catch(e){}
    const r = f.getBoundingClientRect();
    return { txt:f.textContent, top, pe:getComputedStyle(f).pointerEvents, x:r.left, y:r.top,
             total:document.getElementById('barTotal').textContent,
             barIn:document.getElementById('bar').classList.contains('in') };
  });
  push('ใส่ตะกร้าแล้ว มีวง "+2" ลอยออกมา', !!f0 && f0.txt === '+2');
  push('วงที่ลอยอยู่ชั้นบนสุด เหนือกล่องที่กำลังปิด (ไม่จมใต้ฉากหลังมืด)', !!f0 && f0.top);
  push('วงที่ลอยไม่รับการแตะ ไม่บังปุ่ม', !!f0 && f0.pe === 'none');
  push('ยอดเงินถูกตั้งแต่วินาทีแรก ไม่นับขึ้นทีละนิด (15 × 2 = 30)', !!f0 && f0.total.replace(/[^\d]/g, '') === '30');
  push('แถบรวมเงินโผล่ครั้งแรก เลื่อนขึ้นมา', !!f0 && f0.barIn);
  await cust.screenshot({ path: SHOT + '/fx-fly.png' });

  await cust.waitForTimeout(330);
  const f1 = await cust.evaluate(() => {
    const f = document.querySelector('.fly'), t = document.getElementById('barTotal');
    if(!f) return null;
    const a = f.getBoundingClientRect(), c = t.getBoundingClientRect();
    return { x:a.left, y:a.top, tx:c.left, ty:c.top };
  });
  const dist = (p, q) => Math.hypot(p.x - q.tx, p.y - q.ty);
  push('วงลอยเข้าหายอดเงินจริง (ระยะหดลง)', !!f0 && !!f1 && dist(f1, f1) < dist(f0, f1));

  await cust.waitForTimeout(900);
  const after = await cust.evaluate(() => ({
    fly: document.querySelectorAll('.fly').length,
    bump: window.__barAnims.includes('bump'),
    left: ['in', 'bump'].filter(c => document.getElementById('bar').classList.contains(c))
  }));
  push('ลอยจบแล้วไม่เหลือวงค้างในหน้า', after.fly === 0);
  push('ลอยถึงแล้วยอดเงินเด้งรับ', after.bump);
  push('เล่นจบแล้วถอดคลาสออก (แถบโผล่ใหม่ทีหลังจะไม่เล่นซ้ำเอง)', after.left.length === 0);

  // ระหว่างที่ลอย ต้องกดปุ่ม "สั่งเลย" ได้ทันที (ใส่ชิ้นที่สองแล้วกดเลย)
  await tap(cust.locator('#view button.li').first(), 'กดเมนูซ้ำได้');
  await cust.waitForTimeout(900);
  await cust.evaluate(() => { window.__barAnims = []; });
  await tap(cust.locator('button', { hasText:'ใส่ตะกร้า' }), 'ใส่ตะกร้ารอบสอง');
  await cust.waitForTimeout(900);
  push('รอบสอง แถบรวมเงินไม่เลื่อนขึ้นใหม่ (มีอยู่แล้ว) แค่ยอดเงินเด้ง',
    await cust.evaluate(() => !window.__barAnims.includes('barin') && window.__barAnims.includes('bump')));
  await cust.waitForTimeout(100);
  await tap(cust.locator('#barBtn'), 'กดสั่งเลยได้');
  await cust.waitForTimeout(900);
  push('กดสั่งเลยแล้วเปิดกล่องส่งออเดอร์', (await cust.textContent('#dlg')).includes('ส่งออเดอร์'));

  /* ---------- 2) ส่งสำเร็จ ---------- */
  await cust.evaluate(() => {
    window.__ding = 0; window.__buzz = 0;
    const d = window.ding, z = window.buzz;
    window.ding = (...a) => { window.__ding++; return d(...a); };
    window.buzz = (...a) => { window.__buzz++; return z(...a); };
  });
  await tap(cust.locator('#sendBtn'), 'มีปุ่มส่งเลย');
  await cust.waitForTimeout(500);
  const p = await cust.evaluate(() => {
    const e = document.querySelector('.party');
    if(!e) return null;
    let top = false;
    try{ top = e.matches(':popover-open'); }catch(x){}
    return { txt:e.textContent.replace(/\s+/g, ' ').trim(), top, bits:e.querySelectorAll(':scope > i').length,
             pe:getComputedStyle(e).pointerEvents, check:!!e.querySelector('.party-ok path') };
  });
  push('ส่งสำเร็จ มีการ์ดฉลอง "ส่งออเดอร์แล้ว!"', !!p && p.txt.includes('ส่งออเดอร์แล้ว!'));
  push('การ์ดฉลองอยู่ชั้นบนสุด เหนือกล่องที่กำลังปิด', !!p && p.top);
  push('มีเครื่องหมายถูก และกระดาษโปรย', !!p && p.check && p.bits >= 15);
  push('การ์ดฉลองไม่บังการแตะ', !!p && p.pe === 'none');
  push('คำในการ์ดไม่ซ้ำกับหัวการ์ดหน้าคิว ("ขอบคุณที่สั่งนะครับ")', !!p && !p.txt.includes('ขอบคุณที่สั่งนะครับ'));
  push('ไม่มีเสียงไม่มีสั่นตอนลูกค้ากดส่งเอง', await cust.evaluate(() => window.__ding === 0 && window.__buzz === 0));
  await cust.screenshot({ path: SHOT + '/fx-party.png' });
  await cust.waitForTimeout(2300);
  push('การ์ดฉลองหายไปเองใน ~2 วินาที', await cust.evaluate(() => !document.querySelector('.party')));
  push('หน้าคิวขึ้นมาข้างใต้', (await cust.textContent('#view')).includes('ขอบคุณที่สั่งนะครับ'));

  /* ---------- 3) หน้าคิวไม่กระพริบทุก 4 วินาที ---------- */
  await cust.evaluate(() => {
    window.__card = document.querySelector('#view [data-mine]');
    window.__draws = 0;
    const d = drawMine; window.drawMine = (...a) => { window.__draws++; return d(...a); };
  });
  await cust.waitForTimeout(4600);                // ให้ refreshMine วิ่งอย่างน้อยหนึ่งรอบ
  const draws = await cust.evaluate(() => window.__draws);
  push(`(เงื่อนไข) ระหว่างรอ หน้าคิวถูกสั่งวาดใหม่จริง (${draws} รอบ) — ไม่งั้นข้อถัดไปผ่านเปล่า ๆ`, draws >= 1);
  push('ถามคิวรอบใหม่แล้ว การ์ดเดิมไม่ถูกสร้างใหม่ (ไม่กระพริบ)',
    await cust.evaluate(() => !!window.__card && window.__card === document.querySelector('#view [data-mine]')));
  // ร้านรับออเดอร์ = สถานะเปลี่ยน ต้องวาดใหม่ให้เห็น
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(700);
  await seller.evaluate(async () => { const o = cloudOrders[0]; if(o) await takeOrder(o.id); });
  await cust.waitForTimeout(4800);
  push('ร้านกดรับแล้ว หน้าคิววาดใหม่ตามสถานะ (ไม่ค้างของเดิม)',
    (await cust.textContent('#view')).includes('กำลังทอดให้อยู่'));
  // ไปหน้าเมนูแล้วกลับมา ต้องเห็นหน้าคิวจริง
  await cust.evaluate(() => backToMenu());
  await cust.waitForTimeout(400);
  await cust.evaluate(() => goQueue());
  await cust.waitForTimeout(400);
  push('ไปหน้าเมนูแล้วกลับมาหน้าคิว เห็นหน้าคิวจริง ไม่ค้างหน้าเมนู',
    await cust.evaluate(() => !!document.querySelector('#view [data-mine]')));

  /* ---------- 4) เครื่องที่ตั้งลดการเคลื่อนไหว ---------- */
  const rctx = await b.newContext({ viewport:{width:390,height:844}, reducedMotion:'reduce' });
  const rc = await rctx.newPage();
  rc.on('pageerror', e => push('หน้าลูกค้า (ลดการเคลื่อนไหว) ตาย: ' + e.message.slice(0,60), false));
  await rc.goto(URL);
  await rc.waitForTimeout(900);
  await rc.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await rc.goto(URL);
  await rc.waitForTimeout(900);
  await tap(rc.locator('#view button.li').first(), 'ลดการเคลื่อนไหว: มีเมนูให้กด');
  await rc.waitForTimeout(400);
  await tap(rc.locator('button', { hasText:'ใส่ตะกร้า' }), 'ลดการเคลื่อนไหว: ใส่ตะกร้า');
  await rc.waitForTimeout(60);
  push('ลดการเคลื่อนไหว: ไม่มีอะไรลอย', await rc.evaluate(() => !document.querySelector('.fly')));
  await rc.waitForTimeout(300);
  await tap(rc.locator('#barBtn'), 'ลดการเคลื่อนไหว: กดสั่งเลย');
  await rc.waitForTimeout(400);
  await tap(rc.locator('#sendBtn'), 'ลดการเคลื่อนไหว: กดส่ง');
  await rc.waitForTimeout(400);
  push('ลดการเคลื่อนไหว: ยังบอกว่าส่งแล้ว แต่ไม่มีกระดาษโปรย',
    await rc.evaluate(() => { const e = document.querySelector('.party');
      return !!e && e.textContent.includes('ส่งออเดอร์แล้ว') && e.querySelectorAll(':scope > i').length === 0; }));

  await b.close();
  let bad = 0;
  ok.forEach(([n2, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n2}`); if(!v) bad++; });
  console.log(bad ? `\n  ตก ${bad} ข้อ\n` : `\n  ผ่านทุกข้อ (${ok.length} ข้อ)\n`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
