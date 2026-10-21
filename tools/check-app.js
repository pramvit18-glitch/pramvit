// ชุดตรวจของแอป — รันด้วย: node tools/check-app.js
// ตรวจ 3 อย่าง: โครงสร้าง HTML ของทุกหน้า, ตัวแปรสีที่อ้างลอย, และตรรกะหลัก (POS / สมุดรายวัน)
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(FILE, 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

/* ---------- จำลอง DOM เท่าที่โค้ดเรียกใช้ ---------- */
const stub = () => ({
  innerHTML:'', textContent:'', hidden:false, value:'', dataset:{}, className:'',
  addEventListener(){}, removeEventListener(){}, showModal(){}, close(){},
  querySelectorAll:()=>[], querySelector:()=>stub(), focus(){}, setAttribute(){},
  classList:{toggle(){}, add(){}, remove(){}}, scrollIntoView(){}, replaceWith(){},
  insertAdjacentHTML(){}, appendChild(){}
});
global.localStorage = { getItem: () => null, setItem: () => {} };
global.document = { getElementById: stub, querySelector: () => stub(), createElement: stub, body: stub() };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};
global.setTimeout = fn => fn();
global.clearTimeout = () => {};

/* ---------- 1) ตัวแปรสีที่อ้างแต่ไม่ได้ประกาศ ---------- */
const css = src.split('<style>')[1].split('</style>')[0];
const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
const missingVars = [...new Set([...src.matchAll(/var\((--[a-z0-9-]+)/g)]
  .map(m => m[1]).filter(v => !defined.has(v)))];

/* ---------- 2) โครงสร้าง HTML ของทุกหน้า + 3) ตรรกะ ---------- */
const probe = `
(() => {
  const TAGS = ['div','span','button','table','tr','td','select','input'];
  const check = html => {
    const bad = [];
    for (const t of TAGS) {
      if (t === 'input') continue;
      const o = (html.match(new RegExp('<' + t + '[ >]', 'g')) || []).length;
      const c = (html.match(new RegExp('</' + t + '>', 'g')) || []).length;
      if (o !== c) bad.push(t + ' ' + o + '/' + c);
    }
    if (/undefined|NaN|\\[object/.test(html)) bad.push('มีค่า undefined/NaN');
    return bad;
  };

  const views = {};
  order = null; openMenuId = null; recipeDraft = null;
  views['วันนี้']   = viewToday();
  views['ย้อนหลัง'] = viewHist();
  views['เมนู']     = viewMenu();
  views['อื่น ๆ']   = viewMore();
  views['วัตถุดิบ'] = viewIng();
  views['รายจ่าย']  = viewFixed();
  views['ภาพรวม']   = viewDash();
  openMenuId = db.menus[0].id;
  views['เมนู (รายละเอียด)'] = viewMenu();
  openMenuId = null;

  // ---- POS ----
  const logic = [];
  const key = dayKey();
  const before = sumDay(key);
  const m0 = db.menus[0], m1 = db.menus[1] || db.menus[0];

  openPOS();
  logic.push(['เปิดบิลได้', !!order]);
  views['ขาย (POS)'] = viewPOS();

  tapMenu(m0.id);
  tapMenu(m0.id);                       // กดซ้ำ = เพิ่มจำนวน ไม่ใช่เพิ่มบรรทัด
  logic.push(['กดเมนูซ้ำแล้วเพิ่มจำนวน', order.lines.length === 1 && order.lines[0].qty === 2]);
  tapMenu(m1.id);
  logic.push(['กดคนละเมนูแล้วขึ้นบรรทัดใหม่', order.lines.length === (m1===m0 ? 1 : 2)]);

  const l0 = order.lines[0];
  const top = (m0.addons || [])[0];
  if (top) {
    pickLineTop(l0.lid, top.name);
    logic.push(['ใส่ท็อปปิ้งแล้วราคาบวกถูก',
      lineTotal(l0) === (m0.price + top.price) * l0.qty]);
    pickLineTop(l0.lid, top.name);
    logic.push(['กดท็อปปิ้งซ้ำแล้วเอาออกได้', (l0.addons||[]).length === 0]);
    pickLineTop(l0.lid, top.name);
  }

  const expectTotal = order.lines.reduce((s,l) => s + lineTotal(l), 0);
  logic.push(['ยอดรวมบิลตรงกับผลรวมทุกบรรทัด', orderTotal() === expectTotal]);

  lineQty(l0.lid, -1);
  logic.push(['ลดจำนวนได้', order.lines[0].qty === 1]);

  const lines = order.lines.length, paid = orderTotal();
  const salesBefore = db.sales.length;
  payBill();
  logic.push(['รับเงินแล้วปิดบิล', order === null]);
  logic.push(['บันทึกครบทุกบรรทัด', db.sales.length === salesBefore + lines]);
  const billId = db.sales[db.sales.length-1].bill;
  logic.push(['ทุกบรรทัดผูกบิลเดียวกัน',
    db.sales.filter(x => x.bill === billId).length === lines]);
  logic.push(['ยอดขายของวันเพิ่มเท่ากับยอดบิล',
    Math.abs(sumDay(key).sale - (before.sale + paid)) < 0.001]);

  // ---- รายจ่าย ----
  const e0 = db.expenses.length, exp0 = sumDay(key).exp;
  expenseDialog(null);
  logic.push(['กันรายจ่ายไม่ใส่ชื่อ', !!dlgCfg.check({note:'  ', amount:50})]);
  logic.push(['กันรายจ่ายเงิน 0', !!dlgCfg.check({note:'แป้ง', amount:0})]);
  dlgCfg.save({note:'แป้ง 2 ถุง', amount:90});
  logic.push(['บันทึกรายจ่ายได้', sumDay(key).exp === exp0 + 90]);
  delEntry('exp', db.expenses[db.expenses.length-1].id);
  logic.push(['ลบรายจ่ายได้', db.expenses.length === e0 && sumDay(key).exp === exp0]);

  const d = sumDay(key);
  logic.push(['เหลือ = ขายได้ − ซื้อของ', Math.abs(d.net - (d.sale - d.exp)) < 0.001]);

  const report = {};
  for (const [k,v] of Object.entries(views)) report[k] = { len: v.length, bad: check(v) };
  return { report, logic, day: d, month: sumMonth(monthKey(key)) };
})()
`;

let r;
try { r = eval(script + probe); }
catch (e) { console.error('  ✗ รันไม่ผ่าน:', e.message); process.exit(1); }

let fail = 0;
console.log('\n  โครงสร้างหน้าจอ');
for (const [name, v] of Object.entries(r.report)) {
  const ok = v.bad.length === 0;
  if (!ok) fail++;
  console.log('   ', ok ? '✓' : '✗', name.padEnd(20), String(v.len).padStart(6), 'ตัวอักษร', v.bad.join(' '));
}

console.log('\n  ตรรกะการใช้งาน');
for (const [name, v] of r.logic) {
  if (!v) fail++;
  console.log('   ', v ? '✓' : '✗', name);
}

console.log('\n  ตัวแปรสี');
if (missingVars.length) { fail++; console.log('    ✗ อ้างแต่ไม่ได้ประกาศ:', missingVars.join(', ')); }
else console.log('    ✓ ครบทุกตัว');

const b = v => v.toLocaleString('th-TH');
console.log('\n  วันนี้   : ขายได้ ' + b(r.day.sale) + ' · ซื้อของ ' + b(r.day.exp) + ' · เหลือ ' + b(r.day.net));
console.log('  เดือนนี้ : ขายได้ ' + b(r.month.sale) + ' · เหลือ ' + b(r.month.net) + ' (' + r.month.days + ' วัน)');
console.log('\n ', fail ? '✗ ไม่ผ่าน ' + fail + ' จุด' : '✓ ผ่านทั้งหมด', '\n');
process.exit(fail ? 1 : 0);
