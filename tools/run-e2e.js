// รันเทสต์เส้นทางออเดอร์ให้จบในคำสั่งเดียว:  npm run check:order
// เปิดเว็บกับที่เก็บออเดอร์จำลองให้เอง รันเสร็จแล้วปิดให้ด้วย
//
// แยกจาก npm run check เพราะต้องเปิดเซิร์ฟเวอร์กับเบราว์เซอร์จริง ใช้เวลานานกว่า
// และต้องมี playwright อยู่ในเครื่อง

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const kids = [];

function bg(file, args){
  const p = spawn(process.execPath, [path.join(ROOT, file), ...(args||[])],
                  { cwd: ROOT, stdio:'ignore' });
  kids.push(p);
  return p;
}
const stopAll = () => kids.forEach(p => { try{ p.kill(); }catch(e){} });

// รอจนเว็บตอบจริง ดีกว่าเดาเวลาแล้วเทสต์ล้มเพราะเครื่องช้า
async function waitUp(url, tries = 40){
  for(let i = 0; i < tries; i++){
    try{ await fetch(url); return true; }catch(e){}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  bg('serve.js');
  bg('tools/fake-cloud.js');

  const up = await waitUp('http://127.0.0.1:8787/index.html')
          && await waitUp('http://127.0.0.1:8788/x.json');
  if(!up){ stopAll(); console.error('  เปิดเซิร์ฟเวอร์ไม่ขึ้น'); process.exit(1); }

  // ชุดทดสอบที่ต้องใช้เบราว์เซอร์จริง รันต่อกันไปทีละชุด
  const suites = ['tools/e2e-order.js', 'tools/e2e-dialog.js', 'tools/e2e-shortcut.js', 'tools/e2e-quota.js', 'tools/e2e-pay.js', 'tools/e2e-slip.js'];
  let worst = 0;
  for(const f of suites){
    console.log(`\n  ── ${f} ──`);
    const code = await new Promise(res => {
      const r = spawn(process.execPath, [path.join(ROOT, f)], { cwd: ROOT, stdio:'inherit' });
      r.on('exit', c => res(c || 0));
    });
    if(code) worst = code;
  }
  stopAll();
  process.exit(worst);
})();

process.on('SIGINT',  () => { stopAll(); process.exit(1); });
process.on('SIGTERM', () => { stopAll(); process.exit(1); });
