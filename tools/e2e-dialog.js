// ทดสอบการเปิด-ปิดกล่องด้วยเบราว์เซอร์จริง
// dialog.close() ของเบราว์เซอร์ปิดทันทีเสมอ แอปจึงครอบไว้เล่นภาพเลื่อนออกก่อน
// จุดเสี่ยงคือ "ปิดแล้วเปิดกล่องใหม่ทันที" ซึ่งมีหลายที่ในแอป
//
//   npm run check:order   (รันชุดนี้ด้วย)

const { chromium } = require('playwright');
// ภาพหน้าจอไปลงที่ชั่วคราว ไม่ให้ไปรกในโฟลเดอร์โปรเจกต์
const S = process.env.SHOT_DIR || require('os').tmpdir();
const out=[]; const ok=(n,v)=>out.push([n,!!v]);
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
  await p.locator('.bottomnav button', {hasText:'ขาย'}).click();
  await p.waitForTimeout(400);
  await p.locator('.orderbtn').click();
  await p.waitForTimeout(600);
  ok('เปิดกล่องได้', await p.evaluate(() => dlg.open));

  await p.locator('.dlg-x').click();
  await p.waitForTimeout(60);
  const mid = await p.evaluate(() => {
    const d = document.getElementById('dlg');
    return { ยังเปิดอยู่: d.open, มีคลาสปิด: d.classList.contains('closing'),
             ชื่อภาพ: getComputedStyle(d).animationName };
  });
  ok('กดกากบาทแล้วยังไม่หายทันที มีภาพเลื่อนออกก่อน',
    mid.ยังเปิดอยู่ && mid.มีคลาสปิด && mid.ชื่อภาพ === 'sheetout');
  await p.screenshot({path:S+'/close-mid.png'});

  await p.waitForTimeout(500);
  ok('เล่นจบแล้วกล่องปิดจริง', await p.evaluate(() => !dlg.open));
  ok('คลาสปิดถูกล้างทิ้ง ไม่ค้าง',
    await p.evaluate(() => !document.getElementById('dlg').classList.contains('closing')));

  /* ---- 2. กด Esc ก็ต้องมีภาพเคลื่อนไหวเหมือนกัน ---- */
  await p.locator('.orderbtn').click();
  await p.waitForTimeout(500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(60);
  ok('กด Esc ก็มีภาพเลื่อนออกเหมือนกัน',
    await p.evaluate(() => dlg.open && document.getElementById('dlg').classList.contains('closing')));
  await p.waitForTimeout(500);
  ok('กด Esc แล้วปิดจริง', await p.evaluate(() => !dlg.open));

  /* ---- 3. ปิดแล้วเปิดกล่องใหม่ทันที กล่องใหม่ต้องไม่หายตามไปด้วย ---- */
  await p.evaluate(() => { tab='money'; render(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => dayMoneyDialog(dayKey()));
  await p.waitForTimeout(600);
  await p.locator('.dlg-foot button', {hasText:'เพิ่มรายจ่าย'}).click();   // dlg.close(); expenseDialog(null)
  await p.waitForTimeout(500);
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
  await p.waitForTimeout(500);
  ok('ปิดกล่องสุดท้ายเรียบร้อย', await p.evaluate(() => !dlg.open));

  ok('ไม่มี error หลุดออกมาเลย', errs.length === 0);
  await b.close();
  let bad=0; out.forEach(([n,v])=>{console.log(`  ${v?'✓':'✗'} ${n}`); if(!v)bad++;});
  console.log(bad?`\n  ตก ${bad} ข้อ\n`:'\n  ผ่านทุกข้อ\n');
  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
