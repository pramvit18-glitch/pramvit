// ตรวจว่าทุกครั้งที่บันทึก / แก้ไข / ลบ มีข้อความแจ้งขึ้นจริง
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};
const fields = {};
global.__f = fields;
const stub = (id) => {
  const cls = new Set();
  return { id, innerHTML:'', textContent:'', hidden:false, title:'',
    get value(){ return fields[id] === undefined ? '' : fields[id]; },
    set value(v){ fields[id] = v; },
    dataset: id && id.indexOf('dlg_') === 0 ? { k: id.slice(4) } : {},
    addEventListener(){}, removeEventListener(){}, showModal(){}, close(){},
    querySelectorAll:()=>[], querySelector:()=>stub(), focus(){}, setAttribute(){},
    classList:{ toggle(c,on){ const w = on === undefined ? !cls.has(c) : !!on; w ? cls.add(c) : cls.delete(c); },
      add(c){cls.add(c)}, remove(c){cls.delete(c)}, contains:c=>cls.has(c) },
    scrollIntoView(){}, replaceWith(){}, insertAdjacentHTML(){} };
};
global.document = { body: stub(), getElementById: id => stub(id),
  querySelector: () => stub(), createElement: () => stub() };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};
global.location = { origin:'https://x.test', pathname:'/', search:'', href:'https://x.test/' };
global.history = { replaceState(){} };
global.__msgs = [];
// setTimeout ทำงานทันที เพื่อให้ข้อความแบบ "รอหยุดพิมพ์" ถูกนับด้วย
global.setTimeout = (fn) => { if (typeof fn === 'function') fn(); return 0; };
global.clearTimeout = () => {};

