// ตรวจว่ารหัสคนดูแลล็อกของสำคัญจริง แต่หน้าขายยังใช้ได้ปกติ
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
global.location = { origin:'https://example.test', pathname:'/app/', search:'', href:'https://example.test/app/' };
global.history = { replaceState(){} };
global.setTimeout = (fn) => { if (typeof fn === 'function') fn(); };

const probe = `
(() => {
  const out = [];
  const seen = [];
  const realOpen = openDialog;
  openDialog = cfg => { seen.push(cfg); return realOpen(cfg); };

  db.menus = shopMenu(); db.groups = []; migrateGroups(db); db.hideShopHint = 1; save();

  // --- ยังไม่ตั้งรหัส: ทุกอย่างทำได้เหมือนเดิม ---
  out.push(['ยังไม่ได้ตั้งรหัส ถือว่าเป็นคนดูแล', hasPin() === false && isAdmin() === true]);
  seen.length = 0;
  addMenu();
  out.push(['ยังไม่ตั้งรหัส กดเพิ่มเมนูได้เลย ไม่ถูกถามรหัส',
    seen.length === 1 && String(seen[0].title).indexOf('รหัส') < 0]);

  // --- ตั้งรหัส ---
  const salt = 'saltsalt';
  store.pin = { s: salt, h: pinHash('1234', salt) };
  adminUntil = 0; save();
  out.push(['ตั้งรหัสแล้วถือว่าล็อกอยู่', hasPin() === true && isAdmin() === false]);
  out.push(['รหัสไม่ได้ถูกเก็บเป็นตัวเลขเปล่า ๆ',
    JSON.stringify(store.pin).indexOf('1234') < 0]);
  out.push(['รหัสคนละตัวได้ค่าคนละอัน', pinHash('1234', salt) !== pinHash('1235', salt)]);
  out.push(['รหัสเดียวกันคนละร้านก็ได้ค่าคนละอัน', pinHash('1234', salt) !== pinHash('1234', 'other')]);

  // --- ของสำคัญต้องถามรหัสก่อน ---
  const guarded = [
    ['เพิ่มเมนู', () => addMenu()],
    ['แก้เมนู', () => menuDialog(db.menus[0])],
    ['เลือกชุดไส้ของเมนู', () => pickGroups(db.menus[0].id)],
    ['เพิ่ม/แก้ชุดไส้', () => groupDialog(null)],
    ['ลบชุดไส้', () => delGroup(db.groups[0].id)],
    ['สำรองข้อมูล', () => openBackup()],
    ['ล้างข้อมูล', () => resetAll()],
    ['เพิ่มร้าน', () => addShop()],
    ['แก้ไขร้าน', () => shopDialog(db.id)],
    ['ลิงก์เฉพาะร้าน', () => shopLinkDialog(db.id)],
    ['ใส่เมนูจากใบเมนูร้าน', () => loadShopMenu()],
    ['ใส่ข้อมูลตัวอย่าง', () => loadDemo()]
  ];
  let allAsk = true, which = [];
  guarded.forEach(([label, fn]) => {
    seen.length = 0; adminUntil = 0;
    fn();
    const asked = seen.length && String(seen[0].title).indexOf('ใส่รหัสคนดูแล') >= 0;
    if(!asked){ allAsk = false; which.push(label); }
  });
  out.push(['ของสำคัญทุกอย่างถามรหัสก่อน' + (which.length ? ' — หลุด: ' + which.join(', ') : ''), allAsk]);

  // --- แท็บเครื่องมือของคนดูแลก็ต้องถาม ---
  adminUntil = 0; seen.length = 0; tab = 'sale';
  go('ing');
  out.push(['เข้าแท็บของที่ซื้อมา ต้องใส่รหัสก่อน',
    tab === 'sale' && seen.length && String(seen[0].title).indexOf('ใส่รหัสคนดูแล') >= 0]);

  // --- ลบบิลต้องใส่รหัส และบิลต้องไม่หาย ---
  adminUntil = 0;
  order = { lines: [] }; tapMenu(db.menus[0].id); payBill();
  const billId = (db.sales[db.sales.length-1].bill);
  const salesBefore = db.sales.length;
  seen.length = 0;
  delBill(billId);
  out.push(['ลบบิลต้องใส่รหัส และบิลยังอยู่',
    db.sales.length === salesBefore && String(seen[0].title).indexOf('ใส่รหัสคนดูแล') >= 0]);

  // --- หน้าร้านต้องใช้ได้ตามปกติ ไม่ถูกถามรหัส ---
  adminUntil = 0; seen.length = 0;
  openOrderDialog();
  out.push(['เปิดบิลขายได้โดยไม่ต้องใส่รหัส',
    seen.length && String(seen[0].title) === 'สั่งสินค้า']);
  tapMenu(db.menus[0].id);
  const before = (db.sales||[]).length;
  payBill();
  out.push(['รับเงินได้โดยไม่ต้องใส่รหัส', (db.sales||[]).length > before]);
  adminUntil = 0; seen.length = 0;
  expenseDialog(null);
  out.push(['บันทึกรายจ่ายได้โดยไม่ต้องใส่รหัส',
    seen.length && String(seen[0].title).indexOf('รหัส') < 0]);
  adminUntil = 0;
  out.push(['ดู Dashboard ได้โดยไม่ต้องใส่รหัส', viewToday().length > 500]);
  out.push(['ดูย้อนหลังได้โดยไม่ต้องใส่รหัส', viewHist().length > 300]);
  adminUntil = 0; tab = 'sale';
  go('today');
  out.push(['สลับแท็บ Dashboard ได้โดยไม่ต้องใส่รหัส', tab === 'today']);

  // --- ใส่รหัสถูกแล้วทำต่อได้ ---
  adminUntil = 0; seen.length = 0;
  addMenu();                                   // โดนถามรหัส
  const ask = seen[0];
  out.push(['ใส่รหัสผิดแล้วไม่ผ่าน', !!ask.check({pin:'9999'})]);
  out.push(['ใส่รหัสถูกแล้วผ่าน', ask.check({pin:'1234'}) === null]);
  seen.length = 0;
  ask.save({pin:'1234'});                      // ยืนยันรหัส แล้วต้องทำสิ่งที่ค้างไว้ต่อ
  out.push(['ใส่รหัสถูกแล้วทำสิ่งที่ค้างไว้ต่อให้เลย',
    isAdmin() === true && seen.some(c => String(c.title).indexOf('เมนู') >= 0)]);

  // --- ล็อกเดี๋ยวนี้ / รหัสหมดอายุ ---
  lockAdmin();
  out.push(['กดล็อกเดี๋ยวนี้แล้วล็อกทันที', isAdmin() === false]);
  openAdmin();
  out.push(['ปลดล็อกแล้วใช้ได้', isAdmin() === true]);
  adminUntil = Date.now() - 1;
  out.push(['ปลดล็อกแล้วหมดเวลาก็ล็อกกลับเอง', isAdmin() === false]);

  // --- รหัสต้องอยู่รอดหลังปิดเปิดแอป และไม่ผูกกับร้านใดร้านหนึ่ง ---
  save();
  const raw = JSON.parse(localStorage.getItem('crepe-hub-v1'));
  out.push(['รหัสถูกบันทึกลงเครื่อง', !!(raw.pin && raw.pin.h)]);
  adminUntil = 0;
  db = load();
  out.push(['เปิดแอปใหม่ยังล็อกอยู่', hasPin() === true && isAdmin() === false]);

  // --- กติกาการตั้งรหัส ---
  adminUntil = Date.now() + 60000; seen.length = 0;
  pinDialog();
  const set = seen[0];
  out.push(['ตั้งรหัสสั้นไปไม่ผ่าน', !!set.check({pin:'12', pin2:'12'})]);
  out.push(['ตั้งรหัสเป็นตัวหนังสือไม่ผ่าน', !!set.check({pin:'abcd', pin2:'abcd'})]);
  out.push(['สองช่องไม่ตรงกันไม่ผ่าน', !!set.check({pin:'1234', pin2:'4321'})]);
  out.push(['ตัวเลข 4-6 หลักและตรงกัน ผ่าน', set.check({pin:'123456', pin2:'123456'}) === null]);

  return { out };
})()
`;
const r = eval(script + probe);
let bad = 0;
r.out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
