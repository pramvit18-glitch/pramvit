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
    scrollIntoView(){}, replaceWith(){}, insertAdjacentHTML(){} };
};
global.document = { body: stub(), getElementById: stub, querySelector: () => stub(), createElement: stub };
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
  out.push(['ปุ่มเปลี่ยนเป็นแก้ไส้', orderDialogHTML().indexOf('แก้ไส้ (1 อย่าง)') >= 0]);
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

  const o = t => (orderDialogHTML().match(new RegExp('<' + t + '[ >]', 'g'))||[]).length;
  const c = t => (orderDialogHTML().match(new RegExp('</' + t + '>', 'g'))||[]).length;
  out.push(['แท็กครบ', ['div','span','button','p','small','b'].every(t => o(t) === c(t))]);

  return { out, groups: (db.groups||[]).map(g => g.name + '(' + g.items.length + ')') };
})()
`;
const r = eval(script + probe);
let bad = 0;
r.out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log('\n  ชุดไส้:', r.groups.join(' · '));
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