const probe = `
(() => {
  const out = [];
  let cfg = null;
  const realOpen = openDialog;
  openDialog = c => { cfg = c; return realOpen(c); };
  // ดักข้อความแจ้งทุกอัน
  toast = msg => { global.__msgs.push(String(msg)); };

  function pressSave(values){
    Object.keys(values || {}).forEach(k => { global.__f['dlg_' + k] = values[k]; });
    if(!cfg || typeof cfg.save !== 'function') return 'กล่องนี้ไม่มีปุ่มบันทึก';
    const v = {};
    (cfg.fields || []).forEach(f => {
      const raw = global.__f['dlg_' + f.k];
      v[f.k] = f.type === 'number' ? n(raw) : (raw === undefined ? '' : raw);
    });
    const err = cfg.check ? cfg.check(v) : null;
    if(err) return 'ไม่ผ่านการตรวจ: ' + err;
    cfg.save(v);
    return null;
  }
  // ยืนยันแทนผู้ใช้ทันที เพื่อให้เดินไปถึงขั้นลบจริง
  askConfirm = (t, s2, y, onYes) => { if(typeof onYes === 'function') onYes(); };

  db.menus = shopMenu(); db.groups = []; migrateGroups(db);
  db.hideShopHint = 1; db.ingredients = []; db.expenses = []; db.sales = []; save();

  // ทำสิ่งหนึ่ง แล้วดูว่ามีข้อความแจ้งขึ้นไหม และมีคำที่ควรมีอยู่ในข้อความหรือเปล่า
  const act = (label, fn, must) => {
    global.__msgs.length = 0;
    let note = '';
    try{ const r = fn(); if(typeof r === 'string') note = r; }
    catch(e){ out.push([label, false, 'ERROR ' + e.message]); return; }
    const msgs = global.__msgs.slice();
    if(note){ out.push([label, false, note]); return; }
    if(!msgs.length){ out.push([label, false, 'ไม่มีข้อความแจ้งเลย']); return; }
    const joined = msgs.join(' / ');
    if(must && joined.indexOf(must) < 0){
      out.push([label, false, 'ข้อความไม่มีคำว่า "' + must + '" (ได้: ' + joined + ')']); return;
    }
    out.push([label, true, joined]);
  };

  // ---------- เพิ่ม ----------
  act('เพิ่มเมนู', () => { addMenu(); return pressSave({name:'เมนูใหม่', price:30, qtyPerDay:0}); }, 'เพิ่ม');
  act('เพิ่มของที่ซื้อมา', () => { ingDialog(null); return pressSave({name:'แป้ง', packQty:1000, unit:'กรัม', packPrice:60}); }, 'เพิ่ม');
  act('เพิ่มชุดไส้', () => { groupDialog(null); return pressSave({name:'ชุดใหม่'}); }, 'เพิ่ม');
  act('เพิ่มไส้ในชุด', () => { const g = db.groups[db.groups.length-1];
    groupItemDialog(g.id, -1); return pressSave({name:'ไส้ใหม่', price:5}); }, 'เพิ่ม');
  act('บันทึกรายจ่าย', () => { expenseDialog(null); return pressSave({note:'ซื้อไข่', amount:250}); }, 'เพิ่ม');
  act('เพิ่มของที่ใช้ในสูตร', () => { itemDialog(db.menus[0].id, -1);
    return pressSave({ingId: db.ingredients[0].id, qty: 50}); }, 'เพิ่ม');

  // ---------- แก้ไข ----------
  act('แก้ราคาเมนู', () => { menuDialog(db.menus[0]);
    return pressSave({name: db.menus[0].name, price: 22, qtyPerDay: 0}); }, 'แก้');
  act('แก้ของที่ซื้อมา', () => { ingDialog(db.ingredients[0]);
    return pressSave({name:'แป้งสาลี', packQty:1000, unit:'กรัม', packPrice:70}); }, 'แก้');
  act('แก้ชื่อชุดไส้', () => { groupDialog(db.groups[0]);
    return pressSave({name:'ไส้คาวใหม่'}); }, 'แก้');
  act('แก้ราคาไส้', () => { groupItemDialog(db.groups[0].id, 0);
    return pressSave({name: db.groups[0].items[0].name, price: 7}); }, 'แก้');
  act('แก้รายจ่าย', () => { expenseDialog(db.expenses[0]);
    return pressSave({note:'ซื้อไข่ไก่', amount:300}); }, 'แก้');
  act('แก้ชื่อร้าน', () => { shopDialog();
    return pressSave({shopName:'ร้านใหม่', shopBranch:''}); }, 'แล้ว');
  act('แก้จำนวนจานต่อวัน', () => { editSales();
    const v = {}; db.menus.forEach(m => v['q_'+m.id] = 3); return pressSave(v); }, 'แล้ว');
  act('แก้ค่าเช่า/ค่าไฟ', () => { setFixed('rent', 3000); }, 'แล้ว');
  act('ใส่ชุดไส้ให้เมนู', () => { toggleMenuGroup(db.menus[0].id, db.groups[1].id); }, 'แล้ว');
  act('เปิด/ปิดร้าน', () => { toggleShopOpen(); }, 'แล้ว');

  // ---------- ขาย ----------
  act('รับเงินปิดบิล', () => { order = { lines: [] }; orderOpen = false;
    tapMenu(db.menus[0].id); payBill(); }, 'แล้ว');
  const rec = db.sales[db.sales.length - 1];
  act('แก้รายการขาย', () => { editEntry('sale', rec.id); bumpQty(1); commitSale(); }, 'แก้รายการขาย');

  // ---------- ลบ ----------
  act('ลบรายการขาย', () => { delEntry('sale', rec.id); }, 'ลบ');
  act('ลบรายจ่าย', () => { delEntry('exp', db.expenses[0].id); }, 'ลบ');
  act('ลบไส้ในชุด', () => { delGroupItem(db.groups[0].id, 0); }, 'ลบ');
  act('ลบชุดไส้', () => { delGroup(db.groups[db.groups.length-1].id); }, 'ลบ');
  act('ลบของที่ใช้ในสูตร', () => { delItem(db.menus[0].id, 0); }, 'ลบ');
  act('ลบของที่ซื้อมา', () => { delIng(db.ingredients[0].id); }, 'ลบ');
  act('ลบเมนู', () => { delMenu(db.menus[db.menus.length-1].id); }, 'ลบ');
  act('ล้างบิลที่เปิดค้างไว้', () => { order = { lines: [] }; orderOpen = false;
    tapMenu(db.menus[0].id); clearBill(); }, 'ล้างบิล');

  // ---------- ร้าน / ข้อมูล ----------
  act('เพิ่มร้าน', () => { addShop(); return pressSave({name:'ร้านที่สอง', branch:''}); }, 'แล้ว');
  act('ลบร้าน', () => { const other = store.shops.find(x => x.id !== store.active);
    store.active = store.shops[0].id; db = store.shops[0];
    delShop(other.id); }, 'ลบร้าน');
  act('ล้างข้อมูลของร้าน', () => { resetAll(); }, 'ล้างข้อมูล');
  act('ใส่เมนูจากใบเมนูร้าน', () => { loadShopMenu(); }, 'ใส่ให้แล้ว');
  act('ใส่ข้อมูลตัวอย่าง', () => { loadDemo(); }, 'ตัวอย่าง');
  act('กู้คืนข้อมูล', () => { const b = JSON.stringify(store);
    if(applyData(b) !== true) return 'กู้คืนไม่สำเร็จ'; }, 'กู้คืน');

  return { out };
})()
`;
const r = eval(script + probe);
let bad = 0;
r.out.forEach(([name, ok, why]) => {
  if (!ok) bad++;
  console.log('  ' + (ok ? '✓' : '✗'), name + ' — ' + why);
});
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ · ' + r.out.length + ' จุด');
process.exit(bad ? 1 : 0);
