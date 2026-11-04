/* แจ้งเตือนออเดอร์เข้า LINE — ทดสอบกับ "ตัวกลางจำลอง"

   ของจริงตัวกลางอยู่บน Google Apps Script (line-relay.gs) ยิงต่อไปหา LINE
   ชุดนี้เอาเซิร์ฟเวอร์เล็ก ๆ มายืนแทน แล้วดูว่าแอปส่งอะไรออกไปบ้าง

   สองข้อที่สำคัญที่สุด:
   1. **ลิงก์ตัวกลางห้ามขึ้นคลาวด์** ใครได้ไปก็ส่งข้อความเข้าไลน์ร้านได้
   2. **ต้องส่งแบบ text/plain** ไม่งั้นเบราว์เซอร์ยิง preflight (OPTIONS)
      ซึ่ง Apps Script ตอบไม่ได้ แล้วจะส่งไม่ออกทั้งที่ลิงก์ถูก — เงียบแบบไม่มี error

   node tools/fake-cloud.js &  node serve.js &  node tools/e2e-line.js  */

const { chromium } = require('playwright');
const http = require('http');

const APP   = process.env.APP_URL || 'http://127.0.0.1:8787';
const CLOUD = 'http://127.0.0.1:8788';
const RELAY_PORT = 8790;
const RELAY = `http://127.0.0.1:${RELAY_PORT}/exec`;
const KEY   = 'linekey1';

const ok = [];
const push = (name, v) => ok.push([name, !!v]);

/* อ่านข้อความที่ส่งไปตัวกลาง แบบไม่ระเบิดถ้ายังไม่มีอะไรส่งไปเลย
   เคยพลาดมาแล้ว: เขียน got[0].text ตรง ๆ พอ got ว่างเทสต์ล้มทั้งชุด
   ไม่รายงานผลสักข้อ กลายเป็นจับบั๊กได้แต่ไม่บอกว่าจับอะไรได้ */
const sent = i => (got[(i < 0 ? got.length + i : i)] || {}).text || '';
const sentType = i => (got[(i < 0 ? got.length + i : i)] || {}).type || '';

async function tap(loc, why){
  if(await loc.count() === 0){ push(why, false); return false; }
  await loc.first().click();
  return true;
}

/* ---------- ตัวกลางจำลอง ---------- */
const got = [];            // ข้อความที่ถูกส่งมา
let preflight = 0;         // ถ้าโดน OPTIONS แปลว่าแอปส่งผิดชนิด
let mode = 'ok';           // ok | quota | dead

const relay = http.createServer((req, res) => {
  const head = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if(req.method === 'OPTIONS'){ preflight++; res.writeHead(204, head); res.end(); return; }
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    let o = {};
    try{ o = JSON.parse(body); }catch(e){}
    got.push({ text: String(o.text || ''), type: String(req.headers['content-type'] || '') });
    if(mode === 'quota'){
      res.writeHead(200, head);
      res.end(JSON.stringify({ ok:false, why:'โควตาข้อความของ LINE เดือนนี้หมดแล้ว' }));
      return;
    }
    res.writeHead(200, head);
    res.end(JSON.stringify({ ok:true }));
  });
});

const put = (p, b) => fetch(`${CLOUD}/${p}.json`, {
  method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b)
}).then(r => r.json());
const get = p => fetch(`${CLOUD}/${p}.json`).then(r => r.json());

