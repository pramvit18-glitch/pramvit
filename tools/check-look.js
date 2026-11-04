// ตรวจว่าทุกหน้าหน้าตาไปทางเดียวกัน: หัวใหญ่ แท็บเม็ดยาชุดเดียว การ์ดสถานะ แถบวัน
// หน้าขายไม่นับ — ตั้งใจให้เต็มจอ ไม่มีหัวใหญ่
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

/* ---------- จอคอม ----------
   เคยพังมาแล้ว: `@media` วัดจาก "ความกว้างจอ" แต่เนื้อหาถูกล็อกด้วย .shell{max-width}
   แดชบอร์ดสลับเป็น 4 คอลัมน์ตั้งแต่จอกว้าง 1040 ทั้งที่เปลือกยังกว้างแค่ 780
   ได้การ์ดผอมเบียดกันและกล่องขาวว่างครึ่งใบ เจ้าของบอกว่า "ในคอมไม่สวยเลย"
   กฎ: จุดที่สลับเป็นหลายคอลัมน์ ต้องไม่มาก่อนจุดที่เปลือกกว้างขึ้นจริง */
const mq = [...css.matchAll(/@media\(min-width:(\d+)px\)\{([\s\S]*?)\n  \}/g)]
  .map(m => ({ at: Number(m[1]), body: m[2] }));
/* จอคอมใช้รางเมนูชิดขอบ เปลือกจึงกว้างเต็มจอ แล้วไปจำกัดความกว้างที่ "เนื้อหา" แทน
   ถ้าไม่จำกัด การ์ดจะยืดข้ามจอ 2,000px บนจอใหญ่ ๆ อ่านไม่ไหว */
const mainCap = mq.filter(b => /\n    main\{[^}]*max-width:(\d{4,})px/.test(b.body))
  .map(b => Number(/\n    main\{[^}]*max-width:(\d{4,})px/.exec(b.body)[1]))[0];
push(`จอคอมจำกัดความกว้างเนื้อหาไว้ (${mainCap || '-'}px)`, mainCap >= 1000 && mainCap <= 1400);
/* เคยมีข้อ "แดชบอร์ด 4 คอลัมน์ต้องไม่มาก่อนจุดที่เปลือกกว้าง" อยู่ตรงนี้
   พอเพิ่มรางเมนูข้าง (กินที่อีก ~110px) การเทียบเลขสองตัวนี้ก็ไม่ได้บอกอะไรอีกแล้ว
   มันผ่านตลอดทั้งที่เนื้อหาอาจแคบอยู่ — เป็นเทสต์ที่โกหก เลยเอาออก
   ของจริงไปวัดความกว้างจากเบราว์เซอร์ใน tools/e2e-wide.js แทน */
/* กราฟเป็น SVG ที่ย่อ-ขยายทั้งภาพ ปล่อยให้เต็มความกว้างจอคอม ตัวหนังสือจะโตจนเทอะทะ */
push('กราฟบนจอคอมถูกคุมความกว้างไว้',
  mq.some(b => b.at >= 1000 && /\.chart svg\{[^}]*max-width:\d+px/.test(b.body)));

/* ---------- ระดับ CSS ---------- */
/* หัวใหญ่ต้องใหญ่กว่าหัวปกติ (17px) แต่ไม่โตจนข่มเนื้อหา
   เช็กเป็นช่วงแทนตัวเลขตายตัว จะได้ปรับขนาดได้โดยไม่ต้องตามแก้เทสต์ */
