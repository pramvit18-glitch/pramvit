// ตรวจว่าสถานะไม่ค้างข้ามหน้า — อาการคือ "กดเมนูแล้วหน้ายังพูดถึงของเดิมอยู่"
// รากของบั๊กคลาสนี้คือมีหลายทางที่เซ็ต tab เองแล้วเรียก render() ตรง ๆ
// งานเก็บกวาดจึงต้องอยู่ใน render() (syncPageState) ไม่ใช่ใน go()
// บวกกับตรวจโค้ดตาย: ฟังก์ชันที่ไม่มีใครเรียก และฟังก์ชันที่มีแต่เทสต์เรียก
const fs = require('fs');
const path = require('path');
const FILE = process.argv[2] || path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(FILE, 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');
const markup = src.split('</style>')[1].split('<script>')[0];

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

const out = [];
const push = (n, v) => out.push([n, !!v]);

/* ---------- โครงสร้าง: งานเก็บกวาดต้องอยู่ในจุดที่ข้ามไม่ได้ ---------- */
push('มีตัวเก็บกวาดสถานะตอนเปลี่ยนหน้า', /function syncPageState\(from, to\)/.test(script));
push('render\\(\\) เรียกตัวเก็บกวาดก่อนวาด',
  /function render\(\)\{\s*\r?\n?\s*if\(tab !== shownTab\) syncPageState\(shownTab, tab\);/.test(script));
push('go() ไม่ได้เก็บงานเก็บกวาดไว้เอง (ไม่งั้นทางอื่นจะข้าม)',
  !/function go\(t\)\{[\s\S]{0,400}?homeQ = ''/.test(script));
push('มีตัวล้างสถานะตอนข้อมูลเปลี่ยนยกชุด', /function resetView\(t\)/.test(script));
push('resetView บังคับให้เก็บกวาดเสมอแม้แท็บปลายทางเหมือนเดิม',
  /function resetView\(t\)[\s\S]{0,400}?shownTab = null/.test(script));

// ไม่ควรมีใครเซ็ต tab แล้ว render() เองอีก นอกจาก go() กับ resetView()
const raw = [...script.matchAll(/^\s*(?:.*?;\s*)?tab\s*=\s*'(\w+)'\s*;\s*render\(\)/gm)];
push(`ไม่มีทางลัดที่เซ็ต tab แล้ว render() เอง (เจอ ${raw.length} จุด)`, raw.length === 0);

/* ---------- โค้ดตาย ---------- */
const names = new Set();
for (const m of script.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)) names.add(m[1]);
const all = script + markup;
const unused = [...names].filter(n => {
  const esc = n.replace(/\$/g, '\\$');
  const uses = (all.match(new RegExp('\\b' + esc + '\\b', 'g')) || []).length;
  const defs = (script.match(new RegExp('^function ' + esc + '\\b', 'gm')) || []).length;
  return uses - defs <= 0;
});
push(`ไม่มีฟังก์ชันที่ไม่มีใครเรียก${unused.length ? ' — เจอ: ' + unused.join(', ') : ''}`, !unused.length);

// ฟังก์ชันที่มีแต่เทสต์เรียก = เทสต์กำลังตรวจทางที่ผู้ใช้เดินไม่ถึง ให้ความมั่นใจผิด ๆ
const testSrc = fs.readdirSync(path.join(__dirname))
  .filter(f => f.startsWith('check-') && f !== path.basename(__filename))
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
const onlyTest = [...names].filter(n => {
  const esc = n.replace(/\$/g, '\\$');
  const uses = (all.match(new RegExp('\\b' + esc + '\\b', 'g')) || []).length;
  const defs = (script.match(new RegExp('^function ' + esc + '\\b', 'gm')) || []).length;
  return uses - defs <= 0 && new RegExp('\\b' + esc + '\\s*\\(').test(testSrc);
});
push(`ไม่มีฟังก์ชันที่มีแต่เทสต์เรียก${onlyTest.length ? ' — เจอ: ' + onlyTest.join(', ') : ''}`, !onlyTest.length);

/* ---------- พฤติกรรมจริง ---------- */
const probe = `
(() => {
  const r = [];

  /* แก้สูตรค้างไว้ แล้วกดแท็บอื่น — เคสที่เจอจริง */
  tab = 'menu'; shownTab = 'menu';
  openRecipe(db.menus[0].id);
  r.push(['เริ่มแก้สูตรแล้ว draft ถูกตั้ง', !!recipeDraft]);
  go('today');
  r.push(['กดแท็บอื่นแล้วสูตรที่ค้างถูกทิ้ง', recipeDraft === null]);
  const hs = headStat();
  r.push(['หัวหน้าใหม่ไม่พูดถึงสูตรที่ทิ้งไปแล้ว',
    !(hs && String(hs.k).indexOf('ของที่ใช้') >= 0)]);
  go('menu');
  r.push(['กลับมาแท็บเมนู เจอรายการเมนู ไม่ใช่หน้าแก้สูตรค้าง', recipeDraft === null]);

  /* บิลเปล่าไม่ตามไปหน้าอื่น แต่บิลที่มีของต้องไม่หาย */
  go('sale');
  r.push(['เข้าแท็บขายแล้วมีบิลรออยู่', !!order]);
  go('today');
  r.push(['ออกจากแท็บขายโดยบิลยังว่าง บิลถูกทิ้ง', order === null]);
  go('sale'); tapMenu(db.menus[0].id);
  go('today');
  r.push(['บิลที่มีของอยู่ไม่ถูกทิ้ง', !!order && orderCount() > 0]);
  order = null;

  /* ดูย้อนวันแล้วไปหน้าอื่น กลับมาต้องเป็นวันนี้ */
  const old = allDays().find(k => k < dayKey());
  if(old){
    go('today'); pickDay(old);
    r.push(['เลือกดูวันเก่าได้', dashDay === old]);
    go('hist'); go('today');
    r.push(['กลับเข้าหน้าแรกแล้วเด้งมาที่วันนี้', dashDay === dayKey()]);
  } else {
    r.push(['เลือกดูวันเก่าได้ (ไม่มีข้อมูลวันเก่า ข้าม)', true]);
    r.push(['กลับเข้าหน้าแรกแล้วเด้งมาที่วันนี้ (ข้าม)', true]);
  }

  /* คำค้นเป็นของหน้าแรก ห้ามตามไปหน้าอื่น */
  go('today'); homeQ = 'ทดสอบ';
  go('setup');
  r.push(['ออกจากหน้าแรกแล้วคำค้นถูกล้าง', homeQ === '']);

  /* เมนูที่เปิดค้างไว้ ห้ามตามไปหน้าอื่น */
  go('menu'); openMenuId = db.menus[0].id;
  go('hist');
  r.push(['ออกจากหน้าเมนูแล้วเมนูที่เปิดค้างถูกปิด', openMenuId === null]);

  /* ข้อมูลเปลี่ยนยกชุด ต้องล้างทุกอย่าง ไม่ว่าจะอยู่แท็บไหน */
  go('today'); homeQ = 'ค้างไว้'; histSort = 'net'; histOnlyBig = true;
  if(old) dashDay = old;
  resetView('today');
  r.push(['ล้างยกชุดแล้ว คำค้นหาย', homeQ === '']);
  r.push(['ล้างยกชุดแล้ว กลับมาวันนี้', dashDay === dayKey()]);
  r.push(['ล้างยกชุดแล้ว ตัวกรองย้อนหลังกลับค่าเริ่มต้น', histSort === 'date' && histOnlyBig === false]);

  /* ทุกแท็บต้องไปถึงได้และสถานะตรงกัน */
  const miss = TABS.map(t => t[0]).filter(k => { go(k); return tab !== k || shownTab !== k; });
  r.push(['กดทุกแท็บแล้วไปถึงจริงทุกอัน' + (miss.length ? ' — พัง: ' + miss.join(',') : ''), !miss.length]);

  return r;
})()
`;
eval(script + probe).forEach(([n, v]) => out.push([n, !!v]));

let bad = 0;
out.forEach(([n, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), n); });
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
