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

  ok('ไม่มี error หลุดออกมาเลย', errs.length === 0);
  await b.close();
  let bad=0; out.forEach(([n,v])=>{console.log(`  ${v?'✓':'✗'} ${n}`); if(!v)bad++;});
  console.log(bad?`\n  ตก ${bad} ข้อ\n`:'\n  ผ่านทุกข้อ\n');
  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
