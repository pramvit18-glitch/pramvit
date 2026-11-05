/* สลิปโอนเงิน — แนบได้ และ **กันสลิปซ้ำ** ได้จริง

   เรื่องนี้เป็นเรื่องเงิน เทสต์จึงไม่ดูแค่ว่า "มีปุ่มแนบรูปแล้ว"
   แต่สร้างไฟล์รูปจริงขึ้นมา 3 ใบ (ใบเดิม · ใบเดิมที่โดนบีบอัดจนเพี้ยนเล็กน้อย ·
   ใบที่ต่างกันคนละรูป) แล้วไล่ส่งเข้าไปจริง ดูว่าฝั่งแม่ค้าจับได้ถูกใบ

   ข้อที่สำคัญที่สุดสองข้อ:
   1. **รูปห้ามอยู่ในก้อนออเดอร์** ต้องแยกไปอยู่ s/<ร้าน>/slips/<id>
      เพราะแอปแม่ค้าถามออเดอร์ทุก 5 วินาที ถ้ารูปติดมาด้วยโควตาฟรีหมดวันเดียว
   2. **ตอนถามออเดอร์ห้ามโหลดรูปเลย** ต้องโหลดเฉพาะตอนแม่ค้ากดดู

   node tools/fake-cloud.js &  node serve.js &  node tools/e2e-slip.js  */

const { chromium } = require('playwright');
const os   = require('os');
const path = require('path');
const fs   = require('fs');

const APP   = process.env.APP_URL || 'http://127.0.0.1:8787';   // ชี้ไปที่ของที่โหลดมาจากเว็บจริงได้
const CLOUD = 'http://127.0.0.1:8788';
const KEY   = 'slipkey1';
const SHOT  = process.env.SHOT_DIR || os.tmpdir();

const ok = [];
const push = (name, v) => ok.push([name, !!v]);

/* กดของที่อาจไม่มี — ถ้าไม่มีให้ตกเฉพาะข้อนั้น
   เคยพลาดมาแล้ว: click() ของที่ไม่มีจะรอจนหมดเวลาแล้ว **ล้มทั้งชุด**
   ไม่รายงานผลสักข้อ กลายเป็นเทสต์ที่จับบั๊กได้แต่ไม่บอกว่าจับอะไรได้ */
async function tap(loc, why){
  if(await loc.count() === 0){ push(why, false); return false; }
  await loc.first().click();
  return true;
}

const put = (p, b) => fetch(`${CLOUD}/${p}.json`, {
  method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b)
}).then(r => r.json());
const get = p => fetch(`${CLOUD}/${p}.json`).then(r => r.json());

/* รูปสลิปปลอมทำจาก tools/fake-slip.js (ใช้ร่วมกับ e2e-pay)
   a = ใบเดิม · a2 = ใบเดิมที่พิกเซลเพี้ยน · b, c = คนละใบ */
const { writeSlips } = require(path.join(__dirname, 'fake-slip.js'));
const SLIPS  = writeSlips(['a', 'a2', 'b', 'c']);
const IMG_A  = SLIPS.a;
const IMG_A2 = SLIPS.a2;
const IMG_B  = SLIPS.b;
const IMG_C  = SLIPS.c;