const bigH1 = +(css.match(/\.appbar\.big \.titles h1\{[^}]*font-size:([\d.]+)px/) || [])[1];
push('มีหัวใหญ่สำหรับหน้าทั่วไป ขนาดอยู่ระหว่าง 20–28px', bigH1 > 20 && bigH1 <= 28);
/* การ์ดสรุป (.srow) มีแต่ระยะห่างด้านบน การ์ดที่ตามมาเลยเคยมาชนติดกัน */
push('การ์ดสรุปไม่ชนการ์ดถัดไป', /\.srow \+ \.card[^{]*\{[^}]*margin-top:\d+px/.test(css));
/* .cat = ชิปกรอง (เลือกได้หลายแบบ ไม่เปลี่ยนหน้า) → ทรงแคปซูล
   .dseg-b = แท็บหน้า (เปลี่ยนเนื้อหาทั้งแผง) → ทรงแฟ้ม ต่อกับการ์ดข้างล่าง
   สองอันนี้ทำคนละหน้าที่ จึงตั้งใจให้หน้าตาต่างกัน แต่ละอันต้องสม่ำเสมอในตัวเอง */
const cat  = (css.match(/\n  \.cat\{[^}]*\}/) || [''])[0];
const dseg = (css.match(/\n  \.dseg-b\{[^}]*\}/) || [''])[0];
push('ชิปกรองเลิกใช้เส้นขอบแล้ว', cat && !/border:1px/.test(cat));
push('ชิปกรองเป็นทรงแคปซูล', /border-radius:var\(--r-pill\)/.test(cat));
push('แท็บหน้าเป็นทรงแฟ้ม มนเฉพาะมุมบน',
  /border-radius:var\(--r\) var\(--r\) 0 0/.test(dseg));
push('แท็บที่เลือกเป็นสีเดียวกับการ์ด จะได้ดูต่อเนื่องกัน',
  /\.dseg-b\.on\{[^}]*background:var\(--bg\)/.test(css));
