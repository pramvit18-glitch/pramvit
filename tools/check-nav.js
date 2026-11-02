// ตรวจแถบเมนูล่าง 5 เมนู และหน้ารายจ่ายที่เพิ่งเพิ่มเข้ามา
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const css = src.split('<style>')[1].split('</style>')[0];
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k,v) => { mem[k] = String(v); } };
const stub = () => ({ innerHTML:'', textContent:'', hidden:false, value:'', dataset:{},
  addEventListener(){}, removeEventListener(){}, showModal(){}, close(){}, querySelectorAll:()=>[],
  querySelector:()=>stub(), focus(){}, setAttribute(){},
  classList:{toggle(){},add(){},remove(){},contains:()=>false},
  scrollIntoView(){}, style:{setProperty(){},removeProperty(){}}, replaceWith(){}, insertAdjacentHTML(){} });
global.document = { body: stub(), getElementById: stub, querySelector: () => stub(), createElement: stub };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};

const out = [];
const push = (name, v) => out.push([name, !!v]);

// 5 เมนูเหลือราว 70px ต่ออัน ป้ายยาว ๆ อย่าง "แดชบอร์ด" ต้องไม่ตัดบรรทัด
push('ป้ายเมนูล่างไม่ตัดบรรทัด', /\.bottomnav button span\{[^}]*white-space:nowrap/.test(css));
push('ป้ายเมนูล่างยาวเกินแล้วตัดด้วย …', /\.bottomnav button span\{[^}]*text-overflow:ellipsis/.test(css));
push('ปุ่มเมนูล่างแบ่งพื้นที่เท่ากัน', /\.bottomnav button\{[^}]*flex:1/.test(css));

// ตัวเลือกหน้าใน render() ต้องรู้จักทุกแท็บ ไม่งั้นแท็บนั้นจะเงียบ ๆ ไปโผล่หน้าสำรอง
const dispatch = (/getElementById\('view'\)\.innerHTML =([\s\S]{0,600}?);/.exec(script) || [])[1] || '';
const tabsBlock = (/const TABS = \[([\s\S]*?)\];/.exec(script) || [])[1] || '';
const keys = [...tabsBlock.matchAll(/\['(\w+)'/g)].map(m => m[1]);
const unrouted = keys.filter(k => !new RegExp("tab\\s*===?\\s*'" + k + "'").test(dispatch));
push('ตัวเลือกหน้ารู้จักทุกแท็บ' + (unrouted.length ? ' — ขาด ' + unrouted.join(', ') : ''), !unrouted.length);

const probe = `
(() => {
  const r = [];
  const bal = html => ['div','span','button','p','b','small','h2','h3']
    .every(t => (html.match(new RegExp('<' + t + '[ >]','g'))||[]).length
             === (html.match(new RegExp('</' + t + '>','g'))||[]).length);

  /* ---- แถบเมนูล่าง ---- */
  r.push(['แถบล่างมี 5 เมนู', TABS.length === 5]);
  r.push(['เรียงเป็น ภาพรวม → เงินเข้า → เงินออก → ย้อนหลัง → ตั้งค่า',
    TABS.map(t => t[0]).join() === 'today,sale,money,hist,setup']);
  r.push(['ทุกเมนูมีชื่อและไอคอน', TABS.every(t => t[1] && t[2] && SVG[t[2]])]);
  r.push(['ชื่อเมนูไม่ซ้ำกัน', new Set(TABS.map(t => t[1])).size === TABS.length]);
  r.push(['ชื่อเมนูยาวไม่เกิน 8 ตัวอักษร', TABS.every(t => t[1].length <= 8)]);
  // ทุกแท็บต้องมีหน้าของตัวเองจริง ไม่ใช่ตกไปที่ viewMore() ซึ่งเป็นหน้าสำรองท้ายสุด
  const VIEW = { today:viewToday, sale:viewPOS, money:viewExpense, hist:viewHist, setup:viewSetup };
  const noView = TABS.map(t => t[0]).filter(k => typeof VIEW[k] !== 'function');
  r.push(['ทุกแท็บมีหน้าของตัวเอง' + (noView.length ? ' — ขาด ' + noView.join(', ') : ''), !noView.length]);

  const empty = TABS.map(t => t[0]).filter(k => {
    const h = VIEW[k] ? VIEW[k]() : '';
    return !h || h.length < 50 || !bal(h);
  });
  r.push(['ทุกแท็บวาดเนื้อหาออกมาจริงและแท็กปิดครบ' + (empty.length ? ' — พัง ' + empty.join(', ') : ''),
    !empty.length]);

  /* ---- หน้ารายจ่ายต้องไม่ติด PIN ---- */
  r.push(['หน้ารายจ่ายเปิดได้เลย ไม่ต้องใส่รหัส', !ADMIN_TABS.includes('money')]);

  /* ---- หน้ารายจ่าย ---- */
  tab = 'money';
  r.push(['หน้ารายจ่ายไม่มีหัวตัวเลขซ้ำ', headStat() === null]);

  const exp = viewExpense();
  r.push(['มีการ์ดสรุปยอดจ่ายเดือนนี้', exp.indexOf('จ่ายไปเดือนนี้') >= 0]);
  r.push(['มีแท็บย่อย วันนี้ / เดือนนี้', (exp.match(/dseg-b/g)||[]).length === 2]);
  r.push(['เปิดอยู่แผงเดียว', (exp.match(/dpane on/g)||[]).length === 1]);
  r.push(['มีสรุปเข้า-ออก-เหลือ', (exp.match(/mbox/g)||[]).length >= 1]);
  r.push(['มีปุ่มเพิ่มรายจ่าย', exp.indexOf('expenseDialog(null)') >= 0]);
  r.push(['แท็กปิดครบ', bal(exp)]);
  r.push(['ปุ่มทุกอันมีฟังก์ชันรองรับ',
    [...new Set([...exp.matchAll(/onclick="([A-Za-z_$][A-Za-z0-9_$]*)[(]/g)].map(m => m[1]))]
      .every(f => typeof eval(f) === 'function')]);

  // ตัวเลขต้องตรงกับข้อมูลจริง
  const mk = curMonth();
  const m = sumMonth(mk);
  r.push(['ยอดจ่ายทั้งเดือนตรงกับข้อมูล', m.exp === 0 || exp.indexOf(baht(m.exp)) >= 0]);
  const inMonth = (db.expenses||[]).filter(x => monthKey(x.d) === mk);
  r.push(['นับจำนวนรายการถูก', m.exp === 0 || exp.indexOf(inMonth.length + ' รายการ') >= 0]);

  // สลับไปแท็บเดือนแล้วเนื้อหายังครบ
  segs.exp = 'month';
  const exp2 = viewExpense();
  r.push(['สลับไปเดือนนี้แล้วยังครบ',
    exp2.indexOf('เงินเข้า-ออกทั้งเดือน') >= 0 && (exp2.match(/dpane on/g)||[]).length === 1 && bal(exp2)]);
  segs.exp = 'day';

  // ร้านที่ยังไม่มีรายจ่ายเลยต้องไม่พัง
  const keep = db.expenses;
  db.expenses = [];
  const bare = viewExpense();
  r.push(['ร้านที่ยังไม่มีรายจ่ายก็ไม่พัง',
    bare.indexOf('ยังไม่มีรายจ่าย') >= 0 && bal(bare)]);
  db.expenses = keep;

  tab = 'today';
  return r;
})()
`;
eval(script + probe).forEach(([name, v]) => out.push([name, !!v]));

let bad = 0;
out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