(async () => {
  await fetch(CLOUD + '/__reset').catch(() => {});

  const b = await chromium.launch({ args:['--no-sandbox'] });

  /* ---------- เครื่องแม่ค้า ---------- */
  const seller = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  seller.on('pageerror', e => push('แอปแม่ค้าตาย: ' + e.message.slice(0,60), false));
  let slipGET = 0;          // นับว่าโหลดรูปสลิปไปกี่ครั้ง
  seller.on('request', r => {
    if(r.method() === 'GET' && /\/slips\/[^/]+\.json/.test(r.url())) slipGET++;
  });

  await seller.goto(APP + '/index.html');
  await seller.evaluate(cloud => {
    localStorage.setItem('crepe-cloud', cloud);
    const d = {
      id:'sh1', shopName:'ร้านเครปทดสอบ', shopBranch:'', shopOpen:1,
      groups:[], menus:[{ id:'m1', name:'เครปกรอบ', price:15, groupIds:[], items:[] }],
      ingredients:[], expenses:[],
      sales:[{ id:'sx', bill:'bx', d:'2020-01-01', t:'10:00', menuId:'m1',
               name:'เครปกรอบ', qty:1, addons:[], total:15 }],
      fixed:{rent:0, electric:0, gas:0, water:0, other:0, days:26, labor:0},
      payId:'0812345678'
    };
    localStorage.setItem('crepe-hub-v1', JSON.stringify({shops:[d], active:'sh1'}));
  }, CLOUD);
  await seller.reload();
  await seller.waitForTimeout(400);
  await seller.evaluate(async () => {
    db.orderKey = 'slipkey1'; db.orderOn = 1; db.payId = '0812345678';
    save(); await publishMenu();
  });
  push('ร้านเปิดรับออเดอร์พร้อมเลขพร้อมเพย์', (await get(`s/${KEY}/menu`)).payId === '0812345678');

  /* ---------- สูตรเทียบลายนิ้วมือ ต้องทนบีบอัด แต่ไม่มั่ว ---------- */
  const near = await seller.evaluate(() => ({
    same:   slipSame('abcd1234abcd1234', 'abcd1234abcd1234'),
    oneBit: slipSame('0000000000000000', '0000000000000001'),   // ต่าง 1 บิต
    fiveBit:slipSame('0000000000000000', '000000000000001f'),   // ต่าง 5 บิต = ยังใบเดิม
    sixBit: slipSame('0000000000000000', '000000000000003f'),   // ต่าง 6 บิต = คนละใบ
    empty:  slipSame('', ''),
    half:   slipSame('abcd1234abcd1234', 'abcd1234')
  }));
  push('ลายนิ้วมือเดียวกัน = ใบเดียวกัน', near.same === true);
  push('เพี้ยน 1 บิต ยังถือว่าใบเดียวกัน (โดนบีบอัดซ้ำ)', near.oneBit === true);
  push('เพี้ยน 5 บิต ยังถือว่าใบเดียวกัน', near.fiveBit === true);
  push('ต่าง 6 บิตขึ้นไป = คนละใบ ไม่กล่าวหาผิด', near.sixBit === false);
  push('ไม่มีสลิป ไม่เอาไปเทียบกับใครเลย', near.empty === false);
  push('ความยาวไม่เท่ากันไม่เทียบ (ของเก่าคนละรุ่น)', near.half === false);

  /* ---------- เครื่องลูกค้า ---------- */
  const cust = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  cust.on('pageerror', e => push('หน้าลูกค้าตาย: ' + e.message.slice(0,60), false));

  const toPay = async () => {
    await cust.goto(`${APP}/order.html?s=${KEY}&c=${encodeURIComponent(CLOUD)}`);
    await cust.waitForTimeout(800);
    await cust.locator('#view button.li').first().click();
    await cust.waitForTimeout(900);
    await cust.locator('button', { hasText:'ใส่ตะกร้า' }).click();
    await cust.waitForTimeout(700);
    await cust.locator('#barBtn').click();
    await cust.waitForTimeout(800);
    await cust.locator('#payBtn').click();
    await cust.waitForTimeout(700);
  };
  const sendWith = async img => {
    if(img){
      await cust.setInputFiles('#slipPick', img);
      await cust.waitForTimeout(700);
    }
    await cust.locator('#sendBtn').click();
    await cust.waitForTimeout(1500);
  };

  await toPay();
  push('หน้าสแกนจ่ายมีช่องแนบสลิป', await cust.locator('#slipPick').count() === 1);
  push('บอกว่าแนบสลิปไว้ช่วยอะไร',
    (await cust.textContent('#dlg')).includes('แนบสลิป'));
  /* ช่องเลือกไฟล์ของเบราว์เซอร์หน้าตาคนละเรื่องกับแอป แถมเขียน "Choose File"
     เป็นภาษาอังกฤษ จึงต้องซ่อนไว้แล้วทำปุ่มเองให้เหมือนแอป */
  push('ปุ่มแนบสลิปเป็นปุ่มของแอป ไม่ใช่ช่องเลือกไฟล์ของเบราว์เซอร์',
    await cust.locator('.slip-add').count() === 1
    && !(await cust.locator('#slipPick').isVisible()));
  push('บอกชัดว่าต้องแนบสลิป',
    (await cust.textContent('.slip-add')).includes('ต้องแนบ'));
  /* เจ้าของสั่งเอง: โอนแล้วต้องมีสลิปมาด้วยเสมอ ไม่งั้นร้านไล่หายอดในแอปธนาคารไม่เจอ */
  push('ยังไม่แนบสลิป กดส่งออเดอร์ไม่ได้', await cust.locator('#sendBtn').isDisabled());
  push('ปุ่มบอกเหตุผลว่าทำไมกดไม่ได้',
    (await cust.textContent('#sendBtn')).includes('แนบสลิปก่อน'));

  await cust.screenshot({ path: SHOT + '/slip-ask.png' });

  await cust.setInputFiles('#slipPick', IMG_A);
  await cust.waitForTimeout(800);
  push('แนบแล้วเห็นรูปที่แนบ ไม่ใช่แนบไปแบบไม่รู้ว่าใบไหน',
    await cust.locator('.slipprev img').count() === 1);
  push('ย่อรูปแล้วเก็บเป็น jpeg ไม่ส่งไฟล์เต็มใบขึ้นไป',
    await cust.evaluate(() => (slipData || '').startsWith('data:image/jpeg')));
  const kb = await cust.evaluate(() => Math.round((slipData || '').length / 1024));
  push(`รูปที่จะส่งเล็กพอ (${kb}KB ไม่เกิน 300KB)`, kb > 0 && kb < 300);
  push('ได้ลายนิ้วมือ 16 ตัว', await cust.evaluate(() => /^[0-9a-f]{16}$/.test(slipHash)));
  push('แนบแล้วปุ่มส่งกดได้', !(await cust.locator('#sendBtn').isDisabled()));
  push('แนบแล้วปุ่มกลับไปเป็นข้อความส่งออเดอร์',
    (await cust.textContent('#sendBtn')).includes('โอนแล้ว'));
  push('แนบแล้วบอกว่าแนบแล้ว และเปลี่ยนรูปได้',
    (await cust.textContent('.slipprev')).includes('แนบสลิปแล้ว')
    && await cust.locator('button', { hasText:'เปลี่ยนรูป' }).count() === 1);
  await cust.screenshot({ path: SHOT + '/slip-pay.png' });

  // เอาออกได้ ถ้าแนบผิดใบ
  await tap(cust.locator('button', { hasText:'เอาสลิปออก' }), 'มีปุ่มเอาสลิปออกให้กด');
  await cust.waitForTimeout(300);
  push('แนบผิดใบ เอาออกได้', await cust.locator('.slipprev img').count() === 0
    && await cust.evaluate(() => slipData === null && slipHash === ''));
  push('เอาสลิปออกแล้ว กดส่งไม่ได้อีก', await cust.locator('#sendBtn').isDisabled());

  // ย้อนกลับไปแก้ชื่อแล้วกลับมา รูปที่แนบต้องยังอยู่
  await cust.setInputFiles('#slipPick', IMG_A);
  await cust.waitForTimeout(700);
  const hashA = await cust.evaluate(() => slipHash);
  await tap(cust.locator('#dlg button', { hasText:'ย้อนกลับ' }), 'หน้าสแกนจ่ายมีปุ่มย้อนกลับ');
  await cust.waitForTimeout(600);
  await cust.locator('#payBtn').click();
  await cust.waitForTimeout(700);
  push('ย้อนกลับแล้วกลับมา สลิปที่แนบไว้ยังอยู่ ไม่ต้องเลือกใหม่',
    await cust.locator('.slipprev img').count() === 1);

  await sendWith(null);

  /* ---------- ข้อสำคัญ: รูปต้องไม่อยู่ในก้อนออเดอร์ ---------- */
  const ords1 = await get(`s/${KEY}/orders`);
  const id1 = Object.keys(ords1 || {})[0];
  const o1  = ords1[id1];
  push('ออเดอร์ส่งถึงแล้วและแจ้งว่าโอนแล้ว', !!o1 && o1.paid === true);
  push('ออเดอร์มีแค่ลายนิ้วมือสลิป ไม่ใช่ตัวรูป', o1.slip === hashA && o1.slip.length === 16);
  push('ไม่มีรูปแอบอยู่ในก้อนออเดอร์ (ไม่งั้นโควตาฟรีหมดวันเดียว)',
    !/data:image/.test(JSON.stringify(ords1)));
  const img1 = await get(`s/${KEY}/slips/${id1}`);
  push('รูปสลิปไปอยู่ช่องแยกของตัวเอง', typeof img1 === 'string' && img1.startsWith('data:image/jpeg'));

  /* ---------- ฝั่งแม่ค้าเห็นว่ามีสลิป แต่ยังไม่โหลดรูป ---------- */
  slipGET = 0;
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(500);
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(500);
  await seller.evaluate(() => go('orders'));
  await seller.waitForTimeout(400);
  push('การ์ดออเดอร์มีปุ่มดูสลิป',
    (await seller.textContent('#view')).includes('ดูสลิปที่แนบมา'));
  push('ใบแรกยังไม่ซ้ำกับใคร ไม่ขึ้นเตือนผิด', await seller.locator('.ord-slip.dup').count() === 0);
  push('ถามออเดอร์ตั้งหลายรอบแล้วยังไม่โหลดรูปเลย (ประหยัดโควตา)', slipGET === 0);

  await tap(seller.locator('.ord-slip'), 'มีปุ่มดูสลิปให้กด');
  await seller.waitForTimeout(900);
  push('กดดูแล้วค่อยโหลดรูป', slipGET === 1);
  push('เห็นรูปสลิปจริงในกล่อง', await seller.locator('.slipview img').count() === 1);
  push('กล่องย้ำว่าสลิปปลอมทำได้เหมือนจริง ให้เช็กแอปธนาคาร',
    (await seller.textContent('#dlg')).includes('สลิปปลอม'));
  await seller.screenshot({ path: SHOT + '/slip-view.png' });
  await seller.evaluate(() => dlg.close());
  await seller.waitForTimeout(900);

  /* ---------- ส่งสลิปใบเดิมซ้ำ ต้องจับได้ ---------- */
  await cust.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await toPay();
  await sendWith(IMG_A);
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(600);
  await seller.evaluate(() => render());
  await seller.waitForTimeout(300);
  push('เอาสลิปใบเดิมมาส่งอีกใบ แม่ค้าเห็นคำเตือนทันทีบนการ์ด',
    (await seller.textContent('#view')).includes('สลิปซ้ำ'));
  push('ปุ่มสลิปซ้ำเป็นสีเตือน ไม่ใช่ปุ่มเทา ๆ เหมือนเดิม',
    await seller.locator('.ord-slip.dup').count() >= 1);
  await seller.screenshot({ path: SHOT + '/slip-cards.png' });
  const openedDup = await tap(seller.locator('.ord-slip.dup'), 'กดปุ่มสลิปซ้ำเข้าไปดูได้');
  await seller.waitForTimeout(900);
  const dupTxt = openedDup ? await seller.textContent('#dlg') : '';
  push('กล่องบอกว่าเคยใช้มาแล้วเมื่อไหร่ ยอดเท่าไหร่', dupTxt.includes('เคยใช้มาแล้ว') && dupTxt.includes('ยอด'));
  /* สลิปเป็นรูปแนวตั้งยาวกว่าจอ เคยวางคำเตือนไว้ใต้รูป แม่ค้าต้องเลื่อนลงไปหา
     เท่ากับไม่ได้เตือน — คำเตือนต้องอยู่เหนือรูปและเห็นได้โดยไม่ต้องเลื่อน */
  const seen = await seller.evaluate(() => {
    const w = document.querySelector('#dlg .note.bad');
    const im = document.querySelector('.slipview img');
    if(!w) return null;
    const a = w.getBoundingClientRect(), b = im ? im.getBoundingClientRect() : null;
    return { top:a.top, bottom:a.bottom, imgTop: b ? b.top : null,
             imgH: b ? b.height : 0, vh: innerHeight };
  });
  push('คำเตือนสลิปซ้ำอยู่เหนือรูป ไม่ใช่ใต้รูป',
    !!seen && seen.imgTop !== null && seen.top < seen.imgTop);
  push('คำเตือนอยู่ในจอ ไม่ต้องเลื่อนหา',
    !!seen && seen.top >= 0 && seen.bottom <= seen.vh);
  push('รูปสลิปสูงไม่เกินครึ่งจอ ไม่ดันของอื่นตกจอ',
    !!seen && seen.imgH > 0 && seen.imgH <= seen.vh * 0.5);
  push('บอกวิธีดูรูปใหญ่เต็มจอ', dupTxt.includes('แตะที่รูปเพื่อดูใหญ่'));
  await seller.screenshot({ path: SHOT + '/slip-dup.png' });
  await seller.evaluate(() => dlg.close());
  await seller.waitForTimeout(900);

  /* ---------- แม่ค้าเช็กแอปธนาคารแล้วกดบอกว่ายอดตรงไหม ----------
     แอป **ไม่ได้ตรวจสลิปให้** คนเป็นคนตรวจ แอปแค่จำผลไว้
     เพื่อไม่ต้องเช็กซ้ำ และกันเผลอทอดใบที่เงินยังไม่เข้า */
  const salesBefore = await seller.evaluate(() => (db.sales || []).length);
  await tap(seller.locator('.ord-slip'), 'มีปุ่มดูสลิปให้กดเช็กยอด');
  await seller.waitForTimeout(900);
  const want = await seller.textContent('#dlg');
  push('กล่องบอกยอดที่ต้องได้ชัด ๆ จะได้เทียบกับสลิป', want.includes('ยอดที่ต้องได้'));
  push('บอกให้ไปเปิดแอปธนาคารดูก่อน', want.includes('เปิดแอปธนาคารดูว่าเงินเข้าจริงไหม'));
  push('มีปุ่มให้บอกว่ายอดตรง', await seller.locator('#dlg button', { hasText:'ยอดตรง' }).count() === 1);
  push('มีปุ่มให้บอกว่ายอดไม่ตรง', await seller.locator('#dlg button', { hasText:'ยอดไม่ตรง' }).count() === 1);

  const firstId = await seller.evaluate(() => cloudOrders.find(x => x.slip).id);
  await tap(seller.locator('#dlg button', { hasText:'ยอดตรง' }), 'กดบอกว่ายอดตรงได้');
  await seller.waitForTimeout(1200);
  push('กดแล้วการ์ดเปลี่ยนเป็นเช็กแล้ว ไม่ใช่ "ลูกค้าแจ้งว่า" เหมือนเดิม',
    (await seller.textContent('#view')).includes('เช็กแล้ว เงินเข้าจริง'));
  push('ป้ายเช็กแล้วเป็นเขียวเข้ม ต่างจากป้ายที่ลูกค้าแจ้งเอง',
    await seller.locator('.ord-paid.ok').count() === 1);
  const saved = await get(`s/${KEY}/orders/${firstId}`);
  push('ที่เก็บจำว่ายอดตรง', !!saved && saved.chk === 1);
  push('เช็กยอดแล้วต้องไม่ไปแตะยอดขาย',
    await seller.evaluate(() => (db.sales || []).length) === salesBefore);

  // เปิดดูซ้ำ ต้องไม่ถามอีก
  await tap(seller.locator('.ord-slip').first(), 'เปิดดูสลิปใบเดิมซ้ำได้');
  await seller.waitForTimeout(900);
  push('ใบที่เช็กแล้ว เปิดดูซ้ำไม่ถามอีก',
    await seller.locator('#dlg button', { hasText:'ยอดตรง' }).count() === 0);
  await seller.evaluate(() => dlg.close());
  await seller.waitForTimeout(900);

  // อีกใบกดว่ายอดไม่ตรง
  const others = seller.locator('.ord-slip').nth(1);
  if(await seller.locator('.ord-slip').count() > 1){
    await others.click();
    await seller.waitForTimeout(900);
    await tap(seller.locator('#dlg button', { hasText:'ยอดไม่ตรง' }), 'กดบอกว่ายอดไม่ตรงได้');
    await seller.waitForTimeout(1200);
    push('ยอดไม่ตรงขึ้นป้ายแดงกันเผลอทอด',
      (await seller.textContent('#view')).includes('ยอดไม่ตรง')
      && await seller.locator('.ord-paid.no').count() === 1);
  } else push('มีออเดอร์ใบที่สองให้ทดสอบยอดไม่ตรง', false);
  /* ออเดอร์ใบนี้จะถูกลบจากที่เก็บในอีก 12-24 ชม. แต่เรื่องที่เกิดต้องยังค้นได้
     ไม่งั้นพอลูกค้าคนเดิมกลับมา แม่ค้าจำไม่ได้ว่าเคยมีปัญหากัน */
  push('ยอดไม่ตรงถูกจดลงสมุดออเดอร์มีปัญหา',
    await seller.evaluate(() => (db.troubles || []).some(t => t.kind === 'bad')));
  await seller.screenshot({ path: SHOT + '/slip-checked.png' });

  /* ---------- ใบเดิมที่โดนบีบอัดจนพิกเซลเพี้ยน ก็ยังต้องจับได้ ---------- */
  await cust.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await toPay();
  await cust.setInputFiles('#slipPick', IMG_A2);
  await cust.waitForTimeout(800);
  const hashA2 = await cust.evaluate(() => slipHash);
  push('รูปเดิมที่เพี้ยนไป ได้ลายนิ้วมือใกล้เดิม (ไม่ต้องเหมือนเป๊ะ)',
    await seller.evaluate(h => slipSame(h[0], h[1]), [hashA, hashA2]));
  await sendWith(null);
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(600);
  await seller.evaluate(() => render());
  await seller.waitForTimeout(300);
  push('ถ่ายจอ/บีบอัดใหม่แล้วเอามาใช้ซ้ำ ก็ยังจับได้',
    await seller.locator('.ord-slip.dup').count() >= 2);
  /* เจ้าของขอมาตรง ๆ: "จะได้รู้ว่าซ้ำจากออเดอร์ไหน"
     แค่บอกว่า "เคยใช้แล้ว" ไม่พอ ต้องชี้ใบเดิมได้ว่าคิวที่เท่าไหร่ ของใคร เมื่อไหร่ */
  const dupTr = await seller.evaluate(() =>
    (db.troubles || []).filter(t => t.kind === 'dup')
      .map(t => ({ ofNo:n(t.ofNo), ofAt:n(t.ofAt), ofTotal:n(t.ofTotal), no:n(t.no) })));
  push(`จดว่าสลิปซ้ำ และชี้ได้ว่าซ้ำกับคิวไหน (${dupTr.length} ราย)`,
    dupTr.length >= 1 && dupTr.every(t => t.ofNo > 0 && t.ofAt > 0 && t.ofNo !== t.no));

  /* ---------- คนละใบจริง ๆ ต้องไม่ถูกกล่าวหา ---------- */
  await cust.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await toPay();
  await sendWith(IMG_B);
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(600);
  await seller.evaluate(() => render());
  await seller.waitForTimeout(300);
  const cards = await seller.locator('.ord-slip').count();
  const dups  = await seller.locator('.ord-slip.dup').count();
  push(`คนละใบไม่ถูกกล่าวหาว่าซ้ำ (มีสลิป ${cards} ใบ ซ้ำ ${dups} ใบ)`, cards - dups === 1);

  /* ---------- ข้ามวันแล้วเอาสลิปใบเดิมกลับมาใช้อีก ----------
     ข้อนี้คือสิ่งที่เจ้าของขอมา: "ถ้าวันถัดไปมีการใช้อันเดิมอีกก็ต้องแจ้งด้วย"
     จำลองของจริง: ออเดอร์เมื่อวานถูกตัวเก็บกวาดลบไปจากที่เก็บหมดแล้ว
     ถ้าโค้ดไปดูสลิปจากออเดอร์ที่ยังค้างอยู่ จะจับไม่ได้เลย — ต้องจำไว้ในเครื่องเอง */
  await put(`s/${KEY}/orders`, null);
  await put(`s/${KEY}/slips`, null);   // ตัวเก็บกวาดลบรูปไปพร้อมออเดอร์ (dropSlips)
  const yNo = await seller.evaluate(() => {
    /* ย้อนเวลาที่จดไว้ให้เป็นเมื่อวาน (เครื่องจำเอง ไม่ได้อ่านจากออเดอร์)
       **ต้องยึดวันเมื่อวานจริง ๆ ไม่ใช่ลบ 26 ชม. ตายตัว**
       รันตอนตีหนึ่ง ลบ 26 ชม. แล้วไปโผล่เมื่อวานซืน เทสต์จะตกทั้งที่โค้ดถูก
       (เจอจริงตอนรันเวลา 01:55 — เทสต์ที่ตก ๆ ผ่าน ๆ ตามเวลาที่รัน) */
    const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(14, 20, 0, 0);
    (db.slipSeen || []).forEach(x => { x.at = y.getTime(); });
    save();
    return (db.slipSeen.find(x => n(x.no)) || {}).no || 0;
  });
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(800);
  push('จำลองข้ามวัน: ออเดอร์เมื่อวานหายจากที่เก็บหมดแล้ว',
    await seller.evaluate(() => cloudOrders.length) === 0);
  push('แต่ลายนิ้วมือสลิปยังอยู่ในเครื่อง ไม่หายไปกับออเดอร์',
    await seller.evaluate(() => (db.slipSeen || []).length) > 0 && Number(yNo) > 0);

  await cust.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await toPay();
  await sendWith(IMG_A);
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(800);
  await seller.evaluate(() => { go('orders'); render(); });
  await seller.waitForTimeout(400);
  push('ข้ามวันแล้วเอาสลิปใบเดิมมาใช้ซ้ำ ยังจับได้',
    await seller.locator('.ord-slip.dup').count() === 1);
  const dupTag = await seller.locator('.ord-slip.dup').count()
    ? (await seller.textContent('.ord-slip.dup')).replace(/\s+/g, ' ').trim() : '';
  /* ป้ายบนการ์ดต้องบอกเองว่าซ้ำกับคิวไหนเมื่อไหร่ ไม่ต้องกดเข้าไปดู
     แม่ค้ายืนทอดมือเปื้อนแป้ง ไม่มีใครกดดูทุกใบ */
  push(`ป้ายบนการ์ดบอกเองว่าซ้ำกับคิวไหนเมื่อไหร่ (${dupTag.slice(0,70)})`,
    dupTag.includes('คิวที่ ' + yNo) && dupTag.includes('เมื่อวาน'));
  await seller.screenshot({ path: SHOT + '/slip-crossday.png' });

  await tap(seller.locator('.ord-slip.dup'), 'กดดูสลิปใบที่ซ้ำได้');
  await seller.waitForTimeout(1000);
  const dupBox = (await seller.textContent('#dlg')).replace(/\s+/g, ' ');
  push('ในกล่องดูสลิป บอกครบว่าซ้ำกับคิวไหน เมื่อไหร่ ยอดเท่าไหร่',
    dupBox.includes('เคยใช้มาแล้ว') && dupBox.includes('คิวที่ ' + yNo) && dupBox.includes('เมื่อวาน'));
  await seller.evaluate(() => dlg.close());
  await seller.waitForTimeout(900);

  /* ---------- การ์ด + กล่องประวัติออเดอร์มีปัญหา ---------- */
  push('หน้าออเดอร์มีการ์ดประวัติออเดอร์ที่มีปัญหา',
    (await seller.textContent('#view')).includes('ออเดอร์ที่มีปัญหา'));
  await tap(seller.locator('#view button', { hasText:'ดูประวัติ' }), 'การ์ดมีปุ่มดูประวัติ');
  await seller.waitForTimeout(1000);
  const trBox = (await seller.textContent('#dlg')).replace(/\s+/g, ' ');
  push('ในประวัติบอกว่าใบไหนซ้ำกับคิวไหน และเป็นเมื่อวาน',
    /ใช้ซ้ำกับ คิวที่ \d/.test(trBox) && trBox.includes('เมื่อวาน'));
  push('ในประวัติมีเรื่อง "ยอดไม่ตรง" ที่แม่ค้ากดไว้ด้วย', trBox.includes('ยอดไม่ตรง'));
  push('ประวัติบอกชัดว่าไม่เกี่ยวกับยอดขาย ลบได้ไม่ต้องกลัว',
    trBox.includes('ไม่เกี่ยวกับยอดขาย'));
  await seller.screenshot({ path: SHOT + '/slip-trouble.png' });
  await seller.evaluate(() => dlg.close());
  await seller.waitForTimeout(900);

  /* ---------- ไม่รับออเดอร์ ก็ต้องถูกจดไว้ ---------- */
  const rejWas = await seller.evaluate(() => (db.troubles || []).length);
  await seller.evaluate(() => { const o = cloudOrders[0]; if(o) rejectOrder(o.id); });
  await seller.waitForTimeout(900);
  await tap(seller.locator('#dlg button', { hasText:'ปฏิเสธ' }), 'กล่องยืนยันมีปุ่มปฏิเสธ');
  await seller.waitForTimeout(1200);
  push('กดไม่รับออเดอร์แล้วถูกจดลงสมุดปัญหา',
    await seller.evaluate(() => (db.troubles || []).some(t => t.kind === 'rej'))
    && await seller.evaluate(() => (db.troubles || []).length) === rejWas + 1);

  /* ---------- ประวัติห้ามหลุดขึ้นคลาวด์ ---------- */
  await seller.evaluate(async () => { await publishMenu(); });
  await seller.waitForTimeout(600);
  const menuUp = JSON.stringify(await get(`s/${KEY}/menu`) || {});
  push('ประวัติออเดอร์มีปัญหาไม่หลุดขึ้นคลาวด์ให้ลูกค้าเห็น',
    !menuUp.includes('troubles') && !/"kind"\s*:\s*"(dup|rej|bad)"/.test(menuUp));

  /* ---------- จ่ายตอนมารับของ ไม่มีสลิปติดไป ---------- */
  await cust.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await cust.goto(`${APP}/order.html?s=${KEY}&c=${encodeURIComponent(CLOUD)}`);
  await cust.waitForTimeout(800);
  await cust.locator('#view button.li').first().click();
  await cust.waitForTimeout(900);
  await cust.locator('button', { hasText:'ใส่ตะกร้า' }).click();
  await cust.waitForTimeout(700);
  await cust.locator('#barBtn').click();
  await cust.waitForTimeout(800);
  await cust.locator('#laterBtn').click();
  await cust.waitForTimeout(1500);
  const ordsAll = await get(`s/${KEY}/orders`);
  const cash = Object.values(ordsAll).find(o => o && !o.paid);
  push('จ่ายตอนมารับของ ไม่มีสลิปติดไปด้วย', !!cash && !cash.slip);

  /* ---------- สั่งใหม่ต้องไม่เอาสลิปใบเก่าติดไปเอง ---------- */
  await cust.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await toPay();
  await cust.setInputFiles('#slipPick', IMG_B);
  await cust.waitForTimeout(700);
  const hashB = await cust.evaluate(() => slipHash);
  await sendWith(null);
  await tap(cust.locator('button', { hasText:'สั่งเพิ่ม' }), 'หน้าคิวมีปุ่มสั่งเพิ่ม');
  await cust.waitForTimeout(600);
  push('ส่งแล้วสลิปถูกล้างออกจากมือ', await cust.evaluate(() => slipData === null && slipHash === ''));
  await cust.locator('#view button.li').first().click();
  await cust.waitForTimeout(900);
  await cust.locator('button', { hasText:'ใส่ตะกร้า' }).click();
  await cust.waitForTimeout(700);
  await cust.locator('#barBtn').click();
  await cust.waitForTimeout(800);
  await cust.locator('#payBtn').click();
  await cust.waitForTimeout(700);
  push('สั่งรอบใหม่ ช่องแนบสลิปว่างเปล่า ไม่มีใบเก่าค้าง',
    await cust.locator('.slipprev img').count() === 0);
  push('รอบใหม่ก็ยังต้องแนบสลิปก่อนถึงจะส่งได้', await cust.locator('#sendBtn').isDisabled());
  await cust.setInputFiles('#slipPick', IMG_C);
  await cust.waitForTimeout(700);
  const hashC = await cust.evaluate(() => slipHash);
  await cust.locator('#sendBtn').click();
  await cust.waitForTimeout(1500);
  const ords2 = await get(`s/${KEY}/orders`);
  const latest = Object.keys(ords2).sort().pop();
  push('ออเดอร์รอบใหม่ใช้ลายนิ้วมือของใบใหม่ ไม่ใช่ใบเก่าที่เพิ่งส่งไป',
    hashC !== hashB && ords2[latest].slip === hashC);

  /* ---------- ลบออเดอร์ รูปต้องหายไปด้วย (ไม่ทิ้งรูปค้างกินโควตา) ---------- */
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(600);
  const before = Object.keys(await get(`s/${KEY}/slips`) || {}).length;
  await seller.evaluate(async () => {
    const o = cloudOrders.find(x => x.slip);
    window.__gone = o.id;
    deleteOrder(o.id);
  });
  await seller.waitForTimeout(700);
  push('ลบทีละใบต้องถามยืนยันก่อน ไม่ลบทันที',
    (await seller.textContent('#dlg')).includes('ไม่ถูกบันทึกเป็นยอดขาย'));
  await tap(seller.locator('#dlg button', { hasText:'ลบทิ้ง' }), 'กล่องยืนยันมีปุ่มลบทิ้ง');
  await seller.waitForTimeout(1200);
  const goneId = await seller.evaluate(() => window.__gone);
  const afterOne = await get(`s/${KEY}/slips`) || {};
  push('ลบออเดอร์ทีละใบ รูปสลิปใบนั้นหายไปด้วย',
    before > 0 && !afterOne[goneId] && Object.keys(afterOne).length === before - 1);

  /* ---------- ล้างออเดอร์วันนี้ รูปต้องหายเกลี้ยง (ข้อนี้ล้างข้อมูล อยู่ท้ายสุด) ---------- */
  await seller.evaluate(() => clearTodayOrders());
  await seller.waitForTimeout(1000);
  await tap(seller.locator('#dlg button', { hasText:'ล้างเลย' }), 'กล่องยืนยันมีปุ่มล้างเลย');
  await seller.waitForTimeout(1500);
  const afterAll = await get(`s/${KEY}/slips`);
  push('ล้างออเดอร์วันนี้ รูปสลิปไม่เหลือค้างในที่เก็บ',
    afterAll === null || Object.keys(afterAll).length === 0);
  /* ของที่ต้องรอดจากการล้าง: ประวัติปัญหา · ลายนิ้วมือสลิป · ยอดขาย
     ถ้าประวัติหายไปพร้อมออเดอร์ ก็ไม่ต่างจากไม่มีประวัติเลย */
  push('ล้างออเดอร์วันนี้แล้ว ประวัติออเดอร์มีปัญหายังอยู่',
    await seller.evaluate(() => (db.troubles || []).length) > 0);
  push('ล้างออเดอร์วันนี้แล้ว ยังกันสลิปซ้ำได้เหมือนเดิม',
    await seller.evaluate(() => (db.slipSeen || []).length) > 0);
  push('ประวัติออเดอร์มีปัญหา **ไม่แตะยอดขาย** (แถวที่ใส่ไว้ยังอยู่ครบ)',
    await seller.evaluate(() => (db.sales || []).length === 1 && db.sales[0].id === 'sx'));
  // ล้างประวัติเองได้ และล้างแล้วการกันสลิปซ้ำต้องไม่พังตามไปด้วย
  await seller.evaluate(() => clearTroubles());
  await seller.waitForTimeout(900);
  await tap(seller.locator('#dlg button', { hasText:'ล้างเลย' }), 'กล่องล้างประวัติมีปุ่มยืนยัน');
  await seller.waitForTimeout(1000);
  push('ล้างประวัติแล้วว่างจริง', await seller.evaluate(() => (db.troubles || []).length) === 0);
  push('ล้างประวัติแล้ว การกันสลิปซ้ำยังทำงานอยู่',
    await seller.evaluate(() => (db.slipSeen || []).length) > 0);

  /* ---------- ทางเข้าต้องอยู่ตลอด แม้ยังไม่มีประวัติสักรายการ ----------
     เจ้าของถามว่า "เมนูออเดอร์ที่มีปัญหาอยู่ไหน" เพราะของเดิมซ่อนตัวเองตอนว่าง
     เครื่องที่ยังไม่เคยมีปัญหาจึงหาไม่เจอสักที่ แล้วไม่รู้ว่าของมาแล้วหรือยัง
     (ข้อนี้อยู่ท้ายสุดเพราะต้องการสภาพ "ประวัติว่าง" ซึ่งเพิ่งล้างไป) */
  await seller.evaluate(() => orderSetupDialog());
  await seller.waitForTimeout(1000);
  const setupTxt = (await seller.textContent('#dlg')).replace(/\s+/g, ' ');
  push('ประวัติว่างอยู่ แต่ในกล่องตั้งค่ายังมีปุ่มเข้าไปดูได้',
    await seller.locator('#dlg button', { hasText:'ดูประวัติออเดอร์มีปัญหา' }).count() === 1);
  push('และบอกด้วยว่ายังไม่มี ไม่ใช่เงียบไปเฉย ๆ',
    setupTxt.includes('ยังไม่มีออเดอร์ที่มีปัญหา'));
  await tap(seller.locator('#dlg button', { hasText:'ดูประวัติออเดอร์มีปัญหา' }), 'กดเข้าไปดูได้');
  await seller.waitForTimeout(1100);
  push('เปิดเข้าไปแล้วบอกว่ายังไม่มี ไม่ใช่กล่องเปล่า',
    (await seller.textContent('#dlg')).includes('ยังไม่มีออเดอร์ที่มีปัญหา'));
  await seller.screenshot({ path: SHOT + '/slip-trouble-empty.png' });

  await b.close();
  try{ fs.rmSync(SLIPS.dir, { recursive:true, force:true }); }catch(e){}

  let bad = 0;
  ok.forEach(([n2, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n2}`); if(!v) bad++; });
  console.log(bad ? `\n  ตก ${bad} ข้อ\n` : `\n  ผ่านทุกข้อ (${ok.length} ข้อ)\n`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
