// ตรวจกราฟ: แกนถูก แท่งอยู่ในกรอบ และมีตารางตัวเลขให้ดูแทนกราฟ
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');
global.localStorage = { getItem: () => null, setItem: () => {} };
const stub = () => ({ innerHTML:'', textContent:'', hidden:false, value:'', dataset:{},
  addEventListener(){}, removeEventListener(){}, showModal(){}, close(){}, querySelectorAll:()=>[],
  querySelector:()=>stub(), focus(){}, setAttribute(){}, classList:{toggle(){},add(){},remove(){},contains:()=>false},
  scrollIntoView(){}, replaceWith(){}, insertAdjacentHTML(){} });
global.document = { body: stub(), getElementById: stub, querySelector: () => stub(), createElement: stub };
global.window = { addEventListener(){}, scrollTo(){} };
global.navigator = {};

const probe = `
(() => {
  const key = dayKey();
  const days = lastNDays(key, 7);
  const svg = chartBody(key, days);
  const out = [];

  out.push(['สร้างกราฟได้', svg.length > 0]);
  out.push(['มี 7 วัน', days.length === 7]);
  out.push(['วันสุดท้ายคือวันนี้', days[6].key === key]);
  out.push(['เรียงวันจากเก่าไปใหม่', days.every((d,i) => i === 0 || d.key > days[i-1].key)]);

  // แท่งต้องอยู่ในกรอบ viewBox (0..158 แนวตั้ง)
  const ys = [...svg.matchAll(/<rect[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/g)]
    .map(m => +m[1] + +m[2]);
  out.push(['แท่งไม่ล้นกรอบ', ys.every(v => v <= 158 + 0.01)]);
  const tops = [...svg.matchAll(/<rect[^>]*y="([\d.]+)"/g)].map(m => +m[1]);
  out.push(['ป้ายตัวเลขมีที่พอ ไม่ชนขอบบน', tops.every(v => v >= 20)]);

  out.push(['มีเส้นฐาน', svg.indexOf('y1="120"') >= 0]);
  out.push(['มีเส้นเฉลี่ยแบบประ', svg.indexOf('stroke-dasharray') >= 0]);
  out.push(['มีตารางตัวเลขให้ดูแทนกราฟ', svg.indexOf('<table>') >= 0 && svg.indexOf('ดูเป็นตัวเลข') >= 0]);
  out.push(['มีคำอธิบายสำหรับโปรแกรมอ่านหน้าจอ', svg.indexOf('role="img"') >= 0 && svg.indexOf('aria-label') >= 0]);
  // บนมือถือไม่มีการเอาเมาส์ชี้ ทุกแท่งจึงต้องแตะเพื่อดูรายละเอียดของวันนั้นได้
  out.push(['ทุกแท่งแตะได้ เพื่อดูรายละเอียดของวันนั้น',
    svg.split(String.fromCharCode(34)+"cday"+String.fromCharCode(34)).length - 1 === 7
    && svg.split('onclick="dayMoneyDialog(').length - 1 === 7]);
  out.push(['แท่งที่แตะได้บอกเครื่องอ่านหน้าจอด้วย',
    (svg.match(/role="button"/g)||[]).length === 7 && svg.indexOf('aria-label') >= 0]);
  out.push(["มีข้อความบอกว่าแตะแท่งได้", svg.indexOf('แตะแท่ง') >= 0]);
  out.push(['ทุกแท่งมีคำอธิบายตอนชี้', (svg.match(/<title>/g)||[]).length === days.filter(d=>d.sale>0 || true).length]);

  const o = t => (svg.match(new RegExp('<' + t + '[ >]', 'g'))||[]).length;
  const c = t => (svg.match(new RegExp('</' + t + '>', 'g'))||[]).length;
  out.push(['แท็กครบ', ['div','g','text','table','tr','td','th'].every(t => o(t) === c(t))]);

  return { out, days: days.map(d => thaiDate(d.key) + ' ' + Math.round(d.sale)) };
})()
`;
const r = eval(script + probe);
let bad = 0;
r.out.forEach(([name, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), name); });
console.log('\n  7 วันล่าสุด:', r.days.join(' · '));
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
