// ตรวจ 3 เรื่อง: ป้ายเตือนบิลค้าง · หน้าขายแบบใหม่ · จังหวะระยะห่างที่เคยเพี้ยน
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

/* ---------- ระยะห่าง (CSS) ---------- */
// หัวการ์ดต้องขึ้นบรรทัดใหม่ได้ ไม่งั้นคำอธิบายโดนป้าย+ปุ่มบีบจนตัดคำมั่ว
push('หัวการ์ดห่อบรรทัดได้เมื่อที่ไม่พอ', /\.card-head\{[^}]*flex-wrap:wrap/.test(css));
push('ข้อความในหัวการ์ดมีความกว้างขั้นต่ำ', /\.card-head-t\{[^}]*min-width:150px/.test(css));

// จังหวะหัวข้อต้องเป็นค่าเดียวกันทั้งแอป เดิมปน 20/22/24
const secTop = [...css.matchAll(/\.(?:home-sec|sec|wk)\{[^}]*margin(?:-top)?:\s*(\d+)px/g)].map(m => Number(m[1]));
push(`จังหวะหัวข้อเท่ากันหมด (${[...new Set(secTop)].join('/') || '-'}px)`,
  secTop.length >= 3 && new Set(secTop).size === 1);

// วงแหวน 4px รอบรูปกลม + ป้ายตัวเลขที่ยื่นออกมา ต้องมีที่พอ ไม่โดนขอบตัด
['quick','hil'].forEach(c => {
  const m = new RegExp('\\.' + c + '\\{[^}]*padding:(\\d+)px [^;}]*?(\\d+)px').exec(css);
  push(`.${c} เผื่อที่ให้วงแหวนรอบรูป (บน ${m ? m[1] : '?'}px)`, !!m && Number(m[1]) >= 6);
});

// การ์ดกับการ์ดห่างกัน 14 ทั้งแอป การ์ดสถานะต้องไม่ใช้ค่าอื่น
push('การ์ดสถานะห่างเท่าการ์ดอื่น', /\.srow\{[^}]*margin-top:14px/.test(css));

/* ---------- จังหวะแนวตั้งของคอลัมน์หลัก ----------
   บนหน้าตั้งค่า ของเรียงกันเป็น การ์ดสถานะ → แถบชิป → การ์ด → การ์ด
   ทุกช่องต้องเป็น 14px ช่องไหนหลุดไปจะเห็นเป็นของเกาะกันทันที */
const gapOf = (sel, prop) => {
  const b = (new RegExp('\\.' + sel + '\\{([^}]*)\\}').exec(css) || [])[1] || '';
  const m = new RegExp(prop + ':\\s*(-?\\d+)px').exec(b);
  if (m) return Number(m[1]);
  const sh = /margin:\s*(-?\d+)px/.exec(b);          // margin ย่อ: ค่าแรกคือบน
  return sh ? Number(sh[1]) : null;
};
const col = {
  'การ์ดสถานะ → แถบชิป': gapOf('dseg', 'margin-top'),
  'แถบชิป → การ์ดแรก':   gapOf('dseg', 'margin-bottom'),
  'การ์ด → การ์ด':        gapOf('card, \\.block', 'margin-bottom'),
  'หัวหน้า → การ์ดสถานะ': gapOf('srow', 'margin-top'),
};
Object.entries(col).forEach(([k, v]) => push(`ช่อง "${k}" = 14px (ได้ ${v}px)`, v === 14));

