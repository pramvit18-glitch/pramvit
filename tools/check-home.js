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
global.document = { body: stub(), addEventListener(){}, removeEventListener(){}, getElementById: stub, querySelector: () => stub(), createElement: stub };
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
  /* ถาดวันเป็นแถวยาวที่ลากไหลได้ (เจ้าของขอ: "เลื่อนให้มันสมูทหน่อย เหมือนเมนูของฉัน")
     ไม่ใช่ 7 ช่องตายตัวแล้ว ต้องมีของให้ลากย้อนหลายสัปดาห์ */
  const wkNow = wkHTML();
  const cellCount = (wkNow.match(/class="wk-d[ "]/g)||[]).length;
  out.push(['ถาดวันมีของให้ลากย้อนหลายสัปดาห์ (' + cellCount + ' วัน)', cellCount >= 60]);
  out.push(['สัปดาห์นี้อยู่ในถาดครบทั้ง 7 วัน',
    wk.filter(k => k <= today).every(k => wkNow.indexOf('data-day="' + k + '"') >= 0)]);
  out.push(['วันนี้ถูกไฮไลต์อยู่', wkNow.indexOf(' on') >= 0 && wkNow.indexOf('today') >= 0]);
  out.push(['ถาดวันแท็กปิดครบ', bal(wkNow)]);
  /* ถาดจบที่วันนี้ ไม่ต้องมีวันข้างหน้าให้กดเลย
     (ของเดิมเป็น 7 ช่องตายตัว เลยมีวันข้างหน้าโผล่มาแล้วต้องปิดทีละอัน) */
  const latest = [...wkNow.matchAll(/data-day="([\\d-]+)"/g)].map(m => m[1]).sort().pop();
  out.push(['ถาดวันจบที่วันนี้ ไม่มีวันข้างหน้าให้กด (' + latest + ')', latest === today]);
  // วันอาทิตย์ต้องเป็นสีแดงถูกวันจริง ไม่ใช่นับช่องที่ 7 เอา
  /* ตัวหนังสือบอกวันต้องตรงกับวันจริง **ห้ามนับจากลำดับช่อง**
     ถาดยาวต่อเนื่องแล้ว "ช่องที่ 7" ไม่ได้แปลว่าวันอาทิตย์อีกต่อไป
     ข้อเดิมนับแค่จำนวนช่องที่เป็นสีแดง ซึ่งจับไม่ได้เลยตอนทุกวันเลื่อนไปหนึ่งวัน */
  const dowOf = {};
  wkNow.split('<button').forEach(ch => {
    const i = ch.indexOf('data-day="'); if(i < 0) return;
    const k = ch.slice(i + 10, ch.indexOf('"', i + 10));
    const j = ch.indexOf('class="dow">'); if(j < 0) return;
    dowOf[k] = { dow: ch.slice(j + 12, ch.indexOf('<', j + 12)), sun: ch.indexOf(' sun"') >= 0 };
  });
  const TH7 = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const dayOf = k => new Date(k.replace(/-/g, '/')).getDay();
  const wrongDow = Object.keys(dowOf).filter(k => dowOf[k].dow !== TH7[dayOf(k)]);
  out.push(['ตัวหนังสือบอกวันตรงกับวันจริงทุกช่อง' + (wrongDow.length ? ' — ผิด ' + wrongDow.length + ' ช่อง' : ''),
    !wrongDow.length && Object.keys(dowOf).length >= 60]);
  const wrongSun = Object.keys(dowOf).filter(k => dowOf[k].sun !== (dayOf(k) === 0));
  out.push(['วันอาทิตย์เป็นสีแดงถูกวันทุกอัน' + (wrongSun.length ? ' — ผิด ' + wrongSun.length + ' ช่อง' : ''),
    !wrongSun.length]);
  // ถาดเลื่อนเองด้วยเบราว์เซอร์ ไม่ใช่ JS ลากเอง — ลื่นกว่าและไม่แย่งจังหวะเลื่อนหน้าจอ
  out.push(['ถาดวันเลื่อนด้วยการเลื่อนของเบราว์เซอร์เอง',
    /\.wk-row\{[^}]*overflow-x:auto/.test(src)]);
  out.push(['เลื่อนถาดไปหาวันที่เลือกให้เอง', /function centerWkRow/.test(src)]);
  out.push(['ชื่อเดือนวิ่งตามวันที่เลื่อนไปเห็น', /wk-mt/.test(src)]);

  /* ---- ปฏิทินเต็มเดือน (กดที่ชื่อเดือน) ----
     เจ้าของขอมาเอง: ของเดิมเป็นรายชื่อเดือน ไปได้แค่เดือนที่เคยมีบันทึก */
  calMon = '2026-02';                      // ก.พ. 2026 มี 28 วัน · วันที่ 1 ตรงวันอาทิตย์
  const cal = calHTML();
  out.push(['ปฏิทินวาดครบทุกวันของเดือน (ก.พ. = 28)',
    (cal.match(/class="cal-d[ "]/g)||[]).length === 28]);
  // วันที่ 1 ของ ก.พ. 2026 เป็นวันอาทิตย์ = ช่องสุดท้ายของแถว ต้องเว้นหน้า 6 ช่อง
  out.push(['เว้นช่องหน้าวันที่ 1 ให้ตรงคอลัมน์วัน (ก.พ. 2026 ขึ้นวันอาทิตย์)',
    (cal.match(/class="cal-x"/g)||[]).length === 6]);
  out.push(['ปฏิทินมีหัววัน จ-อา ครบ 7', cal.indexOf('cal-dow') >= 0
    && DOW_TH.every(d => cal.indexOf('>' + d + '<') >= 0)]);
  out.push(['ปฏิทินแท็กปิดครบ', bal(cal)]);
  // เดือนที่มีวันนี้อยู่ ต้องปิดปุ่มเดือนถัดไป และวันในอนาคตต้องกดไม่ได้
  calMon = monthKey(today);
  const calNow = calHTML();
  const lastDay = new Date(Number(today.slice(0,4)), Number(today.slice(5,7)), 0).getDate();
  const future = lastDay - Number(today.slice(8));
  out.push(['เดือนนี้: วันข้างหน้ากดไม่ได้',
    (calNow.match(/disabled/g)||[]).length >= future]);
  out.push(['เดือนนี้: ปุ่มไปเดือนหน้าถูกปิด', /cal-nav[^>]*calShift\\(1\\)[\\s\\S]{0,80}disabled/.test(calNow)]);
  out.push(['วันนี้ถูกทำเครื่องหมายในปฏิทิน', calNow.indexOf('cal-d on today') >= 0
    || /class="cal-d[^"]*today/.test(calNow)]);
  // ปัดนิ้วต้องเปลี่ยนสัปดาห์ได้จริง ไม่ใช่มีแค่ปุ่มลูกศร
  out.push(['ปฏิทินติดป้ายว่าปัดนิ้วได้', /data-swipe="cal"/.test(src)]);
  /* **ถาดวันต้องไม่ดักปัดทับการเลื่อนของเบราว์เซอร์**
     ถ้าดักไว้ด้วย พอสะบัดถาดแล้วปล่อย มันจะกระโดดสัปดาห์ให้อีกต่อหนึ่ง */
  out.push(['ถาดวันไม่ดักปัดทับการเลื่อน', !/data-swipe="week"/.test(src)]);
  /* ปัดในปฏิทินแล้วนิ้วไปหยุดทับปุ่มวันพอดี เบราว์เซอร์จะยิง click ตามมาด้วย
     ถ้าไม่กินทิ้ง ปัดทีเดียวได้ทั้งเปลี่ยนเดือนและเลือกวันที่บังเอิญอยู่ใต้นิ้ว */
  out.push(['ปัดแล้วไม่เผลอเลือกวันที่นิ้วไปหยุดทับ',
    /swAte\\s*=\\s*true/.test(src) && /stopPropagation/.test(src)]);
  // ปัดแนวตั้ง = เขากำลังเลื่อนหน้าจอ ห้ามไปเปลี่ยนเดือนให้
  out.push(['เลื่อนหน้าจอแนวตั้งไม่ไปเปลี่ยนเดือน', /Math\\.abs\\(dy\\)/.test(src)]);

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

  /* ---- สะกิดให้สำรองข้อมูล ----
     ข้อมูลอยู่ในเครื่องเดียว ไม่มีบัญชีผู้ใช้ มือถือหาย = หายหมด
     และการสำรองต้องกดเอง ซึ่งไม่มีใครนึกถึงจนกว่าจะสายไปแล้ว */
  const DAY = 86400000;
  const bkWas = store.bkAt;

  store.bkAt = Date.now();
  out.push(['เพิ่งสำรองไป ไม่ต้องสะกิด', backupWarnHTML() === '']);
  out.push(['นับวันได้ถูก', daysSinceBackup() === 0]);

  store.bkAt = Date.now() - 3 * DAY;
  out.push(['สำรอง 3 วันที่แล้ว ยังไม่ต้องสะกิด', backupWarnHTML() === '']);

  store.bkAt = Date.now() - 9 * DAY;
  const nag = backupWarnHTML();
  out.push(['เกิน 7 วันแล้วต้องสะกิด', nag.indexOf('9 วัน') >= 0]);
  out.push(['สะกิดเป็นแถบเตือน ไม่ใช่แถวธรรมดา', nag.indexOf('srow warn') >= 0]);
  out.push(['บอกด้วยว่าไม่สำรองแล้วเสียอะไร', nag.indexOf('หายหมด') >= 0]);
  out.push(['มีปุ่มพาไปสำรองเลย', nag.indexOf('openBackup()') >= 0]);
  out.push(['แถบสะกิดแท็กปิดครบ', bal(nag)]);

  delete store.bkAt;
  out.push(['ยังไม่เคยสำรองเลย ต้องสะกิด', backupWarnHTML().indexOf('ยังไม่เคยสำรอง') >= 0]);
  out.push(['ยังไม่เคยสำรอง = ไม่มีจำนวนวัน', daysSinceBackup() === null]);

  /* เครื่องที่เพิ่งลงแอปยังไม่มีอะไรจะเสีย อย่าไปเตือนตั้งแต่วันแรก */
  const shopsWas = store.shops;
  store.shops = [{ id:'empty', sales:[], menus:[], ingredients:[] }];
  out.push(['ยังไม่มีอะไรจะเสีย ไม่ต้องเตือน', backupWarnHTML() === '']);
  store.shops = shopsWas;

  /* การ์ดสถานะเดิมต้องไม่ถูกแถบสะกิดเบียดหาย — ของเดิมคือยอดขายวันนี้ ต้องเห็นทุกวัน */
  out.push(['สะกิดแล้วได้สองแถว ไม่ใช่แถวเดียว',
    (statusHTML() + backupWarnHTML()).match(/<div class="srow /g).length === 2]);
  out.push(['หน้าแรกต่อแถบสะกิดท้ายการ์ดสถานะจริง ไม่ใช่เอาไปแทนที่',
    renderHome.toString().replace(/\\s/g, '').indexOf('statusHTML()+backupWarnHTML()') >= 0]);

  /* ต้องรอดจากการปิด-เปิดแอป เหมือน locked กับ pin
     load() สร้าง store ขึ้นใหม่ทุกครั้ง ลืมคัดลอกค่านี้มาเมื่อไหร่
     ก็จะนับหนึ่งใหม่ทุกเช้า แล้วเตือนทั้งที่เพิ่งสำรองไปเมื่อวาน
     (สองตัวนั้นเคยหลุดมาแล้วสองรอบ ข้อนี้กันไว้ไม่ให้เป็นรอบที่สาม) */
  store.bkAt = Date.now() - 2 * DAY;
  save();
  load();
  out.push(['ปิด-เปิดแอปแล้วยังจำได้ว่าสำรองไปเมื่อไหร่', daysSinceBackup() === 2]);
  db = curShop();

  store.bkAt = bkWas;

  /* ---- ปุ่มทุกอันต้องมีฟังก์ชันรองรับ ---- */
  const all = wkHTML() + quickHTML() + statusHTML() + backupWarnHTML() + hiliteHTML() + viewToday();
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
