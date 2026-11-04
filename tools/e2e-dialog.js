// ทดสอบการเปิด-ปิดกล่องด้วยเบราว์เซอร์จริง
// dialog.close() ของเบราว์เซอร์ปิดทันทีเสมอ แอปจึงครอบไว้เล่นภาพเลื่อนออกก่อน
// จุดเสี่ยงคือ "ปิดแล้วเปิดกล่องใหม่ทันที" ซึ่งมีหลายที่ในแอป
//
//   npm run check:order   (รันชุดนี้ด้วย)

const { chromium } = require('playwright');
// ภาพหน้าจอไปลงที่ชั่วคราว ไม่ให้ไปรกในโฟลเดอร์โปรเจกต์
const S = process.env.SHOT_DIR || require('os').tmpdir();
const out=[]; const ok=(n,v)=>out.push([n,!!v]);
async function tap(loc, why){
  try{
    if(await loc.count() === 0){ ok(why, false); return false; }
    await loc.first().click({ timeout: 4000 });
    return true;
  }catch(e){ ok(why + ' (กดไม่ได้: ' + String(e.message).split('\n')[0].slice(0,50) + ')', false); return false; }
}
(async () => {
  const b = await chromium.launch({args:['--no-sandbox']});
  const p = await b.newPage({viewport:{width:390,height:700}, deviceScaleFactor:1});
  const errs=[]; p.on('pageerror', e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8787/index.html');
  await p.evaluate(() => {
    const dk=(()=>{const d=new Date(),P=v=>String(v).padStart(2,'0');return `${d.getFullYear()}-${P(d.getMonth()+1)}-${P(d.getDate())}`})();
    localStorage.setItem('crepe-hub-v1', JSON.stringify({shops:[{
      id:'s1', shopName:'ร้านเครป', shopOpen:1, groups:[], ingredients:[],
      menus:[{id:'m1',name:'เครปน้ำตาลเนย',price:25,groupIds:[],items:[]}],
      sales:[{id:'x1',bill:'b1',d:dk,t:'10:00',menuId:'m1',name:'เครปน้ำตาลเนย',qty:2,addons:[],total:50}],
      expenses:[], fixed:{rent:0,electric:0,gas:0,water:0,other:0,days:26,labor:0}
    }], active:'s1'}));
  });
  await p.reload(); await p.waitForTimeout(400);

  /* ---- 1. กดกากบาทแล้วต้องมีภาพเคลื่อนไหวก่อนปิด ---- */
  /* ต้องเจาะ [data-tab] — ตั้งแต่มีเมนูย่อยบนจอคอม ในแถบเมนูมีปุ่มอื่นปนอยู่ด้วย
     ข้อความ "ขาย" ไปโดนปุ่ม "ดูย้อนหลังรายวัน · วันไหนขายได้เท่าไหร่" เข้าด้วย แล้วล้มทั้งชุด */
  await p.locator('.bottomnav button[data-tab]', {hasText:'ขาย'}).click();
  await p.waitForTimeout(400);
  await p.locator('.orderbtn').click();
  await p.waitForTimeout(600);
  ok('เปิดกล่องได้', await p.evaluate(() => dlg.open));
  /* เบลอฉากหลังทำให้เฟรมสะดุด จึงเบลอทีหลังตอนกล่องจอดแล้ว
     ระหว่างเลื่อนต้องยังไม่เบลอ พอจอดแล้วต้องเบลอ */
  await p.waitForTimeout(900);
  ok('กล่องจอดแล้วฉากหลังเบลอ',
    await p.evaluate(() => dlg.classList.contains('settled')));

  await p.locator('.dlg-x').click();
  await p.waitForTimeout(60);
  const mid = await p.evaluate(() => {
    const d = document.getElementById('dlg');
    return { ยังเปิดอยู่: d.open, มีคลาสปิด: d.classList.contains('closing'),
             ชื่อภาพ: getComputedStyle(d).animationName };
  });
  ok('ปิดแล้วเอาเบลอออกก่อน ขาออกจะได้เบาด้วย',
    !(await p.evaluate(() => dlg.classList.contains('settled'))));
  ok('กดกากบาทแล้วยังไม่หายทันที มีภาพเลื่อนออกก่อน',
    mid.ยังเปิดอยู่ && mid.มีคลาสปิด && mid.ชื่อภาพ === 'sheetout');
  await p.screenshot({path:S+'/close-mid.png'});

  await p.waitForTimeout(900);
  ok('เล่นจบแล้วกล่องปิดจริง', await p.evaluate(() => !dlg.open));
  ok('คลาสปิดถูกล้างทิ้ง ไม่ค้าง',
    await p.evaluate(() => !document.getElementById('dlg').classList.contains('closing')));

  /* ---- 2. กด Esc ก็ต้องมีภาพเคลื่อนไหวเหมือนกัน ---- */
  await p.locator('.orderbtn').click();
  await p.waitForTimeout(900);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(60);
  ok('กด Esc ก็มีภาพเลื่อนออกเหมือนกัน',
    await p.evaluate(() => dlg.open && document.getElementById('dlg').classList.contains('closing')));
  await p.waitForTimeout(900);
  ok('กด Esc แล้วปิดจริง', await p.evaluate(() => !dlg.open));

  /* ---- 3. ปิดแล้วเปิดกล่องใหม่ทันที กล่องใหม่ต้องไม่หายตามไปด้วย ---- */
  await p.evaluate(() => { tab='money'; render(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => dayMoneyDialog(dayKey()));
  await p.waitForTimeout(600);
  await p.locator('.dlg-foot button', {hasText:'เพิ่มรายจ่าย'}).click();   // dlg.close(); expenseDialog(null)
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => ({
    เปิดอยู่: dlg.open,
    ค้างคลาสปิด: document.getElementById('dlg').classList.contains('closing'),
    หัวกล่อง: document.getElementById('dlgTitle').textContent
  }));
  ok('ปิดแล้วเปิดกล่องใหม่ทันที กล่องใหม่ยังอยู่', after.เปิดอยู่ && !after.ค้างคลาสปิด);
  ok('กล่องใหม่เป็นกล่องที่ถูกต้อง', /รายจ่าย/.test(after.หัวกล่อง));
  await p.screenshot({path:S+'/close-chain.png'});

  /* ---- 4. ลากหัวกล่องลงเพื่อปิดยังใช้ได้ ---- */
  await p.evaluate(() => dlg.close());
  await p.waitForTimeout(900);
  ok('ปิดกล่องสุดท้ายเรียบร้อย', await p.evaluate(() => !dlg.open));

  /* ---- 5. คู่มือการใช้งาน ----
     เจ้าของขอมาเอง · ของที่ต้องคุมคือ "เปิดแล้วใช้ได้จริง" ไม่ใช่แค่มีข้อความอยู่ในโค้ด
     หัวข้อต้องพับเก็บอยู่ตอนเปิดมา ไม่งั้นได้กำแพงตัวหนังสือยาวเหยียด เลื่อนหาไม่เจอ */
  await p.evaluate(() => { tab='today'; render(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => openHelp());
  await p.waitForTimeout(900);
  const gd = await p.evaluate(() => {
    const d = [...document.querySelectorAll('#dlg details.gd-s')];
    const box = document.getElementById('dlg');
    return {
      n: d.length,
      open: d.filter(x => x.open).length,
      empty: d.filter(x => !(x.querySelector('.gd-b') || {}).textContent
                          || x.querySelector('.gd-b').textContent.trim().length < 20).length,
      title: document.getElementById('dlgTitle').textContent,
      spills: box.scrollWidth > box.clientWidth + 1,
      warns: document.querySelectorAll('#dlg .gd-warn').length
    };
  });
  ok(`คู่มือมีหัวข้อหลายหัวข้อ (${gd.n} หัวข้อ)`, gd.n >= 8);
  ok('หัวกล่องบอกว่าเป็นคู่มือการใช้งาน', /คู่มือ/.test(gd.title));
  ok('เปิดมากางแค่หัวข้อเดียว ที่เหลือพับไว้', gd.open === 1);
  ok('ทุกหัวข้อมีเนื้อหาจริง ไม่มีหัวข้อเปล่า', gd.empty === 0);
  ok('มีกล่องย้ำเรื่องที่พลาดแล้วเสียเงิน', gd.warns >= 2);
  ok('คู่มือไม่ล้นออกข้าง', !gd.spills);

  // แตะหัวข้อแล้วต้องกางจริง
  if(await tap(p.locator('#dlg summary', { hasText:'ขายหน้าร้าน' }), 'แตะหัวข้อ "ขายหน้าร้าน" ได้')){
    await p.waitForTimeout(400);
    ok('แตะหัวข้อแล้วกางออกจริง', await p.evaluate(() =>
      [...document.querySelectorAll('#dlg details.gd-s')].some(x => x.open && /ขายหน้าร้าน/.test(x.querySelector('summary').textContent))));
  }

  // ปุ่มในคู่มือต้องพาไปที่ที่บอกไว้จริง ไม่ใช่ปุ่มตาย
  if(await tap(p.locator('#dlg summary', { hasText:'สำรองข้อมูล' }), 'แตะหัวข้อ "สำรองข้อมูล" ได้')){
    await p.waitForTimeout(400);
    if(await tap(p.locator('#dlg button', { hasText:'ไปสำรองข้อมูลเลย' }), 'หัวข้อสำรองข้อมูลมีปุ่มพาไปที่กดได้')){
      await p.waitForTimeout(1200);
      ok('กดปุ่มในคู่มือแล้วพาไปที่กล่องสำรองข้อมูลจริง',
        await p.locator('#backup').isVisible());
      await p.evaluate(() => closeBackup());
    }
  }

  /* ---- 6. พาทัวร์ทีละปุ่ม ----
     เจ้าของขอมาเอง: "กดมาแล้วบอกว่าปุ่มนี้ต้องทำอะไร แล้วกดถัดไป"
     ของที่ต้องคุมคือ **ชี้ของจริงและกล่องอธิบายอยู่ในจอ** ไม่ใช่แค่มีโค้ดอยู่ */
  await p.evaluate(() => { dlg.close(); });
  await p.waitForTimeout(900);
  const keys = await p.evaluate(() => TOURS.map(t => t[0]));
  ok(`มีทัวร์แยกตามหน้าหลายชุด (${keys.length} ชุด)`, keys.length >= 4);

  let allSteps = 0, offEdge = 0, misAligned = 0, noTitle = 0, countBad = 0;
  for(const key of keys){
    await p.evaluate(k => startTour(k), key);
    await p.waitForTimeout(1500);
    if(!(await p.locator('#tour').isVisible().catch(() => false))){
      ok(`ทัวร์ "${key}" เปิดได้`, false);
      continue;
    }
    let n = 0, total = 0;
    for(let i = 0; i < 14; i++){
      if(!(await p.locator('#tour').isVisible().catch(() => false))) break;
      if(await p.locator('#tourTip.tour-end').count() > 0) break;   // ถึงการ์ดดูจบแล้ว พอ
      const st = await p.evaluate(k => {
        const t = TOURS.find(x => x[0] === k);
        const tip = document.getElementById('tourTip');
        const lab = String((tip.querySelector('.tour-no') || {}).textContent || '');
        const idx = Number(lab.split('/')[0]) - 1;
        const vis = t[3].filter(([sel]) => {
          const e = document.querySelector(sel);
          if(!e || e.hidden) return false;
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const step = vis[idx] || [];
        const el = step[0] ? document.querySelector(step[0]) : null;
        const tr = tip.getBoundingClientRect();
        const hr = document.getElementById('tourHole').getBoundingClientRect();
        /* รูต้องคร่อม "กรอบของ element ที่ขั้นนั้นชี้" จริง ๆ บวกขอบ 6px
           ข้อนี้คือหัวใจ — ถ้ารูไปคร่อมที่ว่างหรือคร่อมของผิดชิ้น ทัวร์ก็ไร้ความหมาย
           (เคยเขียนข้อนี้ด้วย elementFromPoint แล้วมันไปโดนตัวคลุมทุกครั้ง = เทสต์ที่ผ่านตลอด) */
        let off = 999;
        if(el){
          const er = el.getBoundingClientRect();
          off = Math.max(Math.abs(hr.left - (er.left - 6)), Math.abs(hr.top - (er.top - 6)),
                         Math.abs(hr.width - (er.width + 12)), Math.abs(hr.height - (er.height + 12)));
        }
        return {
          total: Number(lab.split('/')[1] || 0),
          title: (tip.querySelector('h3') || {}).textContent || '',
          off,
          inView: tr.top >= 0 && tr.bottom <= innerHeight && tr.left >= 0 && tr.right <= innerWidth
        };
      }, key);
      n++; allSteps++; total = st.total || total;
      if(!st.inView) offEdge++;
      if(st.off > 12) misAligned++;
      if(st.title.trim().length < 3) noTitle++;
      if(!await tap(p.locator('#tourTip button', { hasText: /ถัดไป|จบแล้ว/ }),
                    `ทัวร์ "${key}" กดถัดไปที่ขั้น ${n} ได้`)) break;
      await p.waitForTimeout(800);
    }
    if(total !== n) countBad++;
    const doneCard = await p.locator('#tourTip.tour-end').count() > 0;
    ok(`ทัวร์ "${key}" เดินจนจบแล้วขึ้นการ์ดดูจบ (${n} ขั้น)`, n >= 2 && doneCard);
    await tap(p.locator('#tourTip button', { hasText:'เริ่มใช้งานเลย' }), `ทัวร์ "${key}" กดจบแล้วปิดได้`);
    await p.waitForTimeout(400);
    ok(`ทัวร์ "${key}" กดเริ่มใช้งานแล้วปิดจริง`,
      !(await p.locator('#tour').isVisible().catch(() => false)));
  }
  ok(`ทุกทัวร์รวมกันเดินได้ ${allSteps} ขั้น`, allSteps >= 18);
  ok(`ทุกขั้นมีหัวข้อบอกว่าปุ่มนั้นทำอะไร (${noTitle} ขั้นที่ไม่มี)`, noTitle === 0);
  ok(`ทุกขั้นกล่องอธิบายอยู่ในจอ ไม่ตกขอบ (${offEdge} ขั้นที่ตก)`, offEdge === 0);
  ok(`ทุกขั้นรูคร่อมของที่ชี้จริง ไม่ใช่ที่ว่าง (${misAligned} ขั้นที่เพี้ยน)`, misAligned === 0);
  ok(`ตัวนับตรงกับจำนวนขั้นที่เดินจริงทุกทัวร์ (${countBad} ทัวร์ที่ไม่ตรง)`, countBad === 0);

  /* ---- การ์ดดูจบ ----
     เจ้าของขอมาเอง: "หลังจากที่ดูจบ หรือครบแล้ว ก็ให้มีปุ่มด้วย"
     ดูจบแล้วจอหรี่หายไปเฉย ๆ คนดูจะงงว่าจบแล้วหรือแอปค้าง */
  await p.evaluate(() => { store.tourSeen = []; save(); startTour('sale'); });
  await p.waitForTimeout(1600);
  for(let i = 0; i < 8; i++){
    if(!(await p.locator('#tour').isVisible().catch(() => false))) break;
    if(await p.locator('#tourTip.tour-end').count() > 0) break;
    if(!await tap(p.locator('#tourTip button', { hasText: /ถัดไป|จบแล้ว/ }), 'กดจนถึงการ์ดดูจบได้')) break;
    await p.waitForTimeout(800);
  }
  const fin = await p.evaluate(() => {
    const t = document.getElementById('tourTip'), r = t.getBoundingClientRect();
    const h = document.getElementById('tourHole').getBoundingClientRect();
    return {
      shown: !document.getElementById('tour').hidden && t.classList.contains('tour-end'),
      head: (t.querySelector('h3') || {}).textContent || '',
      btns: [...t.querySelectorAll('button')].map(x => x.textContent.trim()),
      inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      holeGone: h.width < 2 && h.height < 2,
      seen: (store.tourSeen || [])
    };
  });
  ok('ดูจบแล้วมีการ์ดบอกว่าจบ ไม่ใช่หายไปเฉย ๆ', fin.shown && /จบ/.test(fin.head));
  ok('การ์ดดูจบอยู่ในจอทั้งใบ', fin.inView);
  ok('การ์ดดูจบไม่มีกรอบชี้ปุ่มค้างอยู่', fin.holeGone);
  ok('การ์ดดูจบมีปุ่มปิดให้กด', fin.btns.some(x => /เริ่มใช้งาน/.test(x)));
  ok('การ์ดดูจบชวนดูทัวร์หน้าที่ยังไม่ได้ดูต่อ', fin.btns.some(x => /หน้ารายจ่าย/.test(x)));
  ok('จำไว้ว่าดูทัวร์ชุดนี้จบแล้ว', fin.seen.includes('sale'));
  await p.screenshot({ path: S + '/tour-end.png' });

  // กดทัวร์ต่อจากการ์ดจบ ต้องเริ่มชุดใหม่จริง ไม่ใช่ค้างอยู่ที่การ์ดเดิม
  if(await tap(p.locator('#tourTip button', { hasText:'หน้ารายจ่าย' }), 'กดดูทัวร์ต่อจากการ์ดจบได้')){
    await p.waitForTimeout(1800);
    const nx = await p.evaluate(() => ({ which: tourWhich,
      end: document.getElementById('tourTip').classList.contains('tour-end') }));
    ok('กดทัวร์ต่อแล้วเริ่มชุดใหม่จริง ไม่ค้างที่การ์ดจบ', nx.which === 'money' && !nx.end);
  }
  await p.evaluate(() => endTour());
  await p.waitForTimeout(300);

  // คู่มือติ๊กถูกให้ชุดที่ดูจบแล้ว จะได้รู้ว่าเหลือชุดไหน
  await p.evaluate(() => openHelp());
  await p.waitForTimeout(1000);
  ok('ปุ่มในคู่มือติ๊กถูกเฉพาะชุดที่ดูจบแล้ว', await p.evaluate(() => {
    const bs = [...document.querySelectorAll('.tourpick-b')];
    const tick = bs.filter(x => x.querySelector('svg')).map(x => x.textContent.trim());
    return tick.length === 1 && /หน้าขาย/.test(tick[0]);
  }));
  await p.evaluate(() => dlg.close());
  await p.waitForTimeout(900);

  /* ระหว่างทัวร์ต้องกดทะลุไปโดนของจริงไม่ได้ แม่ค้ามือเปื้อนแป้ง เผลอแตะโดนง่าย */
  await p.evaluate(() => { go('today'); startTour('intro'); });
  await p.waitForTimeout(1600);
  const tabWas = await p.evaluate(() => tab);
  await p.mouse.click(200, 520);
  await p.waitForTimeout(400);
  ok('ระหว่างทัวร์ กดทะลุไปโดนของข้างหลังไม่ได้', await p.evaluate(() => tab) === tabWas);
  await p.screenshot({ path: S + '/tour-step.png' });
  await p.evaluate(() => endTour());
  await p.waitForTimeout(300);
  ok('กดปิดแล้วทัวร์หายไปจริง', !(await p.locator('#tour').isVisible().catch(() => false)));

  ok('ไม่มี error หลุดออกมาเลย', errs.length === 0);
  await b.close();
  let bad=0; out.forEach(([n,v])=>{console.log(`  ${v?'✓':'✗'} ${n}`); if(!v)bad++;});
  console.log(bad?`\n  ตก ${bad} ข้อ\n`:'\n  ผ่านทุกข้อ\n');
  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
