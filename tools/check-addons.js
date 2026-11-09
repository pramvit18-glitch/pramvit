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
  /* --- จัดชุดข้ามชุดไส้: เอาทั้งคาว ทั้งหวาน ทั้งซอส ---
     เจ้าของถามเอง: "ถ้าใส่คาวกับหวานหมดด้วยล่ะทำไง ไหนจะซอสด้วยนะ" */
  menuDraftFix = new Set();
  const gAll = fixGroups();
  out.push(['ตัวเลือกไส้แยกเป็นชุดให้ ไม่ใช่กองรวมกันหมด', gAll.length >= 3
    && fixPickerHTML().indexOf(gAll[0].name) >= 0
    && fixPickerHTML().indexOf(gAll[1].name) >= 0]);
  out.push(['ทุกชุดมีปุ่ม "เลือกทั้งชุด" ให้กดทีเดียว',
    (fixPickerHTML().match(/toggleDraftFixGroup/g) || []).length === gAll.length]);

  // กดเลือกทั้งชุดของชุดที่ 2 ก่อน แล้วค่อยชุดแรก — ตั้งใจสลับลำดับ
  toggleDraftFixGroup(gAll[1].id);
  toggleDraftFixGroup(gAll[0].id);
  toggleDraftFixGroup(gAll[2].id);
  const wantAll = gAll[0].items.length + gAll[1].items.length + gAll[2].items.length;
  out.push(['กดเลือกทั้งชุดแล้วได้ไส้ทั้งชุดจริง', menuDraftFix.size === wantAll]);
  out.push(['กดซ้ำ = เอาออกทั้งชุด', (() => {
    toggleDraftFixGroup(gAll[1].id);
    const okk = menuDraftFix.size === wantAll - gAll[1].items.length;
    toggleDraftFixGroup(gAll[1].id);
    return okk && menuDraftFix.size === wantAll;
  })()]);
  /* **ต้องเรียงตามลำดับชุด ไม่ใช่ตามลำดับที่แม่ค้าแตะ**
     ไม่งั้นบิลขึ้นหวานก่อนคาวสลับไปมา อ่านตอนยืนทอดแล้วสับสน */
  const sorted = sortedDraftFix();
  const wantOrder = [...gAll[0].items, ...gAll[1].items, ...gAll[2].items].map(it => it.name);
  out.push(['ไส้ที่จัดให้เรียงตามลำดับชุด (คาว → หวาน → ซอส) ไม่ใช่ตามลำดับที่แตะ',
    sorted.join('|') === wantOrder.join('|')]);

  const bigM = { id:'setm2', name:'เครปจัดเต็ม', price:45, groupIds:[gAll[0].id], items:[], fix:sorted };
  db.menus.push(bigM);
  out.push(['ใส่ไส้หมดทุกชุดก็ยังราคาเดียว ไม่บวกเพิ่ม',
    addonCost(bigM, setAddons(bigM)) === 0 && sorted.length >= 9]);

  order = { lines: [] };
  tapMenu(bigM.id);
  const bigLine = order.lines[0];
  out.push(['ไส้ครบทุกอันติดไปกับบรรทัดในบิล',
    !!bigLine && (bigLine.addons || []).length === sorted.length]);
  /* **บิลต้องโชว์ไส้ครบทุกชื่อ** นั่นคือสิ่งที่แม่ค้าอ่านตอนยืนทอด
     ส่วนแถวเมนูที่ไว้กดเลือก ต้องตัดให้สั้น ไม่งั้นแถวเดียวสูงสามบรรทัด เลือกเมนูลำบาก */
  const bigHTML = orderDialogHTML();
  out.push(['บิลโชว์ไส้ครบทุกชื่อ ไม่ตัดทิ้ง',
    sorted.every(nm => bigHTML.indexOf(nm) >= 0)]);
  out.push(['แถวเมนูในหน้าขายตัดให้สั้น ไม่ยาวเป็นพรืด',
    bigHTML.indexOf('และอีก ' + (sorted.length - 3) + ' อย่าง') >= 0]);

  /* ไส้ที่ถูกลบออกจากชุดไปแล้วต้องไม่หายเงียบ และต้องเอาออกได้เอง */
  menuDraftFix = new Set(['ไส้ที่ถูกลบไปแล้ว']);
  out.push(['ไส้ที่ไม่อยู่ในชุดไหนแล้ว ยังเห็นในตัวเลือกและเอาออกได้',
    fixPickerHTML().indexOf('ไส้ที่ถูกลบไปแล้ว') >= 0
    && sortedDraftFix().join('') === 'ไส้ที่ถูกลบไปแล้ว']);
  menuDraftFix = new Set();

  /* --- ไส้หมดรายอย่าง ---
     เจ้าของถามเอง: "แล้วตั้งตรงไหน ไส้คาวกับหวาน ตอนที่หมด"
     ของเดิมปิดได้แค่ทั้งเมนู พอไข่หมดแต่ไส้อื่นยังมี ต้องปิดเมนูทิ้งทั้งอัน = เสียของ */
  const tName = gAll[0].items[0].name;
  // ชื่อไส้เดียวกันอยู่ได้หลายชุด (ไข่ไก่อยู่ทั้งไส้คาวและไส้โตเกียว) ต้องปิดให้ครบทุกชุด
  db.groups.push({ id:'gdup', name:'ชุดทดสอบ', items:[{ id:'dup1', name:tName, price:0 }] });
  toggleTopOut(tName);
  out.push(['ปิดไส้แล้วปิดทุกชุดที่มีชื่อนั้น',
    topsByName(tName).length >= 2 && topsByName(tName).every(isTopOut)]);
  /* **จดเป็นวันที่ ไม่ใช่ true/false** พรุ่งนี้ต้องกลับมาใส่ได้เองโดยไม่ต้องมีใครมาเปิด */
  out.push(['จดเป็นวันที่ พรุ่งนี้กลับมาใส่ได้เอง', (() => {
    const it = topsByName(tName)[0];
    const today = isTopOut(it);
    it.soldDay = '2020-01-01';
    const stale = !isTopOut(it);
    it.soldDay = dayKey();
    return today && stale;
  })()]);
  out.push(['กล่อง "ของหมดวันนี้" มีส่วนของไส้ให้กดด้วย',
    soldOutHTML().indexOf('ไส้ที่หมด') >= 0 && soldOutHTML().indexOf('toggleTopOut(') >= 0]);

  const findIt = (pub, nm) => {
    let f = null;
    pub.menus.forEach(m => (m.groups || []).forEach(g => (g.items || []).forEach(it => {
      if(it.name === nm) f = it;
    })));
    return f;
  };
  const pubOut = menuForCustomers();
  out.push(['ไส้ที่หมดขึ้นไปบอกลูกค้าเป็น true/false ไม่ส่งวันที่',
    (findIt(pubOut, tName) || {}).off === true]);
  out.push(['ไส้อื่นไม่โดนปิดตามไปด้วย',
    (findIt(pubOut, gAll[1].items[0].name) || {}).off === false]);

  /* เมนูจัดชุดที่ไส้ของมันหมด ลูกค้าเลือกไส้เองไม่ได้ สั่งมาก็ทำให้ไม่ได้ตามที่บอกไว้
     จึงต้องปิดเมนูนั้นให้ฝั่งลูกค้าไปเลย (เมนูธรรมดาไม่ต้อง เพราะเลี่ยงไปไส้อื่นได้) */
  db.menus.push({ id:'setout', name:'จัดชุดที่ไส้หมด', price:30,
                  groupIds:[gAll[0].id], items:[], fix:[tName] });
  const pub2 = menuForCustomers();
  const rowOut = pub2.menus.find(m => m.id === 'setout') || {};
  const rowOk  = pub2.menus.find(m => m.id === crepe.id) || {};
  out.push(['เมนูจัดชุดที่ไส้หมด ถูกปิดให้ลูกค้าด้วย', rowOut.off === true]);
  out.push(['เมนูธรรมดาที่ไส้นั้นหมด ยังสั่งได้ (เลือกไส้อื่นแทน)', rowOk.off === false]);
  out.push(['กล่องบอกแม่ค้าด้วยว่าเมนูจัดชุดไหนถูกปิดให้',
    soldOutHTML().indexOf('จัดชุดที่ไส้หมด') >= 0]);
  out.push(['ชิปเลือกไส้ฝั่งแม่ค้าบอกว่าอันไหนปิดไว้ว่าหมด',
    topsHTML(gAll[0].items.map(it => ({ name:it.name, price:it.price, group:gAll[0].name })),
             new Set(), 'x', false).indexOf('top out') >= 0]);

  // คืนสภาพให้เหมือนเดิม ไม่ทิ้งของที่ปิดไว้ให้ข้อถัด ๆ ไป
  toggleTopOut(tName);
  db.groups = db.groups.filter(g => g.id !== 'gdup');
  db.menus  = db.menus.filter(m => m.id !== 'setout');
  out.push(['เปิดคืนแล้วธงหายหมด', topOutNames().length === 0]);

  saleDraft = null;
  db.menus = db.menus.filter(m => m.id !== setM.id && m.id !== bigM.id);
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
