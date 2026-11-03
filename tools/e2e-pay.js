/* QR พร้อมเพย์ให้ลูกค้าสแกนจ่ายก่อนส่งออเดอร์
   **นี่คือเรื่องเงิน เทสต์ชุดนี้จึงไม่ดูด้วยตาว่า "มีลายตารางแล้ว"**
   แต่เอาตัวอ่าน QR จริง (jsqr) มาอ่าน QR ที่หน้าลูกค้าวาดออกมา
   แล้วเทียบกับผลของไลบรารีอ้างอิง (promptpay-qr) ว่าตรงเป๊ะทุกตัวอักษร

   ทั้งสองไลบรารีใช้ตอนทดสอบเท่านั้น แอปจริงยังไม่มี dependency */

const { chromium } = require('playwright');
const path = require('path');
const jsQR = (m => m.default || m)(require(path.join(__dirname, '../node_modules/jsqr')));
const refPayload = require(path.join(__dirname, '../node_modules/promptpay-qr'));

const APP = 'http://127.0.0.1:8787';
const CLOUD = 'http://127.0.0.1:8788';
const KEY = 'paykey1';

const ok = [];
const push = (name, v) => ok.push([name, !!v]);

const put = (p, b) => fetch(`${CLOUD}/${p}.json`, {
  method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b)
}).then(r => r.json());

// อ่าน QR จาก <svg> ที่หน้าเว็บวาด โดยถ่ายเป็นรูปแล้วส่งให้ตัวอ่าน
async function readQR(pg){
  const el = pg.locator('.payqr');
  if(!await el.count()) return '(ไม่มี QR บนจอ)';
  const png = await el.screenshot();
  // แปลง PNG เป็นพิกเซลด้วยเบราว์เซอร์ (ไม่ต้องลงไลบรารีอ่านรูปเพิ่ม)
  const { data, w, h } = await pg.evaluate(async b64 => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height);
    return { data: Array.from(d.data), w: cv.width, h: cv.height };
  }, png.toString('base64'));
  const r = jsQR(new Uint8ClampedArray(data), w, h);
  return r ? r.data : '(อ่านไม่ออก)';
}

