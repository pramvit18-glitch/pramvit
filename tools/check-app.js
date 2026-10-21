// ชุดตรวจของแอป — รันด้วย:  npm run check
// ตรวจ 4 อย่าง: โครงสร้าง HTML ทุกหน้า · ปุ่มที่เรียกฟังก์ชันซึ่งไม่มีจริง · ตัวแปรสีลอย · ตรรกะหลัก
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

/* ---------- ตัวแปรสีที่อ้างแต่ไม่ได้ประกาศ ---------- */
const css = src.split('<style>')[1].split('</style>')[0];
const definedVars = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
const missingVars = [...new Set([...src.matchAll(/var\((--[a-z0-9-]+)/g)]
  .map(m => m[1]).filter(v => !definedVars.has(v)))];

/* ---------- รันแอปแล้วเก็บผล ---------- */
const probe = `
(() => {
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

  const logic = [];
  const key = dayKey();
  const before = sumDay(key);
  const m0 = db.menus[0], m1 = db.menus[1] || db.menus[0];

  /* ---- POS ---- */
  openPOS();
  logic.push(['เปิดบิลได้', !!order]);
  views['ขาย (POS)'] = viewPOS();

  tapMenu(m0.id);
  tapMenu(m0.id);
  logic.push(['กดเมนูซ้ำแล้วเพิ่มจำนวน', order.lines.length === 1 && order.lines[0].qty === 2]);
  tapMenu(m1.id);
  logic.push(['กดคนละเมนูแล้วขึ้นบรรทัดใหม่', order.lines.length === (m1 === m0 ? 1 : 2)]);

  const l0 = order.lines[0];
  const top = (m0.addons || [])[0];
  if (top) {
    pickLineTop(l0.lid, top.name);
    logic.push(['ใส่ท็อปปิ้งแล้วราคาบวกถูก', lineTotal(l0) === (m0.price + top.price) * l0.qty]);
    pickLineTop(l0.lid, top.name);
    logic.push(['กดท็อปปิ้งซ้ำแล้วเอาออกได้', (l0.addons || []).length === 0]);
    pickLineTop(l0.lid, top.name);
  }
  logic.push(['ยอดรวมบิลตรงกับผลรวมทุกบรรทัด',
    orderTotal() === order.lines.reduce((s,l) => s + lineTotal(l), 0)]);

  lineQty(l0.lid, -1);
  logic.push(['ลดจำนวนได้', order.lines[0].qty === 1]);

  const lineCount = order.lines.length, paid = orderTotal(), salesBefore = db.sales.length;
  payBill();
  logic.push(['รับเงินแล้วปิดบิล', order === null]);
  logic.push(['บันทึกครบทุกบรรทัด', db.sales.length === salesBefore + lineCount]);
  const billId = db.sales[db.sales.length - 1].bill;
  logic.push(['ทุกบรรทัดผูกบิลเดียวกัน', db.sales.filter(x => x.bill === billId).length === lineCount]);
  logic.push(['ยอดขายของวันเพิ่มเท่ากับยอดบิล',
    Math.abs(sumDay(key).sale - (before.sale + paid)) < 0.001]);

  /* ---- รายจ่าย ---- */
  const e0 = db.expenses.length, exp0 = sumDay(key).exp;
  expenseDialog(null);
  logic.push(['กันรายจ่ายไม่ใส่ชื่อ', !!dlgCfg.check({note:'  ', amount:50})]);
  logic.push(['กันรายจ่ายเงิน 0', !!dlgCfg.check({note:'แป้ง', amount:0})]);
  dlgCfg.save({note:'แป้ง 2 ถุง', amount:90});
  logic.push(['บันทึกรายจ่ายได้', sumDay(key).exp === exp0 + 90]);
  delEntry('exp', db.expenses[db.expenses.length - 1].id);
  logic.push(['ลบรายจ่ายได้', db.expenses.length === e0 && sumDay(key).exp === exp0]);

  const d = sumDay(key);
  logic.push(['เหลือ = ขายได้ − ซื้อของ', Math.abs(d.net - (d.sale - d.exp)) < 0.001]);

  /* ---- เมนูจริงจากใบเมนู ---- */
  const ms = shopMenu();
  const crepe = ms[0];
  const egg   = crepe.addons.find(a => a.name === 'ไข่ไก่');
  const jam   = crepe.addons.find(a => a.name === 'แยมสตรอเบอร์รี่');
  const sauce = crepe.addons.find(a => a.name === 'นมข้น');
  const choc  = crepe.addons.find(a => a.name === 'ช็อกโกแลต' && a.group === 'ไส้หวาน');
  logic.push(['ใบเมนูมีครบ 8 เมนู', ms.length === 8]);
  logic.push(['เครปราคาแป้ง 15 บาท', crepe.price === 15]);
  logic.push(['เครปมีไส้+ซอสครบ 23 อย่าง', (crepe.addons || []).length === 23]);
  logic.push(['ไข่ไก่ 10 บาท', !!egg && egg.price === 10]);
  logic.push(['แยมสตรอเบอร์รี่ 5 บาท', !!jam && jam.price === 5]);
  logic.push(['ซอสราดฟรี 0 บาท', !!sauce && sauce.price === 0]);
  logic.push(['โตเกียว 2 ไส้ = 10 บาท', ms[2].price === 10]);
  logic.push(['โตเกียว 3 ไส้ = 15 บาท', ms[3].price === 15]);
  logic.push(['ไส้หวานโตเกียว 25 บาท', ms[4].price === 25]);
  logic.push(['แพนเค้กไส้กรอก 20 บาท', ms[7].price === 20]);
  logic.push(['จัดกลุ่มไส้ไว้ 3 กลุ่ม',
    [...new Set(crepe.addons.map(a => a.group))].length === 3]);
  logic.push(['เครป+ไข่ไก่+ช็อกโกแลต+นมข้น = 30 บาท',
    15 + egg.price + choc.price + sauce.price === 30]);

  return { views, logic, day: d, month: sumMonth(monthKey(key)) };
})()
`;

let r;
try { r = eval(script + probe); }
catch (e) { console.error('\n  ✗ รันไม่ผ่าน:', e.message, '\n'); process.exit(1); }

/* ---------- ตรวจผล ---------- */
let fail = 0;
const TAGS = ['div', 'span', 'button', 'table', 'tr', 'td', 'select'];

console.log('\n  โครงสร้างหน้าจอ');
for (const [name, html] of Object.entries(r.views)) {
  const bad = [];
  for (const t of TAGS) {
    const open = (html.match(new RegExp('<' + t + '[ >]', 'g')) || []).length;
    const close = (html.match(new RegExp('</' + t + '>', 'g')) || []).length;
    if (open !== close) bad.push(t + ' ' + open + '/' + close);
  }
  if (/undefined|NaN|\[object/.test(html)) bad.push('มีค่า undefined/NaN');
  if (bad.length) fail++;
  console.log('   ', bad.length ? '✗' : '✓', name.padEnd(20),
              String(html.length).padStart(6), 'ตัวอักษร', bad.join(' '));
}

/* ปุ่มที่เรียกฟังก์ชันซึ่งไม่มีอยู่จริง */
const allHTML = Object.values(r.views).join(' ');
const handlerRx = /on(?:click|keydown)="[^"]*?([A-Za-z_$][A-Za-z0-9_$]*)\(/g;
// ชื่อที่ไม่ใช่ฟังก์ชันของแอป (คำสงวน หรือเมธอดของ event)
const SKIP = ['if', 'event', 'return', 'function', 'for', 'while', 'stopPropagation', 'preventDefault'];
const called = [...new Set([...allHTML.matchAll(handlerRx)].map(m => m[1]))].filter(f => !SKIP.includes(f));
const declared = new Set([
  ...[...script.matchAll(/function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)].map(m => m[1]),
  ...[...script.matchAll(/(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g)].map(m => m[1]),
  'dlg'
]);
const ghosts = called.filter(f => !declared.has(f));
console.log('\n  ปุ่มทั้งหมด ' + called.length + ' ตัว');
if (ghosts.length) { fail++; console.log('    ✗ เรียกฟังก์ชันที่ไม่มีอยู่จริง:', ghosts.join(', ')); }
else console.log('    ✓ มีฟังก์ชันรองรับครบทุกปุ่ม');

console.log('\n  ตรรกะการใช้งาน');
for (const [name, ok] of r.logic) {
  if (!ok) fail++;
  console.log('   ', ok ? '✓' : '✗', name);
}

console.log('\n  ตัวแปรสี');
if (missingVars.length) { fail++; console.log('    ✗ อ้างแต่ไม่ได้ประกาศ:', missingVars.join(', ')); }
else console.log('    ✓ ครบทุกตัว');

const b = v => v.toLocaleString('th-TH');
console.log('\n  วันนี้   : ขายได้ ' + b(r.day.sale) + ' · ซื้อของ ' + b(r.day.exp) + ' · เหลือ ' + b(r.day.net));
console.log('  เดือนนี้ : ขายได้ ' + b(r.month.sale) + ' · เหลือ ' + b(r.month.net) + ' (' + r.month.days + ' วัน)');
console.log('\n ', fail ? '✗ ไม่ผ่าน ' + fail + ' จุด' : '✓ ผ่านทั้งหมด', '\n');
process.exit(fail ? 1 : 0);