// หัวการ์ด → เนื้อหา ต้องเป็นค่าเดียวกันทั้งแบบ cardHead() และแบบ <h2>+.sub
const headGap = gapOf('card-head', 'margin-bottom');
const subGap = (/\.card > h2 \+ \.sub[^{]*\{[^}]*margin:0 0 (\d+)px/.exec(css) || [])[1];
push(`หัวการ์ด → เนื้อหา ใช้ค่าเดียวกันทั้งสองแบบ (${headGap}px / ${subGap}px)`,
  headGap !== null && String(headGap) === subGap);

// ขอบในของการ์ดสถานะต้องตรงกับการ์ดทั่วไป ไม่งั้นดูแคบกว่าใบอื่นที่อยู่ใต้มัน
const pad = sel => (new RegExp('\\.' + sel + '\\{[^}]*padding:(?:\\d+px )?(\\d+)px').exec(css) || [])[1];
push(`ขอบในซ้าย-ขวาของการ์ดสถานะเท่าการ์ดอื่น (${pad('srow')}px / ${pad('card, \\.block')}px)`,
  pad('srow') === pad('card, \\.block'));

/* ---------- ปุ่มย้อนกลับ ----------
   .btn ตั้ง box-shadow ไว้ ถ้า .btn.back ไม่เคลียร์ จะได้กล่องใสที่มีเงาลอยคร่อมเส้นคั่น */
const backRule = (/\.btn\.back\{([^}]*)\}/.exec(css) || [])[1] || '';
push('ปุ่มย้อนกลับไม่มีเงาการ์ดค้าง', /box-shadow:\s*none/.test(backRule));
push('ปุ่มย้อนกลับมีระยะบน-ล่างสมมาตร', !/padding:0 0 \d+px/.test(backRule));

/* ---------- แถวรายการ ----------
   ชิปหน่วยเคยอยู่รวมกับถังขยะ+ลูกศรทางขวา ทำให้ข้อความทางซ้ายถูกบีบจนตัดบรรทัด */
push('มีบรรทัดคำอธิบายที่รับชิปได้', /\.li-subrow\{[^}]*flex-wrap:wrap/.test(css));

/* ---------- หน้าขาย (CSS) ---------- */
push('แถบสรุปหน้าขายวางเลขบนฐานเดียวกัน', /\.possum-n\{[^}]*align-items:baseline/.test(css));
push('มีปุ่มเมนูกดด่วน', /\.qmenu\{[^}]*grid-template-columns/.test(css));

