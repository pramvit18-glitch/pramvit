// ตรวจความมน: ทุกพื้นผิวต้องใช้ token เดียว ห้ามเขียนตัวเลขดิบ ๆ กระจาย
// เคยมี 21 ค่าตั้งแต่ 3px ถึง 28px ปนกันอยู่ในไฟล์เดียว
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const css = src.split('<style>')[1].split('</style>')[0].replace(/\/\*[\s\S]*?\*\//g, '');

const out = [];
const push = (name, v) => out.push([name, !!v]);

/* ---------- token ---------- */
const r = (/--r:\s*(\d+)px/.exec(css) || [])[1];
push(`มี token ความมนของพื้นผิว --r (${r || '-'}px)`, !!r);
push('--r เท่ากับ rounded-xl ของ Tailwind (12px)', r === '12');
push('มี token แคปซูลแยกต่างหาก', /--r-pill:\s*999px/.test(css));
push('เลิกใช้ชื่อเก่า --r-card ที่สื่อว่าใช้แค่กับการ์ด', !/--r-card/.test(css));

/* ---------- ไล่ดูทุกค่าที่ใช้จริง ---------- */
const vals = [...css.matchAll(/border-radius:\s*([^;}]+)/g)].map(m => m[1].trim());
const kinds = {};
vals.forEach(v => { kinds[v] = (kinds[v] || 0) + 1; });

const OK = v =>
  v === 'var(--r)' ||            // พื้นผิว
  v === 'var(--r-pill)' ||       // แคปซูล
  v === '50%' ||                 // วงกลม
  v === '0' ||                   // ไม่มีมุมมน — เป็นเจตนา ไม่ใช่ตัวเลขลอย
  v === 'inherit' ||
  // มุมแยก เช่น "var(--r) var(--r) 0 0" — ทุกส่วนต้องเป็น token หรือ 0
  (/\s/.test(v) && v.split(/\s+/).every(p => p === '0' || p === 'var(--r)' || p === 'var(--r-pill)'));

const bad = Object.keys(kinds).filter(v => !OK(v));
push(`ไม่มีตัวเลขความมนดิบ ๆ หลงเหลือ${bad.length ? ' — เจอ: ' + bad.join(' | ') : ''}`, !bad.length);
push(`จำนวนค่าความมนที่ใช้ไม่เกิน 7 แบบ (ตอนนี้ ${Object.keys(kinds).length})`,
  Object.keys(kinds).length <= 7);

/* ---------- รูปทรงต้องไม่ถูกยุบไปด้วย ----------
   วงกลมกับแคปซูลเป็น "รูปทรง" ไม่ใช่ค่าความมน ถ้าโดนเปลี่ยนเป็น 12px คือดีไซน์พัง */
const circleMust = [
  ['.icon-btn', 'ปุ่มไอคอนกลมบนหัว'],
  ['.bottomnav button::before', 'วงกลมแดงในแถบเมนูล่าง'],
  ['.quick-ic', 'ไอคอนทางลัดวงกลม'],
  ['.hil-av', 'รูปเมนูขายดี'],
  ['.wk-d .num', 'ตัวเลขวันในปฏิทิน'],
  ['.srow-ic', 'ไอคอนในการ์ดสถานะ'],
];
// หา body ของกฎที่ selector ตรงเป๊ะ — ห้ามใช้ regex ลอย ๆ
// เพราะ ".head-tag" จะไปแมตช์ ".mnav .head-tag{...}" ซึ่งเป็นคนละกฎกัน
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(m => ({ sels: m[1].split(',').map(x => x.trim().replace(/\s+/g, ' ')), body: m[2] }))
  .filter(r => r.sels[0] && !r.sels[0].startsWith('@'));
const bodyOf = sel => rules.filter(r => r.sels.includes(sel)).map(r => r.body).join(';');

const miss = circleMust.filter(([sel]) => !/border-radius:\s*50%/.test(bodyOf(sel)));
push(`วงกลมยังเป็นวงกลม${miss.length ? ' — พัง: ' + miss.map(m => m[1]).join(', ') : ''}`, !miss.length);

const pillMust = [['.btn', 'ปุ่มทั่วไป'], ['.dseg-b', 'ชิปแท็บย่อย'], ['.cat', 'ชิปกรอง'],
                  ['.meter', 'แถบวัดสัดส่วน'], ['.head-tag', 'ป้ายตัวเลขบนหัวการ์ด']];
const pillBad = pillMust.filter(([sel]) => !/border-radius:\s*var\(--r-pill\)/.test(bodyOf(sel)));
push(`แคปซูลยังเป็นแคปซูล${pillBad.length ? ' — พัง: ' + pillBad.map(m => m[1]).join(', ') : ''}`, !pillBad.length);

/* ---------- การ์ดกับของข้างในต้องไม่มนเท่ากันเป๊ะจนดูแปลก ----------
   ของที่ซ้อนอยู่ในการ์ดควรมนน้อยกว่าหรือเท่ากับการ์ด ไม่ใช่มนกว่า
   ตอนนี้ใช้ค่าเดียวกันหมดจึงผ่านโดยปริยาย — ข้อนี้ไว้ดักตอนมีใครเพิ่มค่าใหม่ */
push('ไม่มีของข้างในที่มนเกินกว่าพื้นผิวที่ครอบมัน',
  !Object.keys(kinds).some(v => /^(1[3-9]|[2-9]\d)px$/.test(v)));

let bad2 = 0;
out.forEach(([name, v]) => { if (!v) bad2++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log('\n  ค่าที่ใช้: ' + Object.entries(kinds).map(([k, n]) => k + '×' + n).join('  '));
console.log(' ', bad2 ? bad2 + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad2 ? 1 : 0);
