
/* ===================== หน้าขายแบบ POS =====================
   เปิดบิล → กดเมนูที่ลูกค้าสั่ง (กดซ้ำ = เพิ่มจำนวน) → ใส่ท็อปปิ้ง → รับเงิน
   บันทึกเป็นรายการแยกตามเมนู แต่ผูก bill เดียวกัน จะได้ดูย้อนหลังได้เหมือนเดิม */
let order = null;   // {lines:[{menuId,name,price,qty,addons:[{name,price}]}]}

function openPOS(){
  if(!db.menus.length){
    openDialog({ title:'ยังไม่มีเมนู', sub:'ตั้งเมนูกับราคาไว้ก่อน แล้วค่อยมาเปิดบิล',
      html:'<p style="margin:0;color:var(--ink-2)">ไปที่แท็บ <b>เมนู</b> กดปุ่ม <b>เพิ่ม</b> ใส่ชื่อกับราคาขาย แล้วกลับมาที่นี่ครับ</p>' });
    return;
  }
  order = { lines: [] };
  render(); window.scrollTo({top:0});
}
function closePOS(){ order = null; render(); window.scrollTo({top:0}); }

const lineTotal = l => (n(l.price) + (l.addons||[]).reduce((s,a) => s + n(a.price), 0)) * n(l.qty);
const orderTotal = () => (order ? order.lines : []).reduce((s,l) => s + lineTotal(l), 0);
const orderCount = () => (order ? order.lines : []).reduce((s,l) => s + n(l.qty), 0);

// กดเมนู: ถ้าบรรทัดล่าสุดเป็นเมนูเดียวกันและยังไม่ใส่ท็อปปิ้ง ให้บวกจำนวนแทนการเพิ่มบรรทัดใหม่
function tapMenu(id){
  const m = findMenu(id); if(!m || !order) return;
  const last = order.lines.find(l => l.menuId === id && !(l.addons||[]).length);
  if(last) last.qty = n(last.qty) + 1;
  else order.lines.push({ lid: uid(), menuId:id, name:m.name, price:n(m.price), qty:1, addons:[] });
  render();
}
function lineQty(lid, v){
  const l = order.lines.find(x => x.lid === lid); if(!l) return;
  l.qty = n(l.qty) + v;
  if(l.qty <= 0) order.lines = order.lines.filter(x => x.lid !== lid);
  render();
}
function delLine(lid){ order.lines = order.lines.filter(x => x.lid !== lid); render(); }

// ใส่ท็อปปิ้งให้บรรทัดนั้น
function lineAddons(lid){
  const l = order.lines.find(x => x.lid === lid); if(!l) return;
  const m = findMenu(l.menuId);
  const tops = (m && m.addons) || [];
  if(!tops.length){
    openDialog({ title:'ยังไม่มีท็อปปิ้ง', sub: m ? m.name : '',
      html:'<p style="margin:0;color:var(--ink-2)">ตั้งท็อปปิ้งของเมนูนี้ได้ที่แท็บ <b>เมนู</b> → เลือกเมนู → <b>ท็อปปิ้งที่เพิ่มได้</b></p>' });
    return;
  }
  const picked = new Set((l.addons||[]).map(a => a.name));
  window._topPick = picked;
  const draw = () => openDialog({
    title:'ท็อปปิ้ง',
    sub: `${l.name} — ติ๊กของที่ลูกค้าเพิ่ม`,
    html: `<div class="tops">${tops.map(a => `
      <button class="top${picked.has(a.name) ? ' on' : ''}" onclick="pickLineTop('${lid}','${esc(a.name)}')">
        ${esc(a.name)} <b>+${baht(a.price)}</b>
      </button>`).join('')}</div>`,
    foot:[{label:'เสร็จแล้ว', cls:'primary', fn:'dlg.close(); render()'}]
  });
  l._draw = draw;
  draw();
}
function pickLineTop(lid, name){
  const l = order.lines.find(x => x.lid === lid); if(!l) return;
  const m = findMenu(l.menuId);
  const a = ((m && m.addons) || []).find(x => x.name === name);
  if(!a) return;
  const has = (l.addons||[]).some(x => x.name === name);
  l.addons = has ? l.addons.filter(x => x.name !== name)
                 : [...(l.addons||[]), {name:a.name, price:n(a.price)}];
  if(l._draw) l._draw();
}

