// ตรวจของที่ทำให้หน้ากว้างเกินจอ
//  1) ellipsis บน element ที่ยังเป็น inline — overflow/text-overflow ไม่ทำงาน ข้อความจะดันกรอบ
//  2) grid/flex item ที่ไม่ได้ปลด min-width:auto — ของข้างในกว้างเกินแล้วดันทั้งคอลัมน์
const fs = require('fs');
const path = require('path');
const FILE = process.argv[2] || path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(FILE, 'utf8');
const css = src.split('<style>')[1].split('</style>')[0].replace(/\/\*[\s\S]*?\*\//g, '');
const script = src.split('<script>')[1].split('</script>')[0];
const markup = src.split('</style>')[1].split('<script>')[0];
const html = script + markup;          // markup ส่วนใหญ่อยู่ใน template string ของ JS

const out = [];
const push = (n, v) => out.push([n, !!v]);

const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(m => ({ sels: m[1].split(',').map(x => x.trim().replace(/\s+/g, ' ')), body: m[2] }))
  .filter(r => r.sels[0] && !r.sels[0].startsWith('@'));
const bodyOf = s => rules.filter(r => r.sels.includes(s)).map(r => r.body).join(';');
const has = (sel, re) => re.test(bodyOf(sel));

/* ---------- 1. ellipsis ที่ใช้ไม่ได้จริง ---------- */
// หาคลาสที่ตั้ง text-overflow:ellipsis ไว้
const clipped = [...new Set(rules
  .filter(r => /text-overflow:\s*ellipsis/.test(r.body))
  .flatMap(r => r.sels)
  .filter(s => /^\.[\w-]+$/.test(s))
  .map(s => s.slice(1)))];

push(`เจอคลาสที่ใช้ ellipsis (${clipped.length} คลาส)`, clipped.length > 0);

// element จะได้ block มาเองก็ต่อเมื่อเป็นลูกตรงของ flex/grid (ถูก blockify)
// หรือเขียน display:block ไว้เอง หรือ tag เป็นบล็อกอยู่แล้ว (div/p/h1-3)
const flexParents = new Set(rules
  .filter(r => /display:\s*(flex|grid|inline-flex)/.test(r.body))
  .flatMap(r => r.sels).filter(s => /^\.[\w-]+$/.test(s)).map(s => s.slice(1)));

// หา class ของตัวครอบที่ใกล้ที่สุด: ไล่ย้อนจากจุดที่เจอคลาสนั้น ไปหาแท็กเปิดที่ยังไม่ถูกปิด
function parentClassesOf(at) {
  let depth = 0;
  const head = html.slice(Math.max(0, at - 3000), at);
  const tags = [...head.matchAll(/<(\/?)(\w+)([^>]*)>/g)].reverse();
  for (const t of tags) {
    if (t[1] === '/') { depth++; continue; }
    if (/\/>$/.test(t[0]) || /^(br|img|input|hr)$/i.test(t[2])) continue;
    if (depth > 0) { depth--; continue; }
    const c = /class="([^"]*)"/.exec(t[3]);
    return c ? c[1].split(/\s+/).filter(Boolean) : [];
  }
  return [];
}

const broken = [];
for (const cls of clipped) {
  if (has('.' + cls, /display:\s*(block|flex|grid)/)) continue;       // ประกาศเองแล้ว
  const hit = new RegExp('<(\\w+)[^>]*class="[^"]*\\b' + cls + '\\b').exec(html);
  if (!hit) continue;                                                  // ไม่ได้ใช้จริง
  if (/^(div|p|h1|h2|h3|li)$/.test(hit[1])) continue;                  // เป็นบล็อกตาม tag อยู่แล้ว
  // span/b/small จะเป็นบล็อกก็ต่อเมื่อเป็นลูกตรงของ flex/grid (เบราว์เซอร์ blockify ให้)
  const parents = parentClassesOf(hit.index);
  if (parents.some(pc => flexParents.has(pc))) continue;
  broken.push(cls + ' (<' + hit[1] + '> ใน .' + (parents[0] || '?') + ')');
}
push(`ellipsis ทุกจุดใช้ได้จริง${broken.length ? ' — ยังเป็น inline: ' + broken.join(', ') : ''}`, !broken.length);

// จุดที่เคยพังจริง ล็อกไว้เฉพาะ
push('ชื่อ/ราคาในปุ่มเมนูด่วนเป็นบล็อก (เคยล้นจอเพราะเป็น inline)',
  /\.qmenu-n,\s*\.qmenu-p\{display:block\}/.test(css));
push('ราคาอยู่คนละบรรทัดกับชื่อ ไม่ใช่ต่อท้าย', has('.qmenu-n', /display:block/) || /\.qmenu-n,\s*\.qmenu-p\{display:block\}/.test(css));

/* ---------- 2. grid/flex item ที่หดไม่ได้ ---------- */
// ตัวครอบที่เป็น grid/flex และลูกอาจมีของกว้าง ๆ ต้องปลด min-width:auto
const WRAPS = [
  ['.salewrap', 'หน้าขาย'],
  ['.dash', 'แดชบอร์ด'],
];
const noMin = WRAPS.filter(([sel]) => {
  if (!/display:\s*grid/.test(bodyOf(sel))) return false;
  return !new RegExp(sel.replace('.', '\\.') + ' > \\*\\{[^}]*min-width:0').test(css)
      && !/min-width:0/.test(bodyOf(sel + ' > *'));
});
push(`กริดหลักปลด min-width ให้ลูกแล้ว${noMin.length ? ' — ขาด: ' + noMin.map(x => x[1]).join(', ') : ''}`,
  !noMin.length);

/* ---------- 3. ของที่กว้างตายตัวเกินจอแคบสุด ---------- */
// จอแคบที่ยังต้องรองรับคือ 320px ลบ padding ของ main (20+20) = 280px
// ของที่อยู่ในกล่องที่เลื่อนข้างได้ (overflow-x:auto) ไม่นับ — มันตั้งใจให้กว้างแล้วเลื่อนดู
const scrollers = new Set(rules
  .filter(r => /overflow-x:\s*auto|overflow:\s*auto/.test(r.body))
  .flatMap(r => r.sels).filter(s => /^\.[\w-]+$/.test(s)));

const wide = rules.flatMap(r => {
  const m = /(?:^|;)\s*(?:min-)?width:\s*(\d{3,})px/.exec(r.body);
  if (!m || Number(m[1]) <= 280) return [];
  if (/max-width/.test(r.body) && !/(?:^|;)\s*min-width/.test(r.body)) return [];
  // ".scroll table" → ตัวครอบคือ ".scroll" ถ้ามันเลื่อนข้างได้ก็ปล่อยผ่าน
  const owner = r.sels[0].split(' ')[0];
  if (scrollers.has(owner)) return [];
  return [r.sels[0] + ' = ' + m[1] + 'px'];
});
push(`ไม่มีของกว้างตายตัวเกิน 280px${wide.length ? ' — เจอ: ' + wide.join(', ') : ''}`, !wide.length);

let bad = 0;
out.forEach(([n, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), n); });
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
