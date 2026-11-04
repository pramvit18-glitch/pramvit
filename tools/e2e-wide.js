/* หน้าตาบนจอกว้าง — เจ้าของเจอเองว่า "ในมือถือโอเค แต่ในคอมไม่สวยเลย"

   สาเหตุคือ `@media` วัดจาก **ความกว้างจอ** แต่เนื้อหาถูกล็อกด้วย `.shell{max-width}`
   แอปเลยสลับไปใช้เลย์เอาต์จอกว้างทั้งที่ยังมีที่ไม่พอ ได้การ์ดเบียดกันกับกล่องว่าง

   ชุดนี้จึง **วัดของจริงจากเบราว์เซอร์** ไม่ใช่ไล่อ่านว่า CSS เขียนว่าอะไร
   เพราะกฎพวกนี้พันกันหลายชั้น อ่านแล้วเดาผลไม่ออก

   node serve.js &   node tools/e2e-wide.js  */

const { chromium } = require('playwright');

const APP  = process.env.APP_URL || 'http://127.0.0.1:8787';
const SHOT = process.env.SHOT_DIR || require('os').tmpdir();

const ok = [];
const push = (name, v) => ok.push([name, !!v]);
const outsideFont = [];

// เนื้อหาต้องกว้างพอจริงก่อนถึงจะแตกเป็น 4 คอลัมน์ ไม่งั้นการ์ดผอมจนอ่านไม่ออก
const MIN_4COL = 860;