function payBill(){
  if(!order || !order.lines.length) return;
  const d = dayKey(), t = nowTime(), bill = uid();
  order.lines.forEach(l => {
    (db.sales = db.sales || []).push({
      id: uid(), bill, d, t,
      menuId: l.menuId, name: l.name, qty: n(l.qty),
      addons: (l.addons||[]).map(a => ({name:a.name, price:n(a.price)})),
      total: lineTotal(l)
    });
  });
  const paid = orderTotal();
  order = null; save(); render();
  toast(`รับเงินแล้ว ${baht(paid)} บาท`);
}

function viewPOS(){
  const lines = order.lines;
  const menuBtns = db.menus.map(m => `
    <button class="posbtn" onclick="tapMenu('${m.id}')">
      <span class="posbtn-n">${esc(m.name || '(ไม่มีชื่อ)')}</span>
      <span class="posbtn-p">${baht(m.price)}</span>
    </button>`).join('');

  const billRows = lines.map(l => `
    <div class="bill-line">
      <div class="bl-main">
        <div class="bl-name">${esc(l.name || '(ไม่มีชื่อ)')}</div>
        ${(l.addons||[]).length
          ? `<div class="bl-add">${l.addons.map(a => esc(a.name) + ' +' + baht(a.price)).join(' · ')}</div>`
          : ''}
        <button class="bl-top" onclick="lineAddons('${l.lid}')">+ ท็อปปิ้ง</button>
      </div>
      <div class="bl-qty">
        <button onclick="lineQty('${l.lid}',-1)" aria-label="ลด">−</button>
        <span>${n(l.qty)}</span>
        <button onclick="lineQty('${l.lid}',1)" aria-label="เพิ่ม">+</button>
      </div>
      <div class="bl-sum">${baht(lineTotal(l))}</div>
      <button class="bl-del" onclick="delLine('${l.lid}')" aria-label="ลบ">${icon('x',14)}</button>
    </div>`).join('');

  return `
  <button class="btn back" onclick="closePOS()">${icon('back',16)} ปิดบิล</button>

  <div class="card">
    <div class="head-row">
      <h2>ลูกค้าสั่งอะไร</h2>
      <button class="btn sm" onclick="go('menu')">แก้เมนู</button>
    </div>
    <p class="sub">กดที่เมนูเพื่อเพิ่มลงบิล · กดซ้ำ = เพิ่มจำนวน</p>
    <div class="posgrid">${menuBtns}</div>
  </div>

  <div class="card">
    <h2>บิลนี้</h2>
    <p class="sub">${lines.length ? `${orderCount()} จาน` : 'ยังไม่ได้เลือกอะไร'}</p>
    <div class="bill">${billRows || `<div class="empty" style="padding:26px 10px">
      <div class="empty-ic">${icon('today',30)}</div>
      <h3>บิลยังว่าง</h3>
      <p>กดเมนูด้านบนที่ลูกค้าสั่ง</p>
    </div>`}</div>
  </div>

  <div class="savebar">
    <div class="recipe-sum">
      <b>รวม ${baht(orderTotal())} บาท</b>
      <span>${orderCount()} จาน${lines.length ? ' · กดรับเงินเพื่อบันทึกลงสมุด' : ''}</span>
    </div>
    <div class="btnrow">
      <button class="btn ghost" onclick="closePOS()">ยกเลิกบิล</button>
      <button class="btn primary" onclick="payBill()" ${lines.length ? '' : 'disabled'}>รับเงิน</button>
    </div>
  </div>`;
}

/* ข้อความแจ้งสั้น ๆ มุมล่าง */
let toastTimer = null;
function toast(msg){
  let el = document.getElementById('toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'toast'; el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}