(async () => {
  await fetch(CLOUD + '/__reset').catch(() => {});
  const PAY_ID = '0812345678';
  await put(`s/${KEY}/menu`, {
    name:'ร้านเครปทดสอบ', branch:'', open:true, taking:true, payId: PAY_ID,
    menus:[{ id:'m1', name:'เครปกรอบ', price:15, groups:[] }]
  });

  const b = await chromium.launch({ args:['--no-sandbox'] });
  const pg = await b.newPage({ viewport:{width:390,height:844} });
  pg.on('pageerror', e => push('หน้าลูกค้าตาย: ' + e.message.slice(0,60), false));

  const order = async n => {
    await pg.goto(`${APP}/order.html?s=${KEY}&c=${encodeURIComponent(CLOUD)}`);
    await pg.waitForTimeout(800);
    await pg.locator('#view button.li').first().click();
    await pg.waitForTimeout(900);
    for(let i = 1; i < n; i++){ await pg.locator('.qbtn', { hasText:'+' }).first().click(); await pg.waitForTimeout(150); }
    await pg.locator('button', { hasText:'ใส่ตะกร้า' }).click();
    await pg.waitForTimeout(800);
    await pg.locator('#barBtn').click();
    await pg.waitForTimeout(900);
  };

  /* ---------- ร้านใส่พร้อมเพย์ไว้ = มีทางเลือกให้สแกนจ่าย ---------- */
  await order(1);
  push('ร้านเปิดรับโอน ลูกค้าเห็นปุ่มสแกนจ่าย', await pg.locator('#payBtn').count() === 1);
  push('ยังมีทางเลือกจ่ายตอนมารับของ', await pg.locator('#laterBtn').count() === 1);

  await pg.fill('#who', 'โอ๋');
  await pg.fill('#note', 'ไม่เอาผัก');
  await pg.locator('#payBtn').click();
  await pg.waitForTimeout(700);

  push('กดสแกนจ่ายแล้วได้ QR จริงบนจอ', await pg.locator('.payqr').count() === 1);
  push('โชว์ยอดตัวใหญ่ให้เห็นชัด',
    (await pg.locator('.payamt').textContent()).includes('15'));
  push('เตือนว่าโอนเสร็จค่อยกด',
    (await pg.textContent('#dlg')).includes('โอนเสร็จแล้วค่อยกดปุ่ม'));

  /* ---------- ข้อสำคัญที่สุด: อ่าน QR กลับแล้วต้องตรงกับไลบรารีอ้างอิง ---------- */
  const got1 = await readQR(pg);
  const want1 = refPayload(PAY_ID, { amount: 15 });
  push('QR ที่ลูกค้าเห็น อ่านกลับได้ตรงกับไลบรารีอ้างอิง (1 ชิ้น ฿15)', got1 === want1);
  push('QR มีเบอร์พร้อมเพย์ของร้านอยู่จริง', got1.includes('0066812345678'));
  push('QR มียอดเงินใส่มาให้แล้ว ลูกค้าไม่ต้องพิมพ์', got1.includes('540515.00'));

  /* ---------- ย้อนกลับแล้วชื่อที่พิมพ์ต้องไม่หาย ---------- */
  await pg.locator('#dlg button', { hasText:'ย้อนกลับ' }).click();
  await pg.waitForTimeout(600);
  push('ย้อนกลับแล้วชื่อที่พิมพ์ไว้ยังอยู่', await pg.inputValue('#who') === 'โอ๋');
  push('ย้อนกลับแล้วหมายเหตุยังอยู่', await pg.inputValue('#note') === 'ไม่เอาผัก');

  /* ---------- ส่งออเดอร์แบบแจ้งว่าโอนแล้ว ---------- */
  await pg.locator('#payBtn').click();
  await pg.waitForTimeout(700);
  await pg.locator('#sendBtn').click();
  await pg.waitForTimeout(1400);

  const all = await (await fetch(`${CLOUD}/s/${KEY}/orders.json`)).json();
  const o1 = Object.values(all || {})[0];
  push('ออเดอร์ถูกส่งพร้อมธงว่าแจ้งโอนแล้ว', !!o1 && o1.paid === true);
  push('ชื่อกับหมายเหตุติดไปกับออเดอร์ด้วย', !!o1 && o1.who === 'โอ๋' && o1.note === 'ไม่เอาผัก');
  push('หน้าคิวบอกว่าแจ้งว่าโอนแล้ว',
    (await pg.textContent('#view')).includes('แจ้งว่าโอนแล้ว'));

  /* ---------- ยอดอื่นก็ต้องถูก ไม่ใช่ถูกเฉพาะเคสเดียว ---------- */
  await fetch(`${CLOUD}/s/${KEY}/orders.json`, { method:'DELETE' });
  await pg.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await order(3);                                   // 3 ชิ้น = ฿45
  await pg.locator('#payBtn').click();
  await pg.waitForTimeout(700);
  const got2 = await readQR(pg);
  push('ยอดเปลี่ยน QR ก็เปลี่ยนตาม และยังตรงกับไลบรารี (3 ชิ้น ฿45)',
    got2 === refPayload(PAY_ID, { amount: 45 }));
  push('QR สองยอดไม่เหมือนกัน (ไม่ได้วาดรูปเดิมค้างไว้)', got1 !== got2);

  /* ---------- ร้านไม่ใส่พร้อมเพย์ = ต้องไม่มีปุ่มสแกนจ่าย ---------- */
  await put(`s/${KEY}/menu`, {
    name:'ร้านเครปทดสอบ', branch:'', open:true, taking:true, payId:'',
    menus:[{ id:'m1', name:'เครปกรอบ', price:15, groups:[] }]
  });
  await pg.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await order(1);
  push('ร้านไม่ใส่พร้อมเพย์ ไม่มีปุ่มสแกนจ่ายมาหลอก', await pg.locator('#payBtn').count() === 0);
  push('ยังสั่งได้ตามปกติ จ่ายตอนมารับของ', await pg.locator('#sendBtn').count() === 1);
  await pg.locator('#sendBtn').click();
  await pg.waitForTimeout(1400);
  const all2 = await (await fetch(`${CLOUD}/s/${KEY}/orders.json`)).json();
  const o2 = Object.values(all2 || {}).find(x => x && !x.paid);
  push('ออเดอร์ที่ไม่ได้โอน ธง paid เป็น false', !!o2 && o2.paid === false);

  await b.close();
  let bad = 0;
  ok.forEach(([n2, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n2}`); if(!v) bad++; });
  console.log(bad ? `\n  ตก ${bad} ข้อ\n` : '\n  ผ่านทุกข้อ\n');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
