// ตรวจว่าหลายร้านในแอปเดียวแยกข้อมูลขาดจากกันจริง และย้ายข้อมูลเก่ามาได้
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

// localStorage ปลอม จำค่าได้จริง จะได้ทดสอบการย้ายข้อมูลเก่า
const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};
const stub = () => {
  const cls = new Set();
  return { innerHTML:'', textContent:'', hidden:false, value:'', dataset:{},
    addEventListener(){}, removeEventListener(){}, showModal(){}, close(){},
    querySelectorAll:()=>[], querySelector:()=>stub(), focus(){}, setAttribute(){},
    classList:{ toggle(c,on){ const w = on === undefined ? !cls.has(c) : !!on; w ? cls.add(c) : cls.delete(c); },
      add(c){cls.add(c)}, remove(c){cls.delete(c)}, contains:c=>cls.has(c) },
    scrollIntoView(){}, replaceWith(){}, insertAdjacentHTML(){} };
};
global.document = { body: stub(), getElementById: stub, querySelector: () => stub(), createElement: stub };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};

// --- จำลองว่าเครื่องนี้เคยใช้เวอร์ชันร้านเดียวมาก่อน ---
const oldShop = {
  ingredients: [], menus: [{id:'m1', name:'เครปวานิลา', price:15, groupIds:[]}],
  groups: [], sales: [{id:'s1', bill:'b1', d:'2026-10-20', t:'10:00', menuId:'m1', name:'เครปวานิลา', qty:2, addons:[], total:30}],
  expenses: [], fixed:{rent:0,electric:0,gas:0,water:0,other:0,days:26,labor:0}, targetMargin:65
};
mem['crepe-cost-v1'] = JSON.stringify(oldShop);

const probe = `
(() => {
  const out = [];

  // --- ย้ายข้อมูลเก่าเข้ามาเป็นร้านแรกให้เอง ---
  out.push(['ข้อมูลเวอร์ชันเก่าถูกย้ายมาเป็นร้านแรก', store.shops.length === 1 && db.menus.length === 1]);
  out.push(['ยอดขายเดิมยังอยู่ครบ', (db.sales||[]).length === 1 && db.sales[0].total === 30]);
  out.push(['ร้านแรกมีชื่อให้เลย', !!String(db.shopName||'').trim()]);
  out.push(['ทุกร้านมี id ไม่ซ้ำ', new Set(store.shops.map(x => x.id)).size === store.shops.length]);

  // --- เพิ่มร้านที่สอง ---
  const second = fixShop(blank(), 'ร้านน้ำปั่น');
  second.shopName = 'ร้านน้ำปั่น'; second.shopBranch = 'หน้าปากซอย';
  store.shops.push(second);
  const crepeId = store.shops[0].id;
  store.active = second.id; db = second; save();

  out.push(['ร้านใหม่เริ่มจากศูนย์ ไม่ติดเมนูร้านเดิมมา', db.menus.length === 0 && (db.sales||[]).length === 0]);
  out.push(['ร้านใหม่ไม่ถูกชวนให้ใส่เมนูเครป', needShopMenu() === false]);

  // ขายของในร้านน้ำปั่น
  db.menus.push({id:'n1', name:'นมสดปั่น', price:35, groupIds:[]});
  order = { lines: [] }; orderOpen = false;
  tapMenu('n1'); tapMenu('n1'); payBill();
  const shakeSale = sumDay(dayKey()).sale;
  out.push(['ขายในร้านน้ำปั่นได้ 70 บาท', shakeSale === 70]);

  // --- สลับกลับไปร้านเครป ยอดต้องไม่ปนกัน ---
  db = store.shops.find(x => x.id === crepeId); store.active = crepeId;
  out.push(['สลับกลับมาร้านเครปแล้วไม่เห็นเมนูน้ำปั่น',
    db.menus.length === 1 && db.menus[0].name === 'เครปวานิลา']);
  out.push(['ยอดขายวันนี้ของร้านเครปไม่ติดของร้านน้ำปั่นมา', sumDay(dayKey()).sale === 0]);
  out.push(['ยอดเมื่อวาน (20 ต.ค.) ยังเป็นของร้านเครป', sumDay('2026-10-20').sale === 30]);

  // --- เปลี่ยนเมนูร้านหนึ่ง อีกร้านต้องไม่ขยับ ---
  db.menus[0].price = 20;
  out.push(['แก้ราคาร้านเครปแล้วร้านน้ำปั่นไม่เปลี่ยน',
    store.shops.find(x => x.shopName === 'ร้านน้ำปั่น').menus[0].price === 35]);

  // --- เซฟแล้วโหลดใหม่ ต้องได้ทั้งสองร้านคืน ---
  save();
  const reread = JSON.parse(localStorage.getItem('crepe-hub-v1'));
  out.push(['บันทึกลงเครื่องครบทั้งสองร้าน', reread.shops.length === 2]);
  out.push(['จำได้ว่ากำลังใช้ร้านไหนอยู่', reread.active === crepeId]);
  const again = load();
  out.push(['โหลดใหม่แล้วได้ร้านที่ค้างไว้', again.id === crepeId && store.shops.length === 2]);
  db = again;

  // --- สำรองข้อมูลต้องได้ทุกร้าน แล้วกู้คืนกลับมาครบ ---
  const backup = JSON.stringify(store);
  store = { shops:[fixShop(blank(),'ร้านเดียว')], active:null };
  store.active = store.shops[0].id; db = store.shops[0];
  out.push(['ลบจนเหลือร้านเดียวแล้วจริง', store.shops.length === 1]);
  out.push(['กู้คืนจากข้อมูลสำรองได้ครบทั้งสองร้าน',
    applyData(backup) === true && store.shops.length === 2]);
  out.push(['กู้คืนแล้วเมนูของแต่ละร้านยังถูก',
    store.shops.find(x => x.shopName === 'ร้านน้ำปั่น').menus[0].price === 35 &&
    store.shops.find(x => x.shopName !== 'ร้านน้ำปั่น').menus[0].price === 20]);

  // --- ข้อมูลสำรองแบบเก่า (ร้านเดียว) ต้องยังใส่กลับได้ ---
  const shopsBefore = store.shops.length;
  const activeBefore = store.active;
  out.push(['ข้อมูลสำรองแบบเก่ายังกู้คืนได้ โดยลงที่ร้านที่ใช้อยู่',
    applyData(JSON.stringify(oldShop)) === true
      && store.shops.length === shopsBefore
      && store.active === activeBefore
      && db.menus[0].name === 'เครปวานิลา']);

  // --- ล้างข้อมูลต้องล้างแค่ร้านเดียว ---
  const other = store.shops.find(x => x.id !== store.active);
  const otherMenus = (other.menus||[]).length;
  setShopData(blank());
  out.push(['ล้างข้อมูลแล้วร้านอื่นไม่โดนด้วย',
    db.menus.length === 0 && (store.shops.find(x => x.id === other.id).menus||[]).length === otherMenus]);
  out.push(['ล้างข้อมูลแล้วชื่อร้านยังอยู่', !!String(db.shopName||'').trim()]);

  return { out, shops: store.shops.map(x => x.shopName + ' (' + (x.menus||[]).length + ' เมนู)') };
})()
`;
const r = eval(script + probe);
let bad = 0;
r.out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log('\n  ร้านที่เหลืออยู่:', r.shops.join(' · '));
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
