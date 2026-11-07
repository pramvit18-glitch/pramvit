// ตรวจว่า "ไส้ / ท็อปปิ้ง" หาเจอจริงในหน้าต่างสั่งสินค้า
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

global.localStorage = { getItem: () => null, setItem: () => {} };
const opened = [];
const stub = () => {
  const cls = new Set();
  return { innerHTML:'', textContent:'', hidden:false, value:'', dataset:{},
    addEventListener(){}, removeEventListener(){}, showModal(){}, close(){},
    querySelectorAll:()=>[], querySelector:()=>stub(), focus(){}, setAttribute(){},
    classList:{
      toggle(c,on){ const want = on === undefined ? !cls.has(c) : !!on; want ? cls.add(c) : cls.delete(c); return want; },
      add(c){cls.add(c)}, remove(c){cls.delete(c)}, contains:c=>cls.has(c) },
    scrollIntoView(){}, style:{setProperty(){},removeProperty(){}}, replaceWith(){}, insertAdjacentHTML(){} };
};
global.document = { body: stub(), addEventListener(){}, removeEventListener(){}, getElementById: stub, querySelector: () => stub(), createElement: stub };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};

const probe = `
(() => {
  const out = [];
  // ดักเฉพาะหน้าต่าง "เลือกไส้" — หน้าต่างสั่งสินค้าเองก็เรียก openDialog ทุกครั้งที่วาดใหม่
  let seen = [];
  const realOpen = openDialog;
  openDialog = cfg => { if(String(cfg.title||'').indexOf('ไส้') >= 0) seen.push(cfg); return realOpen(cfg); };

  // --- เมนูตัวอย่างที่เปิดมาเจอครั้งแรก ต้องชวนให้ใส่เมนูร้าน ---
  out.push(['เมนูตัวอย่างยังไม่มีโตเกียว จึงชวนให้ใส่เมนูร้าน', needShopMenu() === true]);
  out.push(['หน้าขายมีปุ่มใส่เมนูร้าน', viewPOS().indexOf('loadShopMenu()') >= 0]);
  out.push(['Dashboard ก็มีปุ่มใส่เมนูร้าน (เป็นหน้าแรกที่เปิดเจอ)', viewToday().indexOf('loadShopMenu()') >= 0]);
  hideShopHint();
  out.push(['กดไม่ต้องแล้วการ์ดหายไป', needShopMenu() === false && viewPOS().indexOf('loadShopMenu()') < 0]);

  // --- ใส่เมนูร้าน: ต้องได้ชุดไส้มาด้วย ไม่ใช่แค่ชื่อเมนู ---
  db.menus = shopMenu(); db.groups = []; migrateGroups(db);
  out.push(['ใส่เมนูร้านแล้วมีโตเกียว', db.menus.filter(m => m.name.includes('โตเกียว')).length === 3]);
  out.push(['ชุดไส้ถูกแตกออกมาใช้ร่วมกัน', (db.groups||[]).length >= 5]);
  out.push(['ไม่ต้องชวนใส่เมนูร้านแล้ว', (delete db.hideShopHint, needShopMenu() === false)]);

  db.sales = []; order = { lines: [] }; posCat = null; orderOpen = true;

  // --- ป้ายบอกจำนวนไส้ต้องขึ้นที่แถวเมนู ---
  const withTops = db.menus.filter(m => menuAddons(m).length);
  const html = orderDialogHTML();
  out.push(['แถวเมนูบอกว่าเลือกไส้ได้กี่อย่าง',
    (html.match(/posrow-top/g)||[]).length === withTops.length && withTops.length === 5]);

  // --- กดเมนูที่มีไส้ ต้องเด้งให้เลือกไส้เลย ---
  const crepe = db.menus.find(m => m.name.includes('วานิลา'));
  seen = [];
  tapMenu(crepe.id);
  const picker = seen[0];
  out.push(['กดเมนูที่มีไส้แล้วเด้งให้เลือกไส้เลย', !!picker]);
  out.push(['ในหน้าต่างเลือกไส้มีไส้ให้กดจริง',
    !!picker && (picker.html.match(/class="top[" ]/g)||[]).length === menuAddons(crepe).length]);
  out.push(['แยกหัวข้อไส้คาว-ไส้หวานให้', !!picker && picker.html.indexOf('ไส้คาว') >= 0 && picker.html.indexOf('ไส้หวาน') >= 0]);

  // --- ติ๊กไส้แล้วต้องเห็นทันทีในหน้าต่างเลือกไส้ ไม่ใช่รอกดเสร็จแล้ว ---
  const lid = order.lines[0].lid;
  const line = order.lines[0];
  const btn = { classList: { _on:false, toggle(c,on){ this._on = on === undefined ? !this._on : !!on; } } };
  pickLineTop(lid, 'ไข่ไก่', btn);
  out.push(['ติ๊กแล้วปุ่มนั้นเปลี่ยนเป็นเลือกอยู่ทันที', btn.classList._on === true]);
  const redrawn = topsHTML(menuAddons(crepe), new Set((line.addons||[]).map(a => a.name)), lid);
  const at = redrawn.indexOf('ไข่ไก่');
  out.push(['วาดใหม่แล้วยังจำได้ว่าติ๊กไข่ไก่ไว้',
    at > 0 && redrawn.slice(Math.max(0, at - 160), at).lastIndexOf('class="top on"') >= 0]);
  out.push(['บรรทัดสรุปบอกว่าเลือกอะไรไปแล้ว',
    topSumText(line).indexOf('ไข่ไก่') >= 0 && topSumText(line).indexOf('+10') >= 0]);
  pickLineTop(lid, 'ไข่ไก่', btn);
  out.push(['กดซ้ำปุ่มกลับเป็นไม่เลือก', btn.classList._on === false]);
  pickLineTop(lid, 'ไข่ไก่', btn);

  const before = orderTotal() - 10;
  out.push(['เลือกไส้แล้วขึ้นในบิล', orderDialogHTML().indexOf('ไข่ไก่') >= 0]);
  out.push(['ไส้บวกราคาให้ถูก', orderTotal() === before + 10]);
  out.push(['ปุ่มเปลี่ยนเป็นแก้ไส้ พร้อมบอกจำนวน', orderDialogHTML().indexOf('แก้ไส้ (1)') >= 0]);
  pickLineTop(lid, 'ไข่ไก่', btn);
  out.push(['กดซ้ำเอาไส้ออกได้', orderTotal() === before]);
  out.push(['ไม่เหลือค่าค้างนอกบรรทัด (window._topPick)', typeof window._topPick === 'undefined']);

  // --- เมนูที่ไม่มีไส้ ต้องไม่เด้ง และไม่มีปุ่มหลอกให้กด ---
  const plain = db.menus.find(m => !menuAddons(m).length);
  seen = [];
  tapMenu(plain.id);
  out.push(['เมนูที่ไม่มีไส้ไม่เด้งหน้าต่างเลือกไส้', seen.length === 0]);
  const plainLine = order.lines.find(l => l.menuId === plain.id);
  const bill = orderDialogHTML();
  out.push(['เมนูที่ไม่มีไส้ไม่มีปุ่มเลือกไส้',
    (bill.match(/class="bl-top/g)||[]).length === order.lines.length - 1]);

  // --- กดเมนูเดิมซ้ำต้องเพิ่มจำนวน ไม่ใช่เด้งใหม่ทุกครั้ง ---
  seen = [];
  tapMenu(plain.id);
  out.push(['กดเมนูเดิมซ้ำแค่เพิ่มจำนวน', n(plainLine.qty) === 2 && seen.length === 0]);

  // ปุ่มในกล่องที่ไม่ได้บอก type จะเป็น submit ของ form แล้วกดทีกล่องปิดที
  const noType = h => h.split('<button').slice(1).filter(x => x.slice(0, x.indexOf('>')).indexOf('type=') < 0);
  out.push(['ปุ่มในหน้าต่างสั่งสินค้าบอก type ครบ ไม่ไปปิดกล่องเอง', noType(orderDialogHTML()).length === 0]);
  out.push(['ปุ่มเลือกไส้บอก type ครบ',
    noType(topsHTML(menuAddons(crepe), new Set(), lid)).length === 0]);

  /* --- เมนูจัดชุด: ร้านตั้งไส้ไว้ให้เลย (เจ้าของขอมาเอง) ---
     ตั้ง incl/extraTop ไว้ด้วย **ตั้งใจ** ถ้าไส้ที่ร้านจัดให้หลุดเข้าสูตรโควตา
     จานนี้จะถูกคิดเพิ่ม (2-1)x10 = 10 บาท ทั้งที่ลูกค้าไม่ได้เลือกอะไรเลย */
  const g0 = db.groups[0];
  const setM = { id:'setm1', name:'เครปจัดชุดทดสอบ', price:25, groupIds:[g0.id], items:[],
                 incl:1, extraTop:10, fix:[g0.items[0].name, g0.items[1].name] };
  db.menus.push(setM);
  out.push(['รู้จักว่าเมนูไหนเป็นเมนูจัดชุด',
    isSetMenu(setM) === true && isSetMenu(crepe) === false]);
  out.push(['ไส้ที่ร้านจัดให้ไม่คิดเงินเพิ่ม ถึงจะตั้งโควตาไว้ก็ตาม',
    addonCost(setM, setAddons(setM)) === 0 && addonOver(setM, setAddons(setM)) === 0]);

  order = { lines: [] }; seen = [];
  tapMenu(setM.id);
  const sl = order.lines[0];
  out.push(['กดเมนูจัดชุดแล้วไม่เด้งกล่องให้ติ๊กไส้', seen.length === 0]);
  out.push(['ไส้ที่ร้านจัดให้ติดมากับบรรทัดในบิลเอง', !!sl && (sl.addons||[]).length === 2]);
  out.push(['ราคายังเป็นราคาเดียว ไม่บวกค่าไส้', !!sl && lineTotal(sl) === 25]);
  tapMenu(setM.id);
  out.push(['กดซ้ำเพิ่มจำนวนในบรรทัดเดิม ไม่แตกบรรทัดซ้ำ',
    order.lines.length === 1 && n(order.lines[0].qty) === 2]);
  out.push(['บรรทัดเมนูจัดชุดไม่มีปุ่มเลือกไส้ให้กด', orderDialogHTML().indexOf('bl-top') < 0]);
  out.push(['แถวเมนูในหน้าขายบอกไส้ที่ร้านจัดให้', orderDialogHTML().indexOf('ร้านจัดไส้ให้:') >= 0]);
  // เผลอเรียกตรง ๆ ต้องได้คำอธิบาย ไม่ใช่ชิปให้ติ๊ก (ไม่งั้นแม่ค้าแก้ได้แต่ลูกค้าแก้ไม่ได้)
  seen = [];
  lineAddons(order.lines[0].lid);
  out.push(['เรียกเลือกไส้ตรง ๆ กับเมนูจัดชุด ได้คำอธิบายไม่ใช่ชิป',
    seen.length === 1 && String(seen[0].title).indexOf('จัดไส้ไว้แล้ว') >= 0
    && String(seen[0].html).indexOf('class="top') < 0]);
  // แก้ยอดขายย้อนหลังต้องใช้สูตรเดียวกัน ไม่งั้นย้อนไปแก้แล้วได้ราคาคนละอย่าง
  saleDraft = { menuId:setM.id, qty:2, picked:new Set() };
  out.push(['แก้ยอดขายย้อนหลังก็คิดราคาเดียว', saleTotal() === 50]);
  out.push(['กล่องแก้ยอดขายบอกว่าร้านจัดไส้ไว้แล้ว ไม่โชว์ชิปให้ติ๊ก', (() => {
    let box = null;
    const keep = openDialog;
    openDialog = c => { box = c; return keep(c); };
    renderSaleDialog();
    openDialog = keep;
    return !!box && String(box.html).indexOf('ร้านจัดไส้ไว้แล้ว') >= 0
                 && String(box.html).indexOf('toggleTop(') < 0;
  })()]);
  // บันทึกจริง: ไส้ที่ร้านจัดให้ต้องลงไปในยอดขายด้วย ไม่งั้นย้อนดูแล้วไม่รู้ว่าขายอะไรไป
  out.push(['บันทึกยอดขายเมนูจัดชุดแล้วไส้ติดไปในรายการด้วย', (() => {
    saleDraft = { menuId:setM.id, qty:2, picked:new Set(), d:dayKey(), t:'10:00' };
    const before = (db.sales||[]).length;
    try{ commitSale(); }catch(e){ return false; }
    const rec = (db.sales||[])[db.sales.length - 1] || {};
    const good = db.sales.length === before + 1
              && (rec.addons||[]).length === 2 && n(rec.total) === 50;
    db.sales.pop();                     // คืนสภาพ ไม่ทิ้งยอดขายปลอมไว้ให้ข้อถัดไป
    return good;
  })()]);
  saleDraft = null;
  db.menus = db.menus.filter(m => m.id !== setM.id);
  order = { lines: [] };

  const o = t => (orderDialogHTML().match(new RegExp('<' + t + '[ >]', 'g'))||[]).length;
  const c = t => (orderDialogHTML().match(new RegExp('</' + t + '>', 'g'))||[]).length;
  out.push(['แท็กครบ', ['div','span','button','p','small','b'].every(t => o(t) === c(t))]);

  if(noType(orderDialogHTML()).length) console.log('  ปุ่มที่ยังไม่บอก type:', noType(orderDialogHTML()).map(x => x.slice(0, x.indexOf('>'))));
  return { out, groups: (db.groups||[]).map(g => g.name + '(' + g.items.length + ')') };
})()
`;
const r = eval(script + probe);
let bad = 0;
r.out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log('\n  ชุดไส้:', r.groups.join(' · '));
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
