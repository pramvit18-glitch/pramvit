/* เทสต์ "อ่าน QR บนสลิป" ด้วยเบราว์เซอร์จริง
   สลิปจากแอปธนาคารไทยมี QR เล็ก ๆ ข้างในมีแค่ รหัสธนาคาร + เลขอ้างอิง (ไม่มียอด ไม่มีชื่อ)
   หน้าลูกค้าอ่านเอง (lib/jsqr.js) ส่งเลขไปกับออเดอร์ ฝั่งร้านใช้จับสลิปซ้ำ

   ข้อที่ต้องพิสูจน์ให้ได้:
   1. **ใบเดียวกันแต่รูปต่าง (ตัดขอบ/ถ่ายจอ) ต้องจับได้** เพราะเลขอ้างอิงตรงกัน
   2. **คนละใบแต่รูปคล้ายกัน ต้องไม่เตือนผิด** เพราะเลขอ้างอิงคนละเลข
   3. ไม่เจอ QR / QR ผิดแบบ ต้องบอกเบา ๆ ทั้งสองฝั่ง **แต่ไม่บังคับ** ยังส่งได้
   4. **ห้ามเขียนเหมือนแอปตรวจสลิปให้แล้ว** QR ไม่ได้บอกว่าเงินเข้า
   5. ระหว่างอ่าน QR ปุ่มส่งต้องปิด ไม่งั้นออเดอร์ออกไปโดยไม่มีเลข
   6. โหลดตัวอ่านไม่ขึ้น ต้องยังส่งออเดอร์ได้ และฝั่งร้านต้องไม่เตือนว่า "ไม่มี QR" ผิด ๆ

   รูปสลิปทำเองด้วย tools/fake-slip.js · ตาราง QR เอามาจาก qr() ของหน้าลูกค้า
   node tools/fake-cloud.js &  node serve.js &  node tools/e2e-slipqr.js  */

const { chromium } = require('playwright');
const os   = require('os');
const path = require('path');
const fs   = require('fs');

const APP   = process.env.APP_URL || 'http://127.0.0.1:8787';
const CLOUD = 'http://127.0.0.1:8788';
const KEY   = 'qrkey1';
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
async function shut(pg){
  await pg.evaluate(() => { try{ if(dlg.open) dlg.close(); }catch(e){} });
  await pg.waitForTimeout(900);
}
const get = p => fetch(`${CLOUD}/${p}.json`).then(r => r.json());

// ---------- สร้างข้อความใน QR สลิป (แบบเดียวกับธนาคาร) ----------
const f = (tag, v) => tag + String(v.length).padStart(2, '0') + v;
function crc16(s){
  let c = 0xFFFF;
  for(let i = 0; i < s.length; i++){
    c ^= s.charCodeAt(i) << 8;
    for(let k = 0; k < 8; k++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}
function slipText(bank, ref){
  const s = f('00', f('00', '000001') + f('01', bank) + f('02', ref)) + f('51', 'TH') + '9104';
  return s + crc16(s);
}
const R1 = '014242082547BPM04988';
const R2 = '014242082547BPM07731';
const TXT1 = slipText('004', R1);
const TXT2 = slipText('004', R2);
const TXT_BADCRC = TXT1.slice(0, -4) + (TXT1.slice(-4) === '0000' ? '1111' : '0000');

const { writeQRSlip } = require(path.join(__dirname, 'fake-slip.js'));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'slipqr-'));

