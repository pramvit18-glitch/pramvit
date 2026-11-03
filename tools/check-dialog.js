// ตรวจหน้าต่าง (dialog): ฉากหลังเบลอ หัวลอยติดบน ลากปิดได้ จอใหญ่เป็นกล่องกลางจอ
// และทุกหน้าต่างมีไอคอนหัวข้อ ไม่มีอันไหนตกหล่น
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const css = src.split('<style>')[1].split('</style>')[0];
const body = src.split('</style>')[1].split('<script>')[0];
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

const out = [];
const push = (name, v) => out.push([name, !!v]);

/* ---------- โครงของหน้าต่าง ---------- */
push('มีช่องไอคอนหัวหน้าต่าง', /id="dlgIcon"/.test(body));
push('มีพื้นที่ลากปิด', /id="dlgGrip"/.test(body) && /class="dlg-grip-hit"/.test(body));

/* ---------- CSS ---------- */
/* เบลอยังอยู่ แต่ย้ายไปใส่ตอนกล่องจอดนิ่งแล้ว (คลาส settled)
   เบลอระหว่างกล่องกำลังเลื่อนทำให้เฟรมสะดุดจาก 2 เป็น 10 บนมือถือจำลอง */
push('ฉากหลังยังเบลอ', /dialog\.settled::backdrop\{[^}]*backdrop-filter:blur/.test(css));
push('ไม่เบลอระหว่างกล่องกำลังเลื่อน จะได้ไม่สะดุด',
  !/dialog::backdrop\{[^}]*backdrop-filter:blur/.test(css));
push('มีโค้ดใส่เบลอตอนภาพเปิดเล่นจบ', /classList\.add\('settled'\)/.test(script));
push('ปิดกล่องเอาเบลอออกก่อน ขาออกจะได้เบาด้วย',
  /remove\('settled'\)[\s\S]{0,120}add\('closing'\)/.test(script));
push('ฉากหลังค่อย ๆ จาง ไม่โผล่ทันที', /dialog\[open\]::backdrop\{animation:dlgfade/.test(css));
push('หัวหน้าต่างลอยติดบน', /\.dlg-head\{[^}]*position:sticky/.test(css));
push('เส้นใต้หัวโผล่เฉพาะตอนเลื่อน', css.includes('dialog.scrolled .dlg-head::after{opacity:1}'));
push('ท้ายหน้าต่างติดล่างเสมอ', /\.dlg-foot\{position:sticky/.test(css));
push('ปุ่มหลักเด่นกว่าปุ่มยกเลิก', /\.dlg-foot \.btn\.primary\{flex:1\.5\}/.test(css));
push('มีตัวเลื่อนสำหรับลากปิด', /transform:translateY\(var\(--drag/.test(css));
push('ประกาศ --drag ไว้แล้ว', /--drag:0px/.test(css));
push('ลากอยู่ไม่ใส่ทรานซิชัน ปล่อยแล้วเด้งกลับ',
  css.includes('dialog.dragging{transition:none}') && /dialog\.snapback\{transition:transform/.test(css));
push('จอใหญ่เป็นกล่องลอยกลางจอ', /dialog\[open\]\{animation:dlgpop/.test(css));
push('จอใหญ่ไม่ต้องมีที่ลาก', css.includes('.dlg-grip-hit{display:none}'));
push('ปิดแอนิเมชันให้คนที่ตั้งค่าลดการเคลื่อนไหว',
  (css.match(/prefers-reduced-motion/g) || []).length >= 2);

/* ---------- JS ---------- */
push('มีตัวดักเลื่อนเพื่อโชว์เส้นใต้หัว', /dlg\.addEventListener\('scroll'/.test(script));
push('ลากด้วย pointer event ใช้ได้ทั้งนิ้วและเมาส์',
  /pointerdown/.test(script) && /pointermove/.test(script) && /pointercancel/.test(script));
push('จอใหญ่ไม่เปิดโหมดลาก', /matchMedia\('\(min-width:760px\)'\)/.test(script));
push('เปิดหน้าต่างใหม่แล้วล้างสถานะลาก/เลื่อนค้างทิ้ง',
  /removeProperty\('--drag'\)/.test(script) && /dlg\.scrollTop = 0/.test(script));
push('ไอคอนรับโทนสีได้', /cfg\.tone \? ' tone-' \+ cfg\.tone/.test(script));
push('หน้าต่างยืนยันลบใช้โทนแดง', /icon:'trash', tone:'r'/.test(script));

/* ---------- ทุกหน้าต่างต้องมีไอคอน ---------- */
const calls = [...script.matchAll(/openDialog\(\{([\s\S]{0,120})/g)];
const noIcon = calls.filter(m => !/^\s*icon:/.test(m[1])).length;
push(`ทุกหน้าต่างมีไอคอน (${calls.length} หน้าต่าง${noIcon ? ', ขาด ' + noIcon : ''})`, calls.length > 20 && !noIcon);

// ไอคอนที่ใส่ต้องมีอยู่จริงในชุด SVG ไม่งั้นหัวหน้าต่างจะว่างเปล่า
const keys = new Set([...(script.split('const SVG = {')[1] || '').split('\n};')[0]
  .matchAll(/^\s{2}([a-z0-9]+):/gm)].map(m => m[1]));
const used = [...new Set([...script.matchAll(/openDialog\(\{ icon:'([a-z0-9]+)'/g)].map(m => m[1]))];
const missing = used.filter(k => !keys.has(k));
push('ไอคอนที่ใช้มีอยู่จริงทุกตัว' + (missing.length ? ' — ไม่มี ' + missing.join(', ') : ''),
  used.length > 0 && !missing.length);

let bad = 0;
out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