(async () => {
  await fetch(CLOUD + '/__reset').catch(() => {});
  await new Promise(r => relay.listen(RELAY_PORT, r));

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
      ingredients:[{ id:'i1', name:'แป้งลับเฉพาะ', packQty:1000, unit:'กรัม', packPrice:45 }],
      // ยอดขายย้อนหลังของจริง ใช้เช็กว่ามันไม่หลุดไปในข้อความ LINE
      sales:[{ id:'s1', d:'2026-01-05', t:'10:00', menuId:'m1', name:'เครปกรอบ',
               qty:1, addons:[], total: 9999 }],
      expenses:[],
      fixed:{ rent:3000, electric:0, gas:0, water:0, other:0, days:26, labor:0 }
    };
    localStorage.setItem('crepe-hub-v1', JSON.stringify({ shops:[d], active:'sh1' }));
  }, CLOUD);
  await seller.reload();
  await seller.waitForTimeout(400);

  await seller.evaluate(async url => {
    db.orderKey = 'linekey1'; db.orderOn = 1; db.lineUrl = url;
    save(); await publishMenu();
  }, RELAY);

  /* ---------- ลิงก์ตัวกลางห้ามหลุดขึ้นคลาวด์ ---------- */
  const pub = JSON.stringify(await get(`s/${KEY}/menu`));
  push('ใบเมนูขึ้นคลาวด์แล้ว', pub.includes('เครปกรอบ'));
  push('ลิงก์แจ้งเตือน LINE ไม่หลุดขึ้นคลาวด์', !pub.includes('8790') && !pub.includes('lineUrl'));

  /* ---------- ลูกค้าสั่ง แล้วต้องเด้งเข้า LINE ---------- */
  const cust = await b.newPage({ viewport:{width:390,height:844} });
  cust.on('pageerror', e => push('หน้าลูกค้าตาย: ' + e.message.slice(0,60), false));
  const order = async () => {
    await cust.goto(`${APP}/order.html?s=${KEY}&c=${encodeURIComponent(CLOUD)}`);
    await cust.waitForTimeout(800);
    await cust.locator('#view button.li').first().click();
    await cust.waitForTimeout(900);
    await cust.locator('button', { hasText:'ใส่ตะกร้า' }).click();
    await cust.waitForTimeout(700);
    await cust.locator('#barBtn').click();
    await cust.waitForTimeout(800);
    await cust.fill('#who', 'โอ๋');
    await cust.locator('#laterBtn, #sendBtn').first().click();
    await cust.waitForTimeout(1400);
  };
  await order();

  // รอบแรกหลังเปิดแอปถือว่าเป็นของเก่า ต้องยิงสองรอบถึงจะนับว่า "ใหม่"
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(900);
  push('รอบแรกหลังเปิดแอปยังไม่เด้ง LINE (ไม่ใช่ออเดอร์ใหม่)', got.length === 0);

  await cust.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await order();
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(1200);

  push('มีออเดอร์ใหม่แล้วส่งเข้า LINE จริง', got.length === 1);
  const msg = sent(0);
  push('ข้อความบอกว่ามีออเดอร์ใหม่', msg.includes('มีออเดอร์ใหม่'));
  push('บอกเลขคิว แม่ค้าเรียกได้เลย', /คิวที่ \d+/.test(msg));
  push('บอกว่าลูกค้าสั่งอะไร', msg.includes('เครปกรอบ'));
  push('บอกยอดเงิน', msg.includes('15'));
  push('บอกชื่อลูกค้า', msg.includes('โอ๋'));

  /* ---------- ห้ามเอาความลับของร้านไปโผล่ในไลน์ ---------- */
  push('ไม่มีวัตถุดิบ/ต้นทุนหลุดไปในข้อความ',
    !/แป้งลับเฉพาะ|ต้นทุน|packPrice/.test(msg));
  push('ไม่มีกำไร/ยอดขายย้อนหลังหลุดไป', !/กำไร|9999/.test(msg));
  push('ไม่มีค่าเช่าหลุดไป', !msg.includes('3000'));

  /* ---------- ต้องส่งแบบ text/plain ไม่งั้นโดน preflight แล้วเงียบ ---------- */
  push('ส่งเป็น text/plain (ไม่โดน preflight)',
    sentType(0).includes('text/plain'));
  push('เบราว์เซอร์ไม่ได้ยิง OPTIONS มาเลย', preflight === 0);

  /* ---------- ตัวนับโควตา ---------- */
  push('นับจำนวนข้อความที่ส่งไปแล้ว', await seller.evaluate(() => n(db.lineNo)) === 1);
  push('จำว่าเป็นของเดือนไหน',
    await seller.evaluate(() => /^\d{4}-\d{2}$/.test(String(db.lineMonth || ''))));
  push('ขึ้นเดือนใหม่แล้วเริ่มนับ 0 ใหม่', await seller.evaluate(() => {
    db.lineMonth = '2000-01'; db.lineNo = 99; save();
    const used = lineUsed();
    return used === 0 && n(db.lineNo) === 0;
  }));

  /* ---------- ปุ่มส่งข้อความทดสอบ ---------- */
  const before = got.length;
  await seller.evaluate(() => { db.lineNo = 0; save(); orderSetupDialog(); });
  await seller.waitForTimeout(900);
  push('หน้าตั้งค่ามีช่องใส่ลิงก์แจ้งเตือน LINE', await seller.locator('#lineBox').count() === 1);
  push('หน้าตั้งค่าบอกว่าเดือนนี้ส่งไปกี่ข้อความ',
    (await seller.textContent('#dlg')).includes('เดือนนี้ส่งไปแล้ว'));
  await tap(seller.locator('#dlg button', { hasText:'ส่งข้อความทดสอบ' }), 'มีปุ่มส่งข้อความทดสอบ');
  await seller.waitForTimeout(1500);
  push('กดทดสอบแล้วส่งถึงตัวกลางจริง', got.length === before + 1);
  push('ข้อความทดสอบบอกว่าเป็นการทดสอบ',
    sent(-1).includes('ทดสอบ'));

  /* ---------- ตัวกลางบอกว่าส่งไม่สำเร็จ ต้องไม่เงียบ ---------- */
  mode = 'quota';
  const usedBefore = await seller.evaluate(() => n(db.lineNo));
  const why = await seller.evaluate(async () => {
    const okk = await sendLine('ลองตอนโควตาหมด');
    return { okk, err: lineErr, used: n(db.lineNo) };
  });
  push('โควตาหมดแล้ว sendLine คืนว่าไม่สำเร็จ', why.okk === false);
  push('บอกเหตุผลตรง ๆ ว่าโควตาหมด', String(why.err).includes('โควตา'));
  push('ส่งไม่สำเร็จต้องไม่นับเพิ่มในตัวนับ', why.used === usedBefore);

  await seller.evaluate(() => { dlg.close(); });
  await seller.waitForTimeout(900);
  await seller.evaluate(() => orderSetupDialog());
  await seller.waitForTimeout(900);
  push('หน้าตั้งค่าโชว์เหตุผลที่ส่งไม่สำเร็จให้เห็น',
    (await seller.textContent('#dlg')).includes('ล่าสุดส่งไม่สำเร็จ'));

  /* ---------- ใกล้เต็ม / เต็มโควตา ต้องเตือนล่วงหน้า ---------- */
  await seller.evaluate(() => { dlg.close(); });
  await seller.waitForTimeout(900);
  await seller.evaluate(() => { db.lineNo = LINE_MAX - 10; save(); orderSetupDialog(); });
  await seller.waitForTimeout(900);
  push('ใกล้เต็มโควตาแล้วขึ้นเตือนล่วงหน้า',
    (await seller.textContent('#dlg')).includes('ใกล้เต็มโควตา'));
  await seller.evaluate(() => { dlg.close(); });
  await seller.waitForTimeout(900);
  await seller.evaluate(() => { db.lineNo = LINE_MAX; save(); orderSetupDialog(); });
  await seller.waitForTimeout(900);
  push('เต็มโควตาแล้วบอกว่า LINE จะไม่ส่งให้อีกจนขึ้นเดือนใหม่',
    (await seller.textContent('#dlg')).includes('จนขึ้นเดือนใหม่'));
  await seller.evaluate(() => { dlg.close(); });
  await seller.waitForTimeout(900);

  /* ---------- ตัวกลางล่ม ต้องไม่ลามไปทำออเดอร์พัง ---------- */
  mode = 'ok';
  await new Promise(r => relay.close(r));
  await cust.evaluate(() => { try{ localStorage.clear(); }catch(e){} });
  await order();
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(1500);
  push('ตัวกลางล่ม ออเดอร์ยังเข้าเครื่องแม่ค้าตามปกติ',
    await seller.evaluate(() => cloudOrders.length) >= 2);
  push('ตัวกลางล่มแล้วบอกว่าส่งไม่ถึง',
    String(await seller.evaluate(() => lineErr)).includes('ส่งไม่ถึงตัวกลาง'));

  /* ---------- ไม่ได้ใส่ลิงก์ = ไม่ยิงอะไรเลย ---------- */
  push('ไม่ได้ใส่ลิงก์ ไม่ต้องไปยิงที่ไหน', await seller.evaluate(async () => {
    db.lineUrl = ''; save();
    return (await sendLine('ไม่ควรถูกส่ง')) === false;
  }));

  /* ---------- กู้ข้อมูลแล้วลิงก์ต้องไม่หาย ---------- */
  push('กู้ข้อมูลทับแล้วลิงก์แจ้งเตือนยังอยู่', await seller.evaluate(() => {
    db.lineUrl = 'http://127.0.0.1:8790/exec'; save();
    setShopData({ menus:[], groups:[], sales:[], expenses:[], ingredients:[] });
    return db.lineUrl === 'http://127.0.0.1:8790/exec';
  }));

  await b.close();
  let bad = 0;
  ok.forEach(([n2, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n2}`); if(!v) bad++; });
  console.log(bad ? `\n  ตก ${bad} ข้อ\n` : `\n  ผ่านทุกข้อ (${ok.length} ข้อ)\n`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
