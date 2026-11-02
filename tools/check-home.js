// ตรวจส่วนบนของหน้าแรก: ค้นหา ทางลัด แถบวันในสัปดาห์ การ์ดสถานะ แถวเมนูขายดี
// และแท็บย่อยบนแดชบอร์ด — ต้องวาดครบ แท็กปิดครบ และย้อนวันได้จริง
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
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

const probe = `
(() => {
  const out = [];
  const today = dayKey();
  const bal = html => ['div','span','button','p','b','small']
    .every(t => (html.match(new RegExp('<' + t + '[ >]','g'))||[]).length
             === (html.match(new RegExp('</' + t + '>','g'))||[]).length);

  /* ---- แถบวันในสัปดาห์ ---- */
  const wk = weekOf(today);
  out.push(['สัปดาห์มี 7 วัน เรียงจันทร์→อาทิตย์', wk.length === 7 && wk.includes(today)
    && new Date(wk[0].replace(/-/g,'/')).getDay() === 1]);
  out.push(['แถบวันวาดครบ 7 ปุ่ม', (wkHTML().match(/class="wk-d/g)||[]).length === 7]);
  out.push(['วันนี้ถูกไฮไลต์อยู่', wkHTML().indexOf(' on') >= 0 && wkHTML().indexOf('today') >= 0]);
  out.push(['แถบวันแท็กปิดครบ', bal(wkHTML())]);

  // วันในอนาคตต้องกดไม่ได้ และปุ่มสัปดาห์ถัดไปต้องถูกปิด
  const wkNow = wkHTML();
  const fut = wk.filter(k => k > today).length;
  out.push(['วันในอนาคตกดไม่ได้', (wkNow.match(/disabled/g)||[]).length >= fut]);

  /* ---- ย้อนวันแล้วแดชบอร์ดเปลี่ยนตาม ---- */
  const y = addDays(today, -1);
  out.push(['เมื่อวานคำนวณถูก', y < today && addDays(y, 1) === today]);
  dashDay = y;
  const back = viewToday();
  out.push(['ย้อนวันแล้วแดชบอร์ดใช้ยอดของวันนั้น', back.indexOf(baht(sumDay(y).sale)) >= 0]);
  out.push(['หัวการ์ดเปลี่ยนเป็น "เมื่อวาน"', back.indexOf('เมื่อวาน') >= 0]);
  out.push(['การ์ดสถานะมีปุ่มกลับมาวันนี้', statusHTML().indexOf("pickDay('" + today + "')") >= 0]);
  dashDay = today;
  out.push(['กลับมาวันนี้แล้วหัวการ์ดเป็น "วันนี้"', viewToday().indexOf('วันนี้') >= 0]);

  /* ---- แท็บย่อยบนแดชบอร์ด ---- */
  const html = viewToday();
  out.push(['มีแท็บย่อยครบ 4 อัน', (html.match(/dseg-b/g)||[]).length === 4]);
  out.push(['มีแผงเนื้อหาครบ 4 แผง', (html.match(/class="dash dpane/g)||[]).length === 4]);
  out.push(['เปิดอยู่แผงเดียว', (html.match(/dash dpane on/g)||[]).length === 1]);
  out.push(['การ์ดเดิมยังอยู่ครบ', ['hero-card','stat-card','mon-nums','mbox']
    .every(c => html.indexOf(c) >= 0)]);
  // อันดับเมนูขึ้นเฉพาะวันที่มีขาย วันที่ยังไม่ขายต้องเป็นสถานะว่าง ไม่ใช่หน้าโล่ง
  const busy = allDays().find(k => sumDay(k).sale > 0);
  dashDay = busy || today;
  out.push(['วันที่มีขายโชว์อันดับเมนู', !busy || viewToday().indexOf('rankx') >= 0]);
  dashDay = today;
  out.push(['วันที่ยังไม่ขายบอกว่ายังไม่มีการขาย', html.indexOf('ยังไม่มีการขาย') >= 0
    || html.indexOf('rankx') >= 0]);
  out.push(['แดชบอร์ดแท็กปิดครบทุกแผง', bal(html)]);
  // ทุกแท็บย่อยต้องมีการ์ดอย่างน้อยหนึ่งใบ ไม่มีแผงว่าง
  const panes = html.split('class="dash dpane').slice(1);
  out.push(['ไม่มีแผงว่าง', panes.length === 4 && panes.every(p => p.indexOf('card') >= 0)]);

  /* ---- ทางลัด ---- */
  out.push(['ทางลัดค่าเริ่มต้นวาดครบ', (quickHTML().match(/quick-b/g)||[]).length === QUICK_DEF.length]);
  out.push(['ทางลัดทุกอันมีปลายทางจริง', QUICK.every(([k]) =>
    QUICK_RUN[k] || TABS.some(t => t[0] === k) || ADMIN_TABS.includes(k))]);
  localStorage.setItem('crepe-quick-v1', JSON.stringify(['hist','bk']));
  out.push(['เลือกทางลัดเองแล้วจำได้', (quickHTML().match(/quick-b/g)||[]).length === 2]);
  localStorage.setItem('crepe-quick-v1', JSON.stringify([]));
  out.push(['ไม่เลือกเลยก็ไม่พัง', quickHTML().indexOf('ปรับแต่ง') >= 0]);
  localStorage.setItem('crepe-quick-v1', JSON.stringify(QUICK_DEF));
  out.push(['ทางลัดแท็กปิดครบ', bal(quickHTML())]);

  /* ---- ค้นหา ---- */
  const name = (db.menus[0] || {}).name || '';
  homeQ = name.slice(0, 3);
  const res = searchHTML();
  out.push(['ค้นชื่อเมนูแล้วเจอ', !!name && res.indexOf(esc(name)) >= 0]);
  out.push(['ผลค้นหาแท็กปิดครบ', bal(res)]);
  homeQ = 'ไม่มีทางมีของชื่อนี้';
  out.push(['ไม่เจอแล้วบอกว่าไม่เจอ', searchHTML().indexOf('ไม่เจอ') >= 0]);
  homeQ = '';

  /* ---- การ์ดสถานะ + แถวเมนูขายดี ---- */
  const wasOpen = db.shopOpen;
  db.shopOpen = 0;
  out.push(['ร้านปิดอยู่แล้วการ์ดสถานะเตือน', statusHTML().indexOf('ร้านปิดอยู่') >= 0]);
  db.shopOpen = 1;
  out.push(['การ์ดสถานะแท็กปิดครบ', bal(statusHTML())]);
  db.shopOpen = wasOpen;
  out.push(['แถวเมนูขายดีมีของให้กด', hiliteHTML().indexOf('hil-b') >= 0]);
  out.push(['แถวเมนูขายดีแท็กปิดครบ', bal(hiliteHTML())]);

  /* ---- ปุ่มทุกอันต้องมีฟังก์ชันรองรับ ---- */
  const all = wkHTML() + quickHTML() + statusHTML() + hiliteHTML() + viewToday();
  const miss = [...new Set([...all.matchAll(/onclick="([A-Za-z_$][A-Za-z0-9_$]*)[(]/g)].map(m => m[1]))]
    .filter(f => typeof eval(f) !== 'function');
  out.push(['ทุกปุ่มบนหน้าแรกมีฟังก์ชันรองรับ' + (miss.length ? ' — ขาด ' + miss.join(', ') : ''), !miss.length]);

  return out;
})()
`;
const out = eval(script + probe);
let bad = 0;
out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
