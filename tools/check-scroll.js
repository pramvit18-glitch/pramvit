// ตรวจว่ากดปุ่มในหน้าต่างแล้วไม่โดนดีดกลับขึ้นบน
// เคสจริง: หน้าต่างสั่งสินค้าเรียก openDialog() ซ้ำทุกครั้งที่กด +/− เพื่อวาดบิลใหม่
// ถ้า openDialog ล้าง scrollTop ทุกครั้ง ผู้ใช้ที่เลื่อนหาเมนูอยู่จะเด้งกลับไปบนสุด
const fs = require('fs');
const path = require('path');
const FILE = process.argv[2] || path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(FILE, 'utf8');
const script = src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m, '');

/* ---------- stub ที่จำ scrollTop จริง ไม่ใช่ของเปล่า ---------- */
const nodes = {};                                   // เก็บ element ตาม id/selector
function node(key) {
  if (nodes[key]) return nodes[key];
  const el = {
    _key: key, innerHTML: '', textContent: '', hidden: false, value: '', dataset: {},
    scrollTop: 0, offsetWidth: 1, open: false,
    addEventListener(){}, removeEventListener(){}, focus(){}, setAttribute(){},
    showModal(){ this.open = true; }, close(){ this.open = false; },
    querySelectorAll: () => [], querySelector: () => node(key + ' >'),
    classList: { _s:new Set(),
      toggle(c, on){ on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c))
                                      : (on ? this._s.add(c) : this._s.delete(c)); },
      add(c){ this._s.add(c); }, remove(...c){ c.forEach(x => this._s.delete(x)); },
      contains(c){ return this._s.has(c); } },
    style: { setProperty(){}, removeProperty(){} },
    scrollIntoView(){}, replaceWith(){}, insertAdjacentHTML(){}
  };
  nodes[key] = el;
  return el;
}
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k,v) => { mem[k] = String(v); } };
global.document = {
  body: node('body'), addEventListener(){}, removeEventListener(){},
  getElementById: id => node('#' + id),
  querySelector: sel => node(sel),
  createElement: () => node('tmp')
};
global.window = { addEventListener(){}, scrollTo(){}, matchMedia: () => ({ matches:false }) };
global.navigator = {};

const out = [];
const push = (n, v) => out.push([n, !!v]);

/* ---------- ระดับซอร์ซ ---------- */
push('ล้างตำแหน่งเลื่อนเฉพาะตอนเปิดหน้าต่างใหม่',
  /if\(!dlg\.open\)\{[\s\S]{0,220}?dlg\.scrollTop = 0;[\s\S]{0,40}?\}/.test(script));
push('ไม่มี scrollTop = 0 ลอยอยู่นอกเงื่อนไข',
  (script.match(/dlg\.scrollTop = 0/g) || []).length === 1);
push('มีตัวช่วยจำตำแหน่งเลื่อนไว้คืนหลังวาดใหม่', /function scrollOf\(\.\.\.sels\)/.test(script));
push('หน้าต่างสั่งสินค้าใช้ตัวช่วยนั้นจริง',
  /const keep = scrollOf\('\.dlg-body \.poslist', '\.dlg-bill'\)/.test(script)
  && /keep\.restore\(\)/.test(script));

/* ---------- พฤติกรรมจริง ---------- */
const probe = `
(() => {
  const r = [];
  const dlgEl = document.getElementById('dlg');

  /* เปิดหน้าต่างครั้งแรก ต้องเริ่มที่บนสุด */
  dlgEl.open = false; dlgEl.scrollTop = 999;
  openOrderDialog();
  r.push(['เปิดหน้าต่างใหม่ เริ่มที่บนสุด', dlgEl.scrollTop === 0]);

  /* ผู้ใช้เลื่อนลงไปหาเมนู แล้วกดเพิ่ม 2 ครั้ง */
  dlgEl.open = true;
  dlgEl.scrollTop = 420;
  document.querySelector('.dlg-body .poslist').scrollTop = 260;
  document.querySelector('.dlg-bill').scrollTop = 80;

  const m = db.menus[0];
  tapMenu(m.id);
  r.push(['กดเพิ่มครั้งแรก หน้าต่างไม่ดีดขึ้นบน', dlgEl.scrollTop === 420]);
  r.push(['รายการเมนูยังอยู่ตำแหน่งเดิม',
    document.querySelector('.dlg-body .poslist').scrollTop === 260]);

  tapMenu(m.id);
  r.push(['กดเพิ่มเมนูเดิมซ้ำ ก็ยังไม่ดีด', dlgEl.scrollTop === 420]);
  r.push(['กดซ้ำแล้วรวมเป็นบรรทัดเดียว จำนวนเป็น 2',
    order.lines.length === 1 && order.lines[0].qty === 2]);

  /* ปุ่ม +/− ในบิลก็ต้องไม่ดีด */
  lineQty(order.lines[0].lid, 1);
  r.push(['กด + ในบิล ไม่ดีดขึ้นบน', dlgEl.scrollTop === 420]);
  lineQty(order.lines[0].lid, -1);
  r.push(['กด − ในบิล ไม่ดีดขึ้นบน', dlgEl.scrollTop === 420]);
  r.push(['บิลยังอยู่ตำแหน่งเดิม', document.querySelector('.dlg-bill').scrollTop === 80]);

  /* ปิดแล้วเปิดใหม่ ต้องกลับไปเริ่มที่บนสุด */
  order = null; orderOpen = false; dlgEl.open = false;
  openOrderDialog();
  r.push(['ปิดแล้วเปิดใหม่ กลับไปเริ่มบนสุด', dlgEl.scrollTop === 0]);
  order = null; orderOpen = false;
  return r;
})()
`;
eval(script + probe).forEach(([n, v]) => out.push([n, !!v]));

let bad = 0;
out.forEach(([n, v]) => { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗'), n); });
console.log(' ', bad ? bad + ' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