(async () => {
  await fetch(CLOUD + '/__reset').catch(() => {});
  const b = await chromium.launch({ args:['--no-sandbox'] });

  /* ---------- เครื่องแม่ค้า ---------- */
  const seller = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  seller.on('pageerror', e => push('แอปแม่ค้าตาย: ' + e.message.slice(0,60), false));
  await seller.goto(APP + '/index.html');
  await seller.evaluate(cloud => {
    localStorage.setItem('crepe-cloud', cloud);
    const d = {
      id:'sh1', shopName:'ร้านเครปทดสอบ', shopBranch:'', shopOpen:1,
      groups:[], menus:[{ id:'m1', name:'เครปกรอบ', price:15, groupIds:[], items:[] }],
      ingredients:[], expenses:[], sales:[],
      fixed:{rent:0, electric:0, gas:0, water:0, other:0, days:26, labor:0},
      payId:'0812345678'
    };
    localStorage.setItem('crepe-hub-v1', JSON.stringify({shops:[d], active:'sh1'}));
  }, CLOUD);
  await seller.reload();
  await seller.waitForTimeout(400);
  await seller.evaluate(async key => {
    db.orderKey = key; db.orderOn = 1; db.payId = '0812345678';
    save(); await publishMenu();
  }, KEY);

  /* ---------- สูตรเทียบฝั่งร้าน (ไม่ต้องใช้รูป) ---------- */
  const unit = await seller.evaluate(() => {
    const keep = db.slipSeen;
    const H = 'abcd1234abcd1234', H2 = '0f0f0f0f0f0f0f0f';
    db.slipSeen = [
      { id:'old1', h:H,  ref:'004:AAA', at:Date.now(), total:15, no:1, who:'' },
      { id:'old2', h:H2, ref:'',        at:Date.now(), total:15, no:2, who:'' }
    ];
    const r = {
      sameRef:   (slipSeenBefore({ id:'x', slip:'ffffffffffffffff', slipRef:'004:AAA' }) || {}).id,
      otherRef:  slipSeenBefore({ id:'x', slip:H, slipRef:'004:BBB' }),
      noRefNew:  (slipSeenBefore({ id:'x', slip:H, slipRef:'' }) || {}).id,
      oldNoRef:  (slipSeenBefore({ id:'x', slip:H2, slipRef:'004:CCC' }) || {}).id,
      self:      slipSeenBefore({ id:'old1', slip:H, slipRef:'004:AAA' }),
      nothing:   slipSeenBefore({ id:'x', slip:'', slipRef:'' }),
      bank:      slipRefInfo('004:AAA'),
      bankOther: slipRefInfo('999:AAA'),
      junk:      slipRefInfo('ไม่ใช่')
    };
    db.slipSeen = keep;
    return r;
  });
  push('เลขอ้างอิงตรงกัน = ใบเดิม ถึงรูปจะต่างกันหมด', unit.sameRef === 'old1');
  push('มีเลขทั้งคู่แต่คนละเลข = คนละใบ ถึงรูปจะเหมือนกันเป๊ะ (ไม่เตือนผิด)', unit.otherRef === null);
  push('ไม่มีเลขให้เทียบ ยังเทียบรูปเหมือนเดิม', unit.noRefNew === 'old1');
  push('ของที่จำไว้รุ่นเก่า (ไม่มีเลข) ยังเทียบรูปกับใบใหม่ได้', unit.oldNoRef === 'old2');
  push('ไม่เอาตัวเองมาเทียบกับตัวเอง', unit.self === null);
  push('ไม่มีทั้งรูปและเลข ไม่เทียบกับใคร', unit.nothing === null);
  push('รหัส 004 = ธนาคารกสิกรไทย', unit.bank && unit.bank.bank === 'ธนาคารกสิกรไทย' && unit.bank.ref === 'AAA');
  push('รหัสที่ไม่รู้จัก บอกเป็นรหัสตรง ๆ ไม่เดาชื่อ', unit.bankOther && unit.bankOther.bank === 'รหัสธนาคาร 999');
  push('ข้อความมั่ว ๆ ไม่ถูกอ่านเป็นธนาคาร', unit.junk === null);

  /* ---------- เครื่องลูกค้า ---------- */
  /* ปิด service worker ของหน้าลูกค้าในเทสต์นี้ — ไม่งั้นการโหลด lib/jsqr.js วิ่งผ่าน sw
     แล้ว Playwright ดัก/หน่วง/ตัดไม่ได้ ข้อ "ระหว่างอ่านปุ่มปิด" กับ "ตัวอ่านล่ม" จะไม่ได้ทดสอบอะไรเลย */
  const custCtx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, serviceWorkers:'block' });
  const cust = await custCtx.newPage();
  cust.on('pageerror', e => push('หน้าลูกค้าตาย: ' + e.message.slice(0,60), false));
  let jsqrGET = 0;
  cust.on('request', r => { if(/\/lib\/jsqr\.js/.test(r.url())) jsqrGET++; });

  const toPay = async () => {
    // ล้างออเดอร์ที่จำไว้ ไม่งั้นเปิดมาเจอหน้าคิวแทนหน้าเมนู
    await cust.evaluate(() => { try{ localStorage.clear(); }catch(e){} }).catch(() => {});
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
  // รอจนอ่าน QR จบ (ไม่ใช่รอเวลาตายตัว — เครื่องช้าอ่านนานกว่า)
  const waitRead = async () => {
    for(let i = 0; i < 60; i++){
      if(!(await cust.evaluate(() => slipReading))) return;
      await cust.waitForTimeout(100);
    }
  };
  const latestOrder = async () => {
    const all = await get(`s/${KEY}/orders`) || {};
    const id = Object.keys(all).sort().pop();
    return id ? Object.assign({ id }, all[id]) : null;
  };
  const sendNow = async () => {
    await tap(cust.locator('#sendBtn'), 'มีปุ่มส่งออเดอร์');
    await cust.waitForTimeout(1500);
  };

  /* ตาราง QR เอามาจากตัววาดของหน้าลูกค้าเอง (พิสูจน์แล้วใน e2e-pay ว่าอ่านกลับได้จริง) */
  await toPay();
  const grid = t => cust.evaluate(x => qr(x), t);
  const G1 = await grid(TXT1), G2 = await grid(TXT2), GBAD = await grid(TXT_BADCRC);
  const GPP = await cust.evaluate(() => qr(ppPayload('0812345678', 15)));   // QR พร้อมเพย์ของร้าน ไม่ใช่สลิป

  const IMG = {
    r1a:  writeQRSlip(path.join(DIR, 'r1a.png'),  { pattern:'a', grid:G1 }),
    r1c:  writeQRSlip(path.join(DIR, 'r1c.png'),  { pattern:'c', grid:G1 }),   // ใบเดิม รูปต่าง (ตัดขอบ/ถ่ายจอ)
    r2a:  writeQRSlip(path.join(DIR, 'r2a.png'),  { pattern:'a', grid:G2 }),   // คนละใบ รูปคล้ายกัน
    none: writeQRSlip(path.join(DIR, 'none.png'), { pattern:'b' }),
    pp:   writeQRSlip(path.join(DIR, 'pp.png'),   { pattern:'b', grid:GPP }),
    crc:  writeQRSlip(path.join(DIR, 'crc.png'),  { pattern:'c', grid:GBAD }),
    // ขนาดเท่าภาพหน้าจอมือถือจริง QR โมดูลละ 5 พิกเซล
    big:  writeQRSlip(path.join(DIR, 'big.png'),  { w:1080, h:2340, pattern:'b', grid:G2, mod:5 })
  };

  push('ยังไม่แนบสลิป ยังไม่โหลดตัวอ่าน QR (คนจ่ายเงินสดไม่ต้องโหลด)', jsqrGET === 0);

  /* ---------- 1) ใบแรก: อ่าน QR ได้ ----------
     หน่วงตัวอ่านไว้ก่อน จะได้เห็นว่าระหว่างอ่าน ปุ่มส่งปิดอยู่จริง */
  await cust.route('**/lib/jsqr.js', async r => {
    await new Promise(z => setTimeout(z, 1500));
    try{ await r.continue(); }catch(e){}
  });
  await cust.setInputFiles('#slipPick', IMG.r1a);
  await cust.waitForTimeout(400);
  push('ระหว่างอ่าน QR ปุ่มส่งปิดไว้ก่อน', await cust.locator('#sendBtn').isDisabled());
  push('ปุ่มบอกว่ากำลังอ่านสลิป', (await cust.textContent('#sendBtn')).includes('กำลังอ่าน'));
  await waitRead();
  await cust.unroute('**/lib/jsqr.js');
  push('โหลดตัวอ่าน QR ตอนแนบสลิป', jsqrGET === 1);
  const q1 = await cust.evaluate(() => slipQ);
  push('อ่าน QR บนสลิปได้ ธนาคาร 004 เลขอ้างอิงถูกตัว', q1.st === 'ok' && q1.bank === '004' && q1.ref === R1);
  push('อ่านจบแล้วปุ่มส่งกดได้', !(await cust.locator('#sendBtn').isDisabled()));
  push('อ่านได้ ไม่ขึ้นคำเตือนอะไรให้ลูกค้างง', await cust.locator('.slipq.warn').count() === 0);
  await sendNow();
  const o1 = await latestOrder();
  push('ออเดอร์มีเลขอ้างอิงติดไปด้วย (004:...)', o1 && o1.slipRef === '004:' + R1 && o1.slipQr === 'ok');
  push('ยังมีลายนิ้วมือรูปเหมือนเดิม (ไว้เทียบตอนไม่มีเลข)', o1 && /^[0-9a-f]{16}$/.test(o1.slip || ''));
  push('ไม่มีรูปแอบอยู่ในก้อนออเดอร์', o1 && !/data:image/.test(JSON.stringify(o1)));

  /* ---------- ฝั่งร้านเห็นธนาคาร + เลขอ้างอิง ---------- */
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(700);
  await seller.evaluate(() => go('orders'));
  await seller.waitForTimeout(400);
  push('ใบแรกไม่ซ้ำกับใคร', await seller.locator('.ord-slip.dup').count() === 0);
  await seller.evaluate(id => viewSlip(id), o1.id);
  await seller.waitForTimeout(1100);
  const d1 = (await seller.textContent('#dlg')).replace(/\s+/g, ' ');
  push('กล่องสลิปบอกธนาคารที่โอน', d1.includes('ธนาคารกสิกรไทย'));
  push('กล่องสลิปบอกเลขอ้างอิง', d1.includes(R1));
  push('บอกตรง ๆ ว่า QR ไม่ได้บอกยอดหรือว่าเงินเข้าจริง', d1.includes('ไม่ได้บอกยอดหรือว่าเงินเข้าจริง'));
  push('อ่านได้ ไม่ทำเป็นป้ายเขียวเหมือนผ่านการตรวจ',
    await seller.evaluate(() => { const e = document.querySelector('#dlg .slipqr');
      return !!e && !e.className.includes('ok') && !e.className.includes('good'); }));
  push('ไม่มีคำว่ายืนยันแล้ว/ตรวจแล้ว/ของจริง (แอปไม่ได้ตรวจให้)',
    !/ยืนยันแล้ว|ตรวจแล้ว|สลิปจริง|ของจริง|ผ่านการตรวจ/.test(d1));
  // บรรทัด QR ต้องอยู่ในจอโดยไม่ต้องเลื่อน (อยู่เหนือรูปสลิป เหมือนคำเตือนสลิปซ้ำ)
  const qBox = await seller.evaluate(() => {
    const e = document.querySelector('#dlg .slipqr'), im = document.querySelector('#slipBox');
    if(!e || !im) return null;
    return { bottom: e.getBoundingClientRect().bottom, img: im.getBoundingClientRect().top, h: innerHeight };
  });
  push('บรรทัด QR อยู่เหนือรูป และอยู่ในจอโดยไม่ต้องเลื่อน',
    !!qBox && qBox.bottom <= qBox.img + 1 && qBox.bottom < qBox.h);
  await seller.screenshot({ path: SHOT + '/slipqr-seller-ok.png' });
  await seller.evaluate(id => markPaidChecked(id, 1), o1.id);
  await seller.waitForTimeout(900);

  /* ---------- 2) ใบเดิม แต่รูปหน้าตาคนละแบบ (ตัดขอบ/ถ่ายจอมา) → ต้องจับได้ ---------- */
  await toPay();
  await cust.setInputFiles('#slipPick', IMG.r1c);
  await cust.waitForTimeout(300); await waitRead();
  await sendNow();
  const o2 = await latestOrder();
  const hashFar = await seller.evaluate(([a, c]) => !slipSame(a, c), [o1.slip, o2.slip]);
  push('(เงื่อนไข) รูปสองใบนี้หน้าตาต่างกันจนเทียบรูปไม่จับ', hashFar);
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(700);
  push('ใบเดิมที่รูปต่าง จับได้เพราะเลขอ้างอิงตรงกัน',
    await seller.evaluate(id => (slipSeenBefore(cloudOrders.find(x => x.id === id)) || {}).id, o2.id) === o1.id);
  push('บนการ์ดขึ้นป้ายสลิปซ้ำ', await seller.locator('.ord-slip.dup').count() === 1);
  await seller.evaluate(id => viewSlip(id), o2.id);
  await seller.waitForTimeout(1100);
  push('กล่องสลิปบอกว่าซ้ำเพราะเลขอ้างอิงตรงกัน',
    (await seller.textContent('#dlg')).includes('เลขอ้างอิงบนสลิปตรงกัน'));
  push('จดลงสมุดออเดอร์มีปัญหาว่าซ้ำกับใบไหน',
    await seller.evaluate(([a, b2]) => (db.troubles || []).some(t => t.kind === 'dup' && t.id === b2 && t.ofId === a), [o1.id, o2.id]));
  await seller.screenshot({ path: SHOT + '/slipqr-seller-dup.png' });
  await shut(seller);

  /* ---------- 3) คนละใบ แต่รูปคล้ายกันมาก → ต้องไม่เตือนผิด ---------- */
  await toPay();
  await cust.setInputFiles('#slipPick', IMG.r2a);
  await cust.waitForTimeout(300); await waitRead();
  await sendNow();
  const o3 = await latestOrder();
  push('(เงื่อนไข) รูปสองใบนี้คล้ายกันจนเทียบรูปอย่างเดียวจะเตือนผิด',
    await seller.evaluate(([a, c]) => slipSame(a, c), [o1.slip, o3.slip]));
  push('ออเดอร์นี้ได้เลขอ้างอิงของใบใหม่', o3 && o3.slipRef === '004:' + R2);
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(700);
  push('คนละเลขอ้างอิง ไม่เตือนว่าสลิปซ้ำ ถึงรูปจะคล้ายกัน',
    await seller.evaluate(id => slipSeenBefore(cloudOrders.find(x => x.id === id)), o3.id) === null);
  push('ไม่จดผิดลงสมุดปัญหา',
    !(await seller.evaluate(id => (db.troubles || []).some(t => t.kind === 'dup' && t.id === id), o3.id)));

  /* ---------- 4) สลิปไม่มี QR → บอกเบา ๆ แต่ยังส่งได้ ---------- */
  await toPay();
  await cust.setInputFiles('#slipPick', IMG.none);
  await cust.waitForTimeout(300); await waitRead();
  push('ไม่เจอ QR = อ่านผลได้ว่า none', await cust.evaluate(() => slipQ.st) === 'none');
  const tNone = (await cust.textContent('#slipPrev')).replace(/\s+/g, ' ');
  push('บอกลูกค้าว่าไม่เจอ QR และแนะนำให้แนบรูปเต็มใบ', tNone.includes('ไม่เจอ QR') && tNone.includes('เต็มใบ'));
  push('ไม่เจอ QR ยังส่งได้ ไม่บังคับ', !(await cust.locator('#sendBtn').isDisabled()));
  push('คำที่บอกลูกค้าไม่กล่าวหา (ไม่มี โกง/ปลอม/หลอก)', !/โกง|ปลอม|หลอก/.test(tNone));
  await cust.screenshot({ path: SHOT + '/slipqr-cust-none.png' });
  await sendNow();
  const o4 = await latestOrder();
  push('ออเดอร์จดว่าไม่เจอ QR และไม่มีเลข', o4 && o4.slipQr === 'none' && o4.slipRef === '');
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(700);
  await seller.evaluate(id => viewSlip(id), o4.id);
  await seller.waitForTimeout(1100);
  const d4 = (await seller.textContent('#dlg')).replace(/\s+/g, ' ');
  push('ฝั่งร้านเตือนว่าไม่เจอ QR บนสลิป', d4.includes('ไม่เจอ QR บนสลิป'));
  push('และให้เช็กแอปธนาคาร ไม่ได้ตัดสินแทน', d4.includes('เช็กแอปธนาคาร'));
  await shut(seller);

  /* ---------- 5) แนบรูป QR พร้อมเพย์ของร้านมาแทนสลิป → ผิดแบบ ---------- */
  await toPay();
  await cust.setInputFiles('#slipPick', IMG.pp);
  await cust.waitForTimeout(300); await waitRead();
  push('QR พร้อมเพย์ (ไม่ใช่สลิป) = ผิดแบบ', await cust.evaluate(() => slipQ.st) === 'bad');
  push('บอกลูกค้าให้เช็กว่าแนบรูปสลิปถูกใบ',
    (await cust.textContent('#slipPrev')).includes('ไม่ใช่ QR ของสลิปโอนเงิน'));
  push('ผิดแบบก็ยังส่งได้', !(await cust.locator('#sendBtn').isDisabled()));
  await sendNow();
  const o5 = await latestOrder();
  push('ออเดอร์จดว่า QR ผิดแบบ', o5 && o5.slipQr === 'bad' && o5.slipRef === '');
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(700);
  await seller.evaluate(id => viewSlip(id), o5.id);
  await seller.waitForTimeout(1100);
  push('ฝั่งร้านบอกว่า QR ไม่ใช่แบบของสลิปธนาคาร',
    (await seller.textContent('#dlg')).includes('ไม่ใช่แบบของสลิปธนาคาร'));
  await seller.screenshot({ path: SHOT + '/slipqr-seller-bad.png' });
  await shut(seller);

  /* ---------- 6) QR หน้าตาเหมือนสลิป แต่รหัสตรวจสอบไม่ตรง (แก้ตัวเลขทีหลัง) ---------- */
  await toPay();
  await cust.setInputFiles('#slipPick', IMG.crc);
  await cust.waitForTimeout(300); await waitRead();
  push('รหัสตรวจสอบไม่ตรง = ผิดแบบ ไม่เอาเลขไปใช้', await cust.evaluate(() => slipQ.st) === 'bad');

  /* ---------- 7) ภาพหน้าจอขนาดจริง (1080×2340) ยังอ่านได้ ---------- */
  const getsBefore = jsqrGET;        // หน้าเดิม เพิ่งอ่านไปแล้วหนึ่งใบ (ข้อ 6)
  await cust.setInputFiles('#slipPick', IMG.big);
  await cust.waitForTimeout(300); await waitRead();
  const qb = await cust.evaluate(() => slipQ);
  push('ภาพหน้าจอมือถือขนาดจริง อ่าน QR ได้', qb.st === 'ok' && qb.ref === R2);
  push('แนบใบที่สองในหน้าเดิม ไม่โหลดตัวอ่านซ้ำ', jsqrGET === getsBefore);

  /* ---------- 8) เปลี่ยนรูประหว่างกำลังอ่าน ผลของรูปเก่าต้องไม่มาทับ ---------- */
  await cust.evaluate(() => clearSlip());
  push('เอาสลิปออกแล้วผลอ่าน QR ล้างไปด้วย', await cust.evaluate(() => slipQ.st) === '');
  /* ให้รูปใหญ่อ่านจบ "ทีหลัง" รูปที่เลือกใหม่แน่ ๆ (ไม่ปล่อยให้ดวง)
     ไม่งั้นบางรอบรูปเล็กจบทีหลังเอง แล้วข้อนี้ผ่านทั้งที่ไม่มีตัวกัน */
  await cust.evaluate(() => {
    const orig = readSlipQR;
    window.readSlipQR = async img => {
      const r = await orig(img);
      if(img.width > 1000) await new Promise(z => setTimeout(z, 1200));
      return r;
    };
  });
  await cust.setInputFiles('#slipPick', IMG.big);    // รูปใหญ่ อ่านนาน
  await cust.waitForTimeout(150);
  await cust.setInputFiles('#slipPick', IMG.none);   // เปลี่ยนใจทันที
  await cust.waitForTimeout(1800); await waitRead();
  push('เปลี่ยนรูประหว่างอ่าน ได้ผลของรูปล่าสุด', await cust.evaluate(() => slipQ.st) === 'none');

  /* ---------- 9) โหลดตัวอ่านไม่ขึ้น → ยังส่งได้ และร้านต้องไม่เตือนผิด ---------- */
  const c2Ctx = await b.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block' });
  const c2 = await c2Ctx.newPage();
  c2.on('pageerror', e => push('หน้าลูกค้า (ตัวอ่านล่ม) ตาย: ' + e.message.slice(0,60), false));
  await c2.route('**/lib/jsqr.js', r => r.abort());
  await c2.goto(`${APP}/order.html?s=${KEY}&c=${encodeURIComponent(CLOUD)}`);
  await c2.waitForTimeout(800);
  await c2.locator('#view button.li').first().click();
  await c2.waitForTimeout(900);
  await c2.locator('button', { hasText:'ใส่ตะกร้า' }).click();
  await c2.waitForTimeout(700);
  await c2.locator('#barBtn').click();
  await c2.waitForTimeout(800);
  await c2.locator('#payBtn').click();
  await c2.waitForTimeout(700);
  await c2.setInputFiles('#slipPick', IMG.r1a);
  await c2.waitForTimeout(1200);
  push('ตัวอ่านล่ม ปุ่มส่งยังกดได้ (ไม่ค้าง "กำลังอ่าน")', !(await c2.locator('#sendBtn').isDisabled()));
  push('ตัวอ่านล่ม ไม่บอกลูกค้าว่าไม่เจอ QR ผิด ๆ', await c2.locator('.slipq.warn').count() === 0);
  await tap(c2.locator('#sendBtn'), 'ตัวอ่านล่มก็ยังมีปุ่มส่ง');
  await c2.waitForTimeout(1500);
  const o9 = await latestOrder();
  push('ตัวอ่านล่ม ออเดอร์ยังส่งถึง', o9 && o9.paid === true && o9.slipQr === '' && !o9.slipRef);
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(700);
  await seller.evaluate(id => viewSlip(id), o9.id);
  await seller.waitForTimeout(1100);
  const d9 = (await seller.textContent('#dlg'));
  push('ไม่ได้อ่าน QR ฝั่งร้านไม่เตือนว่าไม่มี QR (ดีกว่าเตือนผิด)',
    !d9.includes('ไม่เจอ QR') && !d9.includes('ไม่ใช่แบบของสลิปธนาคาร'));
  push('ไม่ได้อ่าน QR ยังจับซ้ำด้วยการเทียบรูปได้ (รูปเดียวกับใบแรก)',
    await seller.evaluate(id => (slipSeenBefore(cloudOrders.find(x => x.id === id)) || {}).id, o9.id) === o1.id);
  await shut(seller);

  // ของที่จำไว้ในเครื่องต้องมีเลขอ้างอิงด้วย ไม่งั้นข้ามวันแล้ว (ออเดอร์ถูกลบ) จะจับด้วยเลขไม่ได้
  push('เครื่องร้านจำเลขอ้างอิงไว้ด้วย (ข้ามวันก็ยังจับได้)',
    await seller.evaluate(r => (db.slipSeen || []).some(x => x.ref === r), '004:' + R1));

  await b.close();
  try{ fs.rmSync(DIR, { recursive:true, force:true }); }catch(e){}

  let bad = 0;
  ok.forEach(([n2, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n2}`); if(!v) bad++; });
  console.log(bad ? `\n  ตก ${bad} ข้อ\n` : `\n  ผ่านทุกข้อ (${ok.length} ข้อ)\n`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
