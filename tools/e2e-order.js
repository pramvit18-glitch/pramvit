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
  push('ลูกค้าเห็นเมนูครบ', (await cust.locator('#view .li').count()) === 2);

  // เลือกเมนูแรก ติ๊กไส้ที่มีเครื่องหมาย ' ในชื่อ (จุดที่เคยทำปุ่มตายเงียบ ๆ)
  await cust.locator('#view .li').first().click();
  await cust.waitForTimeout(300);
  await cust.locator('.tops .top', { hasText: "ไข่ไก่ด'ล" }).click();
  await cust.waitForTimeout(150);
  push("ติ๊กไส้ที่ชื่อมี ' ได้", await cust.locator('.tops .top.on').count() === 1);

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
  push('ส่งแล้วมีคำขอบคุณให้ลูกค้า',
    (await cust.textContent('#view')).includes('ขอบคุณที่สั่ง'));
  // ลูกค้ายืนจ้องหน้านี้อยู่ ถ้านิ่งสนิทจะไม่แน่ใจว่าแอปยังทำงานไหม
  push('รอร้านกดรับ มีจุดสามจุดเด้งอยู่',
    await cust.locator('.qbig .dots i').count() === 3);
  push('แถบขั้นตอนที่ทำอยู่มีแสงวิ่ง',
    await cust.locator('.steps .step.cur').count() === 1);
  push('จุดเด้งจริง ไม่ใช่แค่มีคลาส',
    await cust.evaluate(() => {
      const el = document.querySelector('.qbig .dots i');
      return !!el && getComputedStyle(el).animationName === 'dot';
    }));

  /* ---------- ออเดอร์เด้งถึงแม่ค้าไหม ---------- */
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(500);
  const got = await seller.evaluate(() => cloudOrders.length);
  push('ออเดอร์เด้งเข้าเครื่องแม่ค้า', got === 1);

  /* เลขคิวต้องมาตั้งแต่ออเดอร์เข้า ไม่ต้องรอแม่ค้ากดรับ
     แม่ค้าจะได้เรียก "คิวที่ 1" ได้ทันที และลูกค้าเห็นเลขของตัวเองเลย */
  push('ออเดอร์ได้เลขคิวตั้งแต่เข้ามา ยังไม่ต้องกดรับ',
    await seller.evaluate(() => n(cloudOrders[0].no)) === 1);
  const cloudNo = await (await fetch(`${CLOUD}/s/${key}/orders.json`)).json();
  push('เลขคิวถูกส่งขึ้นที่เก็บให้ลูกค้าเห็นด้วย',
    Object.values(cloudNo).some(o => o.no === 1));

  /* เครื่องถูกล้างข้อมูลกลางวัน ตัวนับย้อนกลับไป 0 แล้วแจกเลขซ้ำกับคิวที่ค้างอยู่
     ลูกค้าสองคนได้เลขเดียวกัน เรียกคิวแล้วมาสองคน */
  await fetch(`${CLOUD}/s/${key}/orders.json`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ at:Date.now(), total:30, status:'new',
                           items:[{id:'m1', name:'ใบใหม่', qty:1, price:30, addons:[], total:30}] })
  });
  await seller.evaluate(() => { db.queueNo = 0; save(); });   // จำลองเครื่องที่โดนล้าง
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(800);
  const nos = await seller.evaluate(() => cloudOrders.map(o => n(o.no)));
  push('เครื่องโดนล้างข้อมูลกลางวัน ก็ไม่แจกเลขซ้ำ',
    nos.length === new Set(nos).size && nos.every(x => x > 0));
  push('ใบใหม่ได้เลขต่อจากของเดิม ไม่ย้อนกลับไป 1', Math.max(...nos) === 2);

  // เก็บกวาดใบที่เพิ่งใส่เข้าไป ไม่ให้ไปกวนข้อถัดไป
  await seller.evaluate(async () => {
    const extra = cloudOrders.find(o => (o.items||[]).some(i => i.name === 'ใบใหม่'));
    if(extra) await cloudReq('PATCH', `s/${db.orderKey}/orders`, { [extra.id]: null });
  });
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(500);

  /* แดชบอร์ดต้องเหลือแค่แถบเล็ก ไม่ใช่การ์ดเต็มที่กินจอแรกทั้งจอ */
  await seller.evaluate(() => { tab = 'today'; render(); });
  await seller.waitForTimeout(300);
  // ไม่มีแถบ = ของที่ตามมาอ่านไม่ได้ ต้องรายงานเป็นข้อตก ไม่ใช่ค้างรอจนล้มทั้งชุด
  const hasBar = await seller.locator('#orderInbox .obar').count() === 1;
  const barTxt = hasBar ? await seller.textContent('#orderInbox .obar') : '';
  push('แดชบอร์ดมีแถบแจ้งออเดอร์', hasBar);
  push('แถบบอกจำนวนออเดอร์ถูกต้อง', /\b1\b/.test(barTxt) && /1 ออเดอร์/.test(barTxt));
  push('แถบบอกด้วยว่าเป็นของอะไร', /เครปกรอบ/.test(barTxt));
  push('แดชบอร์ดไม่มีการ์ดออเดอร์เต็มมาแปะแล้ว',
    await seller.locator('#orderInbox .ord').count() === 0);

  /* กระดิ่งมุมบนขวา — ทางเข้าที่อยู่ที่เดิมตลอด แม้เลื่อนหน้าลงไปแล้ว */
  const hasBell = await seller.locator('#bellBtn:not([hidden])').count() === 1;
  push('มีกระดิ่งแจ้งออเดอร์มุมบนขวา', hasBell);
  push('กระดิ่งมีตัวเลขบอกจำนวน',
    hasBell && (await seller.evaluate(() => {
      const n = document.querySelector('#bellBtn .bell-n');
      return n ? n.textContent.trim() : '';
    })) === '1');
  push('กระดิ่งเป็นสีแดงตอนมีออเดอร์ค้าง',
    await seller.evaluate(() => document.getElementById('bellBtn').classList.contains('on')));
  push('กระดิ่งสั่นได้จริงตอนออเดอร์ใหม่เข้า',
    await seller.evaluate(() => {
      ringBell();
      const b = document.getElementById('bellBtn');
      return b.classList.contains('ring') && getComputedStyle(b).animationName === 'ring';
    }));

  await seller.screenshot({ path: SHOT + '/seller-bar.png' });

  /* แตะแถบแล้วเข้าหน้าออเดอร์เต็ม
     ถ้าไม่มีแถบก็เข้าหน้าตรง ๆ แทน จะได้รายงานเป็นข้อตก ไม่ใช่ค้างรอจนล้มทั้งชุด */
  if(await seller.locator('.obar').count()) await seller.locator('.obar').click();
  else await seller.evaluate(() => go('orders'));
  await seller.waitForTimeout(400);
  push('แตะแถบแล้วเข้าหน้าออเดอร์', await seller.evaluate(() => tab) === 'orders');
  push('หน้าออเดอร์ไม่มีแถบซ้ำอีกใบ', await seller.locator('.obar').count() === 0);
  const cardTxt = await seller.textContent('#view');
  push('หน้าออเดอร์โชว์ของที่ลูกค้าสั่ง',
    /เครปกรอบ/.test(cardTxt) && /โอ๋/.test(cardTxt) && /ไม่เผ็ด/.test(cardTxt));
  push('หน้าออเดอร์มีทางกลับแดชบอร์ด', await seller.locator('.btn.back').count() === 1);
  push('หัวหน้าบอกชื่อถูก ไม่ใช่ "ภาพรวม"',
    (await seller.textContent('#pageTitle')).includes('ออเดอร์จากลูกค้า'));
  push('หน้าออเดอร์แยกใบใหม่กับใบที่กำลังทำ',
    (await seller.textContent('#view')).includes('รอรับ'));

  await seller.screenshot({ path: SHOT + '/seller-order.png' });

  /* ---------- แม่ค้ากดรับ ---------- */
  await seller.evaluate(async () => { await takeOrder(cloudOrders[0].id); });
  await seller.waitForTimeout(400);
  // เลขของใบนี้ต้องไม่เปลี่ยนตอนกดรับ (ลูกค้าเห็นเลขไปแล้วตั้งแต่สั่ง)
  push('กดรับแล้วยังเป็นคิวเดิม ไม่ออกเลขใหม่',
    await seller.evaluate(() => n(cloudOrders[0].no)) === 1);

  await cust.evaluate(() => refreshMine());
  await cust.waitForTimeout(500);
  const qtxt = await cust.textContent('.qbig');
  push('ลูกค้าเห็นเลขคิวของตัวเอง', qtxt.includes('1'));
  push('ลูกค้าเห็นว่ากำลังทำอยู่', (await cust.textContent('.steps')).includes('กำลังทำ'));
  push('ได้เลขคิวแล้ว จุดเด้งหายไป เหลือเลขจริง',
    await cust.locator('.qbig .dots').count() === 0 && await cust.locator('.qbig b.live').count() === 1);
  push('เลขคิวหายใจอยู่ตอนร้านกำลังทำ',
    await cust.evaluate(() => {
      const el = document.querySelector('.qbig b.live');
      return !!el && getComputedStyle(el).animationName === 'breathe';
    }));

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
  const doneTxt = await cust.textContent('#view');
  push('ลูกค้าเห็นว่าของเสร็จแล้ว', doneTxt.includes('ของเสร็จแล้ว'));
  push('ของเสร็จแล้วมีคำขอบคุณปิดท้าย', doneTxt.includes('ขอบคุณที่อุดหนุน'));

  /* ---------- สั่งเพิ่มแล้วออเดอร์เดิมต้องไม่หาย ---------- */
  // ของเดิมกด "สั่งเพิ่ม" แล้วล้างออเดอร์เก่าทิ้ง ลูกค้าไม่รู้ว่าของตัวเองถึงไหน
  await cust.evaluate(() => backToMenu());
  await cust.waitForTimeout(300);
  push('กดสั่งเพิ่มแล้วออเดอร์เดิมยังอยู่',
    await cust.evaluate(() => sentList.length) === 1);
  // ไม่มีป้าย = ออเดอร์เดิมหายไปแล้ว ต้องรายงานเป็นข้อตก ไม่ใช่ปล่อยให้ค้างรอจนล้มทั้งชุด
  const hasBanner = await cust.locator('#view .banner').count() === 1;
  push('หน้าเลือกของมีป้ายพากลับไปดูคิว', hasBanner);
  if(hasBanner){
    await cust.locator('#view .banner').click();
    await cust.waitForTimeout(300);
  }
  push('แตะป้ายแล้วกลับไปดูคิวเดิมได้',
    hasBanner && (await cust.textContent('#view')).includes('ขอบคุณ'));

  // สั่งใบที่สองแล้วต้องเห็นทั้งสองใบ
  await cust.evaluate(() => backToMenu());
  await cust.waitForTimeout(300);
  await cust.locator('#view button.li').first().click();
  await cust.waitForTimeout(300);
  await cust.locator('button', { hasText:'ใส่ตะกร้า' }).click();
  await cust.waitForTimeout(300);
  await cust.locator('#barBtn').click();
  await cust.waitForTimeout(300);
  await cust.locator('#sendBtn').click();
  await cust.waitForTimeout(900);
  push('สั่งใบที่สองได้ และเก็บไว้ทั้งสองใบ',
    await cust.evaluate(() => sentList.length) === 2);
  push('หน้าคิวโชว์ออเดอร์ครบทุกใบ',
    await cust.locator('#view .qbig').count() === 2);

  /* ---------- ร้านปิด = สั่งไม่ได้ ---------- */
  await seller.evaluate(async () => { db.shopOpen = 0; save(); await publishMenu(); });
  const cust2 = await b.newPage({ viewport:{width:390,height:844} });
  await cust2.goto(`${APP}/order.html?s=${key}&c=${encodeURIComponent(CLOUD)}`);
  await cust2.waitForTimeout(600);
  push('ร้านปิดอยู่ ลูกค้าสั่งไม่ได้', (await cust2.textContent('#view')).includes('ร้านปิดอยู่'));
  push('ร้านปิดอยู่ ไม่มีแถบสั่งโผล่', await cust2.locator('#bar[hidden]').count() === 1);
  push('ร้านปิดอยู่ ไม่โชว์เมนูเลย', !(await cust2.textContent('#view')).includes('เครปกรอบ'));
  push('ร้านปิดอยู่ ขึ้นรูปใหญ่บอกสถานะ', await cust2.locator('#view .empty.big .empty-ic').count() === 1);

  /* ---------- แม่ค้ากดหยุดรับออเดอร์ = ลูกค้าต้องสั่งไม่ได้ ---------- */
  // เคยพลาด: ปิดแล้วไม่ได้บอกคลาวด์เลย ลูกค้ายังสั่งเข้ามาได้แต่ไม่มีใครเห็น
  await seller.evaluate(async () => {
    db.shopOpen = 1; db.orderOn = 1; save(); await publishMenu();   // เปิดกลับก่อน
  });
  const beforeOff = await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json();
  push('เปิดรับอยู่ ใบเมนูบอกว่ารับออเดอร์', beforeOff.taking === true);

  await seller.evaluate(async () => { await toggleOrders(); });     // กดหยุดรับ
  await seller.waitForTimeout(600);
  const afterOff = await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json();
  push('กดหยุดรับแล้ว ใบเมนูบอกว่าไม่รับแล้ว', afterOff.taking === false);

  const cust5 = await b.newPage({ viewport:{width:390,height:844} });
  await cust5.goto(`${APP}/order.html?s=${key}&c=${encodeURIComponent(CLOUD)}`);
  await cust5.waitForTimeout(600);
  const t5 = await cust5.textContent('#view');
  push('หยุดรับแล้ว ลูกค้าเปิดลิงก์ได้แต่สั่งไม่ได้', t5.includes('ยังไม่เปิดรับออเดอร์'));
  push('หยุดรับแล้ว ไม่มีแถบสั่งโผล่', await cust5.locator('#bar[hidden]').count() === 1);
  push('หยุดรับแล้ว ไม่โชว์เมนูเลย', !t5.includes('เครปกรอบ'));
  push('หยุดรับแล้ว ขึ้นรูปใหญ่บอกสถานะ', await cust5.locator('#view .empty.big .empty-ic').count() === 1);

  /* ---------- เปิดรับออเดอร์ตอนร้านปิดอยู่ ---------- */
  // เคยพลาด: มีสองสวิตช์ (ร้านเปิดไหม / รับออเดอร์ไหม) แม่ค้ากดเปิดรับออเดอร์
  // แต่ร้านยังปิดค้างอยู่ ลูกค้าเลยเห็น "ร้านปิดอยู่" แล้วแม่ค้างงว่าทำไม
  await seller.evaluate(async () => {
    db.shopOpen = 0; db.orderOn = 0; save(); await publishMenu();
  });
  await seller.evaluate(async () => { await toggleOrders(); });   // กดเปิดรับออเดอร์
  await seller.waitForTimeout(700);
  push('เปิดรับออเดอร์ตอนร้านปิด ระบบเปิดร้านให้ด้วย',
    await seller.evaluate(() => !!db.shopOpen) === true);
  const openedMenu = await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json();
  push('คลาวด์บอกว่าร้านเปิดและรับออเดอร์อยู่',
    openedMenu.open === true && openedMenu.taking === true);

  const cust6 = await b.newPage({ viewport:{width:390,height:844} });
  await cust6.goto(`${APP}/order.html?s=${key}&c=${encodeURIComponent(CLOUD)}`);
  await cust6.waitForTimeout(600);
  const t6 = await cust6.textContent('#view');
  push('ลูกค้าไม่เจอ "ร้านปิดอยู่" แล้ว', !t6.includes('ร้านปิดอยู่'));
  push('ลูกค้ากดสั่งได้จริง', (await cust6.locator('#view button.li').count()) === 2);

  /* ---------- ปิดร้านตอนรับออเดอร์อยู่ ต้องถึงลูกค้าเอง ---------- */
  await seller.evaluate(() => { toggleShopOpen(); });   // ไม่ได้สั่งเผยแพร่เอง
  await seller.waitForTimeout(2500);                    // publishMenuSoon หน่วง 1.5 วิ
  const closedMenu = await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json();
  push('กดปิดร้าน ลูกค้ารู้เองโดยไม่ต้องสั่งเผยแพร่', closedMenu.open === false);

  // เปิดกลับไว้ให้ข้อถัด ๆ ไปใช้ต่อ
  await seller.evaluate(async () => { db.shopOpen = 1; db.orderOn = 1; save(); await publishMenu(); });

  /* ---------- หา URL ของที่เก็บจากชื่อโปรเจกต์ ---------- */
  // เจ้าของร้านไม่ควรต้องรู้ว่า URL จริงมีชื่อโซนปนอยู่
  // ดักคำขอที่ยิงไปหา Firebase แล้วตอบแทน จะได้ทดสอบโดยไม่ต้องมีเน็ตออกนอก
  await seller.route('**/*.firebasedatabase.app/**', r =>
    r.fulfill({ status: r.request().url().includes('asia-southeast1') ? 401 : 404, body:'{}' }));
  await seller.route('**/*.firebaseio.com/**', r => r.fulfill({ status:404, body:'{}' }));

  const okZone = 'https://pramvit-order-default-rtdb.asia-southeast1.firebasedatabase.app';
  push('พิมพ์ชื่อโปรเจกต์เปล่า ๆ แล้วหา URL เจอ',
    await seller.evaluate(() => resolveCloud('pramvit-order')) === okZone);
  push('วางลิงก์หน้า console มา ก็ดึงชื่อโปรเจกต์ออกมาได้',
    await seller.evaluate(() => resolveCloud('https://console.firebase.google.com/u/0/project/pramvit-order/overview')) === okZone);
  push('กฎไม่ให้อ่าน (401) ก็ยังนับว่าที่เก็บมีอยู่จริง',
    await seller.evaluate(u => liveCloud(u), okZone) === true);
  push('ชื่อโปรเจกต์ที่ไม่มีจริง ตอบกลับว่าหาไม่เจอ',
    await seller.evaluate(() => resolveCloud('ไม่มีโปรเจกต์นี้')) === '');
  await seller.unroute('**/*.firebasedatabase.app/**');
  await seller.unroute('**/*.firebaseio.com/**');

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

  /* ---------- เปิดลิงก์ร้านแล้วแอปต้องไม่ล้มกลางคัน ---------- */
  // เคยพังมาแล้ว: applyShopLink() ถูกเรียกก่อนตัวแปรด้านล่างถูกประกาศ
  // สคริปต์ทั้งแอปโยน ReferenceError แล้วหยุดกลางคันแบบเงียบ ๆ
  // หน้าตาแอปยังขึ้นบางส่วนเลยดูเหมือนปกติ แต่ปุ่มทั้งหมดตาย
  const errs = [];
  const probe = await b.newPage({ viewport:{width:390,height:844} });
  probe.on('pageerror', e => errs.push(String(e)));
  await probe.goto(APP + '/index.html');
  await probe.evaluate(() => localStorage.clear());
  await probe.goto(`${APP}/index.html?shop=sh7&n=${encodeURIComponent('ร้านลิงก์')}&k=abcdefghij&o=1`);
  await probe.waitForTimeout(600);
  // ถ้าสคริปต์ตายจริง การถามค่าจะโยน error ออกมา ต้องรับไว้เองแล้วรายงานเป็นข้อตก
  // ไม่งั้นมันพาล้มทั้งชุดเทสต์จนไม่รู้ว่าข้ออื่นเป็นยังไง
  const ask = async (fn, fallback) => { try{ return await probe.evaluate(fn); }catch(e){ return fallback; } };

  push('เปิดลิงก์ร้านแล้วไม่มี error หลุดออกมา', errs.length === 0);
  push('สคริปต์รันจบไฟล์ ฟังก์ชันท้าย ๆ ยังเรียกได้',
    await ask(() => typeof save === 'function' && typeof cloudReady === 'function'
                 && typeof orderSetupDialog === 'function', false) === true);
  push('หน้าแอปวาดขึ้นจริง ไม่ได้ค้างเปล่า',
    (await ask(() => document.getElementById('view').innerHTML.length, 0)) > 500);
  push('ปุ่มแถบล่างใช้ได้ (สคริปต์ไม่ตาย)',
    (await ask(() => document.querySelectorAll('.bottomnav button').length, 0)) >= 4);

  /* ---------- ลิงก์ร้านต้องพารหัสช่องรับออเดอร์ไปด้วย ---------- */
  // ไม่งั้นเครื่องปลายทางสร้างรหัสใหม่ของตัวเอง กลายเป็นคนละช่องกับ QR หน้าร้าน
  const madeLink = await seller.evaluate(() => shopLink(db.id));
  push('ลิงก์ร้านมีรหัสช่องรับออเดอร์อยู่ด้วย', madeLink.includes('k=' + 'testkey123'));
  push('ลิงก์ร้านบอกด้วยว่าเปิดรับออเดอร์อยู่', madeLink.includes('o=1'));

  const branch = await b.newPage({ viewport:{width:390,height:844} });
  await branch.goto(APP + '/index.html');
  await branch.evaluate(() => localStorage.clear());
  await branch.goto(`${APP}/index.html?shop=sh1&n=${encodeURIComponent('สาขาสาม')}&k=testkey123&o=1`);
  await branch.waitForTimeout(500);
  push('เครื่องที่รับลิงก์ไป ฟังช่องเดียวกับ QR หน้าร้าน',
    await branch.evaluate(() => db.orderKey) === 'testkey123');
  push('เครื่องที่รับลิงก์ไป เปิดรับออเดอร์ให้เลย',
    await branch.evaluate(() => !!db.orderOn) === true);

  /* ---------- เครื่องที่ยังไม่มีเมนู ต้องไม่ไปทับเมนูจริง ---------- */
  const menuWas = JSON.stringify(await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json());
  await branch.evaluate(cloud => localStorage.setItem('crepe-cloud', cloud), CLOUD);
  await branch.reload();
  await branch.waitForTimeout(400);
  // รับ error ไว้เอง ถ้าสคริปต์ฝั่งนั้นตาย จะได้ไปตกที่ข้อตรวจ ไม่ใช่ล้มทั้งชุด
  try{ await branch.evaluate(async () => { await publishMenu(); save(); }); }catch(e){}
  await branch.waitForTimeout(700);
  const menuNow = JSON.stringify(await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json());
  push('เครื่องสาขาที่ยังไม่มีเมนู ไม่ไปลบเมนูจริงของลูกค้า', menuWas === menuNow && menuNow.includes('เครปกรอบ'));

  /* ---------- หน้าลูกค้าหา URL ของที่เก็บเองได้ ---------- */
  // ลูกค้าเปิดลิงก์เปล่า ๆ (ไม่มี ?c=) ต้องหาที่เก็บเจอเองจากชื่อโปรเจกต์ที่ฝังไว้
  const cust4 = await b.newPage({ viewport:{width:390,height:844} });
  let probed = [];
  await cust4.route('**/*-default-rtdb.*/**', r => {
    probed.push(r.request().url());
    // ให้โซนสิงคโปร์เป็นตัวจริง ชี้กลับมาที่เก็บจำลองของเรา
    if(r.request().url().includes('asia-southeast1')){
      const path = r.request().url().split('.app')[1] || '/.json';
      return r.fulfill({ status:200, contentType:'application/json',
                         headers:{'Access-Control-Allow-Origin':'*'}, body:'{}' , });
    }
    return r.fulfill({ status:404, body:'{}' });
  });
  await cust4.goto(`${APP}/order.html?s=${key}`);
  await cust4.waitForTimeout(400);
  // ปกติ CLOUD_BASE ถูกฝังไว้แล้วจึงไม่ต้องหา — ล้างทิ้งก่อนเพื่อทดสอบทางสำรอง
  // (ทางนี้ได้ใช้จริงถ้าร้านย้ายโซน หรือ CLOUD_BASE ถูกลบ)
  probed = [];
  await cust4.evaluate(() => { BASE = ''; try{ localStorage.removeItem('crepe-order-base'); }catch(e){} });
  await cust4.evaluate(() => findBase());
  await cust4.waitForTimeout(400);
  push('หน้าลูกค้าหา URL ที่เก็บเองได้จากชื่อโปรเจกต์ ถ้าไม่ได้ฝังไว้',
    probed.some(u => u.includes('asia-southeast1')));
  push('หาเจอแล้วจำไว้ ไม่ต้องหาซ้ำรอบหน้า',
    (await cust4.evaluate(() => localStorage.getItem('crepe-order-base')) || '').includes('asia-southeast1'));
  await cust4.unroute('**/*-default-rtdb.*/**');

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
