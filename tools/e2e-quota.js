/* เมนูแบบ "รวมไส้กี่อย่าง" เช่น โตเกียว 2 ไส้ ฿10 / 3 ไส้ ฿15
   เลือกเกินโควตาแล้วคิดเงินเพิ่มอันละ extraTop บาท (เจ้าของเลือกทางนี้เอง)

   ข้อที่สำคัญที่สุด: **ราคาฝั่งลูกค้ากับฝั่งร้านต้องตรงกันเป๊ะ**
   ถ้าไม่ตรง ลูกค้าเห็นราคาหนึ่ง ร้านเก็บอีกราคาหนึ่ง แล้วเถียงกันหน้าร้าน */

const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8787';
const CLOUD = 'http://127.0.0.1:8788';

const ok = [];
const push = (name, v) => ok.push([name, !!v]);

// โตเกียว 2 ไส้ ฿10 เกินอันละ ฿5 · เครปคิดราคาต่อไส้เหมือนเดิม
const seed = () => {
  localStorage.setItem('crepe-hub-v1', JSON.stringify({shops:[{
    id:'sh1', shopName:'ร้านเครปทดสอบ', shopOpen:1,
    groups:[{id:'g1', name:'ไส้คาว', items:[
      {id:'a1',name:'ไส้กรอก',price:5}, {id:'a2',name:'ปูอัด',price:5},
      {id:'a3',name:'ไก่หยอง',price:5}, {id:'a4',name:'หมูหยอง',price:5}]}],
    menus:[
      {id:'m1', name:'โตเกียวไส้คาว 2 ไส้', price:10, incl:2, extraTop:5, groupIds:['g1'], items:[]},
      {id:'m2', name:'เครปกรอบ', price:15, groupIds:['g1'], items:[]}
    ],
    ingredients:[], sales:[], expenses:[],
    fixed:{rent:0,electric:0,gas:0,water:0,other:0,days:26,labor:0}
  }], active:'sh1'}));
};

