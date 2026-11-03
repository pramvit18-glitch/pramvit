/* ทางลัดที่พาไปสั่งของ — เมนูลัดหน้าขาย · ขายดีบนแดชบอร์ด · ผลค้นหา
   ทั้งสามเส้นต้องทำงานเหมือนกันเป๊ะ กดจริงในเบราว์เซอร์

   สองบั๊กที่เคยเจอ (เจ้าของเจอเองกับตา):
   1. กดเมนูลัด -> เลือกไส้ -> กดกากบาท แล้วโผล่หน้าต่าง "สั่งสินค้า"
      ที่แม่ค้าไม่ได้สั่งให้เปิด ต้องกดปิดอีกรอบ แถมเมนูที่ยกเลิกไปยังค้างในบิล
   2. กดขายดีบนแดชบอร์ด/ผลค้นหา -> เลือกไส้ -> กด "เสร็จแล้ว" แล้ว
      **กล่องไม่ปิด ค้างอยู่อย่างนั้น** เพราะ orderOpen เป็น false
      (สองเส้นนั้นเรียก tapMenu() ตรง ๆ โดยไม่เปิดหน้าต่างสั่งสินค้าก่อน) */

const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:8787';

const ok = [];
const push = (name, v) => ok.push([name, !!v]);

const seed = () => {
  const d = new Date();
  const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  localStorage.setItem('crepe-hub-v1', JSON.stringify({shops:[{
    id:'sh1', shopName:'ร้านเครปทดสอบ', shopOpen:1,
    groups:[{id:'g1', name:'ไส้คาว', items:[{id:'a1',name:'ไส้กรอก',price:5}]}],
    menus:[{id:'m1', name:'เครปกรอบ', price:15, groupIds:['g1'], items:[]}],
    ingredients:[], expenses:[],
    sales:[{id:'s1',bill:'b1',d:k,t:'10:00',menuId:'m1',name:'เครปกรอบ',qty:3,addons:[],total:45}],
    fixed:{rent:0,electric:0,gas:0,water:0,other:0,days:26,labor:0}
  }], active:'sh1'}));
};

const state = pg => pg.evaluate(() => ({
  dlgOpen: dlg.open,
  title: (document.querySelector('#dlg h3') || {}).textContent || '',
  orderOpen,
  lines: order ? order.lines.length : null,
  tab
}));

