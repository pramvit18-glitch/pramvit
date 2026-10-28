// ตรวจว่าแอปทนค่าแปลก ๆ ที่ร้านจริงพิมพ์ได้ โดยไม่พังเงียบ ๆ
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};
const stub = () => {
  const cls = new Set();
  return { innerHTML:'', textContent:'', hidden:false, value:'', dataset:{}, title:'',
    addEventListener(){}, removeEventListener(){}, showModal(){}, close(){},
    querySelectorAll:()=>[], querySelector:()=>stub(), focus(){}, setAttribute(){},
    classList:{ toggle(c,on){ const w = on === undefined ? !cls.has(c) : !!on; w ? cls.add(c) : cls.delete(c); },
      add(c){cls.add(c)}, remove(c){cls.delete(c)}, contains:c=>cls.has(c) },
    scrollIntoView(){}, replaceWith(){}, insertAdjacentHTML(){} };
};
global.document = { body: stub(), getElementById: stub, querySelector: () => stub(), createElement: stub };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};
global.location = { origin:'https://x.test', pathname:'/', search:'', href:'https://x.test/' };
global.history = { replaceState(){} };

// เบราว์เซอร์จะถอดรหัส &amp; &quot; ฯลฯ ก่อนส่งโค้ดใน onclick ให้ JS
global.__decode = h => String(h)
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// โค้ดในปุ่มรันได้จริงไหม (แค่ parse ไม่ได้เรียก)
global.__parses = code => { try{ new Function(code); return true; }catch(e){ return false; } };

