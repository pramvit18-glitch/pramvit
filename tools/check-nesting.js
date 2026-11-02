// ตรวจ "การ์ดซ้อนการ์ด" — ของที่มีพื้นหลังทึบซ้อนกันหลายชั้นจนตาเห็นเป็นกรอบในกรอบ
// เคสที่เคยเป็นปัญหา: ขาว(การ์ด) → เทา(กล่องกลาง) → ขาว(แถว) สามชั้นสลับสี
// ป้ายเล็ก ๆ (ชิป ไอคอนกลม ป้ายตัวเลข) ไม่นับ เพราะมันคือเครื่องหมาย ไม่ใช่พื้นผิว
const fs = require('fs');
const path = require('path');
const FILE = process.argv[2] || path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(FILE, 'utf8');
const css = src.split('<style>')[1].split('</style>')[0].replace(/\/\*[\s\S]*?\*\//g, '');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(m => ({ sels: m[1].split(',').map(x => x.trim().replace(/\s+/g, ' ')), body: m[2] }))
  .filter(r => r.sels[0] && !r.sels[0].startsWith('@'));

// ของที่เล็กเกินกว่าจะเรียกว่าพื้นผิว — กว้างหรือสูงตายตัวไม่เกิน 64px
const isMark = sel => rules.some(r => r.sels.includes(sel) &&
  /(?:^|;)\s*(?:width|height):\s*(\d{1,2})px/.test(r.body) &&
  Number(/(?:^|;)\s*(?:width|height):\s*(\d{1,2})px/.exec(r.body)[1]) <= 64);

// คลาสที่วาดตัวเองเป็นพื้นผิว = มีพื้นหลังทึบ หรือมีเงา
const surface = new Set();
for (const r of rules) {
  const bg = /(?:^|;)\s*background(?:-color)?:\s*(?!none|transparent)[^;]+/.test(r.body);
  const sh = /(?:^|;)\s*box-shadow:\s*(?!none)[^;]+/.test(r.body);
  if (!bg && !sh) continue;
  r.sels.filter(s => /^\.[\w-]+$/.test(s)).forEach(s => { if (!isMark(s)) surface.add(s.slice(1)); });
}
// คลาสที่ถูกสั่งให้เลิกเป็นพื้นผิวในบริบทเจาะจง เช่น ".dlg-body .bill-line"
const flattened = new Set();
for (const r of rules) {
  if (!/background:\s*none/.test(r.body) || !/box-shadow:\s*none/.test(r.body)) continue;
  r.sels.forEach(s => flattened.add(s.split(' ').pop().replace(/^\./, '')));
}

const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
const stub = () => ({ innerHTML:'', textContent:'', hidden:false, value:'', dataset:{},
  addEventListener(){}, removeEventListener(){}, showModal(){}, close(){}, querySelectorAll:()=>[],
  querySelector:()=>stub(), focus(){}, setAttribute(){},
  classList:{toggle(){},add(){},remove(){},contains:()=>false},
  scrollIntoView(){}, style:{setProperty(){},removeProperty(){}}, replaceWith(){}, insertAdjacentHTML(){} });
global.document = { body: stub(), addEventListener(){}, removeEventListener(){},
  getElementById: stub, querySelector: () => stub(), createElement: stub };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};

const views = eval(script + `
(() => {
  const v = {};
  v['แดชบอร์ด'] = viewToday();
  v['ขาย'] = viewPOS();
  v['รายจ่าย'] = viewExpense();
  v['ย้อนหลัง'] = viewHist();
  v['ตั้งค่า'] = viewSetup();
  v['ของที่ซื้อมา'] = viewIng();
  order = { lines: [] }; orderOpen = true; tapMenu(db.menus[0].id);
  v['หน้าต่างสั่งสินค้า'] = orderDialogHTML();
  order = null; orderOpen = false;
  return v;
})()`);

function deepest(html) {
  const stack = [];
  let worst = 0, path = '';
  for (const m of html.matchAll(/<(\/?)(\w+)([^>]*)>/g)) {
    if (m[1] === '/') { stack.pop(); continue; }
    if (/\/>$/.test(m[0]) || /^(br|img|input|hr|path|circle|rect|polyline|line|svg)$/i.test(m[2])) continue;
    const c = /class="([^"]*)"/.exec(m[3]);
    const classes = c ? c[1].split(/\s+/).filter(Boolean) : [];
    const isBox = classes.some(x => surface.has(x)) && !classes.some(x => flattened.has(x));
    stack.push({ classes, isBox });
    const cur = stack.filter(s => s.isBox).map(s => '.' + s.classes[0]);
    if (cur.length > worst) { worst = cur.length; path = cur.join(' > '); }
  }
  return { worst, path };
}

const out = [];
// หน้าต่างมีตัว <dialog> ครอบอีกชั้นที่ไม่ได้อยู่ใน html จึงยอมให้ตื้นกว่า 1 ชั้น
const LIMIT = { 'หน้าต่างสั่งสินค้า': 1 };
for (const [name, html] of Object.entries(views)) {
  const d = deepest(html);
  const max = LIMIT[name] !== undefined ? LIMIT[name] : 2;
  out.push([`${name}: พื้นผิวซ้อนไม่เกิน ${max} ชั้น (ได้ ${d.worst}${d.worst > max ? ' — ' + d.path : ''})`,
    d.worst <= max]);
}

// จุดที่เคยพังจริง ล็อกไว้เฉพาะ
out.push(['บิลในหน้าต่างไม่มีพื้นของตัวเอง',
  !/\.dlg-bill\{[^}]*background:var\(--soft\)/.test(css)]);
out.push(['กล่องเงินเข้า-ออกไม่ใช่ขาวซ้อนเทาซ้อนขาว',
  !/\.mbox-row\{[^}]*background:var\(--bg\)/.test(css)]);
out.push(['สามบรรทัดในกล่องเงินคั่นด้วยเส้นแทนการซ้อนกล่อง',
  /\.mbox-row \+ \.mbox-row\{border-top:1px/.test(css)]);

let bad = 0;
out.forEach(([n, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), n); });
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
