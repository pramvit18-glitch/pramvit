// ตรวจหน้าขาย: หมวดหมู่ กรองเมนู และตัวเลขบอกจำนวนในบิล
const fs = require('fs');
const file = process.argv[2] || 'index.html';
const src = fs.readFileSync(file, 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

global.localStorage = { getItem: () => null, setItem: () => {} };
const stub = () => ({ innerHTML:'', textContent:'', hidden:false, value:'', dataset:{},
  addEventListener(){}, removeEventListener(){}, showModal(){}, close(){},
  querySelectorAll:()=>[], querySelector:()=>stub(), focus(){}, setAttribute(){},
  classList:{toggle(){},add(){},remove(){},contains:()=>false}, scrollIntoView(){}, replaceWith(){}, insertAdjacentHTML(){} });
global.document = { body: stub(), getElementById: stub, querySelector: () => stub(), createElement: stub };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};

const probe = `
(() => {
  db.menus = shopMenu(); db.groups = []; migrateGroups(db);
  db.sales = []; order = { lines: [] }; posCat = null; orderOpen = true;

  const RE = /class="posrow[" ]/g;          // อย่านับ posrow-n / posrow-p
  const out = [];
  const all = orderDialogHTML();

  out.push(['แสดงครบทุกเมนู (' + db.menus.length + ')', (all.match(RE)||[]).length === db.menus.length]);
  out.push(['มีแถบหมวดให้เลือก', all.indexOf('class="cats"') >= 0 && all.indexOf('ทั้งหมด') >= 0]);

  const cats = allCats();
  let okFilter = true;
  cats.forEach(c => {
    posCat = c;
    const want = db.menus.filter(m => menuCat(m) === c).length;
    if((orderDialogHTML().match(RE)||[]).length !== want) okFilter = false;
  });
  out.push(['กรองได้ถูกทุกหมวด', okFilter]);

  posCat = null;
  tapMenu(db.menus[0].id); tapMenu(db.menus[0].id);
  out.push(['ปุ่มที่อยู่ในบิลขึ้นเลข 2', orderDialogHTML().indexOf('posrow-c">2<') >= 0]);
  out.push(['ยอดบิลถูก', orderTotal() === db.menus[0].price * 2]);

  const o = t => (orderDialogHTML().match(new RegExp('<' + t + '[ >]', 'g'))||[]).length;
  const c = t => (orderDialogHTML().match(new RegExp('</' + t + '>', 'g'))||[]).length;
  out.push(['หน้าต่างสั่งสินค้าแท็กครบ', ['div','span','button','p'].every(t => o(t) === c(t))]);

  // --- หน้าขายต้องเก็บบิลที่ขายไปแล้วเป็นรายการ ---
  payBill();
  out.push(['รับเงินแล้วบิลเข้าไปในสมุด', (db.sales||[]).length === 1]);
  orderOpen = false; order = null;
  const page = viewPOS();
  out.push(['หน้าขายมีปุ่มสั่งสินค้า', page.indexOf('openOrderDialog()') >= 0]);
  out.push(['หน้าขายโชว์บิลที่ขายไปแล้ว', billsToday(dayKey()).length === 1]);
  const o2 = t => (page.match(new RegExp('<' + t + '[ >]', 'g'))||[]).length;
  const c2 = t => (page.match(new RegExp('</' + t + '>', 'g'))||[]).length;
  out.push(['หน้าขายแท็กครบ', ['div','span','button','p'].every(t => o2(t) === c2(t))]);

  return { out, cats };
})()
`;
const r = eval(script + probe);
let bad = 0;
r.out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log('\n  หมวดที่จัดได้:', r.cats.join(' · '));
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