push('แท็บที่เลือกต่อกับการ์ดใบแรกโดยลบมุมบนของการ์ด',
  /\.dseg ~ \.dpane\.on > :first-child\{border-top-left-radius:0/.test(css));
push('จอกว้างที่กริดแตกหลายคอลัมน์ คืนมุมการ์ดให้ปกติ',
  /\.dseg ~ \.dpane\.on > :first-child\{border-radius:var\(--r\)\}/.test(css));
push('ทั้งชิปกรองและแท็บหน้า ใช้สีแบรนด์บอกตัวที่เลือก',
  /\.cat\.on\{[^}]*var\(--brand\)/.test(css) && /\.dseg-b\.on\{[^}]*var\(--brand\)/.test(css));
push('แผงแท็บย่อยซ่อนได้ทั้งแบบกริดและแบบธรรมดา', css.includes('.dpane:not(.on){display:none}'));

/* ---------- ระดับ render ---------- */
// หัวใหญ่ต้องใช้ทุกหน้า ไม่มีหน้าไหนหลุดไปใช้หัวแบบเก่า
push('หัวใหญ่ใช้ทุกหน้า ไม่มีหน้าไหนหลุด',
  /classList\.add\('big'\)/.test(script) && !/classList\.toggle\('big'/.test(script));
push('ส่วนบนหน้าแรกยังโผล่เฉพาะแท็บแดชบอร์ด', /getElementById\('homeTop'\)\.hidden\s*=\s*!home/.test(script));

const probe = `
(() => {
  const r = [];
  const bal = html => ['div','span','button','p','b','small','h2','h3']
    .every(t => (html.match(new RegExp('<' + t + '[ >]','g'))||[]).length
             === (html.match(new RegExp('</' + t + '>','g'))||[]).length);

  /* ทุกหน้าที่ไม่ได้อยู่บนแถบล่างต้องมีชื่อหัวข้อของตัวเอง ไม่ใช่ตกไปใช้ชื่อสำรอง */
  r.push(['หน้าย่อยทุกหน้ามีชื่อหัวข้อ',
    ADMIN_TABS.every(k => TABS.some(t => t[0] === k) || (PAGES[k] && PAGES[k][1]))]);
  r.push(['ชื่อหัวข้อไม่ซ้ำกัน', (() => {
    const names = [...TABS.map(t => t[3] || t[1]), ...Object.values(PAGES).map(p => p[1])];
    return new Set(names).size === names.length;
  })()]);

  /* ---- หน้าตั้งค่า ---- */
  const setup = viewSetup();
  r.push(['ตั้งค่า: มีการ์ดสถานะร้านอยู่เหนือแถบแท็บ',
    setup.indexOf('class="srow') >= 0 && setup.indexOf('class="srow') < setup.indexOf('dseg')]);
  r.push(['ตั้งค่า: มีแท็บย่อย 4 อัน', (setup.match(/dseg-b/g)||[]).length === 4]);
  r.push(['ตั้งค่า: มีแผง 4 แผง', (setup.match(/dpane/g)||[]).length === 4]);
  r.push(['ตั้งค่า: เปิดอยู่แผงเดียว', (setup.match(/dpane on/g)||[]).length === 1]);
  r.push(['ตั้งค่า: การ์ดเดิมอยู่ครบทุกใบ',
    ['ร้านของฉัน','รหัสคนดูแล','แป้ง / เมนูที่ขาย','ชุดไส้ที่ใส่ได้','ช่วยตั้งราคา','ข้อมูลของฉัน']
      .filter(t => setup.indexOf(t) < 0).length === 0]);
  r.push(['ตั้งค่า: แท็กปิดครบ', bal(setup)]);
  // สลับแท็บแล้วเนื้อหาต้องยังครบ แค่เปลี่ยนว่าแผงไหนเปิด
  segs.setup = 'data';
  const setup2 = viewSetup();
  r.push(['ตั้งค่า: สลับแท็บแล้วเนื้อหายังครบ',
    setup2.indexOf('ข้อมูลของฉัน') >= 0 && setup2.indexOf('ร้านของฉัน') >= 0
    && (setup2.match(/dpane on/g)||[]).length === 1]);
  segs.setup = 'shop';

  /* ---- หน้าย้อนหลัง ---- */
  const hist = viewHist();
  r.push(['ย้อนหลัง: ใช้แถบวันชุดเดียวกับหน้าแรก', hist.indexOf('wk-row') >= 0 && hist.indexOf('wk-d') >= 0]);
  r.push(['ย้อนหลัง: เลิกใช้ปุ่มเลื่อนเดือนแบบเก่า', hist.indexOf('mnav') < 0]);
  r.push(['ย้อนหลัง: มีการ์ดสถานะของวันที่เลือก', hist.indexOf('srow') >= 0]);
  r.push(['ย้อนหลัง: ยังใช้ชิปกรองเดิมได้', hist.indexOf('class="cat') >= 0]);
  r.push(['ย้อนหลัง: แท็กปิดครบ', bal(hist)]);
  // แตะวันบนแถบ แล้วการ์ดสรุปเดือนต้องตามไปเดือนนั้น
  const other = allDays().find(k => monthKey(k) !== monthKey(dashDay));
  if(other){
    pickDay(other);
    r.push(['ย้อนหลัง: แตะวันข้ามเดือนแล้วการ์ดเดือนตามไปด้วย', curMonth() === monthKey(other)]);
    pickDay(dayKey());
  }else{
    r.push(['ย้อนหลัง: แตะวันข้ามเดือนแล้วการ์ดเดือนตามไปด้วย (ไม่มีข้อมูลข้ามเดือน ข้าม)', true]);
  }

  /* ---- หน้าย่อยที่เข้ามาจากตั้งค่า ---- */
  [['ของที่ซื้อมา', viewIng], ['ต้นทุนคงที่', viewFixed], ['ภาพรวมร้าน', viewDash]].forEach(([nm, fn]) => {
    const h = fn();
    r.push([nm + ': มีปุ่มย้อนกลับ', h.indexOf('btn back') >= 0]);
    r.push([nm + ': มีการ์ดสรุปหัวหน้า', h.indexOf('class="srow') >= 0]);
    r.push([nm + ': แท็กปิดครบ', bal(h)]);
  });

  /* ---- ปุ่มทุกอันทุกหน้าต้องมีฟังก์ชันรองรับ ---- */
  const all = viewSetup() + viewHist() + viewIng() + viewFixed() + viewDash() + viewToday();
  const miss = [...new Set([...all.matchAll(/onclick="([A-Za-z_$][A-Za-z0-9_$]*)[(]/g)].map(m => m[1]))]
    .filter(f => typeof eval(f) !== 'function');
  r.push(['ทุกปุ่มทุกหน้ามีฟังก์ชันรองรับ' + (miss.length ? ' — ขาด ' + miss.join(', ') : ''), !miss.length]);

  return r;
})()
`;
eval(script + probe).forEach(([name, v]) => out.push([name, !!v]));

let bad = 0;
out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