const probe = `
(() => {
  const out = [];
  const t = (label, ok, why) => out.push([label, !!ok, ok ? '' : (why || '')]);

  db.menus = shopMenu(); db.groups = []; migrateGroups(db); db.hideShopHint = 1;
  db.ingredients = []; db.expenses = []; db.sales = []; save();

  // ชื่อแบบที่ร้านจริงพิมพ์ได้: มี ' " & < และช่องว่าง
  const WEIRD = "ไข่'พิเศษ \\"ใหญ่\\" & <ด่วน>";

  // ปุ่มทุกตัวในก้อน HTML นี้ โค้ดใน onclick ต้อง parse ผ่านหมด
  const allButtonsOk = html => {
    const bad = [];
    const re = /on(?:click|keydown|input|change)="([^"]*)"/g;
    let m;
    while((m = re.exec(html))){
      const code = global.__decode(m[1]);
      if(!global.__parses(code)) bad.push(code.slice(0, 70));
    }
    return bad;
  };

  // ---------- ชื่อไส้แปลก ๆ ----------
  const g = db.groups[0];
  g.items[0].name = WEIRD;
  let bad = allButtonsOk(topsHTML(menuAddons(db.menus[0]), new Set(), 'LID'));
  t('ชื่อไส้แปลก ๆ ไม่ทำให้ปุ่มในหน้าต่างเลือกไส้พัง', bad.length === 0, bad.join(' | '));

  // ติ๊กไส้ชื่อแปลกแล้วต้องคิดเงินได้จริง
  order = { lines: [] }; orderOpen = false;
  tapMenu(db.menus[0].id);
  const lid = order.lines[0].lid;
  const base = orderTotal();
  pickLineTop(lid, WEIRD, null);
  t('ติ๊กไส้ชื่อแปลกแล้วบวกราคาได้', orderTotal() === base + n(g.items[0].price),
    'ยอดไม่ขยับ (' + base + ' -> ' + orderTotal() + ')');
  payBill();
  const rec = db.sales[db.sales.length - 1];
  t('ขายแล้วชื่อไส้แปลกถูกบันทึกครบ', (rec.addons||[]).some(a => a.name === WEIRD));

  // ---------- หมวดเมนูแปลก ๆ ----------
  db.menus[0].cat = WEIRD;
  order = { lines: [] }; orderOpen = true; posCat = null; posQ = '';
  bad = allButtonsOk(orderDialogHTML());
  t('ชื่อหมวดแปลก ๆ ไม่ทำให้ปุ่มหมวดพัง', bad.length === 0, bad.join(' | '));
  db.menus[0].cat = ''; orderOpen = false; order = null;

  // ---------- กล่องแก้รายการขาย ----------
  saleDraft = { menuId: db.menus[0].id, qty: 1, picked: new Set() };
  renderSaleDialog();
  bad = allButtonsOk(dlgCfg.html || '');
  t('ชื่อไส้แปลก ๆ ไม่ทำให้ปุ่มในกล่องแก้รายการขายพัง', bad.length === 0, bad.join(' | '));
  saleDraft = null;
  g.items[0].name = 'ไข่ไก่';

  // ---------- ชื่อเมนู / ชื่อร้าน / รายจ่าย แปลก ๆ ทั้งหน้า ----------
  db.menus[0].name = WEIRD;
  db.shopName = WEIRD; db.shopBranch = WEIRD;
  db.expenses.push({id:uid(), d:dayKey(), t:'08:00', note:WEIRD, amount:50});
  db.groups[1].name = WEIRD;
  const pages = [viewPOS(), viewToday(), viewHist(), viewSetup()];
  bad = pages.flatMap(allButtonsOk);
  t('ทุกหน้าหลักทนชื่อแปลก ๆ ได้ ปุ่มไม่พัง', bad.length === 0, bad.slice(0,2).join(' | '));
  db.menus[0].name = 'เครป แป้งวานิลา'; db.groups[1].name = 'ไส้หวาน';
  db.shopName = 'ร้านเครป'; db.shopBranch = ''; db.expenses = [];

  // ---------- ชื่อร้านมีอักขระพิเศษในลิงก์ ----------
  db.shopName = 'ร้าน A & B'; db.shopBranch = 'ซอย #3';
  const u = new URL(shopLink(db.id));
  t('ลิงก์เฉพาะร้านพาชื่อที่มี & และ # ไปครบ',
    u.searchParams.get('n') === 'ร้าน A & B' && u.searchParams.get('b') === 'ซอย #3',
    'ได้ ' + u.searchParams.get('n') + ' / ' + u.searchParams.get('b'));
  db.shopName = 'ร้านเครป'; db.shopBranch = '';

  // ---------- เงินติดลบ ----------
  t('เงินติดลบขึ้นเครื่องหมายลบหน้าสัญลักษณ์เงิน', money(-400) === '-฿400', 'ได้ ' + money(-400));
  t('เงินบวกยังปกติ', money(1250) === '฿1,250', 'ได้ ' + money(1250));
  t('หน้าย้อนหลังใช้รูปแบบเงินติดลบ',
    viewHist().indexOf('฿-') < 0 || 'ยังมี ฿- อยู่ในหน้า');

  // ---------- ราคาว่าง / ไม่ใช่ตัวเลข ----------
  db.menus.push({id:'bad', name:'เมนูไม่ใส่ราคา', price:'', groupIds:[]});
  order = { lines: [] }; orderOpen = false;
  tapMenu('bad');
  t('เมนูที่ไม่ได้ใส่ราคาไม่ทำให้ยอดรวมเป็น NaN', isFinite(orderTotal()), 'ได้ ' + orderTotal());
  order = null;
  db.menus = db.menus.filter(x => x.id !== 'bad');

  // ---------- บิลที่เปิดค้างอยู่แล้วเมนูถูกลบ ----------
  order = { lines: [] }; orderOpen = false;
  tapMenu(db.menus[0].id);
  const goneId = db.menus[0].id;
  const keepMenus = db.menus.slice();
  db.menus = db.menus.filter(x => x.id !== goneId);
  let ok = true, why = '';
  try{ if(!isFinite(orderTotal())) { ok = false; why = 'ยอดเป็น NaN'; } orderDialogHTML(); }
  catch(e){ ok = false; why = e.message; }
  t('บิลที่เปิดค้างไว้ไม่พังเมื่อเมนูถูกลบ', ok, why);
  db.menus = keepMenus; order = null; orderOpen = false;

  // ---------- บันทึกลงเครื่องไม่ได้ ต้องเตือน ----------
  const realSet = localStorage.setItem;
  let warned = false;
  const realToast = toast;
  toast = () => { warned = true; };
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  saveWarned = false; save();
  localStorage.setItem = realSet; toast = realToast;
  t('บันทึกลงเครื่องไม่ได้แล้วเตือนให้รู้', warned, 'เงียบสนิท ของที่กรอกหายโดยไม่รู้ตัว');

  // ---------- เรียงบิลตามเวลา แม้ข้อมูลเก่าจะไม่เติมศูนย์ ----------
  db.sales = [
    {id:'a', bill:'a', d:dayKey(), t:'9:05',  menuId:db.menus[0].id, name:'A', qty:1, addons:[], total:10},
    {id:'b', bill:'b', d:dayKey(), t:'10:05', menuId:db.menus[0].id, name:'B', qty:1, addons:[], total:10}
  ];
  const seq = billsToday(dayKey()).map(x => x.t);
  t('เรียงบิลล่าสุดก่อน แม้เวลาจะเป็นแบบ 9:05', seq[0] === '10:05', 'ได้ ' + seq.join(' > '));

  // ---------- เดือนข้ามปี ----------
  db.sales = [
    {id:'c', bill:'c', d:'2025-12-31', t:'10:00', menuId:db.menus[0].id, name:'C', qty:1, addons:[], total:10},
    {id:'d', bill:'d', d:'2026-01-02', t:'10:00', menuId:db.menus[0].id, name:'D', qty:1, addons:[], total:10}
  ];
  db.expenses = []; histMonth = '2026-01';
  const ms = allMonths();
  t('เรียงเดือนใหม่ไปเก่าถูก แม้ข้ามปี', ms.join(',') === '2026-01,2025-12', 'ได้ ' + ms.join(','));
  shiftMonth(1);
  t('ย้อนไปเดือนก่อนข้ามปีได้', curMonth() === '2025-12', 'ได้ ' + curMonth());
  shiftMonth(-1);
  t('ไปเดือนถัดไปข้ามปีได้', curMonth() === '2026-01', 'ได้ ' + curMonth());
  histMonth = null;

  // ---------- ข้อมูลอยู่คนละเดือนกับวันนี้ ----------
  db.sales = [{id:'e', bill:'e', d:'2025-03-05', t:'10:00', menuId:db.menus[0].id, name:'E', qty:1, addons:[], total:10}];
  let h = '';
  try{ h = viewHist(); }catch(e){ h = ''; }
  t('หน้าย้อนหลังไม่ว่างเมื่อข้อมูลอยู่คนละเดือนกับวันนี้', h.length > 300, 'ยาว ' + h.length);

  return { out };
})()
`;
const r = eval(script + probe);
let bad = 0;
r.out.forEach(([name, ok, why]) => {
  if (!ok) bad++;
  console.log('  ' + (ok ? '✓' : '✗'), name + (ok ? '' : ' — ' + why));
});
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
