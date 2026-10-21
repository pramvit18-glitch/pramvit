// ตรวจ Dashboard แบบการ์ด: โครงครบ กราฟเล็กวาดจริง ตัวเลขตรงกับข้อมูล
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

global.localStorage = { getItem: () => null, setItem: () => {} };
const stub = () => ({ innerHTML:'', textContent:'', hidden:false, value:'', dataset:{},
  addEventListener(){}, removeEventListener(){}, showModal(){}, close(){}, querySelectorAll:()=>[],
  querySelector:()=>stub(), focus(){}, setAttribute(){},
  classList:{toggle(){},add(){},remove(){},contains:()=>false},
  scrollIntoView(){}, replaceWith(){}, insertAdjacentHTML(){} });
global.document = { body: stub(), getElementById: stub, querySelector: () => stub(), createElement: stub };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};

const probe = `
(() => {
  const key = dayKey();
  const html = viewToday();
  const d = sumDay(key);
  const out = [];
  const has = t => html.indexOf(t) >= 0;
  const count = re => (html.match(re) || []).length;

  out.push(['มีการ์ดหลักไล่เฉด', has('hero-card')]);
  out.push(['การ์ดหลักโชว์ยอดขายวันนี้', has(baht(d.sale))]);
  out.push(['มีการ์ดสถิติพร้อมกราฟเล็ก 2 ใบ', count(/stat-card/g) >= 2]);
  out.push(['กราฟเส้นเล็กวาดจริง', count(/<polyline/g) >= 1]);
  out.push(['กราฟแท่งเล็กวาดจริง', count(/miniBars|<rect/g) >= 1]);
  out.push(['หัวการ์ดมีไอคอนอย่างน้อย 3 ใบ', count(/ic-tile/g) >= 3]);
  out.push(['มีกราฟ 7 วันอยู่ในการ์ด', has('class="chart"')]);
  out.push(['มีอันดับเมนูขายดี', has('rankx') || has('ยังไม่มีการขาย')]);
  out.push(['มีสรุปเดือนนี้', has('mon-nums') && has(baht(sumMonth(monthKey(key)).sale))]);

  const o = t => (html.match(new RegExp('<' + t + '[ >]', 'g'))||[]).length;
  const c = t => (html.match(new RegExp('</' + t + '>', 'g'))||[]).length;
  out.push(['แท็กครบ', ['div','span','button','p','b','small'].every(t => o(t) === c(t))]);

  // กราฟเล็กต้องอยู่ในกรอบ
  const pts = [...html.matchAll(/points="([^"]+)"/g)].flatMap(m =>
    m[1].trim().split(/\\s+/).map(p => p.split(',').map(Number)));
  out.push(['จุดในกราฟเล็กอยู่ในกรอบ', pts.every(([x,y]) => x >= 0 && y >= 0 && y <= 60)]);

  return { out, sale: d.sale, bills: billsOf(key) };
})()
`;
const r = eval(script + probe);
let bad = 0;
r.out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log('\n  วันนี้: ขายได้ ' + r.sale + ' บาท · ' + r.bills + ' บิล');
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