(async () => {
  const b = await chromium.launch({ args:['--no-sandbox'] });

  async function fresh(){
    const pg = await b.newPage({ viewport:{width:390,height:844} });
    pg.on('pageerror', e => push('สคริปต์ตาย: ' + e.message.slice(0,50), false));
    await pg.goto(APP + '/index.html');
    await pg.evaluate(seed);
    await pg.reload();
    await pg.waitForTimeout(800);
    return pg;
  }

  // ทางเข้าทั้งสามเส้น ชื่อ + วิธีกด
  /* [ชื่อเส้น, หน้าที่กดมา, วิธีกด]
     แยก "ไปหน้าที่กดมา" ออกจาก "กด" เพราะตัวดักต้องนับเฉพาะ go() ที่แอปเรียกเอง
     ไม่ใช่ go() ที่เทสต์เรียกเองตอนพาไปตั้งต้น */
  const ways = [
    ['เมนูลัดหน้าขาย', 'sale', pg => pg.locator('#view .qmenu-b').first().click()],
    ['ขายดีบนแดชบอร์ด', 'today', pg => pg.locator('.hil-b:not([disabled])').first().click()],
    ['ผลค้นหาเมนู', 'today', async pg => {
      await pg.locator('#searchQ').fill('เครปกรอบ');
      await pg.waitForTimeout(600);
      await pg.locator('[onclick^="searchMenu"]').first().click();
    }]
  ];

  // พาไปหน้าตั้งต้นก่อน แล้วค่อยกด
  const goTap = async (pg, home, click) => {
    await pg.evaluate(t => go(t), home);
    await pg.waitForTimeout(500);
    await click(pg);
  };

  // ดักดูทุกครั้งที่แท็บเปลี่ยน — ใช้จับ "จอกระพริบ" ที่ปลายทางถูกแต่ระหว่างทางเด้ง
  const watchTabs = pg => pg.evaluate(() => {
    window.__tabs = [];
    const realGo = window.go;
    window.go = function(t){ window.__tabs.push(t); return realGo.apply(this, arguments); };
  });

  for(const [name, home, click] of ways){
    /* ---------- กดกากบาท = ยกเลิก ต้องกลับหน้าเดิม ไม่เหลืออะไรค้าง ---------- */
    let pg = await fresh();
    await goTap(pg, home, click);
    await pg.waitForTimeout(1100);
    let s = await state(pg);
    push(`${name}: กดแล้วได้กล่องเลือกไส้`, s.dlgOpen && s.title.includes('เลือกไส้'));
    push(`${name}: หน้าต่างสั่งสินค้าเปิดรออยู่ข้างหลัง`, s.orderOpen === true);

    await pg.locator('#dlg .dlg-x').click();
    await pg.waitForTimeout(1100);
    s = await state(pg);
    push(`${name}: กากบาทแล้วปิดจริง ไม่โผล่หน้าต่างสั่งสินค้า`, s.dlgOpen === false);
    push(`${name}: ยกเลิกแล้วของไม่ค้างอยู่ในบิล`, s.lines === null || s.lines === 0);
    /* ต้องกลับไป **หน้าที่กดมา** ไม่ใช่ทิ้งไว้ที่หน้าขาย
       เจ้าของเจอเอง: กดขายดีจากแดชบอร์ดแล้วยกเลิก มันเด้งไปอยู่หน้าขายเฉย ๆ
       ทั้งที่ไม่ได้ตั้งใจจะย้ายหน้าไปไหน */
    push(`${name}: ยกเลิกแล้วกลับไปหน้าที่กดมา (${home})`, s.tab === home);
    await pg.close();

    /* ---------- ห้ามย้ายแท็บเลยตลอดทาง ----------
       เจ้าของเจอว่าปลายทางถูกแล้วก็จริง แต่ระหว่างทางมัน **แวะหน้าขายให้เห็นแวบหนึ่ง**
       แล้วค่อยเด้งกลับ เห็นเป็นจอกระพริบ ทั้งที่แค่จะกดสั่งของจานเดียว
       หน้าต่างสั่งสินค้าเป็นกล่องลอย เปิดทับหน้าไหนก็ได้ ไม่ต้องย้ายแท็บเลย */
    pg = await fresh();
    await pg.evaluate(t => go(t), home);
    await pg.waitForTimeout(500);
    await watchTabs(pg);                 // เริ่มนับหลังพาไปหน้าตั้งต้นแล้ว
    await click(pg);
    await pg.waitForTimeout(1100);
    const moved = await pg.evaluate(() => window.__tabs);
    push(`${name}: กดแล้วไม่แวะหน้าอื่นให้เห็นแวบ ๆ`, moved.length === 0);
    await pg.locator('#dlg .dlg-x').click();
    await pg.waitForTimeout(1100);
    push(`${name}: ตลอดทางไม่ย้ายแท็บเลยสักครั้ง`,
      (await pg.evaluate(() => window.__tabs)).length === 0);
    push(`${name}: ยังอยู่หน้าเดิมตั้งแต่ต้นจนจบ`,
      await pg.evaluate(() => tab) === home);
    await pg.close();

    /* ---------- กด "เสร็จแล้ว" = ไปต่อที่หน้าต่างสั่งสินค้า ---------- */
    pg = await fresh();
    await goTap(pg, home, click);
    await pg.waitForTimeout(1100);
    const chip = pg.locator('#dlg .tops .top').first();
    if(await chip.count()) { await chip.click(); await pg.waitForTimeout(300); }
    await pg.locator('#dlg button', { hasText:'เสร็จแล้ว' }).click();
    await pg.waitForTimeout(1100);
    s = await state(pg);
    push(`${name}: กดเสร็จแล้ว กล่องเลือกไส้ต้องไม่ค้าง`, !s.title.includes('เลือกไส้'));
    push(`${name}: กดเสร็จแล้วไปต่อที่หน้าต่างสั่งสินค้า`, s.dlgOpen && s.title.includes('สั่งสินค้า'));
    push(`${name}: ของที่เลือกอยู่ในบิลจริง`, s.lines === 1);
    push(`${name}: ไส้ที่ติ๊กไว้ติดไปด้วย`,
      await pg.evaluate(() => !!(order && order.lines[0] && (order.lines[0].addons||[]).length)));
    // กดเสร็จแล้วก็ไม่ย้ายแท็บ บิลอยู่ในกล่องลอยที่เปิดทับอยู่แล้ว
    push(`${name}: กดเสร็จแล้วก็ยังอยู่หน้าเดิม ไม่เด้งไปไหน`, s.tab === home);
    await pg.close();
  }

  /* ---------- ในหน้าต่างสั่งสินค้าเอง ยกเลิกต้องกลับมาที่หน้าต่างนั้น ----------
     อันนี้ **ไม่ใช่บั๊ก** แม่ค้าอยู่ในหน้าต่างนั้นอยู่แล้ว ปิดกล่องไส้ก็ต้องเห็นบิลต่อ
     ถ้าไปปิดหมดเลยจะเสียบิลที่กำลังทำอยู่ ซึ่งแย่กว่า */
  const pg = await fresh();
  await pg.evaluate(() => go('sale'));
  await pg.waitForTimeout(500);
  await pg.locator('#view .orderbtn').click();
  await pg.waitForTimeout(1100);
  await pg.locator('#dlg .posrow').first().click();
  await pg.waitForTimeout(1100);
  let s2 = await state(pg);
  push('ในหน้าต่างสั่งสินค้า: แตะเมนูแล้วได้กล่องเลือกไส้', s2.title.includes('เลือกไส้'));
  await pg.locator('#dlg .dlg-x').click();
  await pg.waitForTimeout(1100);
  s2 = await state(pg);
  push('ในหน้าต่างสั่งสินค้า: ยกเลิกแล้วกลับมาที่บิล ไม่ปิดทิ้งทั้งหมด',
    s2.dlgOpen && s2.title.includes('สั่งสินค้า'));
  push('ในหน้าต่างสั่งสินค้า: บิลที่ทำค้างไว้ยังอยู่', s2.lines === 1);
  await pg.close();

  await b.close();
  let bad = 0;
  ok.forEach(([n, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n}`); if(!v) bad++; });
  console.log(bad ? `\n  ตก ${bad} ข้อ\n` : '\n  ผ่านทุกข้อ\n');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