(async () => {
  await fetch(CLOUD + '/__reset').catch(() => {});
  const b = await chromium.launch({ args:['--no-sandbox'] });

  /* ---------- ฝั่งแม่ค้า ---------- */
  const seller = await b.newPage({ viewport:{width:390,height:844} });
  seller.on('pageerror', e => push('สคริปต์ตาย: ' + e.message.slice(0,60), false));
  await seller.goto(APP + '/index.html');
  await seller.evaluate(cloud => localStorage.setItem('crepe-cloud', cloud), CLOUD);
  await seller.evaluate(seed);
  await seller.reload();
  await seller.waitForTimeout(800);

  // คิดราคาตรงตามโควตาไหม — ไล่ตั้งแต่ไม่เลือกเลยจนเกินสองอย่าง
  const price = (menuId, names) => seller.evaluate(([id, ns]) => {
    const m = findMenu(id);
    const tops = menuAddons(m).filter(a => ns.includes(a.name));
    return n(m.price) + addonCost(m, tops);
  }, [menuId, names]);

  push('โตเกียว ไม่เลือกไส้เลย = ฿10',            await price('m1', []) === 10);
  push('โตเกียว เลือก 1 ไส้ ยังไม่เกิน = ฿10',     await price('m1', ['ไส้กรอก']) === 10);
  push('โตเกียว เลือกครบ 2 ไส้ = ฿10',            await price('m1', ['ไส้กรอก','ปูอัด']) === 10);
  push('โตเกียว เกิน 1 อย่าง = ฿15',              await price('m1', ['ไส้กรอก','ปูอัด','ไก่หยอง']) === 15);
  push('โตเกียว เกิน 2 อย่าง = ฿20',              await price('m1', ['ไส้กรอก','ปูอัด','ไก่หยอง','หมูหยอง']) === 20);
  // เมนูโควตา **ห้าม** เอาราคาต่อไส้มาบวกซ้ำ (ไส้ละ 5 × 3 = 15 ถ้าบวกซ้ำจะได้ 25)
  push('เมนูโควตาไม่เก็บซ้ำสองเด้ง (ไม่ใช่ ฿25)',  await price('m1', ['ไส้กรอก','ปูอัด','ไก่หยอง']) !== 25);
  // เครปไม่ได้ตั้งโควตา ต้องคิดราคาต่อไส้เหมือนเดิม
  push('เครปยังคิดราคาต่อไส้เหมือนเดิม = ฿25',     await price('m2', ['ไส้กรอก','ปูอัด']) === 25);

  // บิลจริงในหน้าต่างสั่งสินค้า
  const billTotal = await seller.evaluate(() => {
    openOrderDialog();
    tapMenu('m1');
    const l = order.lines[0];
    ['ไส้กรอก','ปูอัด','ไก่หยอง'].forEach(nm => {
      const a = menuAddons(findMenu('m1')).find(x => x.name === nm);
      l.addons.push({name:a.name, price:n(a.price)});
    });
    return orderTotal();
  });
  push('บิลหน้าร้านคิดตามโควตาจริง ฿15', billTotal === 15);

  // แก้ยอดขายย้อนหลังต้องใช้สูตรเดียวกัน ไม่งั้นแก้แล้วราคาเพี้ยน
  const editTotal = await seller.evaluate(() => {
    saleDraft = { menuId:'m1', qty:1, picked:new Set(['ไส้กรอก','ปูอัด','ไก่หยอง']) };
    return saleTotal();
  });
  push('แก้ยอดขายย้อนหลังก็คิดตามโควตา ฿15', editTotal === 15);

  /* ---------- ส่งขึ้นคลาวด์ให้ลูกค้าเห็น ---------- */
  const key = await seller.evaluate(async () => {
    order = null; orderOpen = false;
    db.orderKey = 'quotakey1'; db.orderOn = 1; save();
    await publishMenu();
    return db.orderKey;
  });
  const pub = await (await fetch(`${CLOUD}/s/${key}/menu.json`)).json();
  const pm = (pub.menus || []).find(x => x.id === 'm1');
  push('ใบเมนูที่ส่งให้ลูกค้าบอกโควตาด้วย', !!pm && pm.incl === 2 && pm.extraTop === 5);

  /* ---------- ฝั่งลูกค้า ต้องได้ราคาเท่ากันเป๊ะ ---------- */
  const cust = await b.newPage({ viewport:{width:390,height:844} });
  cust.on('pageerror', e => push('หน้าลูกค้าตาย: ' + e.message.slice(0,60), false));
  await cust.goto(`${APP}/order.html?s=${key}&c=${encodeURIComponent(CLOUD)}`);
  await cust.waitForTimeout(900);

  const custPrice = ns => cust.evaluate(nms => {
    const mi = menu.menus.findIndex(x => x.id === 'm1');
    const m = menu.menus[mi];
    const all = (m.groups||[]).flatMap(g => g.items||[]);
    const picked = nms.map(nm => all.find(x => x.name === nm)).filter(Boolean)
                      .map(x => ({name:x.name, price:n(x.price)}));
    return n(m.price) + addonCost(m, picked);
  }, ns);

  push('ลูกค้า: ครบ 2 ไส้ = ฿10',   await custPrice(['ไส้กรอก','ปูอัด']) === 10);
  push('ลูกค้า: เกิน 1 อย่าง = ฿15', await custPrice(['ไส้กรอก','ปูอัด','ไก่หยอง']) === 15);
  push('ลูกค้า: เกิน 2 อย่าง = ฿20', await custPrice(['ไส้กรอก','ปูอัด','ไก่หยอง','หมูหยอง']) === 20);

  // ข้อที่สำคัญที่สุด: ไล่เทียบทุกจำนวนไส้ ฝั่งลูกค้ากับฝั่งร้านต้องตรงกันทุกกรณี
  const names = ['ไส้กรอก','ปูอัด','ไก่หยอง','หมูหยอง'];
  let same = true, diff = '';
  for(let k = 0; k <= names.length; k++){
    const ns = names.slice(0, k);
    const a = await price('m1', ns), c = await custPrice(ns);
    if(a !== c){ same = false; diff = `เลือก ${k} ไส้: ร้าน ฿${a} ลูกค้า ฿${c}`; }
  }
  push('ราคาสองฝั่งตรงกันทุกจำนวนไส้' + (same ? '' : ' — ' + diff), same);

  // ลูกค้าต้องเห็นเงื่อนไขตั้งแต่หน้ารายการ ไม่ใช่มารู้ตอนจ่ายเงิน
  const listTxt = await cust.textContent('#view');
  push('หน้ารายการบอกลูกค้าว่ารวมกี่ไส้ เกินคิดเท่าไหร่',
    listTxt.includes('รวมไส้ 2 อย่าง') && listTxt.includes('เกินอันละ 5'));

  /* ชิปเลือกไส้ของเมนูโควตา **ห้ามโชว์ราคาต่อไส้**
     เคยโชว์ "+5" ทุกอัน ทั้งที่ 2 อันแรกฟรี ดูแล้วนึกว่าเลือก 3 อันต้องจ่าย 15
     ซึ่งไม่จริง จ่ายแค่ 5 — หลอกทั้งแม่ค้าและลูกค้า */
  await cust.locator('#view button.li').first().click();   // โตเกียว (เมนูโควตา)
  await cust.waitForTimeout(900);
  const qChips = await cust.locator('#dlg .tops .top').allTextContents();
  push('ลูกค้า: ชิปเมนูโควตาไม่โชว์ราคาต่อไส้', !qChips.some(t => t.includes('+5')));
  push('ลูกค้า: ชิปยังบอกชื่อไส้ครบ', qChips.some(t => t.includes('ไส้กรอก')));
  await cust.locator('#dlg .dlg-x').click();
  await cust.waitForTimeout(900);

  // เครปไม่ใช่เมนูโควตา ต้องยังโชว์ราคาต่อไส้เหมือนเดิม
  await cust.locator('#view button.li').nth(1).click();
  await cust.waitForTimeout(900);
  const cChips = await cust.locator('#dlg .tops .top').allTextContents();
  push('ลูกค้า: เครปยังโชว์ราคาต่อไส้เหมือนเดิม', cChips.some(t => t.includes('+5')));
  await cust.locator('#dlg .dlg-x').click();
  await cust.waitForTimeout(900);

  // ฝั่งแม่ค้าก็ต้องเหมือนกัน
  const sChips = await seller.evaluate(() => {
    order = null; orderOpen = false;
    openOrderDialog(); tapMenu('m1');
    return [...document.querySelectorAll('#dlg .tops .top')].map(e => e.textContent.trim());
  });
  push('แม่ค้า: ชิปเมนูโควตาไม่โชว์ราคาต่อไส้', !sChips.some(t => t.includes('+5')));
  push('แม่ค้า: ชิปยังบอกชื่อไส้ครบ', sChips.some(t => t.includes('ไส้กรอก')));

  /* ---------- แถบเตือนตอนเลือกเกิน ----------
     เจ้าของขอให้เตือนชัด ๆ ว่าต้องเก็บเงินเพิ่มเท่าไหร่
     ตัวหนังสือสีเทาใต้หัวกล่องมันจางเกินไป มองข้ามได้ง่าย */
  const warnOf = async pg => {
    const box = pg.locator('#topWarn');
    return (await box.count()) ? (await box.textContent()).replace(/\s+/g, ' ').trim() : '(ไม่มีช่องเตือน)';
  };

  // --- ฝั่งแม่ค้า ---
  await seller.evaluate(() => { order = null; orderOpen = false; openOrderDialog(); tapMenu('m1'); });
  await seller.waitForTimeout(1100);
  push('ยังไม่เลือกไส้ ไม่มีแถบเตือนมากวน', (await warnOf(seller)) === '');

  for(const nm of ['ไส้กรอก','ปูอัด']){
    await seller.locator('#dlg .tops .top', { hasText:nm }).first().click();
    await seller.waitForTimeout(250);
  }
  push('เลือกครบโควตาพอดี ยังไม่เตือน', (await warnOf(seller)) === '');

  await seller.locator('#dlg .tops .top', { hasText:'ไก่หยอง' }).first().click();
  await seller.waitForTimeout(350);
  const sw = await warnOf(seller);
  push('แม่ค้า: เกินแล้วขึ้นแถบเตือนทันที', sw.includes('เลือกเกินมา 1 อย่าง'));
  push('แม่ค้า: แถบเตือนบอกว่าเก็บเพิ่มกี่บาท', sw.includes('5 บาท'));
  push('แม่ค้า: แถบเตือนบอกราคารวมของจานนี้', sw.includes('15 บาท'));
  push('แม่ค้า: แถบเตือนใช้สีเตือน ไม่ใช่กล่องขาวธรรมดา',
    await seller.locator('#dlg .note.warn').count() === 1);

  // ติ๊กออกแล้วแถบต้องหายเอง ไม่ค้าง
  await seller.locator('#dlg .tops .top', { hasText:'ไก่หยอง' }).first().click();
  await seller.waitForTimeout(350);
  push('แม่ค้า: ติ๊กออกจนไม่เกินแล้ว แถบเตือนหายเอง', (await warnOf(seller)) === '');

  // --- ฝั่งลูกค้า ---
  await cust.locator('#view button.li').first().click();
  await cust.waitForTimeout(1000);
  push('ลูกค้า: ยังไม่เลือก ไม่มีแถบเตือน', (await warnOf(cust)) === '');
  for(const nm of ['ไส้กรอก','ปูอัด','ไก่หยอง']){
    await cust.locator('#dlg .tops .top', { hasText:nm }).first().click();
    await cust.waitForTimeout(250);
  }
  const cw = await warnOf(cust);
  push('ลูกค้า: เกินแล้วขึ้นแถบเตือนทันที', cw.includes('เลือกเกินมา 1 อย่าง'));
  push('ลูกค้า: แถบเตือนบอกว่าคิดเพิ่มกี่บาท', cw.includes('5 บาท'));
  push('ลูกค้า: แถบเตือนบอกราคารวมของจานนี้', cw.includes('15 บาท'));
  push('ลูกค้า: ใช้สีเตือนเหมือนฝั่งแม่ค้า',
    await cust.locator('#dlg .note.warn').count() === 1);

  // สั่ง 2 จาน แถบต้องบอกยอดรวมทั้งสองจานด้วย
  await cust.locator('.qbtn', { hasText:'+' }).first().click();
  await cust.waitForTimeout(600);
  const cw2 = await warnOf(cust);
  push('ลูกค้า: สั่งหลายจาน แถบเตือนบอกยอดรวมด้วย', cw2.includes('2 จาน') && cw2.includes('30 บาท'));

  await b.close();
  let bad = 0;
  ok.forEach(([nm, v]) => { console.log(`  ${v ? '✓' : '✗'} ${nm}`); if(!v) bad++; });
  console.log(bad ? `\n  ตก ${bad} ข้อ\n` : '\n  ผ่านทุกข้อ\n');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
