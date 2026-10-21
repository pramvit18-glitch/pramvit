// ตรวจหน้าขาย: หมวดหมู่ กรองเมนู และตัวเลขบอกจำนวนในบิล
const fs = require('fs');
const file = process.argv[2] || 'index.html';
const src = fs.readFileSync(file, 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

global.localStorage = { getItem: () => null, setItem: () => {} };
const stub = () => ({ innerHTML:'', textContent:'', hidden:false, value:'', dataset:{},
  addEventListener(){}, removeEventListener(){}, showModal(){}, close(){},
  querySelectorAll:()=>[], querySelector:()=>stub(), focus(){}, setAttribute(){},
  classList:{toggle(){}}, scrollIntoView(){}, replaceWith(){}, insertAdjacentHTML(){} });
global.document = { getElementById: stub, querySelector: () => stub(), createElement: stub };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};

const probe = `
(() => {
  db.menus = shopMenu(); db.groups = []; migrateGroups(db);
  order = { lines: [] }; posCat = null;

  const RE = /class="posbtn[" ]/g;          // อย่านับ posbtn-n / posbtn-p
  const out = [];
  const all = viewPOS();

  out.push(['แสดงครบทุกเมนู (' + db.menus.length + ')', (all.match(RE)||[]).length === db.menus.length]);
  out.push(['มีแถบหมวดให้เลือก', all.indexOf('class="cats"') >= 0 && all.indexOf('ทั้งหมด') >= 0]);

  const cats = allCats();
  let okFilter = true;
  cats.forEach(c => {
    posCat = c;
    const want = db.menus.filter(m => menuCat(m) === c).length;
    if((viewPOS().match(RE)||[]).length !== want) okFilter = false;
  });
  out.push(['กรองได้ถูกทุกหมวด', okFilter]);

  posCat = null;
  tapMenu(db.menus[0].id); tapMenu(db.menus[0].id);
  out.push(['ปุ่มที่อยู่ในบิลขึ้นเลข 2', viewPOS().indexOf('posbtn-c">2<') >= 0]);
  out.push(['ยอดบิลถูก', orderTotal() === db.menus[0].price * 2]);

  const o = t => (viewPOS().match(new RegExp('<' + t + '[ >]', 'g'))||[]).length;
  const c = t => (viewPOS().match(new RegExp('</' + t + '>', 'g'))||[]).length;
  out.push(['แท็กครบ', ['div','span','button','p'].every(t => o(t) === c(t))]);

  return { out, cats };
})()
`;
const r = eval(script + probe);
let bad = 0;
r.out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log('\n  หมวดที่จัดได้:', r.cats.join(' · '));
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