const probe = `
(() => {
  const r = [];
  const bal = html => ['div','span','button','p','b','small','h2','h3']
    .every(t => (html.match(new RegExp('<' + t + '[ >]','g'))||[]).length
             === (html.match(new RegExp('</' + t + '>','g'))||[]).length);

  /* ---- ป้าย "มีบิลค้างอยู่" ---- */
  // บิลเปล่าที่สร้างรอไว้ตอนเข้าแท็บขาย ต้องไม่ไปขึ้นเตือนในหน้าอื่น
  order = { lines: [] };
  tab = 'setup';
  r.push(['บิลเปล่าไม่ขึ้นเตือนในหน้าตั้งค่า', headStat() === null]);
  tab = 'today';
  r.push(['บิลเปล่าไม่ขึ้นเตือนในหน้าแดชบอร์ด', headStat() === null]);

  // พอมีของในบิลจริง ๆ ค่อยเตือน
  const m0 = db.menus[0];
  order = { lines: [{lid:'x', menuId:m0.id, name:m0.name, price:n(m0.price), qty:2, addons:[]}] };
  const hs = headStat();
  r.push(['มีของในบิลแล้วถึงจะเตือน', !!hs && hs.k === 'มีบิลค้างอยู่']);
  r.push(['ป้ายเตือนบอกยอดจริง', !!hs && hs.v === baht(orderTotal()) && orderTotal() > 0]);
  r.push(['ป้ายเตือนบอกจำนวนจาน', !!hs && hs.s.indexOf('2 จาน') >= 0]);

  // ออกจากแท็บขายโดยบิลยังว่าง ต้องถูกล้างทิ้ง
  order = { lines: [] }; tab = 'sale';
  go('today');
  r.push(['ออกจากแท็บขายแล้วบิลเปล่าถูกล้าง', order === null]);
  // แต่บิลที่มีของอยู่ต้องไม่หาย
  tab = 'sale';
  order = { lines: [{lid:'y', menuId:m0.id, name:m0.name, price:n(m0.price), qty:1, addons:[]}] };
  go('today');
  r.push(['บิลที่มีของอยู่ไม่ถูกล้างทิ้ง', !!order && orderCount() === 1]);
  order = null; tab = 'sale';

  /* ---- ไม่บอกเรื่องเดียวกันซ้ำซ้อน ----
     หน้าที่มีการ์ดสรุปจาก subHead() อยู่แล้ว ต้องไม่มีตัวเลขใหญ่ซ้ำอีกชั้นข้างบน */
  ['ing','fixed'].forEach(t => {
    tab = t;
    r.push(['หน้า ' + t + ': ไม่มีหัวตัวเลขซ้ำกับการ์ดสรุป', headStat() === null]);
  });
  tab = 'today';

  // ชิปหน่วยต้องอยู่ในบรรทัดคำอธิบาย ไม่ใช่ไปเบียดกับถังขยะทางขวา
  const ing = viewIng();
  r.push(['ของที่ซื้อมา: ชิปหน่วยอยู่บรรทัดคำอธิบาย',
    ing.indexOf('li-subrow') >= 0 && ing.indexOf('<div class="li-end">\\n        <span class="chip"') < 0]);
  r.push(['ของที่ซื้อมา: ทางขวาเหลือแค่ลบกับลูกศร',
    (ing.match(/li-end/g)||[]).length > 0
    && ing.split('li-end')[1].slice(0, 400).indexOf('class="chip"') < 0]);
  r.push(['ของที่ซื้อมา: แท็กปิดครบ', bal(ing)]);

  /* ---- หน้าขายแบบใหม่ ---- */
  const pos = viewPOS();
  r.push(['หน้าขาย: สรุปเป็นแถบเดียว ไม่ใช่การ์ดใหญ่', pos.indexOf('possum') >= 0 && pos.indexOf('hero-card') < 0]);
  r.push(['หน้าขาย: ยอดขายถูก', pos.indexOf(baht(sumDay(dayKey()).sale)) >= 0]);
  r.push(['หน้าขาย: ปุ่มเปิดบิลยังอยู่', pos.indexOf('orderbtn') >= 0]);
  r.push(['หน้าขาย: มีปุ่มเมนูกดด่วน', (pos.match(/qmenu-b/g)||[]).length > 0]);
  r.push(['หน้าขาย: ปุ่มเมนูด่วนไม่เกิน 6 อัน', (pos.match(/qmenu-b/g)||[]).length <= 6]);
  r.push(['หน้าขาย: ปุ่มเมนูด่วนชี้ไปเมนูที่มีจริง',
    [...pos.matchAll(/posQuick\\('([^']+)'\\)/g)].every(mm => !!findMenu(mm[1]))]);
  r.push(['หน้าขาย: ยังโชว์บิลของวันนี้', pos.indexOf('บิลวันนี้') >= 0]);
  r.push(['หน้าขาย: แท็กปิดครบ', bal(pos)]);
  r.push(['หน้าขาย: ปุ่มทุกอันมีฟังก์ชันรองรับ',
    [...new Set([...pos.matchAll(/onclick="([A-Za-z_\$][A-Za-z0-9_\$]*)[(]/g)].map(mm => mm[1]))]
      .every(f => typeof eval(f) === 'function')]);

  // ไม่มีเมนูเลยก็ต้องไม่พัง
  const keep = db.menus;
  db.menus = [];
  const bare = viewPOS();
  r.push(['หน้าขาย: ไม่มีเมนูก็ไม่พัง', bare.indexOf('qmenu-b') < 0 && bal(bare)]);
  db.menus = keep;

  return r;
})()
`;
eval(script + probe).forEach(([name, v]) => out.push([name, !!v]));

let bad = 0;
out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
