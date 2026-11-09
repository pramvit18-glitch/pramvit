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
global.document = { body: stub(), addEventListener(){}, removeEventListener(){}, getElementById: stub, querySelector: () => stub(), createElement: stub };
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
// เหลือแค่ .quick — .hil เปลี่ยนเป็นตารางมีแถบความยาวตาม mockup ไม่มีรูปกลมแล้ว
['quick'].forEach(c => {
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

/* ---------- gap ต้องไม่ชนกับ margin ----------
   กล่องที่ตั้ง gap ไว้แล้ว ถ้าลูกยังพกมาร์จิ้นของตัวเองมาด้วย ระยะจะบวกกันสองชั้น
   หน้าขายเคยเป็นแบบนี้ ได้ช่อง 28 / 56 / 24 / 28 ทั้งที่ทั้งแอปใช้ 14 */
const rulesOf = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(m => ({ sels: m[1].split(',').map(x => x.trim().replace(/\s+/g, ' ')), body: m[2] }))
  .filter(r => r.sels[0] && !r.sels[0].startsWith('@'));
const bodyOfSel = s => rulesOf.filter(r => r.sels.includes(s)).map(r => r.body).join(';');
const mval = (sel, side) => {
  const b = bodyOfSel(sel);
  const one = new RegExp('(?:^|;)\\s*margin-' + side + ':\\s*(-?[\\d.]+)px').exec(b);
  if (one) return Number(one[1]);
  const sh = /(?:^|;)\s*margin:\s*(-?[\d.]+)px\s+[^;]*?(-?[\d.]+)px/.exec(b);
  if (sh) return Number(side === 'top' ? sh[1] : sh[2]);
  return 0;
};

push('ลูกใน .sale-side ถูกล้างมาร์จิ้น ปล่อยให้ gap คุมคนเดียว',
  /\.sale-side > \*\{margin-top:0; margin-bottom:0\}/.test(css));
push('การ์ดบิลไม่มี inline margin ซ้อนกับ gap ของกริด',
  !/class="card sale-list" style="margin-top/.test(src));

// ไล่วัดช่องจริงอีกรอบ ต้องเป็น gap เปล่า ๆ ทุกช่อง
const sideGap = mval('.sale-side', 'top') || 14;
const gapNum = (/\.sale-side\{[^}]*gap:(\d+)px/.exec(css) || [])[1];
const neutralised = /\.sale-side > \*\{margin-top:0; margin-bottom:0\}/.test(css);
['.possum', '.orderbtn', '.home-sec', '.qmenu'].forEach(k => {
  const extra = neutralised ? 0 : mval(k, 'top') + mval(k, 'bottom');
  push(`ช่องรอบ ${k} เป็น ${gapNum}px เปล่า ๆ ไม่บวกมาร์จิ้นซ้ำ`, extra === 0);
});

/* ---------- แถวในบิล (หน้าต่างสั่งสินค้า) ----------
   เคยเป็น 3 บรรทัดซ้อน: ชื่อ+ราคา / ชิปเลือกไส้ / ปุ่มนับ+ลบ
   และยังเป็นการ์ดขาวมีเงาซ้อนในกล่องเทาซ้อนในหน้าต่างอีก รวม 3 ชั้น */
push('ปุ่มนับ ชิปไส้ ปุ่มลบ อยู่บรรทัดเดียวกัน', /\.bl-act\{[^}]*display:flex/.test(css));
push('ชิปเลือกไส้หดได้เมื่อที่ไม่พอ', /\.bl-top\{[^}]*flex:0 1 auto[\s\S]*?text-overflow:ellipsis/.test(css));
push('ปุ่มลบชิดขวาสุดของแถว', /\.bl-del\{[^}]*margin-left:auto/.test(css));
push('ในหน้าต่าง แถวเป็นแบบแบน ไม่ใช่การ์ดซ้อนการ์ด',
  /\.dlg-body \.bill-line\{[^}]*background:none[^}]*box-shadow:none/.test(css));
push('แถวในหน้าต่างคั่นด้วยเส้น ไม่ใช่ช่องว่าง',
  /\.dlg-body \.bill-line \+ \.bill-line\{border-top:1px/.test(css));

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

  /* ---- แถวในบิลต้องเหลือ 2 บรรทัด ---- */
  order = { lines: [] }; orderOpen = true;
  tapMenu(db.menus[0].id);
  const bill = orderDialogHTML();
  const line = bill.split('<div class="bill-line">')[1] || '';
  r.push(['แถวในบิลมีสองก้อน: ชื่อ-ราคา กับ แถวปุ่ม',
    line.indexOf('bl-main') >= 0 && line.indexOf('bl-act') >= 0]);
  r.push(['ชิปเลือกไส้ย้ายลงไปอยู่ในแถวปุ่มแล้ว',
    line.indexOf('bl-act') >= 0 && line.indexOf('bl-act') < line.indexOf('bl-top')]);
  r.push(['ปุ่มนับ ชิปไส้ ปุ่มลบ อยู่ในก้อนเดียวกันครบสาม',
    ['bl-qty','bl-top','bl-del'].every(c => line.indexOf(c) > line.indexOf('bl-act'))]);
  order = null; orderOpen = false;

  /* ---- หน้าขายแบบใหม่ ---- */
  const pos = viewPOS();
  r.push(['หน้าขาย: สรุปเป็นแถบเดียว ไม่ใช่การ์ดใหญ่', pos.indexOf('possum') >= 0 && pos.indexOf('hero-card') < 0]);
  r.push(['หน้าขาย: ยอดขายถูก', pos.indexOf(baht(sumDay(dayKey()).sale)) >= 0]);
  r.push(['หน้าขาย: ปุ่มเปิดบิลยังอยู่', pos.indexOf('orderbtn') >= 0]);
  r.push(['หน้าขาย: มีปุ่มเมนูกดด่วน', (pos.match(/qmenu-b/g)||[]).length > 0]);
  /* เมนูย้ายไปอยู่ฝั่งกว้างเป็นกริด 3 ช่อง จึงโชว์ครบทุกเมนู ไม่ต้องตัดที่ 6 อีก
     **ต้องยัดเมนูให้เกิน 6 อันเอง** ไม่ใช่เทียบกับ db.menus.length ของข้อมูลที่บังเอิญมี
     เมนูจริงของร้านมี 8 อัน ถ้าข้อมูลทดสอบมีน้อยกว่า 6 ข้อนี้จะผ่านตลอดแม้โค้ดกลับไปตัดที่ 6 */
  const keep8 = db.menus;
  db.menus = ['เครป ก','เครป ข','โตเกียว ก','โตเกียว ข','แพนเค้ก ก','แพนเค้ก ข','ไข่ป๋วง ก','วาฟเฟิล ก']
    .map((nm, i) => ({ id:'m' + i, name:nm, price:15 }));
  const pos8 = viewPOS();
  r.push(['หน้าขาย: โชว์เมนูครบทุกอัน (ลองด้วย 8 เมนู)',
    (pos8.match(/qmenu-b/g)||[]).length === 8]);
  db.menus = keep8;
  // ทุกการ์ดเมนูต้องบอกเรื่องไส้ ไม่ใช่มีแต่ชื่อกับราคา
  r.push(['หน้าขาย: การ์ดเมนูบอกเรื่องไส้ทุกอัน',
    (pos.match(/qmenu-s/g)||[]).length === db.menus.length]);
  // ฝั่งเมนูต้องมีกล่องครอบของตัวเอง ไม่งั้นสลับคอลัมน์บนจอคอมไม่ได้
  r.push(['หน้าขาย: มีฝั่งเมนูแยกจากฝั่งสรุป', pos.indexOf('sale-main') >= 0]);

  /* ชิปกรองหมวดบนหน้าขาย — ยัดเมนูสองหมวดเข้าไปแล้วดูว่าโผล่และกรองได้จริง
     เมนูจริงของร้านแตกเป็น 4 หมวด (เครป · โตเกียว · ไข่ป๋วง · แพนเค้ก) จาก CAT_GUESS
     ข้อมูลทดสอบชุดหลักอาจมีหมวดเดียว ซึ่งชิปจะไม่โผล่ตามที่ออกแบบไว้
     จึงต้องตั้งเมนูเองในข้อนี้ ไม่ใช่พึ่งข้อมูลที่บังเอิญมี */
  const keepMenus = db.menus, keepCat = saleCat;
  db.menus = [{id:'a', name:'เครป แป้งวานิลา', price:15},
              {id:'b', name:'โตเกียวไส้คาว 2 ไส้', price:10}];
  saleCat = null;
  r.push(['หน้าขาย: มีชิปกรองหมวดเมื่อเมนูมีหลายหมวด',
    saleCatTabsHTML().indexOf('pickSaleCat') >= 0 && viewPOS().indexOf('class="cats"') >= 0]);
  r.push(['หน้าขาย: ไม่เลือกหมวด = เห็นครบ', saleMenus().length === 2]);
  saleCat = 'เครป';
  r.push(['หน้าขาย: เลือกหมวดแล้วกรองจริง',
    saleMenus().length === 1 && saleMenus()[0].name.indexOf('เครป') === 0]);
  /* มีหมวดเดียวไม่ต้องมีชิป ไม่งั้นได้ปุ่ม "ทั้งหมด" อันเดียวโดด ๆ ที่กดแล้วไม่มีอะไรเกิด */
  db.menus = [{id:'a', name:'เครป แป้งวานิลา', price:15}];
  saleCat = null;
  r.push(['หน้าขาย: มีหมวดเดียวไม่ต้องโชว์ชิป', saleCatTabsHTML() === '']);
  db.menus = keepMenus; saleCat = keepCat;
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
