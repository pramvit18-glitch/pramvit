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
  await cust.addInitScript(() => {
    window.__ding = 0; window.__buzz = 0;
    navigator.vibrate = () => { window.__buzz++; return true; };
    // นับว่าสร้าง "ตัวเล่นเสียง" กี่ตัว — สร้างใหม่ทุกครั้งแล้วมือถือจะเงียบไปเฉย ๆ
    window.__ac = 0;
    const OrigAC = window.AudioContext;
    if(OrigAC){
      window.AudioContext = function(){ window.__ac++; return new OrigAC(); };
      window.AudioContext.prototype = OrigAC.prototype;
    }
    /* ดักทางที่ "มือถือใช้ได้จริง" คือ service worker
       ของเดิมเรียก new Notification() ซึ่งบนมือถือโยน error แล้วโดน catch กลืน
       เงียบสนิททั้งที่ลูกค้ากดอนุญาตไปแล้ว */
    window.__swNote = []; window.__rawNote = 0;
    const P = window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype;
    if(P) P.showNotification = function(t, o){ window.__swNote.push({ t, o }); return Promise.resolve(); };
    /* **เบราว์เซอร์แบบไม่มีจอตอบ 'denied' เสมอ ขออนุญาตยังไงก็ไม่ได้**
       ของเดิมเลยเลี่ยงไปสตับ pushNote ทิ้งทั้งก้อน — ซึ่งทำให้บั๊กจริงหลุดไปถึงเจ้าของ
       ตรงนี้ปลอมแค่ "คำตอบของเบราว์เซอร์" อย่างเดียว โค้ดของเราได้ทำงานจริงทุกบรรทัด */
    window.__perm = 'default';
    if(window.Notification){
      try{ Object.defineProperty(Notification, 'permission',
        { get: () => window.__perm, configurable: true }); }catch(e){}
      const ON = window.Notification;
      window.Notification = function(t, o){ window.__rawNote++; return Object.create(ON.prototype); };
      window.Notification.prototype = ON.prototype;
      try{ Object.defineProperty(window.Notification, 'permission',
        { get: () => window.__perm, configurable: true }); }catch(e){}
      window.Notification.requestPermission = () => { window.__perm = 'granted'; return Promise.resolve('granted'); };
    }
  });
  const bell = () => cust.evaluate(() => ({ ding: window.__ding, buzz: window.__buzz, title: document.title }));
  await cust.goto(`${APP}/order.html?s=${key}&c=${encodeURIComponent(CLOUD)}`);
  await cust.waitForTimeout(600);

  push('ลูกค้าเห็นชื่อร้าน', (await cust.textContent('#shopName')).includes('ร้านเครปทดสอบ'));
  push('ลูกค้าเห็นเมนูครบ', (await cust.locator('#view .li').count()) === 2);

  /* ---------- ของหมดวันนี้ ----------
     เจ้าของเลือกเอง: พอไข่หมดตอนหกโมง ลูกค้าก็ยังสั่งเข้ามาเรื่อย ๆ
     แล้วต้องมานั่งกด "ไม่รับ" ทีละใบ · ปิดเมนูทีเดียวจบ */
  const soldId = await seller.evaluate(() => db.menus[1].id);
  const soldName = await seller.evaluate(() => db.menus[1].name);
  await seller.evaluate(id => toggleSoldOut(id), soldId);
  await seller.waitForTimeout(900);
  const pubOff = await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json();
  push('ปิดแล้วธง "หมด" ขึ้นไปถึงใบเมนูบนคลาวด์',
    pubOff.menus.filter(m => m.off).length === 1 && pubOff.menus[1].off === true);
  push('เมนูอื่นไม่โดนปิดตามไปด้วย', pubOff.menus[0].off === false);
  /* **ห้ามซ่อนเมนูที่หมดทิ้ง** ถ้าหายไปเฉย ๆ ลูกค้าประจำจะนึกว่าร้านเลิกขายของอย่างนั้นแล้ว
     ต้องโชว์ไว้แต่บอกว่าหมด เดี๋ยวพรุ่งนี้เขากลับมาสั่งใหม่ */
  await cust.reload(); await cust.waitForTimeout(900);
  push('หน้าลูกค้ายังเห็นเมนูที่หมดอยู่ ไม่ได้ซ่อนทิ้ง',
    (await cust.locator('#view .li').count()) === 2);
  push('เมนูที่หมดขึ้นป้ายว่าหมดแล้ว',
    await cust.locator('#view .li.off .li-out').count() === 1);
  /* **ต้อง count() ก่อนทุกครั้ง** ของที่อาจไม่มีแล้วไป evaluate ตรง ๆ
     มันรอจนหมดเวลาแล้วโยน error = ล้มทั้งชุดโดยไม่รายงานผลสักข้อ
     (เจอมาแล้วตอนพิสูจน์ชุดนี้เอง — ถอดการแก้ออกแล้วได้ "ตก 0 ข้อ" ทั้งที่พัง) */
  push('และกดสั่งไม่ได้ (ไม่ใช่ปุ่มแล้ว)',
    await cust.locator('#view .li.off').count() === 1
    && await cust.locator('#view .li.off').first().evaluate(el => el.tagName) === 'DIV');
  // กันอีกชั้นเผื่อถูกเรียกตรง ๆ — กล่องเลือกไส้ต้องไม่เปิด
  await cust.evaluate(() => { const i = menu.menus.findIndex(m => m.off); if(i >= 0) pick(i); });
  await cust.waitForTimeout(400);
  push('เรียก pick() ตรง ๆ กับของที่หมด กล่องก็ไม่เปิด',
    !(await cust.evaluate(() => el('dlg').open)));
  /* เปิดค้างไว้ไม่ได้ **กล่องจะไปบังปุ่มของข้อถัด ๆ ไปจนล้มทั้งชุด**
     ปิดทิ้งเสมอ ไม่ว่าเมื่อกี้มันจะเผลอเปิดขึ้นมาหรือไม่ */
  await cust.evaluate(() => { try{ el('dlg').close(); }catch(e){} });
  await cust.waitForTimeout(900);
  await cust.screenshot({ path: SHOT + '/cust-soldout.png' });

  // เปิดคืนแล้วต้องกลับมาสั่งได้ทันที
  await seller.evaluate(id => toggleSoldOut(id), soldId);
  await seller.waitForTimeout(900);
  const pubOn = await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json();
  push('เปิดคืนแล้วธงหายจากใบเมนู', pubOn.menus.every(m => !m.off));
  /* **พรุ่งนี้ต้องกลับมาขายเองโดยไม่ต้องมีใครไปกดเปิด**
     จึงจดเป็นวันที่ ไม่ใช่ true/false — ย้อนวันที่จดไว้เป็นเมื่อวานแล้วต้องไม่นับว่าหมด */
  const stillOut = await seller.evaluate(id => {
    const m = db.menus.find(x => x.id === id);
    m.soldDay = '2020-01-01';            // ปิดไว้เมื่อวาน (นานมาก)
    const out = isSoldOut(m);
    m.soldDay = ''; save();
    return out;
  }, soldId);
  push('ปิดไว้เมื่อวาน วันนี้กลับมาขายเอง ไม่ต้องกดเปิด', stillOut === false);
  push('ชื่อเมนูที่ปิดโผล่บนหน้าแรกให้เห็นว่าปิดค้างอยู่',
    (await seller.evaluate(n2 => {
      const m = db.menus.find(x => x.name === n2); m.soldDay = dayKey(); save();
      const h = soldOutWarnHTML(); m.soldDay = ''; save(); return h;
    }, soldName)).includes(soldName));

  /* เสียงเตือนบนมือถือพังเงียบ ๆ ได้ 2 ทาง จึงต้องดักทั้งคู่
     1. สร้างตัวเล่นเสียงใหม่ทุกครั้ง — เบราว์เซอร์จำกัดจำนวน พอเกินแล้วเงียบ
     2. มือถือปิดเสียงไว้จนกว่าคนจะแตะจอ ต้องสั่งเปิดเองทุกครั้งก่อนเล่น */
  await cust.evaluate(() => { ding(false); ding(true); ding(false); });
  push('เตือนหลายครั้งแล้วยังใช้ตัวเล่นเสียงตัวเดียว',
    await cust.evaluate(() => window.__ac) === 1);
  push('สั่งเปิดเสียงก่อนเล่นทุกครั้ง (มือถือปิดไว้จนกว่าจะแตะจอ)',
    await cust.evaluate(() => typeof audioCtx === 'function' && /resume/.test(audioCtx.toString())));
  // ไม่มีตัวนี้ = สั่งแถบแจ้งเตือนบนมือถือไม่ได้เลย
  await cust.waitForTimeout(600);
  push('หน้าลูกค้าลงทะเบียน service worker ไว้ด้วย',
    await cust.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!r)));

  // เลือกเมนูแรก ติ๊กไส้ที่มีเครื่องหมาย ' ในชื่อ (จุดที่เคยทำปุ่มตายเงียบ ๆ)
  await cust.locator('#view .li').first().click();
  await cust.waitForTimeout(300);
  await cust.locator('.tops .top', { hasText: "ไข่ไก่ด'ล" }).click();
  await cust.waitForTimeout(150);
  push("ติ๊กไส้ที่ชื่อมี ' ได้", await cust.locator('.tops .top.on').count() === 1);
  // กล่องต้องเลื่อนเข้ามาจากขวาเหมือนแอปร้าน ไม่ใช่ขึ้นจากล่างคนละจังหวะ
  // กดปิดกล่องก็ต้องมีภาพเลื่อนออก เหมือนแอปร้าน
  await cust.evaluate(() => dlg.close());
  await cust.waitForTimeout(60);
  push('กล่องหน้าลูกค้ามีภาพเลื่อนออกตอนปิด',
    await cust.evaluate(() => dlg.open && dlg.classList.contains('closing')));
  await cust.waitForTimeout(900);   // ภาพยาว .7s ต้องรอให้เกิน
  push('กล่องหน้าลูกค้าปิดจริงหลังเล่นจบ',
    await cust.evaluate(() => !dlg.open && !dlg.classList.contains('closing')));
  // เปิดกลับมาให้ข้อถัดไปใช้ต่อ
  await cust.locator('#view button.li').first().click();
  await cust.waitForTimeout(400);
  await cust.locator('.tops .top', { hasText: "ไข่ไก่ด'ล" }).click();
  await cust.waitForTimeout(150);

  push('กล่องหน้าลูกค้าเลื่อนมาจากขวาเหมือนแอปร้าน',
    await cust.evaluate(() => [...document.styleSheets]
      .flatMap(s => { try{ return [...s.cssRules]; }catch(e){ return []; } })
      .some(r => r.name === 'sheet' && /translateX\(100%\)/.test(r.cssText))));

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

  push('ส่งออเดอร์แล้วเข้าหน้ารอคิว', (await cust.locator('.head-q').count()) === 1);
  push('ส่งแล้วมีคำขอบคุณให้ลูกค้า',
    (await cust.textContent('#view')).includes('ขอบคุณที่สั่ง'));
  // ลูกค้ายืนจ้องหน้านี้อยู่ ถ้านิ่งสนิทจะไม่แน่ใจว่าแอปยังทำงานไหม
  push('รอร้านกดรับ มีจุดสามจุดเด้งอยู่',
    await cust.locator('.head-q b.dots i').count() === 3);
  /* ข้อนี้เคยชื่อ "แถบขั้นตอนที่ทำอยู่มีแสงวิ่ง" แต่เช็กแค่ว่ามีคลาส .cur
     พอเปลี่ยนแถบเป็น stepper วงกลมแล้วแสงวิ่งหายไป มันก็ยังผ่านอยู่ดี — เทสต์โกหก
     ตอนนี้อ่าน animationName จริงว่าวงแหวนเต้นอยู่ */
  push('ขั้นที่ทำอยู่มีวงแหวนเต้น บอกว่ายังเดินหน้าอยู่',
    await cust.evaluate(() => {
      const el = document.querySelector('.steps .step.cur .step-n');
      return !!el && getComputedStyle(el).animationName === 'ring';
    }));
  push('จุดเด้งจริง ไม่ใช่แค่มีคลาส',
    await cust.evaluate(() => {
      const el = document.querySelector('.head-q b.dots i');
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
  await cust.evaluate(() => { window.ding = () => { window.__ding++; }; });
  const bellWas = await bell();          // ต้องนับก่อนแม่ค้าลงมือ
  await seller.evaluate(async () => { await takeOrder(cloudOrders[0].id); });
  await seller.waitForTimeout(400);
  // เลขของใบนี้ต้องไม่เปลี่ยนตอนกดรับ (ลูกค้าเห็นเลขไปแล้วตั้งแต่สั่ง)
  push('กดรับแล้วยังเป็นคิวเดิม ไม่ออกเลขใหม่',
    await seller.evaluate(() => n(cloudOrders[0].no)) === 1);

  await cust.evaluate(() => refreshMine());
  await cust.waitForTimeout(500);
  /* ลูกค้าเดินไปนั่งรอ ไม่ได้จ้องจอ — ร้านกดรับแล้วต้องมีอะไรบอก
     ของเดิมหน้าจอเปลี่ยนเองเฉย ๆ ไม่มีเสียง ไม่มีสั่น ไม่มีอะไรเลย */
  const bellCook = await bell();
  push('ร้านกดรับแล้ว ลูกค้าได้ยินเสียงเตือน', bellCook.ding > bellWas.ding);
  push('ร้านกดรับแล้ว เครื่องลูกค้าสั่นด้วย', bellCook.buzz > bellWas.buzz);
  const qtxt = await cust.textContent('.head-q');
  push('ลูกค้าเห็นเลขคิวของตัวเอง', qtxt.includes('1'));
  push('ลูกค้าเห็นว่ากำลังทำอยู่', (await cust.textContent('.steps')).includes('กำลังทำ'));
  /* ตอนร้านกำลังทำ โชว์ภาพเตาเครปที่ขยับ ลูกค้าจะได้เห็นว่าของกำลังทำอยู่จริง */
  push('ตอนกำลังทำ มีภาพเตาเครปโผล่มา', await cust.locator('.cookpic').count() === 1);
  push('ไม้ปาดขยับจริง ไม่ใช่แค่มีรูป',
    await cust.evaluate(() => {
      const el = document.querySelector('.cookpic .spread');
      return !!el && getComputedStyle(el).animationName === 'spread';
    }));
  /* เจ้าของขอว่าอย่าให้หมุนรอบวง เดิมหมุนครบ 360 แล้วดูเหมือนเข็มนาฬิกา
     ตอนนี้ต้องกวาดไปมา: มุมต้องวิ่งกลับไปกลับมา ไม่ใช่เพิ่มทางเดียวจนครบรอบ */
  push('ไม้ปาดกวาดไปมา ไม่หมุนรอบวง',
    await cust.evaluate(async () => {
      const el = document.querySelector('.cookpic .spread');
      if(!el) return false;
      // อ่านมุมจริงจาก matrix ที่เบราว์เซอร์คำนวณให้ ตลอดช่วงหนึ่งรอบเต็ม
      const angle = () => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return Math.atan2(m.b, m.a) * 180 / Math.PI;
      };
      const seen = [];
      for(let i = 0; i < 30; i++){
        seen.push(angle());
        await new Promise(r => setTimeout(r, 100));
      }
      const lo = Math.min(...seen), hi = Math.max(...seen);
      // กวาดไปมา = มุมอยู่ในช่วงแคบ ๆ และต้องเคยถอยกลับอย่างน้อยหนึ่งครั้ง
      const turnedBack = seen.some((v, i) => i > 1 &&
        Math.sign(v - seen[i-1]) !== 0 &&
        Math.sign(v - seen[i-1]) !== Math.sign(seen[i-1] - seen[i-2]));
      return hi - lo < 120 && turnedBack;
    }));
  push('ไอน้ำลอยจริง',
    await cust.evaluate(() => {
      const el = document.querySelector('.cookpic .st');
      return !!el && getComputedStyle(el).animationName === 'steam';
    }));
  // ไม่มีรูป = querySelector คืน null แล้ว getComputedStyle โยน error ทำให้ล้มทั้งชุด
  // ต้องเช็กก่อน จะได้รายงานเป็นข้อตกแทน
  push('ไม้ปาดขยับรอบกลางเตา ไม่ใช่รอบมุมกรอบ',
    await cust.evaluate(() => {
      const el = document.querySelector('.cookpic .spread');
      if(!el) return false;
      const cs = getComputedStyle(el);
      return cs.transformBox === 'view-box' && /70px\s+69px/.test(cs.transformOrigin);
    }));
  /* ขั้นตอนเป็น stepper มาตรฐาน: วงกลมมีเลข ต่อกันด้วยเส้น (เจ้าของขอ)
     ขั้นที่ผ่านแล้วเป็นเครื่องหมายถูก ขั้นที่ยังไม่ถึงเป็นเลขสีเทา */
  push('ขั้นตอนเป็นวงกลมมีเลข ครบ 3 ขั้น',
    await cust.locator('.steps .step-n').count() === 3);
  push('ขั้นที่ผ่านแล้วเป็นเครื่องหมายถูก',
    await cust.locator('.steps .step-n svg').count() === 1);
  push('ขั้นที่กำลังทำกับยังไม่ถึง ยังเป็นเลข',
    (await cust.locator('.steps .step').nth(1).textContent()).includes('2')
    && (await cust.locator('.steps .step').nth(2).textContent()).includes('3'));
  push('วงกลมเป็นวงกลมจริง ไม่ใช่ขีดแบน', await cust.evaluate(() => {
    const el = document.querySelector('.steps .step-n');
    if(!el) return false;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return cs.borderRadius === '50%' && Math.abs(r.width - r.height) < 1 && r.width > 20;
  }));
  push('มีเส้นเชื่อมระหว่างวงกลม', await cust.evaluate(() => {
    const el = document.querySelectorAll('.steps .step')[1];
    if(!el) return false;
    const w = getComputedStyle(el, '::before').width;
    return w && w !== 'auto' && parseFloat(w) > 20;
  }));
  push('ขั้นแรกไม่มีเส้นเข้า (ไม่มีเส้นลอยออกนอกการ์ด)', await cust.evaluate(() => {
    const el = document.querySelector('.steps .step');
    return !!el && getComputedStyle(el, '::before').display === 'none';
  }));

  push('ได้เลขคิวแล้ว จุดเด้งหายไป เหลือเลขจริง',
    await cust.locator('.head-q b.dots').count() === 0 && await cust.locator('.head-q.live b').count() === 1);
  push('เลขคิวหายใจอยู่ตอนร้านกำลังทำ',
    await cust.evaluate(() => {
      const el = document.querySelector('.head-q.live b');
      return !!el && getComputedStyle(el).animationName === 'breathe';
    }));

  await cust.screenshot({ path: SHOT + '/cust-queue.png' });

  /* ---------- เสร็จ + รับเงิน ---------- */
  // จำลองว่าลูกค้าสลับไปแอปอื่น (ของจริงเป็นแบบนี้เกือบทุกคน) แล้วนับก่อนแม่ค้ากด
  await cust.evaluate(() => {
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
  });
  const bellWas2 = await bell();
  /* ลูกค้ากดอนุญาตแจ้งเตือนไปแล้ว (ของจริงกดปุ่ม "เตือนฉันตอนของเสร็จ")
     **ไม่สตับ pushNote** ของเดิมสตับทิ้ง เลยพิสูจน์ได้แค่ว่า "ถูกเรียก"
     ไม่ได้พิสูจน์ว่ามันเด้งขึ้นจริงบนมือถือ — บั๊กจึงหลุดไปถึงมือเจ้าของ */
  /* ยังไม่อนุญาต = ต้องมีปุ่มชวนกด ห้ามเด้งขอเอง */
  push('ยังไม่อนุญาต = มีปุ่มชวนเปิดแจ้งเตือนให้กดเอง',
    await cust.locator('button', { hasText:'เตือนฉันตอนของเสร็จ' }).count() === 1);

  /* **ไอโฟนที่ยังไม่ได้ติดตั้งเป็นแอป ไม่มี Notification ให้เลย** ปุ่มข้างบนจึงไม่โผล่
     ของเดิมเงียบสนิท ไม่มีอะไรบนจอสักอย่าง = เจ้าของหาไม่เจอแล้วนึกว่าเราไม่ได้ทำ
     ต้องบอกว่าเครื่องนี้ได้อะไร (เสียง) และทำยังไงถึงจะได้ครบ (ติดตั้งเป็นแอป) */
  const iosTxt = await cust.evaluate(() => {
    const realN = window.Notification, realUA = navigator.userAgent;
    delete window.Notification;
    Object.defineProperty(navigator, 'userAgent',
      { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari', configurable: true });
    const html = noteRowHTML();
    window.Notification = realN;
    Object.defineProperty(navigator, 'userAgent', { get: () => realUA, configurable: true });
    return html;
  });
  push('ไอโฟนที่ยังไม่ติดตั้งเป็นแอป ต้องไม่เงียบ บอกว่าจะได้ยินเสียงแทน',
    /เสียง/.test(iosTxt));
  push('และบอกวิธีทำให้เตือนตอนปิดจอได้ (เพิ่มลงในหน้าจอโฮม)',
    /หน้าจอโฮม/.test(iosTxt));
  // เครื่องอื่นที่เตือนไม่ได้ ไม่ต้องไปพูดถึง พูดไปก็ทำอะไรไม่ได้
  const pcTxt = await cust.evaluate(() => {
    const realN = window.Notification;
    delete window.Notification;
    const html = noteRowHTML();
    window.Notification = realN;
    return html;
  });
  push('ไม่ใช่ไอโฟน = ไม่ต้องขึ้นคำแนะนำให้รก', pcTxt === '');
  // ติดตั้งเป็นแอปแล้วต้องเปิดเต็มจอ ไม่งั้นไอโฟนยังไม่ให้เตือนอยู่ดี
  push('order.html บอกไอโฟนให้เปิดแบบเต็มจอเมื่อติดตั้งเป็นแอป',
    /apple-mobile-web-app-capable/.test(require('fs').readFileSync('order.html','utf8')));
  /* **ห้ามมีลิงก์ manifest ของแอปแม่ค้า** ไม่งั้นไอคอนบนหน้าจอโฮมของลูกค้า
     จะพาไปเปิดแอปแม่ค้าแทนหน้าสั่งของ */
  push('หน้าลูกค้าไม่ลิงก์ manifest ของแอปแม่ค้า (ไอคอนจะพาไปผิดหน้า)',
    !/rel="manifest"/.test(require('fs').readFileSync('order.html','utf8')));
  // ลูกค้ากดปุ่มเอง (ของจริงเป็นแบบนี้) แล้วค่อยนับ
  await cust.evaluate(() => askNote());
  await cust.waitForTimeout(300);
  await cust.evaluate(() => { window.__swNote = []; window.__rawNote = 0; });
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
  const bellDone = await bell();
  push('ของเสร็จแล้ว ลูกค้าได้ยินเสียงเตือน', bellDone.ding > bellWas2.ding);
  push('ของเสร็จแล้ว เครื่องลูกค้าสั่นด้วย', bellDone.buzz > bellWas2.buzz);
  /* สลับไปแอปอื่นแล้วเสียงอาจถูกเบราว์เซอร์หรี่ ชื่อแท็บจึงต้องบอกด้วย
     เห็นได้โดยไม่ต้องขออนุญาตอะไรเลย */
  push(`สลับไปแอปอื่นแล้ว ชื่อแท็บบอกว่าของเสร็จ (${bellDone.title})`,
    /เสร็จ/.test(bellDone.title));
  /* ปิดจอไปเลยก็ยังต้องรู้ — แถบแจ้งเตือนของเครื่องเป็นทางเดียวที่ถึงตัว
     (ลูกค้าต้องกดอนุญาตเองก่อน ไม่เด้งขอเอง) */
  const liveLeft = await cust.evaluate(() => liveOrders().length);
  const sw = await cust.evaluate(() => window.__swNote || []);
  push(`ของเสร็จแล้วยิงแถบแจ้งเตือนของเครื่องด้วย (${(sw[0]||{}).t || '-'})`,
    sw.length === 1 && /เสร็จ/.test(sw[0].t));
  push('แถบแจ้งเตือนบอกด้วยว่าคิวที่เท่าไหร่',
    sw.length === 1 && /คิวที่/.test((sw[0].o || {}).body || ''));
  /* **ต้องสั่งผ่าน service worker** new Notification() บนมือถือใช้ไม่ได้
     ข้อนี้คือข้อที่จับบั๊กที่เจ้าของเจอ ("ไม่เห็นได้แจ้งเตือนเลย") */
  push('สั่งแถบแจ้งเตือนผ่าน service worker (มือถือถึงจะเห็น)',
    sw.length === 1 && await cust.evaluate(() => window.__rawNote) === 0);
  // กดแจ้งเตือนแล้วต้องกลับมาหน้าลูกค้า ไม่ใช่เด้งไปแอปแม่ค้า
  push('แจ้งเตือนพากลับมาหน้าลูกค้า ไม่ใช่แอปแม่ค้า',
    sw.length === 1 && /order\.html/.test((((sw[0].o || {}).data) || {}).url || ''));

  /* อนุญาตแล้วต้องบอกลูกค้าว่าเปิดไว้แล้ว ไม่ใช่ชวนกดซ้ำไปเรื่อย ๆ
     และตอนยังไม่อนุญาต (หรือปิดไปแล้ว) ต้องไม่ตื๊อ */
  await cust.context().grantPermissions(['notifications'], { origin: APP });
  await cust.evaluate(() => drawMine());
  await cust.waitForTimeout(300);
  const noteTxt = await cust.textContent('#view');
  push('อนุญาตแจ้งเตือนแล้ว หน้าลูกค้าบอกว่าเปิดไว้แล้ว',
    !liveLeft || /เปิดแจ้งเตือนไว้แล้ว/.test(noteTxt));
  // กลับมามองจอแล้วชื่อแท็บต้องคืนเดิม ไม่ค้างเป็นกระดิ่งตลอดกาล
  await cust.evaluate(() => {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await cust.waitForTimeout(300);
  push('กลับมามองจอแล้ว ชื่อแท็บคืนเป็นของเดิม',
    !/เสร็จ/.test((await bell()).title));
  // ของเสร็จแล้วต้องไม่มีภาพกำลังทำค้างอยู่
  push('ของเสร็จแล้ว ภาพเตาหายไป', await cust.locator('.cookpic').count() === 0);
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
    await cust.locator('#view .head-q').count() === 2);

  /* ---------- ที่เก็บออเดอร์ปฏิเสธ (กฎ Firebase หมดอายุ) ----------
     เคสจริงที่อันตรายที่สุด: กฎ "โหมดทดสอบ" หมดอายุ 30 วัน แล้วปิดทุกทางเอง
     โค้ดเดิมกลืน error ทิ้งหมด ออเดอร์เลยเงียบหายโดยไม่มีอะไรเตือน
     แม่ค้าจะนึกว่าวันนี้ไม่มีลูกค้าสั่ง ไม่ใช่ว่าระบบตาย */
  await seller.route('**/orders.json*', r =>
    r.fulfill({ status:401, contentType:'application/json',
                headers:{'Access-Control-Allow-Origin':'*'},
                body: JSON.stringify({error:'Permission denied'}) }));
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(700);

  push('ที่เก็บปฏิเสธแล้วแอปรู้ตัว ไม่กลืนเงียบ',
    await seller.evaluate(() => cloudDenied === true));
  push('ขึ้นแถบเตือนบนสุดให้แม่ค้าเห็น',
    await seller.locator('#orderInbox .obar.warn').count() === 1);
  const warnTxt = await seller.textContent('#orderInbox');
  push('แถบบอกตรง ๆ ว่าลูกค้าสั่งไม่ได้', warnTxt.includes('ลูกค้าสั่งไม่ได้ตอนนี้'));
  push('แถบเตือนใช้คนละสีกับแถบออเดอร์เข้า ไม่สับสนกัน',
    await seller.evaluate(() => {
      const el = document.querySelector('#orderInbox .obar.warn');
      return !!el && !getComputedStyle(el).backgroundImage.includes('211, 43, 43');
    }));

  /* แตะแล้วต้องบอกวิธีแก้ และต้องบอกว่าไม่ต้องเสียเงินเพิ่ม
     ไม่มีแถบ = click ค้างจนหมดเวลาแล้วล้มทั้งชุด ต้องเช็กก่อน จะได้รายงานเป็นข้อตก */
  const hasWarn = await seller.locator('#orderInbox .obar.warn').count() === 1;
  let helpTxt = '';
  if(hasWarn){
    await seller.locator('#orderInbox .obar.warn').click();
    await seller.waitForTimeout(900);
    helpTxt = await seller.textContent('#dlg');
  }
  push('บอกวิธีแก้เป็นขั้นตอน', helpTxt.includes('Realtime Database') && helpTxt.includes('Rules'));
  push('บอกชัดว่าไม่ใช่เรื่องต้องจ่ายเงินเพิ่ม', helpTxt.includes('ไม่ใช่เรื่องต้องจ่ายเงินเพิ่ม'));
  push('บอกว่ายอดขายในเครื่องไม่หาย', helpTxt.includes('ไม่หายไปไหน'));
  if(hasWarn){
    await seller.locator('#dlg button', { hasText:'เข้าใจแล้ว' }).click();
    await seller.waitForTimeout(900);
  }

  // แก้กฎแล้วแถบต้องหายเอง ไม่ต้องปิดเปิดแอป
  await seller.unroute('**/orders.json*');
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(700);
  push('พอกลับมาเข้าได้ แถบเตือนหายเอง',
    await seller.evaluate(() => cloudDenied === false)
    && await seller.locator('#orderInbox .obar.warn').count() === 0);

  // เน็ตหลุดธรรมดาต้องไม่ขึ้นแถบนี้ ไม่งั้นตกใจเล่นทุกครั้งที่สัญญาณไม่ดี
  await seller.route('**/orders.json*', r => r.abort());
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(700);
  push('เน็ตหลุดเฉย ๆ ไม่ขึ้นแถบเตือนนี้ ไม่ตกใจเล่น',
    await seller.evaluate(() => cloudDenied === false));
  await seller.unroute('**/orders.json*');
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(600);

  /* ---------- แจ้งเตือนตอนลูกค้าสั่งเข้ามา ----------
     เดิมแอปหยุดถามที่เก็บทันทีที่จอดับ/สลับแอป แม่ค้าเปิด LINE อยู่แล้วลูกค้าสั่งเข้ามา
     จะไม่มีอะไรเตือนเลยจนกว่าจะกลับมาเปิดแอป — เสียออเดอร์ไปดื้อ ๆ */
  const notes = [];
  await seller.evaluate(() => {
    // ดักไว้ดูว่าแอปสั่งเด้งแถบแจ้งเตือนจริงไหม (เบราว์เซอร์เทสต์ไม่มีของจริงให้กด)
    window.__notes = [];
    window.Notification = function(){};
    window.Notification.permission = 'granted';
    window.Notification.requestPermission = async () => 'granted';
    navigator.serviceWorker.getRegistration = async () => ({
      showNotification: (t, o) => { window.__notes.push({ t, b: o && o.body }); }
    });
  });

  push('แอปรู้จักการกันจอดับ', await seller.evaluate(() => typeof keepScreenOn === 'function'));
  push('ถามถี่ตอนดูจออยู่ · ห่างลงตอนสลับไปแอปอื่น',
    await seller.evaluate(() => POLL_ON < POLL_OFF && POLL_ON === 5000));

  // ทำเป็นว่าแม่ค้าสลับไปเล่นแอปอื่น แล้วลูกค้าสั่งเข้ามาตอนนั้น
  await seller.evaluate(() => {
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenKey = await seller.evaluate(() => db.orderKey);
  await fetch(`${CLOUD}/s/${hiddenKey}/orders/hidden1.json`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ at: Date.now(), status:'new', total: 15,
      items:[{ id:'m1', name:'เครปกรอบ', qty:1, price:15, addons:[], total:15 }] })
  });
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(800);

  push('สลับไปแอปอื่นแล้ว ยังรู้ว่ามีออเดอร์เข้ามา',
    await seller.evaluate(() => cloudOrders.some(o => o.id === 'hidden1')));
  const noteSeen = await seller.evaluate(() => window.__notes);
  push('เด้งแถบแจ้งเตือนของเครื่องให้ด้วย', noteSeen.length >= 1);
  push('แถบแจ้งเตือนบอกว่ามีออเดอร์ใหม่', !!noteSeen[0] && noteSeen[0].t.includes('ออเดอร์ใหม่'));
  push('แถบแจ้งเตือนบอกด้วยว่าลูกค้าสั่งอะไร', !!noteSeen[0] && String(noteSeen[0].b).includes('เครปกรอบ'));

  /* ย้ำซ้ำถ้ายังไม่ได้กดรับ — แม่ค้ายืนทอดอยู่ เสียงครั้งเดียวพลาดง่าย
     ต้องยิงผ่าน pollOrders() ไม่ใช่เรียก nagNewOrders() ตรง ๆ
     ไม่งั้นต่อให้ลืมต่อสายเข้ากับรอบถาม เทสต์ก็ยังผ่าน (ลองแล้ว ผ่านจริง) */
  push('ยังไม่กดรับ = ย้ำเตือนซ้ำเองตอนถามรอบถัดไป', await seller.evaluate(async () => {
    nagAt = Date.now() - NAG_EVERY - 1;      // ทำเป็นว่าผ่านไปครบรอบแล้ว
    let rang = 0;
    const real = window.ringBell; window.ringBell = () => { rang++; };
    await pollOrders();
    window.ringBell = real;
    return rang === 1;
  }));
  push('กดรับหมดแล้ว = หยุดย้ำเอง', await seller.evaluate(async () => {
    for(const o of cloudOrders.filter(x => x.status === 'new')) await takeOrder(o.id);
    nagAt = Date.now() - NAG_EVERY - 1;
    let rang = 0;
    const real = window.ringBell; window.ringBell = () => { rang++; };
    await pollOrders();
    window.ringBell = real;
    return rang === 0;
  }));

  // กลับมาดูจอ แล้วเก็บกวาดใบที่เพิ่งใส่เข้าไป
  await seller.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await cloudReq('PATCH', `s/${db.orderKey}/orders`, { hidden1: null });
    await pollOrders();
  });
  await seller.waitForTimeout(600);

  /* ---------- แม่ค้าลบออเดอร์ทิ้งเองได้ ----------
     เดิมออเดอร์ที่กดรับไปแล้วแต่ลูกค้าไม่มารับ จะค้างอยู่จนกว่าจะกด "เสร็จแล้ว · รับเงิน"
     ซึ่งจะกลายเป็นยอดขายปลอม เงินในสรุปวันนี้เพี้ยนทันที */
  const liveId   = await seller.evaluate(() => cloudOrders[0] && cloudOrders[0].id);
  const salesWas = await seller.evaluate(() => (db.sales||[]).length);
  // ต้องนับ **ก่อน** แม่ค้ากดลบ ไม่งั้นชนกับจังหวะที่หน้าลูกค้าถามเองทุก 4 วินาที
  // แล้วบางรอบมันตัดใบที่ถูกลบออกไปก่อนเราจะทันนับ เทสต์เลยตก ๆ ผ่าน ๆ
  const cardsWas = await cust.locator('#view .head-q').count();
  push('มีออเดอร์ค้างอยู่ให้ลบ', !!liveId);

  await seller.evaluate(id => deleteOrder(id), liveId);
  await seller.waitForTimeout(900);
  push('กดลบแล้วมีกล่องถามยืนยันก่อน',
    (await seller.textContent('#dlg')).includes('ไม่ถูกบันทึกเป็นยอดขาย'));
  const delBtn = seller.locator('#dlg button', { hasText:'ลบทิ้ง' });
  const canDel = await delBtn.count() > 0;
  push('มีปุ่มยืนยันลบให้กด', canDel);
  if(canDel){
    await delBtn.click();
    await seller.waitForTimeout(900);
  }

  const goneInCloud = await (await fetch(`${CLOUD}/s/${key}/orders/${liveId}.json`)).json();
  push('ลบแล้วออเดอร์หายจากที่เก็บจริง', goneInCloud === null);
  push('ลบแล้วหายจากรายการค้างของแม่ค้า',
    await seller.evaluate(id => !cloudOrders.some(o => o.id === id), liveId));
  push('ลบออเดอร์แล้ว **ไม่ถูกนับเป็นยอดขาย**',
    await seller.evaluate(() => (db.sales||[]).length) === salesWas);

  /* ลูกค้าต้องรู้ด้วย ไม่ใช่ค้างหมุนรอไม่มีวันจบ
     แต่ต้อง **ไม่** โชว์เป็นการ์ดค้างไว้ทีละใบ
     เคยทำแบบนั้นแล้วพอแม่ค้าล้างออเดอร์ทั้งวัน ลูกค้าได้การ์ด "ถูกยกเลิกแล้ว"
     ซ้ำ ๆ เรียงยาวเต็มจอ เลื่อนเท่าไหร่ก็ไม่หมด */
  await cust.evaluate(() => refreshMine());
  await cust.waitForTimeout(700);
  const goneTxt = await cust.textContent('#view');
  push('ลูกค้ารู้ว่าทางร้านเอาออเดอร์ออก', goneTxt.includes('เอาออเดอร์ของคุณออกไปแล้ว'));
  push('บอกครั้งเดียว ไม่ขึ้นการ์ดซ้ำ ๆ',
    (goneTxt.match(/เอาออเดอร์ของคุณออกไปแล้ว/g) || []).length === 1);
  push('ออเดอร์ที่ถูกลบหายออกจากรายการของลูกค้าเลย',
    await cust.evaluate(() => sentList.length) === 1);
  push('การ์ดคิวลดลงจริง ไม่ใช่เพิ่มการ์ดยกเลิกเข้ามาแทน',
    await cust.locator('#view .head-q').count() === cardsWas - 1);
  push('ออเดอร์ที่ถูกลบ ไม่นับว่ายังค้างอยู่',
    await cust.evaluate(() => liveOrders().length) === 0);
  push('ออเดอร์ที่ถูกลบ ไม่มีจุดเด้งค้างอยู่',
    await cust.locator('#view .head-q b.dots').count() === 0);
  push('ออเดอร์ที่ถูกลบ ไม่กลับมาอีกตอนถามรอบหน้า',
    await cust.evaluate(async () => { await refreshMine(); return sentList.length; }) === 1);

  /* ---------- ล้างออเดอร์วันนี้ทีเดียวทั้งหมด ---------- */
  // สั่งใหม่หนึ่งใบไว้ให้มีของให้ล้าง
  await cust.evaluate(() => backToMenu());
  await cust.waitForTimeout(300);
  await cust.locator('#view button.li').first().click();
  await cust.waitForTimeout(300);
  await cust.locator('button', { hasText:'ใส่ตะกร้า' }).click();
  await cust.waitForTimeout(300);
  await cust.locator('#barBtn').click();
  await cust.waitForTimeout(300);
  await cust.locator('#sendBtn').click();
  await cust.waitForTimeout(1200);
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(600);

  const salesBefore = await seller.evaluate(() => (db.sales||[]).length);
  push('มีออเดอร์ใหม่เข้ามาให้ล้าง',
    await seller.evaluate(() => cloudOrders.length) >= 1);
  push('ก่อนล้าง เลขคิวเดินไปแล้ว',
    await seller.evaluate(() => n(db.queueNo)) > 0);

  await seller.evaluate(() => clearTodayOrders());
  await seller.waitForTimeout(1200);
  const warn = await seller.textContent('#dlg');
  push('กล่องยืนยันบอกชัดว่ายอดขายไม่หายไปด้วย', warn.includes('ยอดขายที่รับเงินไปแล้ววันนี้ยังอยู่ครบ'));
  push('กล่องยืนยันบอกว่าเลขคิวจะเริ่มใหม่', warn.includes('เลขคิวจะเริ่มนับ 1 ใหม่'));
  await seller.locator('#dlg button', { hasText:'ล้างเลย' }).click();
  await seller.waitForTimeout(1200);

  const leftInCloud = await (await fetch(`${CLOUD}/s/${key}/orders.json`)).json();
  const today = new Date();
  const dk = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const leftToday = Object.values(leftInCloud || {}).filter(o => o && dk(new Date(o.at)) === dk(today));
  push('ล้างแล้วออเดอร์วันนี้หมดเกลี้ยงจากที่เก็บ', leftToday.length === 0);
  push('ล้างแล้วรายการค้างของแม่ค้าว่าง',
    await seller.evaluate(() => cloudOrders.length) === 0);
  push('ล้างแล้วเลขคิวเริ่มนับ 1 ใหม่',
    await seller.evaluate(() => n(db.queueNo)) === 0);
  // ข้อสำคัญที่สุด: เงินต้องไม่หายไปกับการล้าง
  push('ล้างออเดอร์แล้ว **ยอดขายที่รับเงินไปแล้วยังอยู่ครบ**',
    await seller.evaluate(() => (db.sales||[]).length) === salesBefore && salesBefore > 0);

  /* ล้างทั้งวันแล้ว ใบที่ลูกค้ายังรออยู่ต้องหายจากเครื่องลูกค้าด้วย
     ส่วนใบที่รับของไปแล้ว (done) ยังค้างอยู่ได้ — ตั้งใจ
     แอปเลิกถามที่เก็บเรื่องใบที่จบแล้ว เพื่อไม่เปลืองโควตาฟรี
     และการ์ด "ของเสร็จแล้ว ขอบคุณที่อุดหนุน" ก็ไม่ใช่ขยะที่ต้องรีบเอาออก */
  await cust.evaluate(() => refreshMine());
  await cust.waitForTimeout(800);
  push('ล้างออเดอร์แล้ว ใบที่ลูกค้ายังรออยู่หายจากเครื่องลูกค้า',
    await cust.evaluate(() => sentList.length) === 1);
  push('ล้างออเดอร์แล้ว ใบที่เหลือคือใบที่รับของไปแล้ว ไม่ใช่ใบค้าง',
    await cust.evaluate(() => mineMap[sentList[0].id].status) === 'done');
  push('ล้างออเดอร์แล้ว ไม่มีการ์ดยกเลิกโผล่มาแทน',
    !(await cust.textContent('#view')).includes('ถูกยกเลิกแล้ว'));
  push('ล้างออเดอร์แล้ว ไม่มีจุดเด้งค้างรอเก้อ',
    await cust.locator('#view .head-q b.dots').count() === 0);
  push('ยังมีข้อความบอกว่าร้านเอาออเดอร์ออก',
    (await cust.textContent('#view')).includes('เอาออเดอร์ของคุณออกไปแล้ว'));

  // หน้าออเดอร์ตอนว่าง ก็ต้องยังกดล้างได้
  await seller.evaluate(() => go('orders'));
  await seller.waitForTimeout(500);
  push('หน้าออเดอร์ตอนว่าง ยังมีปุ่มล้างออเดอร์วันนี้',
    await seller.locator('#view button', { hasText:'ล้างออเดอร์วันนี้' }).count() === 1);

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

  /* ---------- การ์ดออเดอร์ที่มีหลายรายการ ต้องอ่านรู้เรื่อง ----------
     เจ้าของเจอเอง: "ตอนที่ลูกค้าส่งออเดอร์มาถ้ามีหลายรายการ เราดูแล้วงง ๆ อยู่นะ"
     ของเดิมต่อชื่อทุกจานเป็นพรืดเดียว แล้วเอาไส้ของทุกจานมากองรวมกันไว้บรรทัดเดียว
     อ่านแล้วไม่มีทางรู้ว่าไส้ไหนของจานไหน ซึ่งเป็นสิ่งเดียวที่ต้องรู้ตอนยืนทอด */
  const putOrd = async (id, o) => fetch(`${CLOUD}/s/${key}/orders/${id}.json`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(o) });
  await putOrd('multi', { at: Date.now(), status:'new', total:235, who:'เต้', paid:false, items:[
    { id:'m1', name:'แพนเค้กมินิ 15 ชิ้น', qty:5, price:25,
      addons:[{name:'พิซซ่า'},{name:'พริกเผา'},{name:'ไก่หยอง'}], total:125 },
    { id:'m2', name:'ไข่ว่ง 8 ชิ้น', qty:3, price:25,
      addons:[{name:'โบโลน่า'},{name:'ซอสพริก'}], total:75 },
    { id:'m3', name:'เครป แป้งวานิลา', qty:1, price:35,
      addons:[{name:'ซอสมะเขือเทศ'},{name:'มายองเนส'}], total:35 }
  ]});
  await seller.evaluate(() => pollOrders());
  await seller.waitForTimeout(700);
  await seller.evaluate(() => go('orders'));
  await seller.waitForTimeout(500);

  const card = seller.locator('.ord').filter({ hasText:'แพนเค้กมินิ' }).first();
  push('ของแยกเป็นแถวละอย่าง ไม่ต่อกันเป็นพรืดเดียว',
    await card.locator('.ord-it').count() === 3);
  // ไส้ต้องอยู่ใต้ชื่อของจานตัวเอง ไม่ใช่เอามากองรวมกันหมด
  const rows = await card.locator('.ord-it').evaluateAll(els => els.map(el => ({
    name: (el.querySelector('.ord-it-n') || {}).textContent || '',
    qty:  (el.querySelector('.ord-it-q') || {}).textContent || '',
    tops: (el.querySelector('.ord-it-a') || {}).textContent || ''
  })));
  push('แถวแรกเป็นแพนเค้ก 5 ชิ้น และมีแต่ไส้ของตัวเอง',
    rows[0] && rows[0].name.includes('แพนเค้ก') && rows[0].qty.trim() === '5'
    && rows[0].tops.includes('พิซซ่า') && !rows[0].tops.includes('โบโลน่า'));
  push('แถวสองเป็นไข่ว่ง 3 ชิ้น และมีแต่ไส้ของตัวเอง',
    rows[1] && rows[1].name.includes('ไข่ว่ง') && rows[1].qty.trim() === '3'
    && rows[1].tops.includes('โบโลน่า') && !rows[1].tops.includes('พิซซ่า'));
  push('แถวสามเป็นเครป 1 ชิ้น และมีแต่ไส้ของตัวเอง',
    rows[2] && rows[2].name.includes('เครป') && rows[2].qty.trim() === '1'
    && rows[2].tops.includes('มายองเนส') && !rows[2].tops.includes('ซอสพริก'));
  push('บอกราคาแยกรายจานให้เทียบยอดได้',
    await card.locator('.ord-it-p').count() === 3);
  push('ชื่อลูกค้าขึ้นหัวการ์ด ไม่ไปปนกับรายการของ',
    (await card.locator('.ord-n').textContent()).includes('เต้'));
  /* จ่ายเงินสด / มารับเองที่ร้าน **ต้องกดรับได้เลย ห้ามไปบังคับให้ดูสลิป**
     (เจ้าของสั่งเอง — ใบนี้ไม่มีสลิปเพราะลูกค้าเลือกจ่ายตอนมารับของ) */
  const cashBtn = card.locator('.btn.primary').first();
  push('ออเดอร์เงินสด/มารับเอง กดรับได้เลย ไม่ต้องดูสลิป',
    !(await cashBtn.isDisabled()) && (await cashBtn.textContent()).includes('รับออเดอร์'));
  await seller.screenshot({ path: SHOT + '/ord-multi.png' });
  await seller.evaluate(async () => { await deleteOrder('multi'); });
  await seller.waitForTimeout(600);

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
    (await ask(() => document.querySelectorAll('.bottomnav button[data-tab]').length, 0)) >= 4);

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

  /* ---------- หน้าลูกค้าเปิดค้างไว้ แล้วร้านเอาของใหม่ขึ้นเว็บ ----------
     ลูกค้ายืนรอคิวโดยเปิดหน้านี้ค้างไว้เป็นสิบนาที หน้าที่เปิดค้างแค่วาดใหม่
     ไม่ได้โหลดหน้าใหม่ จึงใช้โค้ดชุดเก่าต่อไปเรื่อย ๆ ถึงเราจะเอาของใหม่ขึ้นเว็บแล้ว
     (เจ้าของเคยเจอ: แก้เสร็จเอาขึ้นเว็บแล้ว แต่หน้าที่เปิดค้างไว้ยังเป็นของเก่า) */
  const custVer = await b.newPage({ viewport:{width:390,height:844} });
  let loads = 0;
  custVer.on('load', () => loads++);

  await custVer.goto(`${APP}/order.html?s=${key}&c=${encodeURIComponent(CLOUD)}`);
  await custVer.waitForTimeout(900);
  const pageVer = await custVer.evaluate(() => (typeof PAGE_VER === 'string' ? PAGE_VER : ''));
  push('หน้าลูกค้ารู้เลขรุ่นของเว็บที่ตัวเองเป็นอยู่', /^crepe-cost-v\d+$/.test(pageVer));
  push('รุ่นเดียวกับบนเว็บ = ไม่โหลดหน้าใหม่ให้เสียของ', loads === 1);

  // ทำเป็นว่าเราเพิ่งเอาของใหม่ขึ้นเว็บ (เลขรุ่นขยับ)
  const newVer = 'crepe-cost-v' + (Number(pageVer.replace(/\D/g, '')) + 1);
  await custVer.route('**/sw.js*', r => r.fulfill({
    status:200, contentType:'application/javascript',
    body:`const CACHE = '${newVer}';`
  }));
  // ลูกค้าหยิบมือถือขึ้นมาดูอีกที
  await custVer.evaluate(() => { verAt = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await custVer.waitForTimeout(1500);
  push('มีของใหม่บนเว็บแล้ว หน้าลูกค้าโหลดหน้าใหม่ให้เอง', loads === 2);

  // โหลดใหม่แล้วแต่ยังได้ของเก่าอยู่ (แคชเบราว์เซอร์ดื้อ) ต้องไม่วนโหลดไม่จบ
  await custVer.waitForTimeout(1200);
  push('ไม่วนโหลดหน้าใหม่ไม่จบ ถ้าโหลดแล้วยังได้ของเก่า', loads === 2);
  await custVer.unroute('**/sw.js*');

  /* ---------- ลิงก์มั่ว ---------- */
  const cust3 = await b.newPage({ viewport:{width:390,height:844} });
  await cust3.goto(`${APP}/order.html?s=ไม่มีจริง&c=${encodeURIComponent(CLOUD)}`);
  await cust3.waitForTimeout(600);
  push('ลิงก์ที่ไม่มีร้านจริง ไม่พังแต่บอกให้รู้', (await cust3.textContent('#view')).includes('ยังไม่ได้เปิด'));

  /* ---------- service worker เก็บหน้าเว็บแยกตามหน้า ----------
     เคยพังมาแล้ว: ตัวจัดการ navigate เอาทุกหน้าที่เปิดไปยัดลงช่องของ index.html
     ลูกค้าเปิด order.html ทีหนึ่ง หน้าลูกค้าก็ไปทับที่เก็บของแอปร้าน
     พอเน็ตหลุดแล้วแม่ค้าเปิดแอป ได้หน้าลูกค้าขึ้นมาแทน
     (ทำท้ายสุดแล้ว unregister ทิ้ง ไม่ให้ไปคุมหน้าอื่นในชุดทดสอบ) */
  const swPage = await b.newPage({ viewport:{width:390,height:844} });
  try{
    await swPage.goto(`${APP}/index.html`);
    await swPage.evaluate(async () => {
      await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
    });
    await swPage.reload();                       // รอบนี้มี service worker คุมแล้ว
    await swPage.waitForTimeout(400);
    push('ลงทะเบียน service worker ได้',
      await swPage.evaluate(() => !!navigator.serviceWorker.controller));

    // ลูกค้าเปิดหน้าสั่งของ — ผ่านมือ service worker เหมือนของจริง
    await swPage.goto(`${APP}/order.html?s=${key}&c=${encodeURIComponent(CLOUD)}`);
    await swPage.waitForTimeout(800);

    const kept = await swPage.evaluate(async () => {
      const names = await caches.keys();
      const c = await caches.open(names.find(x => x.startsWith('crepe-cost-v')) || names[0]);
      const grab = async u => { const r = await c.match(u); return r ? await r.text() : ''; };
      return { home: await grab('/index.html'), order: await grab('/order.html') };
    });
    // แอปร้านมี crepe-hub-v1 · หน้าลูกค้ามี crepe-order-base ไม่ปนกัน
    push('เปิดหน้าลูกค้าแล้ว ที่เก็บของแอปร้านยังเป็นแอปร้าน',
      kept.home.includes('crepe-hub-v1') && !kept.home.includes('crepe-order-base'));
    push('หน้าลูกค้าถูกเก็บไว้ในช่องของตัวเอง เปิดตอนเน็ตหลุดได้',
      kept.order.includes('crepe-order-base'));
  }catch(e){
    push('ทดสอบ service worker ได้ (' + e.message.slice(0, 60) + ')', false);
  }
  // เก็บกวาด ไม่ให้ service worker ค้างไปคุมรอบทดสอบหน้าถัดไป
  await swPage.evaluate(async () => {
    for(const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for(const k of await caches.keys()) await caches.delete(k);
  }).catch(() => {});

  /* ---------- เลขคิวต้องไม่หายเป็นช่วง ----------
     เจ้าของเจอเอง: กดล้างออเดอร์วันนี้ แล้วลูกค้าสั่งเข้ามา ได้ "คิวที่ 2"
     คิวที่ 1 หายไปเฉย ๆ

     สาเหตุ: แอปถามที่เก็บทุก 5 วิ และยังถามเพิ่มตอนกลับมาดูจอกับตอนล้างออเดอร์
     ถ้าเน็ตช้าจนรอบก่อนยังไม่จบ สองรอบจะเห็นออเดอร์ใบเดียวกันที่ยังไม่มีเลข
     แล้วต่างคนต่างแจกเลข รอบแรกแจก 1 รอบสองแจก 2 ตัวหลังเขียนทับ */
  const qKey = await seller.evaluate(() => db.orderKey);
  await seller.evaluate(async () => {
    // ล้างให้เกลี้ยงแล้วคืนเลขคิวเป็น 0 เหมือนกดปุ่ม "ล้างออเดอร์วันนี้"
    const d = await cloudReq('GET', `s/${db.orderKey}/orders`);
    const patch = {}; Object.keys(d || {}).forEach(k => patch[k] = null);
    if(Object.keys(patch).length) await cloudReq('PATCH', `s/${db.orderKey}/orders`, patch);
    db.queueDay = dayKey(); db.queueNo = 0; save();
    cloudOrders = []; seenOrders = null;
    await pollOrders();
  });
  await seller.waitForTimeout(500);
  push('ล้างออเดอร์แล้ว เลขคิวกลับไปเริ่มที่ 0', await seller.evaluate(() => n(db.queueNo)) === 0);

  // ลูกค้าสั่งเข้ามาหนึ่งใบ แล้วแอปถามสองรอบซ้อนกัน (เหมือนเน็ตช้าของจริง)
  await fetch(`${CLOUD}/s/${qKey}/orders.json`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ at: Date.now(), status:'new', total: 15,
      items:[{ id:'m1', name:'เครปกรอบ', qty:1, price:15, addons:[], total:15 }] })
  });
  await seller.evaluate(() => { pollOrders(); pollOrders(); });   // ซ้อนกัน ไม่รอกัน
  await seller.waitForTimeout(1500);

  const qAfter = Object.values(await (await fetch(`${CLOUD}/s/${qKey}/orders.json`)).json() || {})
                       .map(o => o.no);
  push('ถามซ้อนกันแล้วลูกค้าคนแรกยังได้ "คิวที่ 1"', qAfter.length === 1 && qAfter[0] === 1);
  push('ถามซ้อนกันแล้วตัวนับไม่กระโดด', await seller.evaluate(() => n(db.queueNo)) === 1);
  push('ไม่มีเลขคิวซ้ำกัน', new Set(qAfter).size === qAfter.length);

  /* ---------- เมนูขายดีที่ลูกค้าเห็น + เมนูจัดชุด ----------
     เจ้าของขอมาเอง: "เมนูที่ลูกค้าสั่งบ่อย ๆ ไปแสดงที่ลูกค้าได้มั้ย
     แล้วร้านตั้งเมนูพิเศษได้มั้ย ว่าทางร้านตั้งให้เลยว่ามีใส่อะไรบ้าง"

     ทำท้ายสุดของชุด เพราะบล็อกนี้เพิ่มเมนูกับใส่ยอดขายย้อนหลังเข้าไป
     ถ้าไปแทรกกลางทาง ข้อที่นับจำนวนเมนู (2 อัน) จะตกทั้งที่โค้ดถูก */
  await seller.evaluate(async () => {
    /* เมนูจัดชุด ตั้ง incl/extraTop ไว้ด้วย **ตั้งใจ**
       ถ้าไส้ที่ร้านจัดให้หลุดเข้าสูตรโควตา จะถูกคิดเพิ่ม (2-1)x10 = 10 บาททันที
       ข้อที่เช็กราคา 25 จึงจับได้ว่าสูตรกลางตัดค่าไส้ของเมนูจัดชุดจริงไหม */
    /* จัดชุดข้ามชุดไส้ — เจ้าของถามเอง: "ถ้าใส่คาวกับหวานหมดด้วยล่ะ ไหนจะซอสด้วยนะ"
       5 อย่างจาก 2 ชุด ใช้พิสูจน์ว่าราคายังเดียว และแถวเมนูไม่ยาวจนล้น */
    db.groups.push({ id:'g2', name:'ไส้หวาน', items:[
      {id:'b1', name:'นูเทลล่า', price:10}, {id:'b2', name:'กล้วย', price:5},
      {id:'b3', name:'ช็อกโกแลต', price:5}]});
    db.menus.push({ id:'m3', name:'เครปจัดชุดพิเศษ', price:25, groupIds:['g1','g2'], items:[],
                    incl:1, extraTop:10,
                    fix:['ไส้กรอก', "ไข่ไก่ด'ล", 'นูเทลล่า', 'กล้วย', 'ช็อกโกแลต'] });
    // เครปกรอบ 6 จาน (ขายดี) · เครปนุ่ม 1 จาน (น้อยกว่า HOT_MIN จึงไม่ติดป้าย)
    const mk = (id, nm, qty) => ({ id:'x' + id + qty, d:dayKey(), t:'10:00',
      menuId:id, name:nm, qty, addons:[], total:qty * 15 });
    db.sales = [mk('m1','เครปกรอบ',6), mk('m2','เครปนุ่ม',1)];
    save();
    await publishMenu();
  });
  await seller.waitForTimeout(700);

  const pubHot = await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json();
  const mOf = id => pubHot.menus.find(m => m.id === id) || {};
  push('เมนูที่ขายบ่อยติดอันดับขึ้นไปในใบเมนู', mOf('m1').hot === 1);
  push('เมนูที่ขายได้น้อยไม่ติดป้าย (ไม่โกหกลูกค้า)', mOf('m2').hot === 0);
  /* **ห้ามส่งจำนวนจานหรือยอดเงินขึ้นคลาวด์** ยอดขายย้อนหลังเป็นเรื่องในร้าน
     เช็กรายชื่อช่องทั้งหมดเลย ไม่ใช่เช็กแค่ว่าไม่มีคำว่า sales
     ไม่งั้นวันหลังมีคนเติมช่อง "ขายได้กี่จาน" ขึ้นไปก็ยังผ่าน */
  push('ใบเมนูมีแต่ช่องที่ควรมี ไม่มีตัวเลขยอดขายปนขึ้นไป',
    Object.keys(mOf('m1')).sort().join(',') === 'extraTop,fix,groups,hot,id,incl,name,off,price');
  push('อันดับขายดีเป็นเลข 1-3 เท่านั้น',
    pubHot.menus.every(m => Number.isInteger(m.hot) && m.hot >= 0 && m.hot <= 3));
  push('ไส้ที่ร้านจัดให้ขึ้นไปด้วยครบทุกชุด (คาว + หวาน)',
    Array.isArray(mOf('m3').fix) && mOf('m3').fix.length === 5
    && mOf('m3').fix.includes('ไส้กรอก') && mOf('m3').fix.includes('ช็อกโกแลต'));

  await cust.reload(); await cust.waitForTimeout(900);
  push('ลูกค้าเห็นป้ายขายดีแค่อันเดียว', await cust.locator('#view .li-hot').count() === 1);
  push('ป้ายอยู่บนเมนูที่ขายดีจริง',
    (await cust.locator('#view .li').nth(0).textContent()).includes('ขายดี'));
  /* **ต้อง count() ก่อนทุกครั้ง** ป้ายที่หายไปแล้วไป textContent() ตรง ๆ
     มันรอจนหมดเวลาแล้วโยน error = ล้มทั้งชุดโดยไม่รายงานผลสักข้อ
     (เจอมาแล้วตอนพิสูจน์ชุดนี้ — ถอดป้ายออกแล้วชุดตายทั้งชุด ไม่ใช่ตกข้อเดียว) */
  const hotTxt = await cust.locator('#view .li-hot').count()
    ? await cust.locator('#view .li-hot').first().textContent() : '';
  push('ป้ายไม่ได้บอกยอดขายของร้านให้ลูกค้ารู้', !!hotTxt && !/\d/.test(hotTxt));

  const setIdx = await cust.evaluate(() => menu.menus.findIndex(m => m.id === 'm3'));
  const setRow = setIdx >= 0 ? await cust.locator('#view .li').nth(setIdx).textContent() : '';
  push('หน้ารายการบอกตั้งแต่ยังไม่กดว่าร้านจัดไส้ให้อะไร', setRow.includes('ร้านจัดไส้ให้'));
  /* ไส้เยอะ ๆ ต้องตัดให้สั้นในแถวรายการ ไม่งั้นแถวเดียวสูงสี่บรรทัด
     (เห็นตอนถ่ายภาพหน้าจอจริง ใส่ 10 อย่างแล้วกินพื้นที่กว่าชื่อเมนูอีก) */
  push('ไส้เยอะแล้วแถวเมนูไม่ยาวเป็นพรืด', setRow.includes('และอีก 2 อย่าง'));

  if(setIdx >= 0){
    await cust.evaluate(i => pick(i), setIdx);
    await cust.waitForTimeout(900);
    push('กล่องเมนูจัดชุดไม่มีชิปให้ติ๊กไส้ (เปลี่ยนเองไม่ได้)',
      await cust.locator('#sheet .tops .top').count() === 0);
    const sheetTxt = await cust.textContent('#sheet');
    /* **กล่องที่กดเข้าไปต้องโชว์ครบทุกชื่อ** ตัดได้แค่ในแถวรายการ
       ลูกค้าต้องรู้ว่าจ่าย 25 แล้วได้อะไรบ้าง ไม่ใช่สั่งแบบเดา */
    push('กล่องบอกครบทุกไส้ที่จะได้ (ทั้งคาวและหวาน)',
      sheetTxt.includes('ร้านจัดไส้ให้แล้ว')
      && ['ไส้กรอก', 'นูเทลล่า', 'กล้วย', 'ช็อกโกแลต'].every(nm => sheetTxt.includes(nm))
      && !sheetTxt.includes('และอีก'));
    await cust.evaluate(() => addToCart());
    await cust.waitForTimeout(600);
    const line = await cust.evaluate(() => cart[cart.length - 1] || {});
    push('ราคาเมนูจัดชุดเป็นราคาเดียว ไม่คิดค่าไส้เพิ่ม', line.total === 25);
    push('ไส้ที่ร้านจัดให้ติดไปกับออเดอร์ครบทุกอัน', (line.addons || []).length === 5);
    await cust.evaluate(() => { cart.length = 0; draw(); });
  } else {
    push('กล่องเมนูจัดชุดไม่มีชิปให้ติ๊กไส้ (เปลี่ยนเองไม่ได้)', false);
    push('แต่บอกชัดว่าจานนี้ใส่อะไรให้แล้ว', false);
    push('ราคาเมนูจัดชุดเป็นราคาเดียว ไม่คิดค่าไส้เพิ่ม', false);
    push('ไส้ที่ร้านจัดให้ติดไปกับออเดอร์ด้วย', false);
  }
  // กล่องที่เผลอเปิดค้างไว้จะไปบังปุ่มของข้อถัด ๆ ไป ปิดทิ้งเสมอ
  await cust.evaluate(() => { try{ el('dlg').close(); }catch(e){} });
  await cust.waitForTimeout(900);
  await cust.screenshot({ path: SHOT + '/cust-hot-set.png' });

  /* ฝั่งแม่ค้า: กดเมนูจัดชุดในหน้าต่างสั่งสินค้า ไส้ต้องติดมาเองโดยไม่เปิดกล่องให้ติ๊ก */
  const bill = await seller.evaluate(() => {
    openOrderDialog();
    tapMenu('m3'); tapMenu('m3');
    const l = (order && order.lines) || [];
    const html = orderDialogHTML();
    return { lines: l.length, qty: n((l[0] || {}).qty), adds: ((l[0] || {}).addons || []).length,
             total: orderTotal(), topBtn: document.querySelectorAll('.bl-top').length,
             // บิลคือสิ่งที่แม่ค้าอ่านตอนยืนทอด ต้องเห็นไส้ครบทุกชื่อ ห้ามตัด
             billFull: ['ไส้กรอก', 'นูเทลล่า', 'ช็อกโกแลต'].every(nm => html.indexOf(nm) >= 0) };
  });
  push('แม่ค้ากดเมนูจัดชุด ไส้ติดมาในบิลครบทุกอัน', bill.adds === 5);
  push('กดซ้ำ = เพิ่มจำนวนบรรทัดเดิม ไม่แตกบรรทัดซ้ำ', bill.lines === 1 && bill.qty === 2);
  push('บิลคิดราคาเดียว ไม่บวกค่าไส้', bill.total === 50);
  push('บรรทัดเมนูจัดชุดไม่มีปุ่ม "เลือกไส้" ให้กด', bill.topBtn === 0);
  push('บิลหน้าร้านโชว์ไส้ครบทุกชื่อ (ไม่ตัดเหมือนแถวเมนู)', bill.billFull === true);
  // คืนสภาพ ไม่ทิ้งบิลค้างกับกล่องเปิดค้างไว้
  await seller.evaluate(() => { try{ closeOrderDialog(); dlg.close(); }catch(e){} });
  await seller.waitForTimeout(900);

  /* ---------- ไส้หมดรายอย่าง ----------
     เจ้าของถามเอง: "แล้วตั้งตรงไหน ไส้คาวกับหวาน ตอนที่หมด"
     ไส้กรอกหมด → ลูกค้าต้องเห็นว่าหมดและติ๊กไม่ได้ แต่เมนูธรรมดายังสั่งได้ (เลือกไส้อื่น)
     ส่วนเมนูจัดชุดที่ใส่ไส้กรอกไว้ ลูกค้าเลือกเองไม่ได้ ต้องถูกปิดให้ด้วย */
  await seller.evaluate(() => toggleTopOut('ไส้กรอก'));
  await seller.waitForTimeout(900);
  const pubT = await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json();
  const itemsOf = m => (m.groups || []).flatMap(g => g.items || []);
  const m1p = pubT.menus.find(m => m.id === 'm1') || { groups: [] };
  push('ไส้ที่หมดขึ้นไปบอกลูกค้าในใบเมนู',
    (itemsOf(m1p).find(it => it.name === 'ไส้กรอก') || {}).off === true);
  push('ไส้อื่นไม่โดนปิดตาม',
    (itemsOf(m1p).find(it => it.name === "ไข่ไก่ด'ล") || {}).off === false);
  push('เมนูธรรมดาที่มีไส้นั้นยังเปิดอยู่', m1p.off === false);
  push('เมนูจัดชุดที่ใส่ไส้นั้นไว้ ถูกปิดให้ลูกค้าด้วย',
    (pubT.menus.find(m => m.id === 'm3') || {}).off === true);

  await cust.reload(); await cust.waitForTimeout(900);
  const rowsT = await cust.locator('#view .li').count();
  const setRowT = rowsT >= 3 ? await cust.locator('#view .li').nth(2).textContent() : '';
  push('ลูกค้าเห็นเมนูจัดชุดนั้นเป็น "หมดแล้ว"', setRowT.includes('หมดแล้ว'));
  /* เจ้าของทักเอง: หน้าร้านขึ้น "เลือกไส้ได้ 23" แต่ลูกค้าเห็นเลขน้อยกว่า อ่านแล้วงง
     สองฝั่งต้องเห็นเลขเดียวกัน (นับเฉพาะที่ยังมี ชื่อซ้ำนับครั้งเดียว) */
  const custN = Number(((await cust.locator('#view .li').nth(0).textContent()).match(/เลือกไส้ได้ (\d+)/) || [])[1]);
  const sellN = await seller.evaluate(() => topsLeft(db.menus.find(m => m.id === 'm1')).left);
  push('จำนวนไส้ที่เลือกได้ตรงกันทั้งหน้าร้านและหน้าลูกค้า (' + sellN + ' / ' + custN + ')',
    Number.isFinite(custN) && custN === sellN && sellN > 0);
  await cust.evaluate(() => pick(0));
  await cust.waitForTimeout(900);
  /* **ไส้ที่หมดต้องโชว์ไว้ ห้ามซ่อน** กติกาเดียวกับเมนูที่หมด
     ต้อง count() ก่อน ของที่หายไปแล้วไป textContent() ตรง ๆ จะล้มทั้งชุด */
  const outChip = cust.locator('#sheet .tops .top.out');
  const outTxt = await outChip.count() ? await outChip.first().textContent() : '';
  push('ชิปไส้ที่หมดยังโชว์อยู่ และบอกว่าหมดแล้ว', outTxt.includes('ไส้กรอก') && outTxt.includes('หมดแล้ว'));
  push('ชิปนั้นกดไม่ได้', await cust.locator('#sheet .tops .top.out[disabled]').count() === 1);
  push('ไส้อื่นยังกดได้ตามปกติ', await cust.locator('#sheet .tops .top:not(.out)').count() >= 1);
  await cust.evaluate(() => { try{ tog('ไส้กรอก'); }catch(e){} });     // กันอีกชั้น
  push('เรียกติ๊กตรง ๆ กับไส้ที่หมดก็ไม่ติด',
    await cust.evaluate(() => !edit.picked.has('ไส้กรอก')));
  await cust.evaluate(() => { try{ el('dlg').close(); }catch(e){} });
  await cust.waitForTimeout(900);
  await cust.screenshot({ path: SHOT + '/cust-top-out.png' });
  // คืนสภาพ
  await seller.evaluate(() => toggleTopOut('ไส้กรอก'));
  await seller.waitForTimeout(600);

  /* ---------- แม่ค้ากด "ยอดไม่ตรง" ลูกค้าต้องรู้ ----------
     เจ้าของถามเอง: "กดยอดไม่ตรงแล้วต้องไปแจ้งลูกค้าด้วยไหม"
     ของเดิมหน้าลูกค้าไม่อ่านช่อง chk เลย ค้างที่ "รอร้านกดรับออเดอร์" จุดเด้งไม่มีวันจบ */
  const badRes = await (await fetch(`${CLOUD}/s/${key}/orders.json`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ at: Date.now(), status:'new', total: 25, paid: true, slip:'0f0f0f0f0f0f0f0f',
      items:[{ id:'m1', name:'เครปกรอบ', qty:1, price:15, addons:[], total:25 }] })
  })).json();
  const badId = badRes && badRes.name;
  await cust.evaluate(id => { sentList.push({ id, at: Date.now(), paid: true }); saveSent(); goQueue(); }, badId);
  await cust.waitForTimeout(1200);
  await cust.evaluate(() => refreshMine());          // เห็นออเดอร์รอบแรก (ยังไม่มีอะไรผิด)
  await cust.waitForTimeout(500);
  const buzzBefore = await cust.evaluate(() => window.__buzz);
  const beforeTxt = await cust.textContent('#view');
  push('ก่อนแม่ค้ากด ลูกค้ายังไม่เห็นป้ายเรื่องยอดโอน', !beforeTxt.includes('ยังไม่ตรง'));

  await seller.evaluate(async id => { await pollOrders(); await markPaidChecked(id, -1); }, badId);
  await seller.waitForTimeout(600);
  await cust.evaluate(() => refreshMine());
  await cust.waitForTimeout(600);
  const afterTxt = await cust.textContent('#view');
  push('แม่ค้ากดยอดไม่ตรงแล้ว ลูกค้าเห็นป้ายบอกบนการ์ด',
    afterTxt.includes('ร้านเช็กยอดโอนแล้ว ยังไม่ตรง') && afterTxt.includes('฿25'));
  push('การ์ดไม่ค้างที่ "รอร้านกดรับออเดอร์" อีกต่อไป บอกให้แวะคุยที่ร้าน',
    afterTxt.includes('ร้านขอเช็กเรื่องเงินก่อน'));
  push('คำไม่กล่าวหาลูกค้า (ไม่มีคำว่าโกง/ปลอม)', !/โกง|ปลอม|หลอก/.test(afterTxt));
  push('เตือนลูกค้า (สั่น) ตอนร้านเพิ่งกด', await cust.evaluate(() => window.__buzz) === buzzBefore + 1);
  await cust.evaluate(() => refreshMine());
  await cust.waitForTimeout(600);
  push('เตือนครั้งเดียว ไม่สั่นซ้ำทุกรอบที่ถาม', await cust.evaluate(() => window.__buzz) === buzzBefore + 1);
  // เก็บกวาด
  await fetch(`${CLOUD}/s/${key}/orders/${badId}.json`, { method:'DELETE' }).catch(() => {});

  await b.close();

  let bad = 0;
  ok.forEach(([n2, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n2}`); if(!v) bad++; });
  console.log(bad ? `\n  ตก ${bad} ข้อ\n` : '\n  ผ่านทุกข้อ\n');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
