// ทดสอบเส้นทางจริงทั้งเส้น: แม่ค้าเปิดรับออเดอร์ → ลูกค้าสั่ง → เด้งเข้าเครื่องแม่ค้า
//   → แม่ค้ากดรับ (ลูกค้าเห็นเลขคิว) → กดเสร็จ+รับเงิน (กลายเป็นยอดขาย)
//
//   node tools/fake-cloud.js &   node serve.js &   node tools/e2e-order.js
//
// ใช้ที่เก็บออเดอร์จำลอง ไม่ได้ยิง Firebase จริง

const { chromium } = require('playwright');

const APP   = 'http://127.0.0.1:8787';
const CLOUD = 'http://127.0.0.1:8788';
// ภาพหน้าจอไปลงที่ชั่วคราว ไม่ให้ไปรกอยู่ในโฟลเดอร์โปรเจกต์
const SHOT  = process.env.SHOT_DIR || require('os').tmpdir();

const ok = [];
const push = (name, v) => { ok.push([name, !!v]); };

(async () => {
  await fetch(CLOUD + '/__reset', { method:'GET' }).catch(() => {});

  const b = await chromium.launch({ args:['--no-sandbox'] });

  /* ---------- เครื่องแม่ค้า ---------- */
  const seller = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  await seller.goto(APP + '/index.html');
  await seller.evaluate(cloud => {
    localStorage.setItem('crepe-cloud', cloud);
    const d = {
      id:'sh1', shopName:'ร้านเครปทดสอบ', shopBranch:'หน้าโรงเรียน', shopOpen:1,
      groups:[{ id:'g1', name:'ไส้คาว', items:[
        {id:'a1', name:'ไส้กรอก', price:5}, {id:'a2', name:"ไข่ไก่ด'ล", price:10}]}],
      menus:[{ id:'m1', name:'เครปกรอบ', price:15, groupIds:['g1'], items:[] },
             { id:'m2', name:'เครปนุ่ม', price:20, groupIds:['g1'], items:[] }],
      ingredients:[{id:'i1', name:'แป้ง', packQty:1000, unit:'กรัม', packPrice:45}],
      sales:[], expenses:[], fixed:{rent:3000, electric:0, gas:0, water:0, other:0, days:26, labor:0}
    };
    localStorage.setItem('crepe-hub-v1', JSON.stringify({shops:[d], active:'sh1'}));
  }, CLOUD);
  await seller.reload();
  await seller.waitForTimeout(500);

  // เปิดรับออเดอร์
  const key = await seller.evaluate(async () => {
    db.orderKey = 'testkey123';
    db.orderOn = 1;
    save();
    await publishMenu();
    startOrderWatch();
    return db.orderKey;
  });
  push('แม่ค้าเปิดรับออเดอร์ได้', key === 'testkey123');

  // ใบเมนูขึ้นไปถึงที่เก็บจริงไหม และมีแต่ของที่ควรขึ้น
  const pub = await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json();
  push('ใบเมนูขึ้นไปถึงที่เก็บ', pub && Array.isArray(pub.menus) && pub.menus.length === 2);
  push('ใบเมนูมีไส้ให้ลูกค้าเลือก', pub.menus[0].groups[0].items.length === 2);
  const leak = JSON.stringify(pub);
  push('ไม่มีต้นทุน/วัตถุดิบหลุดไปกับใบเมนู', !/แป้ง|packPrice|ingredients/.test(leak));
  push('ไม่มีค่าเช่า/รายจ่ายหลุดไปกับใบเมนู', !/3000|rent|fixed/.test(leak));
  push('ไม่มียอดขายย้อนหลังหลุดไป', !/sales|expenses/.test(leak));

  /* ---------- เครื่องลูกค้า ---------- */
  const cust = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  await cust.goto(`${APP}/order.html?s=${key}&c=${encodeURIComponent(CLOUD)}`);
  await cust.waitForTimeout(600);

  push('ลูกค้าเห็นชื่อร้าน', (await cust.textContent('#shopName')).includes('ร้านเครปทดสอบ'));
  push('ลูกค้าเห็นเมนูครบ', (await cust.locator('.m').count()) === 2);

  // เลือกเมนูแรก ติ๊กไส้ที่มีเครื่องหมาย ' ในชื่อ (จุดที่เคยทำปุ่มตายเงียบ ๆ)
  await cust.locator('.m').first().click();
  await cust.waitForTimeout(300);
  await cust.locator('.tops button', { hasText: "ไข่ไก่ด'ล" }).click();
  await cust.waitForTimeout(150);
  push("ติ๊กไส้ที่ชื่อมี ' ได้", await cust.locator('.tops button.on').count() === 1);

  await cust.locator('.qbtn', { hasText:'+' }).click();        // 2 ชิ้น
  await cust.locator('button', { hasText:'ใส่ตะกร้า' }).click();
  await cust.waitForTimeout(300);

  const total = await cust.textContent('#barTotal');
  push('คิดเงินถูก (แป้ง 15 + ไข่ 10) × 2 = 50', total.replace(/[^\d]/g,'') === '50');

  await cust.screenshot({ path: SHOT + '/cust-cart.png' });

  await cust.locator('#barBtn').click();
  await cust.waitForTimeout(300);
  await cust.fill('#who', 'โอ๋');
  await cust.fill('#note', 'ไม่เผ็ด');
  await cust.locator('#sendBtn').click();
  await cust.waitForTimeout(700);

  push('ส่งออเดอร์แล้วเข้าหน้ารอคิว', (await cust.locator('.qbig').count()) === 1);

  /* ---------- ออเดอร์เด้งถึงแม่ค้าไหม ---------- */
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(500);
  const got = await seller.evaluate(() => cloudOrders.length);
  push('ออเดอร์เด้งเข้าเครื่องแม่ค้า', got === 1);

  const cardTxt = await seller.evaluate(() => {
    render();
    const c = document.querySelector('.ord');
    return c ? c.textContent : '';
  });
  push('การ์ดออเดอร์โชว์ของที่ลูกค้าสั่ง', /เครปกรอบ/.test(cardTxt) && /โอ๋/.test(cardTxt) && /ไม่เผ็ด/.test(cardTxt));

  await seller.screenshot({ path: SHOT + '/seller-order.png' });

  /* ---------- แม่ค้ากดรับ ---------- */
  await seller.evaluate(async () => { await takeOrder(cloudOrders[0].id); });
  await seller.waitForTimeout(400);
  push('กดรับแล้วได้เลขคิว 1', await seller.evaluate(() => db.queueNo) === 1);

  await cust.evaluate(() => refreshMine());
  await cust.waitForTimeout(500);
  const qtxt = await cust.textContent('.qbig');
  push('ลูกค้าเห็นเลขคิวของตัวเอง', qtxt.includes('1'));
  push('ลูกค้าเห็นว่ากำลังทำอยู่', (await cust.textContent('.steps')).includes('กำลังทำ'));

  await cust.screenshot({ path: SHOT + '/cust-queue.png' });

  /* ---------- เสร็จ + รับเงิน ---------- */
  const before = await seller.evaluate(() => (db.sales||[]).length);
  await seller.evaluate(async () => { await finishOrder(cloudOrders[0].id); });
  await seller.waitForTimeout(400);

  const sales = await seller.evaluate(() => db.sales.map(s => ({n:s.name, q:s.qty, t:s.total, m:s.menuId, a:(s.addons||[]).length})));
  push('ออเดอร์กลายเป็นยอดขายจริง', before === 0 && sales.length === 1 && sales[0].t === 50 && sales[0].q === 2);
  push('ยอดขายผูกกับเมนูเดิมถูกตัว', sales[0].m === 'm1');
  push('ไส้ที่ลูกค้าเลือกถูกบันทึกไว้ด้วย', sales[0].a === 1);
  push('ออเดอร์ที่จบแล้วหายออกจากรายการค้าง', await seller.evaluate(() => cloudOrders.length) === 0);

  await cust.evaluate(() => refreshMine());
  await cust.waitForTimeout(400);
  push('ลูกค้าเห็นว่าของเสร็จแล้ว', (await cust.textContent('.note')).includes('เสร็จแล้ว'));

  /* ---------- ร้านปิด = สั่งไม่ได้ ---------- */
  await seller.evaluate(async () => { db.shopOpen = 0; save(); await publishMenu(); });
  const cust2 = await b.newPage({ viewport:{width:390,height:844} });
  await cust2.goto(`${APP}/order.html?s=${key}&c=${encodeURIComponent(CLOUD)}`);
  await cust2.waitForTimeout(600);
  push('ร้านปิดอยู่ ลูกค้าสั่งไม่ได้', (await cust2.textContent('#view')).includes('ร้านปิดอยู่'));
  push('ร้านปิดอยู่ ไม่มีแถบสั่งโผล่', await cust2.locator('#bar[hidden]').count() === 1);

  /* ---------- เก็บกวาดออเดอร์เก่าทิ้งเอง ---------- */
  const DAY = 24*3600*1000, HR = 3600*1000;
  const put = async (id, o) => fetch(`${CLOUD}/s/${key}/orders/${id}.json`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(o) });

  await put('oldDone', { at: Date.now() - 2*DAY,   status:'done', total:10, items:[] });  // จบนานแล้ว → ลบ
  await put('oldStuck',{ at: Date.now() - 2*DAY,   status:'new',  total:10, items:[] });  // ค้างข้ามวัน → ลบ
  await put('newDone', { at: Date.now() - 1*HR,    status:'done', total:10, items:[] });  // เพิ่งจบ → เก็บไว้
  await put('newOrder',{ at: Date.now() - 1*60000, status:'new',  total:10,
                         items:[{id:'m1', name:'ของใหม่', qty:1, price:10, addons:[], total:10}] });

  await seller.evaluate(async () => { await clearOldOrders(); });
  await seller.waitForTimeout(600);

  const left = await (await fetch(`${CLOUD}/s/${key}/orders.json`)).json();
  const ids = Object.keys(left || {});
  push('ออเดอร์ที่จบไปนานแล้วถูกลบทิ้ง', !ids.includes('oldDone'));
  push('ออเดอร์ที่ค้างข้ามวันถูกลบทิ้ง', !ids.includes('oldStuck'));
  push('ออเดอร์ที่เพิ่งจบยังอยู่ (ลูกค้าอาจยังเปิดดูสถานะค้าง)', ids.includes('newDone'));
  push('ออเดอร์ใหม่ที่ยังไม่ได้รับ ไม่โดนลบไปด้วย', ids.includes('newOrder'));
  push('ลบแล้วหายจริง ไม่ใช่เหลือค่าว่างค้างไว้', left.oldDone === undefined);

  // เคลียร์ของที่เหลือ ไม่ให้ไปกวนเทสต์ข้อถัดไป
  await fetch(`${CLOUD}/s/${key}/orders.json`, { method:'PUT', body:'null' });
  await seller.evaluate(() => pollOrders());

  /* ---------- สองร้านต้องไม่เห็นออเดอร์ของกัน ---------- */
  // ร้าน B มีช่องของตัวเอง ลูกค้าที่สแกน QR ของ B ต้องไม่โผล่ไปที่เครื่องของ A
  await fetch(`${CLOUD}/s/otherkey999/orders.json`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ at:Date.now(), total:99, status:'new',
                           items:[{id:'zz', name:'ของร้านอื่น', qty:1, price:99, addons:[], total:99}] })
  });
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(400);
  push('ออเดอร์ของร้านอื่นไม่หลุดมาเครื่องนี้',
    await seller.evaluate(() => cloudOrders.some(o => (o.items||[]).some(i => i.name === 'ของร้านอื่น'))) === false);

  /* ---------- ลิงก์ร้านพาที่เก็บออเดอร์ไปด้วย ---------- */
  const helper = await b.newPage({ viewport:{width:390,height:844} });
  await helper.goto(APP + '/index.html');
  await helper.evaluate(() => localStorage.clear());   // เครื่องใหม่เอี่ยม ยังไม่เคยตั้งอะไร
  await helper.goto(`${APP}/index.html?shop=sh9&n=${encodeURIComponent('ร้านสาขาสอง')}&cb=${encodeURIComponent('https://example.firebasedatabase.app')}`);
  await helper.waitForTimeout(500);
  push('เครื่องที่รับลิงก์ร้านไป ได้ที่เก็บออเดอร์มาด้วยไม่ต้องตั้งเอง',
    await helper.evaluate(() => localStorage.getItem('crepe-cloud')) === 'https://example.firebasedatabase.app');
  push('ลิงก์ร้านยังผูกเครื่องกับร้านนั้นเหมือนเดิม',
    await helper.evaluate(() => db.shopName) === 'ร้านสาขาสอง');

  /* ---------- ลิงก์มั่ว ---------- */
  const cust3 = await b.newPage({ viewport:{width:390,height:844} });
  await cust3.goto(`${APP}/order.html?s=ไม่มีจริง&c=${encodeURIComponent(CLOUD)}`);
  await cust3.waitForTimeout(600);
  push('ลิงก์ที่ไม่มีร้านจริง ไม่พังแต่บอกให้รู้', (await cust3.textContent('#view')).includes('ยังไม่ได้เปิด'));

  await b.close();

  let bad = 0;
  ok.forEach(([n2, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n2}`); if(!v) bad++; });
  console.log(bad ? `\n  ตก ${bad} ข้อ\n` : '\n  ผ่านทุกข้อ\n');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
