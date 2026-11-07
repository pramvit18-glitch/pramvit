// ตรวจว่า "ทุกจุดที่กดแก้ได้" บันทึกได้จริง โดยเดินผ่านปุ่มบันทึกจริงของแต่ละกล่อง
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};
// สตั๊บที่จำค่าในช่องกรอกได้ เพื่อจำลองการกดบันทึกจริง
const fields = {};
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
    scrollIntoView(){}, style:{setProperty(){},removeProperty(){}}, replaceWith(){}, insertAdjacentHTML(){} };
};
global.document = { body: stub(), addEventListener(){}, removeEventListener(){}, getElementById: id => stub(id),
  querySelector: () => stub(), createElement: () => stub() };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};
global.location = { origin:'https://x.test', pathname:'/', search:'', href:'https://x.test/' };
global.history = { replaceState(){} };

const probe = `
(() => {
  const out = [];
  let cfg = null;
  const realOpen = openDialog;
  openDialog = c => { cfg = c; return realOpen(c); };

  // กดปุ่มบันทึกของกล่องที่เปิดอยู่ แบบเดียวกับที่ dlgSubmit ทำ
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

  db.menus = shopMenu(); db.groups = []; migrateGroups(db);
  db.hideShopHint = 1; db.ingredients = []; db.expenses = []; db.sales = []; save();

  const check = (label, fn) => {
    try{ const r = fn(); out.push([label, r === true, r === true ? '' : String(r)]); }
    catch(e){ out.push([label, false, 'ERROR ' + e.message]); }
  };

  // ---------- เมนู ----------
  check('แก้ราคาเมนู', () => {
    menuDialog(db.menus[0]);
    const e = pressSave({name: db.menus[0].name, price: 99, qtyPerDay: 0});
    return e || db.menus[0].price === 99 || 'ราคาไม่เปลี่ยน';
  });
  // เพิ่มเมนูแล้วเลือกไส้ได้ในหน้าต่างเดียว ไม่ต้องกลับมาทำรอบสอง
  check('เพิ่มเมนูพร้อมเลือกชุดไส้ได้ในครั้งเดียว', () => {
    menuDraftGroups = new Set();
    addMenu();
    const picker = cfg.extra || '';
    if(picker.indexOf('gchip') < 0) return 'หน้าต่างเพิ่มเมนูไม่มีที่ให้เลือกชุดไส้';
    toggleDraftGroup(db.groups[0].id, null);
    toggleDraftGroup(db.groups[1].id, null);
    const e = pressSave({name:'เครปทดสอบไส้', price: 25, qtyPerDay: 0});
    if(e) return e;
    const made = db.menus.find(x => x.name === 'เครปทดสอบไส้');
    if(!made) return 'ไม่ได้เมนูใหม่';
    if((made.groupIds||[]).length !== 2) return 'ชุดไส้ไม่ติดมากับเมนู (ได้ ' + (made.groupIds||[]).length + ')';
    if(menuAddons(made).length < 2) return 'เลือกชุดไส้แล้วแต่ตอนขายยังไม่มีไส้ให้ติ๊ก';
    return true;
  });

  // แก้เมนูเดิมต้องเห็นว่าติ๊กชุดไหนไว้อยู่ และเอาออกได้
  check('แก้เมนูแล้วติ๊กชุดไส้เดิมค้างไว้ให้ และเอาออกได้', () => {
    const made = db.menus.find(x => x.name === 'เครปทดสอบไส้');
    menuDialog(made);
    if(menuDraftGroups.size !== 2) return 'ไม่ได้ติ๊กชุดเดิมค้างไว้';
    toggleDraftGroup(db.groups[0].id, null);
    const e = pressSave({name: made.name, price: 25, qtyPerDay: 0});
    if(e) return e;
    return (made.groupIds||[]).length === 1 || 'เอาชุดออกไม่ได้';
  });
  /* เมนูจัดชุด — ร้านตั้งไส้ไว้ให้เลย (เจ้าของขอมาเอง)
     ต้องเลือกจากไส้ที่มีอยู่แล้ว ไม่ใช่ให้พิมพ์ชื่อไส้เอง
     พิมพ์แล้วสะกดไม่ตรงกับไส้จริง ลูกค้าจะเห็นชื่อคนละแบบกับที่ร้านรู้จัก */
  check('ตั้งเมนูจัดชุดได้ และไส้ที่ร้านจัดให้ไม่คิดเงินเพิ่ม', () => {
    menuDraftGroups = new Set(); menuDraftFix = new Set();
    addMenu();
    if(String(cfg.extra || '').indexOf('fpickSum') < 0) return 'หน้าต่างเมนูไม่มีที่ให้ตั้งไส้ที่ร้านจัดให้';
    const names = allAddonNames();
    if(names.length < 2) return 'ร้านนี้ไม่มีไส้ให้เลือกเลย';
    toggleDraftGroup(db.groups[0].id, null);
    toggleDraftFix(names[0].name, null);
    toggleDraftFix(names[1].name, null);
    const e = pressSave({name:'เครปจัดชุดทดสอบ', price:25, qtyPerDay:0, incl:1, extraTop:10});
    if(e) return e;
    const made = db.menus.find(x => x.name === 'เครปจัดชุดทดสอบ');
    if(!made) return 'ไม่ได้เมนูใหม่';
    if((made.fix || []).length !== 2) return 'ไส้ที่ร้านจัดให้ไม่ติดมากับเมนู';
    if(!isSetMenu(made)) return 'บันทึกแล้วแต่ไม่นับว่าเป็นเมนูจัดชุด';
    // ตั้งโควตาไว้ด้วย (incl 1 / เกินอันละ 10) ถ้าสูตรไม่ตัด จะถูกคิดเพิ่ม 10 บาททันที
    if(addonCost(made, setAddons(made)) !== 0) return 'ยังคิดค่าไส้เพิ่มอยู่';
    return true;
  });
  check('แก้เมนูจัดชุดแล้วเห็นไส้เดิมค้างไว้ และเอาออกได้', () => {
    const made = db.menus.find(x => x.name === 'เครปจัดชุดทดสอบ');
    menuDialog(made);
    if(menuDraftFix.size !== 2) return 'ไม่ได้ติ๊กไส้เดิมค้างไว้ให้';
    toggleDraftFix([...menuDraftFix][0], null);
    const e = pressSave({name: made.name, price:25, qtyPerDay:0, incl:1, extraTop:10});
    if(e) return e;
    return (made.fix || []).length === 1 || 'เอาไส้ที่จัดให้ออกไม่ได้';
  });
  check('เพิ่มเมนูใหม่', () => {
    const before = db.menus.length;
    addMenu();
    const e = pressSave({name:'เมนูทดสอบ', price: 40, qtyPerDay: 0});
    return e || db.menus.length === before + 1 || 'ไม่ได้เมนูใหม่';
  });

  // ---------- ชุดไส้ ----------
  check('แก้ชื่อชุดไส้', () => {
    groupDialog(db.groups[0]);
    const e = pressSave({name:'ชุดทดสอบ'});
    return e || db.groups[0].name === 'ชุดทดสอบ' || 'ชื่อไม่เปลี่ยน';
  });
  check('แก้ราคาไส้ในชุด', () => {
    groupItemDialog(db.groups[0].id, 0);
    const e = pressSave({name: db.groups[0].items[0].name, price: 88});
    return e || n(db.groups[0].items[0].price) === 88 || 'ราคาไม่เปลี่ยน';
  });
  check('แก้ไส้ตัวถัดไปต่อได้ทันที', () => {
    groupItemDialog(db.groups[0].id, 1);
    const e = pressSave({name: db.groups[0].items[1].name, price: 66});
    return e || n(db.groups[0].items[1].price) === 66 || 'ราคาไม่เปลี่ยน';
  });

  // ---------- วัตถุดิบ / รายจ่าย ----------
  check('เพิ่มของที่ซื้อมา', () => {
    ingDialog(null);
    const e = pressSave({name:'แป้งทดสอบ', packQty: 1000, unit:'กรัม', packPrice: 100});
    return e || db.ingredients.length === 1 || 'ไม่ได้วัตถุดิบใหม่';
  });
  check('บันทึกรายจ่าย', () => {
    expenseDialog(null);
    const e = pressSave({note:'ซื้อไข่ทดสอบ', amount: 250});
    return e || (db.expenses||[]).some(x => x.note === 'ซื้อไข่ทดสอบ') || 'ไม่ได้บันทึก';
  });

  // ---------- ร้าน ----------
  check('แก้ชื่อร้าน', () => {
    shopDialog();
    const e = pressSave({shopName:'ร้านทดสอบ', shopBranch:'สาขาทดสอบ'});
    return e || db.shopName === 'ร้านทดสอบ' || 'ชื่อไม่เปลี่ยน';
  });
  check('เพิ่มร้านใหม่', () => {
    const before = store.shops.length;
    addShop();
    const e = pressSave({name:'ร้านที่สอง', branch:''});
    const ok = store.shops.length === before + 1;
    // กลับมาร้านเดิม
    store.active = store.shops[0].id; db = store.shops[0];
    return e || ok || 'ไม่ได้ร้านใหม่';
  });

  // ---------- แก้รายการขายย้อนหลัง (จุดที่เคยพัง) ----------
  const m0 = db.menus[0];
  order = { lines: [] }; orderOpen = false;
  tapMenu(m0.id); payBill();
  const rec = db.sales[db.sales.length - 1];
  rec.d = '2026-01-15';                       // ทำให้เป็นรายการของวันเก่า

  check('แก้จำนวนจานของรายการขายเก่าได้', () => {
    editEntry('sale', rec.id);
    bumpQty(2);
    commitSale();
    const after = db.sales.find(x => x.id === rec.id);
    return n(after.qty) === 3 || 'จำนวนจานไม่เปลี่ยน (ได้ ' + after.qty + ')';
  });

  check('ติ๊กไส้ให้รายการขายเก่าแล้วราคาบวกจริง', () => {
    editEntry('sale', rec.id);
    const tops = menuAddons(findMenu(rec.menuId));
    if(!tops.length) return 'เมนูนี้ไม่มีไส้ให้ทดสอบ';
    const paid = tops.find(a => n(a.price) > 0);
    const base = saleTotal();
    toggleTop(paid.name);
    const added = saleTotal() - base;
    commitSale();
    const after = db.sales.find(x => x.id === rec.id);
    if(added !== n(paid.price) * n(after.qty)) return 'ราคาไม่บวกตามไส้ (บวกได้ ' + added + ')';
    if(!(after.addons||[]).some(a => a.name === paid.name)) return 'บันทึกแล้วไส้หาย';
    return true;
  });

  check('เมนูเดิมถูกลบไปแล้ว ยังแก้รายการขายเก่าได้', () => {
    const ghost = { id: uid(), d:'2026-01-15', t:'10:00', menuId:'ไม่มีอยู่จริง',
                    name:'เมนูที่ถูกลบไปแล้ว', qty:1, addons:[], total:20 };
    db.sales.push(ghost);
    editEntry('sale', ghost.id);
    if(!findMenu(saleDraft.menuId)) return 'ยังชี้ไปเมนูที่ไม่มีอยู่';
    bumpQty(1);
    commitSale();
    const after = db.sales.find(x => x.id === ghost.id);
    return (after && n(after.qty) === 2 && after.total > 0) || 'กดบันทึกแล้วไม่มีอะไรเกิดขึ้น';
  });

  // ---------- หน้ารายละเอียดเมนูต้องโชว์ชุดไส้ ไม่ใช่ของเก่าที่ว่างตลอด ----------
  check('หน้ารายละเอียดเมนูโชว์ชุดไส้ที่ใส่ได้', () => {
    const withG = db.menus.find(x => (x.groupIds||[]).length);
    const h = menuGroupList(withG);
    return (h.indexOf('ไส้ที่เมนูนี้ใส่ได้') >= 0 && h.indexOf('pickGroups') >= 0
            && h.indexOf('ยังไม่ได้เลือกชุดไส้') < 0) || 'ยังไม่โชว์ชุดไส้';
  });

  // ---------- ทุกปุ่มในทุกหน้าต้องมีฟังก์ชันรองรับ ----------
  check('ทุกปุ่มในทุกหน้ามีฟังก์ชันรองรับ', () => {
    const pages = [];
    ['sale','today','hist','setup','ing','fixed','dash','more'].forEach(t => {
      tab = t; pages.push(viewOf(t));
    });
    openMenuId = db.menus[0].id; pages.push(viewMenu()); openMenuId = null;
    const names = new Set();
    pages.join('\\n').replace(/on(?:click|input|change|keydown)="([^"]*)"/g, (_, code) => {
      code.replace(/([A-Za-z_$][\\w$]*)\\s*\\(/g, (__, fn) => { names.add(fn); return ''; });
      return '';
    });
    const builtin = new Set(['if','for','while','return','event','preventDefault','stopPropagation',
      'Number','String','Math','JSON','parseInt','parseFloat']);
    const missing = [...names].filter(x => !builtin.has(x) && typeof eval('typeof ' + x) === 'undefined');
    return missing.length === 0 || 'ปุ่มที่ไม่มีฟังก์ชัน: ' + missing.join(', ');
  });

  return { out };
})()
`;

// ช่วยให้ probe เข้าถึงค่าในช่องกรอก และเรียก view ตามชื่อแท็บได้
global.__f = fields;
const helper = `
function viewOf(t){
  return t==='sale' ? viewPOS() : t==='today' ? viewToday() : t==='setup' ? viewSetup()
       : t==='hist' ? viewHist() : t==='menu' ? viewMenu() : t==='ing' ? viewIng()
       : t==='fixed' ? viewFixed() : t==='dash' ? viewDash() : viewMore();
}
`;
const r = eval(script + helper + probe);
let bad = 0;
r.out.forEach(([name, ok, why]) => {
  if (!ok) bad++;
  console.log('  ' + (ok ? '✓' : '✗'), name + (ok ? '' : ' — ' + why));
});
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
