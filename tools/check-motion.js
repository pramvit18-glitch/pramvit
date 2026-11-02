// ตรวจว่าของที่กดได้ทุกชิ้นมีปฏิกิริยาตอนแตะ และมีทางปิดแอนิเมชันให้คนที่ต้องการ
// ข้อสำคัญคือมันไล่หา cursor:pointer เองทั้งไฟล์ ไม่ได้เช็กแค่ลิสต์ที่เขียนไว้
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const css = src.split('<style>')[1].split('</style>')[0];
const script = src.split('<script>')[1].split('</script>')[0];

const out = [];
const push = (name, v) => out.push([name, !!v]);

// ตัดคอมเมนต์ออกก่อน ไม่งั้นมันไปปนกับชื่อ selector
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...clean.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(m => ({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] }))
  .filter(r => r.sel && !r.sel.startsWith('@') && !/^\d/.test(r.sel));

const parts = sel => sel.split(',').map(s => s.trim()).filter(Boolean);
// ตัด pseudo-class ทิ้งแล้วทำช่องว่างรอบ > ให้เหมือนกัน จะได้เทียบ selector ตรงกันจริง
const strip = s => s
  .replace(/:not\([^)]*\)/g, '')
  .replace(/::?[a-z-]+(\([^)]*\))?/g, '')
  .replace(/\s*>\s*/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

/* ---------- ของที่กดได้ทั้งหมด ---------- */
const clickable = [...new Set(
  rules.filter(r => /cursor:pointer/.test(r.body)).flatMap(r => parts(r.sel)).map(strip).filter(Boolean)
)];
push(`หา selector ที่กดได้เจอ (${clickable.length} ชนิด)`, clickable.length > 30);

/* ---------- มีปฏิกิริยาตอนกดไหม ----------
   นับว่ามี ถ้าตัวมันเอง หรือ selector ที่ครอบมันอยู่ มีกฎ :active ที่เปลี่ยนรูป/ความจาง */
const activeBases = [];
rules.forEach(r => {
  if (!/:active/.test(r.sel)) return;
  if (!/transform|opacity|background/.test(r.body)) return;
  parts(r.sel).forEach(s => activeBases.push(strip(s.split(':active')[0])));
});
const reacts = s => activeBases.some(b => b && (s === b || s.startsWith(b + ' ') || s.endsWith(' ' + b) || b.endsWith(' ' + s)));

const numb = clickable.filter(s => !reacts(s));
push(`ของที่กดได้มีปฏิกิริยาครบ${numb.length ? ' — ยังไม่มี: ' + numb.join(', ') : ''}`, !numb.length);

/* ---------- ขยับแล้วต้องนุ่ม ไม่กระตุก ----------
   กฎ :active อาจเปลี่ยนตัวมันเอง (.a:active) หรือเปลี่ยนลูก (.a:active .b)
   ตัวที่โดนเปลี่ยนจริงคือ compound ตัวท้ายสุด — ต้องไปดูว่า "ตัวนั้น" มี transition */
const lastPart = s => strip(s).split(' ').filter(Boolean).pop() || '';
const animated = [];
rules.forEach(r => {
  if (!/:active/.test(r.sel) || !/transform|opacity/.test(r.body)) return;
  parts(r.sel).forEach(s => animated.push(lastPart(s)));
});
const hasTrans = target => rules.some(r =>
  parts(r.sel).some(p => lastPart(p) === target) && /transition:/.test(r.body));
const stiff = [...new Set(animated)].filter(t => t && !hasTrans(t));
push(`ทุกตัวที่ยุบได้มี transition${stiff.length ? ' — ขาด: ' + stiff.join(', ') : ''}`, !stiff.length);

/* ---------- iOS Safari ----------
   ถ้าทั้งหน้าไม่มีใครฟัง touch เลย iOS จะไม่ยิง :active ให้ element ทั่วไป
   พอเราปิด -webkit-tap-highlight-color ไว้ด้วย บนไอโฟนจึงไม่มีปฏิกิริยาอะไรสักอย่าง */
push('มี listener touchstart ปลดล็อก :active ของ iOS',
  /addEventListener\('touchstart'[\s\S]{0,60}passive:true/.test(script));
push('ถ้าปิด tap highlight ของระบบ ต้องมีตัวปลดล็อกคู่กันเสมอ',
  !/-webkit-tap-highlight-color:transparent/.test(css)
  || /addEventListener\('touchstart'/.test(script));

/* ---------- จังหวะกด: ยุบเร็ว เด้งกลับช้า ----------
   แตะ 1 ครั้งกินเวลาราว 80ms ถ้าตั้งเท่ากันทั้งสองขา สเกลจะยุบไม่ถึงครึ่งก็ถูกดึงกลับ
   กลายเป็นสั่นจาง ๆ มองแทบไม่เห็น ขากดจึงต้องสั้นกว่าขาปล่อยชัดเจน */
const ms = v => { const m = new RegExp('--tap-' + v + ':\\s*(\\.?\\d+(?:\\.\\d+)?)s').exec(css);
                  return m ? Number(m[1]) * 1000 : null; };
const tIn = ms('in'), tOut = ms('out');
push(`ขากดสั้นกว่า 80ms จะได้ยุบสุดทันนิ้ว (${tIn}ms)`, tIn !== null && tIn <= 80);
push(`ขาปล่อยช้ากว่าขากดอย่างน้อย 3 เท่า (${tIn}ms → ${tOut}ms)`,
  tIn && tOut && tOut >= tIn * 3);
push('ใช้ตัวแปรจังหวะกด ไม่ได้ฝังตัวเลขไว้ในแต่ละกฎ',
  (css.match(/var\(--tap-(in|out)\)/g) || []).length >= 4);

/* ---------- สปริง: เด้งเลยจุดหมายแล้วค่อยนิ่ง ----------
   ease-out ค่อย ๆ ช้าลงแล้วหยุดตรง ๆ แบบเครื่องจักร
   สปริงวิ่งเลยไปนิดแล้วถอยกลับ — จุดนี้แหละที่ทำให้รู้สึกมีชีวิต */
const spring = (/--spring:\s*cubic-bezier\(([^)]*)\)/.exec(css) || [])[1];
push('มีโค้งสปริงแยกจากโค้งธรรมดา', !!spring);
push(`โค้งสปริงเด้งเกินจริง (y2 ต้อง > 1 ได้ ${spring ? spring.split(',')[1] : '-'})`,
  !!spring && Number(spring.split(',')[1]) > 1);
push('ขาปล่อยของการกดใช้สปริง', /transition:transform var\(--tap-out\) var\(--spring\)/.test(css));

/* ---------- ไอคอนแท็บป๊อปตอนถูกเลือก ---------- */
push('มี keyframe ป๊อปของวงกับไอคอน',
  /@keyframes navpop/.test(css) && /@keyframes navicon/.test(css));
const popMid = (/@keyframes navicon\{[\s\S]*?55%\s*\{transform:translateY\(-16px\) scale\(([\d.]+)\)/.exec(css) || [])[1];
push(`ป๊อปเลยขนาดจริงก่อนหดกลับ (กลางทาง ${popMid || '-'})`, Number(popMid) > 1);
push('ป๊อปด้วย keyframe ไม่ใช่ transition (transition เด้งเกินไม่ได้)',
  /\.bottomnav button\.on::before\{animation:navpop/.test(css)
  && /\.bottomnav button\.on svg\{animation:navicon/.test(css));

/* ---------- สั่นตอนกด ---------- */
push('มีสั่นสั้น ๆ ตอนแตะ', /navigator\.vibrate\(\d+\)/.test(script));
push('เช็กก่อนว่าเครื่องรองรับ ไม่งั้นไอโฟนจะพัง',
  /if\(!navigator\.vibrate\) return/.test(script));
push('ไม่สั่นให้ปุ่มที่กดไม่ได้', /!el\.disabled/.test(script));

/* ---------- จังหวะเดียวกันทั้งแอป ---------- */
push('มีตัวแปรจังหวะกลาง --ease', /--ease:\s*cubic-bezier/.test(css));
push('ใช้ --ease ซ้ำหลายที่ ไม่ได้ก๊อปตัวเลขกระจาย',
  (css.match(/var\(--ease\)/g) || []).length >= 6);

/* ---------- สลับหน้าแล้วมีทรานซิชัน ---------- */
push('มีแอนิเมชันตอนเปลี่ยนหน้า ครบทั้งลอยขึ้นและเลื่อนซ้าย-ขวา',
  ['viewup','viewr','viewl'].every(k => new RegExp('@keyframes ' + k + '\\b').test(css)));
// คลาสแอนิเมชันต้องเป็นคลาสทั่วไป ไม่ผูกกับ id ไหน จะได้ใช้กับแผงย่อยในหน้าได้ด้วย
push('คลาสแอนิเมชันใช้ซ้ำได้ ไม่ผูกกับ #view อย่างเดียว',
  /\n\s*\.swap\s*\{animation:viewup/.test(clean) && !/#view\.swap/.test(clean));
// ทิศต้องมาจากลำดับแท็บจริง ไม่ใช่เดาหรือสุ่ม
push('ทิศการเลื่อนคิดจากลำดับบนแถบล่าง',
  /TABS\.findIndex\(t => t\[0\] === k\)/.test(script) && /to > from \? 'swap-r' : 'swap-l'/.test(script));
// เข้าหน้าย่อยที่ไม่ได้อยู่บนแถบ = เดินเข้าไปข้างใน / กลับออกมา = ถอยออก
push('เข้าหน้าย่อยเลื่อนมาจากขวา ถอยออกเลื่อนมาจากซ้าย',
  /to < 0\s*\?\s*'swap-r'/.test(script) && /from < 0\s*\?\s*'swap-l'/.test(script));
push('มีตัวช่วยเล่นแอนิเมชันตัวเดียว ใช้ซ้ำทุกที่', /function playSwap\(el, cls\)/.test(script));
push('ล้างคลาสทิศเก่าก่อนใส่อันใหม่',
  /classList\.remove\('swap','swap-r','swap-l'\)/.test(script));

/* ---------- แท็บย่อยในหน้าก็ต้องเลื่อนเหมือนกัน ----------
   เดิม setSeg() แค่สลับคลาส แผงโผล่ทันที ดีดไม่เข้ากับที่อื่นในแอป */
push('สลับแท็บย่อยแล้วแผงเลื่อนเข้ามา', /if\(now && prev !== key\) playSwap\(now, dir\)/.test(script));
push('ทิศของแท็บย่อยคิดจากลำดับแผงจริงใน DOM',
  /order\.indexOf\(key\) > order\.indexOf\(prev\)/.test(script));
push('กดแท็บย่อยเดิมซ้ำไม่เล่นแอนิเมชัน', /prev !== key/.test(script));
push('เล่นเฉพาะตอนเปลี่ยนหน้า ไม่ใช่ทุกครั้งที่วาดใหม่',
  /if\(tab !== shownTab\)/.test(script) && /shownTab = tab/.test(script));
push('รีสตาร์ทแอนิเมชันด้วยการบังคับ reflow', /void el\.offsetWidth/.test(script));

/* ---------- เคารพการตั้งค่าลดการเคลื่อนไหว ---------- */
const rm = [...clean.matchAll(/@media\(prefers-reduced-motion:reduce\)\{([\s\S]*?)\n  \}/g)]
  .map(m => m[1]).join('\n');
push('ปิดการยุบตอนกดให้คนที่ตั้งค่าลดการเคลื่อนไหว', /transform:none/.test(rm));
push('ปิดแอนิเมชันเปลี่ยนหน้าด้วย', /\.swap,\s*\.swap-r,\s*\.swap-l\{animation:none\}/.test(clean));
push('มีบล็อก prefers-reduced-motion หลายจุดครอบคลุมทั้งแอป',
  (css.match(/prefers-reduced-motion/g) || []).length >= 4);

/* ---------- แถบเมนูล่างต้องไม่ถูกวาดใหม่ทุกรอบ ----------
   เคยเป็นบั๊ก: render() สร้างปุ่มใหม่ทั้งแถบ ปุ่มที่นิ้วกดอยู่เลยถูกทำลายทันที
   :active ไม่มีโอกาสแสดง และปุ่มใหม่เกิดมาพร้อมคลาส on วงกลมจึงไม่ค่อย ๆ โต
   (CSS transition ไม่ทำงานกับสถานะเริ่มต้นของ element ที่เพิ่งเกิด) */
push('แถบเมนูล่างสร้างครั้งเดียว มีตัวกันสร้างซ้ำ',
  /navEl\.dataset\.built/.test(script) && /if\(!navEl\.dataset\.built\)/.test(script));
push('เปลี่ยนหน้าแล้วแค่สลับคลาส ไม่ได้วาดปุ่มใหม่',
  /navEl\.querySelectorAll\('button'\)[\s\S]{0,160}classList\.toggle\('on'/.test(script));
// ถ้ามีใครเขียน innerHTML ใส่แถบนอกบล็อกที่กันไว้ แปลว่ากลับไปวาดใหม่ทุกรอบอีกแล้ว
const navWrites = (script.match(/tabsBottom'\)\.innerHTML\s*=/g) || []).length;
push(`ไม่มีที่ไหนยัด innerHTML ใส่แถบเมนูตรง ๆ (เจอ ${navWrites} จุด)`, navWrites === 0);
push('ปุ่มเมนูมี data-tab ไว้ให้สลับคลาส', /data-tab="\$\{k\}"/.test(script));
push('บอกโปรแกรมอ่านหน้าจอว่าตอนนี้อยู่หน้าไหน', /aria-current/.test(script));

// แถบวันในสัปดาห์เป็นปัญหาแบบเดียวกัน — วงแดงต้องไหลไปวันใหม่ ไม่ใช่กระโดด
push('แถบวันวาดใหม่เฉพาะตอนเปลี่ยนสัปดาห์',
  /box\.dataset\.week !== week/.test(script) && /box\.dataset\.week = week/.test(script));
push('อยู่สัปดาห์เดิมแค่สลับคลาส',
  /querySelectorAll\('\.wk-d'\)[\s\S]{0,200}classList\.toggle\('on'/.test(script));
push('ปุ่มวันมี data-day ไว้ให้สลับคลาส', /data-day="\$\{k\}"/.test(script));
const weekWrites = (script.match(/wkStrip'\)\.innerHTML\s*=/g) || []).length;
push(`เขียน innerHTML ใส่แถบวันที่เดียวคือในตัวที่กันไว้ (เจอ ${weekWrites} จุด)`, weekWrites <= 1);

/* ---------- กันพลาดที่เจอบ่อย ---------- */
// ปุ่มที่ถูกปิดอยู่ไม่ควรยุบตอนกด จะหลอกว่ากดได้
push('ปุ่มที่ปิดอยู่ไม่ยุบตอนกด', /:active:not\(:disabled\)/.test(css));
// แท่งกราฟเป็น SVG ถ้าใส่ transform จุดหมุนจะเพี้ยน ต้องใช้ opacity
push('แท่งกราฟใช้ความจางแทนการยุบ', /\.chart \.cday:active\{opacity/.test(css));

let bad = 0;
out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