(async () => {
  const b = await chromium.launch({ args:['--no-sandbox'] });

  const look = async (w, h) => {
    const pg = await b.newPage({ viewport:{ width:w, height:h }, deviceScaleFactor:1 });
    pg.on('pageerror', e => push(`แอปตายที่จอ ${w}: ` + e.message.slice(0,60), false));
    // ฟอนต์ต้องมาจากในโปรเจกต์ ไม่ใช่ยิงออกไปโหลดจากข้างนอกทุกครั้งที่เปิดแอป
    pg.on('request', r => {
      const u = r.url();
      if(/\.woff2?($|\?)/.test(u) && !u.startsWith(APP)) outsideFont.push(u);
    });
    await pg.goto(APP + '/index.html');
    await pg.waitForTimeout(700);
    return pg;
  };
  const box = (pg, sel) => pg.evaluate(s => {
    const el = document.querySelector(s);
    if(!el) return null;
    const r = el.getBoundingClientRect(), c = getComputedStyle(el);
    return { x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
             pos:c.position, display:c.display, cols:c.gridTemplateColumns };
  }, sel);
  const spills = pg => pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

  /* ---------- มือถือต้องไม่เปลี่ยนอะไรเลย ---------- */
  let pg = await look(390, 844);
  const mNav = await box(pg, '.bottomnav');
  push('มือถือ: แถบเมนูยังลอยอยู่ล่างเหมือนเดิม', !!mNav && mNav.pos === 'fixed');
  push('มือถือ: แถบเมนูอยู่ครึ่งล่างของจอ', !!mNav && mNav.y > 844 / 2);
  const mBtns = await pg.evaluate(() => [...document.querySelectorAll('.bottomnav button[data-tab]')]
    .map(x => Math.round(x.getBoundingClientRect().width)));
  push(`มือถือ: ปุ่มเมนู 5 อันกว้างเท่ากัน (${[...new Set(mBtns)].join('/')}px)`,
    mBtns.length === 5 && new Set(mBtns).size === 1);
  push('มือถือ: ไม่มีกล่องเมนูย่อยมาโผล่ (ไม่มีเมาส์ให้ชี้)',
    (await box(pg, '.navfly')).display === 'none');
  push('มือถือ: ไม่ล้นออกข้าง', !(await spills(pg)));
  await pg.close();

  /* ---------- จอกลาง ยังไม่ถึงจุดเปลี่ยน ---------- */
  pg = await look(1024, 800);
  const midNav = await box(pg, '.bottomnav');
  const midMain = await box(pg, 'main');
  push('จอ 1024: ยังไม่มีรางเมนูข้าง เมนูยังอยู่เหนือเนื้อหา', !!midNav && midNav.y < midMain.y);
  const midDash = await box(pg, '.dash.on');
  push('จอ 1024: แดชบอร์ดยังไม่แตก 4 คอลัมน์',
    !midDash || midDash.cols.split(' ').length <= 2);
  push('จอ 1024: ไม่ล้นออกข้าง', !(await spills(pg)));
  await pg.close();

  /* ---------- จอกลางค่อนไปทางกว้าง: มีรางเมนูแล้ว แต่ยังไม่ควรแตก 4 คอลัมน์ ---------- */
  pg = await look(1200, 820);
  const nav12 = await box(pg, '.bottomnav');
  const main12 = await box(pg, 'main');
  push('จอ 1200: รางเมนูอยู่ซ้ายของเนื้อหาแล้ว', !!nav12 && nav12.x + nav12.w <= main12.x);
  const d12 = await box(pg, '.dash.on');
  push(`จอ 1200: เนื้อหายังแคบ (${main12.w}px) ยังไม่แตก 4 คอลัมน์`,
    !d12 || d12.cols.split(' ').length <= 2);
  push('จอ 1200: ไม่ล้นออกข้าง', !(await spills(pg)));
  await pg.close();

  /* ---------- จอคอมเต็ม ๆ ---------- */
  pg = await look(1440, 900);
  const shell = await box(pg, '.shell');
  const nav = await box(pg, '.bottomnav');
  const main = await box(pg, 'main');
  push('จอ 1440: เปลือกแอปกว้างขึ้นจริง (ไม่ใช่คอลัมน์ผอมกลางจอ)', shell.w >= 1200);
  push('จอ 1440: รางเมนูชิดซ้ายของเปลือกแอป', nav.x - shell.x <= 40);
  push(`จอ 1440: รางเมนูแคบแบบไอคอน (${nav.w}px)`, nav.w > 50 && nav.w <= 120);
  push('จอ 1440: เนื้อหาอยู่ขวาของราง ไม่ทับกัน', nav.x + nav.w <= main.x);
  push('จอ 1440: รางเมนูเลื่อนตามจอ (sticky) ไม่หายไปตอนเลื่อนลง', nav.pos === 'sticky');
  push('จอ 1440: ไม่ล้นออกข้าง', !(await spills(pg)));

  const dash = await box(pg, '.dash.on');
  const nCols = dash ? dash.cols.split(' ').length : 0;
  push(`จอ 1440: แดชบอร์ดแตก ${nCols} คอลัมน์ และกว้างพอ (${dash ? dash.w : 0}px)`,
    !!dash && (nCols < 4 || dash.w >= MIN_4COL));
  /* ---------- เจ้าของบอกว่า "โล่งเยอะเลย" — วัดกันตรง ๆ ว่าแต่ละแถวใช้ที่ไปเท่าไหร่ ----------
     แถวทางลัดกับแถวขายดีเป็นแถวปัดข้างของมือถือ ของเลยกองชิดซ้ายเป็นก้อนเดียว
     เคยวัดได้ว่าคอลัมน์กว้าง 694px แต่ใช้จริงแค่ 256-340 เหลือว่างยาว 354-438px */
  const fill = await pg.evaluate(() => {
    const used = el => {
      let right = el.getBoundingClientRect().left;
      el.querySelectorAll('*').forEach(c => {
        const b = c.getBoundingClientRect();
        if(b.width > 2 && b.height > 2) right = Math.max(right, b.right);
      });
      return (right - el.getBoundingClientRect().left) / el.getBoundingClientRect().width;
    };
    const hb = document.getElementById('homeBody');
    /* หาหัวข้อ "เมนูของฉัน" แบบไม่ผูกกับตัวครอบ — ถ้าผูกแล้วตัวครอบหายไป
       querySelector จะคืน null แล้วโยน error ทำให้ **ล้มทั้งชุด** แทนที่จะตกข้อเดียว */
    const sec = [...document.querySelectorAll('#homeBody .home-sec')]
      .find(x => x.textContent.includes('เมนูของฉัน'));
    const qEl = document.querySelector('.quick');
    return {
      cols: getComputedStyle(hb).gridTemplateColumns.split(' ').length,
      quick: qEl ? used(qEl) : 0,
      hil:   used(document.querySelector('.hil')),
      หัวห่างของ: (sec && qEl)
        ? Math.round(qEl.getBoundingClientRect().top - sec.getBoundingClientRect().bottom)
        : 9999
    };
  });
  push(`หัวหน้าแรกจัด ${fill.cols} คอลัมน์ ไม่ใช่กองเดียวยาว`, fill.cols === 3);
  push(`แถวทางลัดใช้ที่เกือบเต็มคอลัมน์ (${Math.round(fill.quick*100)}%)`, fill.quick > 0.8);
  push(`แถวขายดีใช้ที่เกือบเต็มคอลัมน์ (${Math.round(fill.hil*100)}%)`, fill.hil > 0.8);
  /* เคยพลาด: หัวข้อกับแถวทางลัดอยู่คนละแถวของกริด ความสูงปฏิทินเลยดันให้ห่างกัน 100px */
  push(`หัวข้อติดกับของที่มันพูดถึง (ห่าง ${fill.หัวห่างของ}px)`, fill.หัวห่างของ <= 40);

  const chart = await box(pg, '.chart svg');
  push(`จอ 1440: กราฟถูกคุมความกว้างไว้ (${chart ? chart.w : '-'}px) ตัวหนังสือจะได้ไม่โตเทอะทะ`,
    !!chart && chart.w <= 680);

  /* ---------- ฟอนต์ต้องโหลดได้จริง ไม่ใช่แค่ประกาศไว้ใน CSS ---------- */
  const font = await pg.evaluate(async () => {
    await document.fonts.ready;
    return { พร้อมใช้: document.fonts.check('16px "Noto Sans Thai"'),
             สแตก: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/"/g,'') };
  });
  push('ฟอนต์ Noto Sans Thai โหลดได้จริงในเบราว์เซอร์', font.พร้อมใช้);
  push(`ตัวหนังสือใช้ฟอนต์นั้นจริง (${font.สแตก})`, font.สแตก === 'Noto Sans Thai');

  /* ---------- เอาเมาส์ชี้แล้วมีเมนูย่อยโผล่ ---------- */
  push('มีกล่องเมนูย่อยให้ชี้มากกว่า 1 เมนู', await pg.locator('.navfly').count() >= 2);
  const setup = pg.locator('.navitem:has(button[data-tab="setup"])');
  const fly = setup.locator('.navfly');
  push('ยังไม่ได้ชี้ กล่องย่อยต้องไม่โผล่มาบังเนื้อหา', !(await fly.isVisible()));
  await setup.hover();
  await pg.waitForTimeout(450);
  push('เอาเมาส์ชี้ "ตั้งค่า" แล้วกล่องย่อยโผล่', await fly.isVisible());
  push('กล่องย่อยมีหัวข้อบอกว่าเป็นของเมนูไหน',
    (await fly.textContent()).includes('ตั้งค่าระบบ'));
  push('กล่องย่อยมีรายการให้เลือกครบ 4 อัน', await fly.locator('.navfly-b').count() === 4);
  push('แต่ละรายการมีคำอธิบายสั้น ๆ ว่าเข้าไปทำอะไร',
    (await fly.locator('.navfly-b i').first().textContent()).length > 8);
  // ไอคอนต้องอยู่ซ้ายของตัวหนังสือ ไม่ใช่กองอยู่ข้างบน (เคยพลาดมาแล้วเพราะ specificity)
  const row = await pg.evaluate(() => {
    const b2 = document.querySelector('.navfly-b');
    const ic = b2.querySelector('.navfly-ic').getBoundingClientRect();
    const tx = b2.querySelector('.navfly-t').getBoundingClientRect();
    return { icRight: ic.right, txLeft: tx.left };
  });
  push('ไอคอนอยู่ซ้ายของตัวหนังสือ ไม่ได้กองอยู่ข้างบน', row.icRight <= row.txLeft + 1);
  await pg.screenshot({ path: SHOT + '/wide-hover.png' });

  // กดแล้วต้องทำงานจริง ไม่ใช่กล่องสวยแต่กดไม่ได้
  await fly.locator('.navfly-b', { hasText:'ให้ลูกค้าสั่งเอง' }).click();
  await pg.waitForTimeout(900);
  push('กดรายการในกล่องย่อยแล้วทำงานจริง',
    (await pg.textContent('#dlg')).includes('ให้ลูกค้าสั่งเองได้'));
  await pg.evaluate(() => dlg.close());
  await pg.waitForTimeout(900);
  // กดแล้วต้องปิดเอง ไม่ค้างบังเนื้อหา (ต้อง blur ไม่งั้น :focus-within ค้างไว้)
  await pg.mouse.move(1000, 700);
  await pg.waitForTimeout(400);
  push('กดเสร็จแล้วกล่องย่อยปิดเอง ไม่ค้างบังเนื้อหา', !(await fly.isVisible()));
  push(`ไม่ได้ไปโหลดฟอนต์จากข้างนอกเลย${outsideFont.length ? ' — เจอ ' + outsideFont[0] : ''}`,
    outsideFont.length === 0);
  await pg.close();

  await b.close();
  let bad = 0;
  ok.forEach(([n, v]) => { console.log(`  ${v ? '✓' : '✗'} ${n}`); if(!v) bad++; });
  console.log(bad ? `\n  ตก ${bad} ข้อ\n` : `\n  ผ่านทุกข้อ (${ok.length} ข้อ)\n`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
