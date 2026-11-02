// ที่เก็บออเดอร์จำลอง — เลียนแบบ Firebase Realtime Database แบบ REST
// ใช้ตอนทดสอบเท่านั้น ของจริงใช้ Firebase (ตั้ง URL ได้ที่หน้าตั้งค่าในแอป)
//
//   node tools/fake-cloud.js          เปิดที่พอร์ต 8788
//
// รองรับเท่าที่แอปใช้จริง:
//   GET    /path.json   อ่านค่า (ไม่มีค่า = null)
//   PUT    /path.json   ทับค่าเดิม
//   POST   /path.json   เพิ่มลูกใหม่ ได้คีย์สุ่มกลับไปแบบ {"name":"-Nxxxx"}
//   PATCH  /path.json   แก้เฉพาะคีย์ที่ส่งมา
//   DELETE /path.json   ลบ

const http = require('http');

const PORT = Number(process.argv[2]) || 8788;
let root = {};

// คีย์แบบ Firebase: เรียงตามเวลาได้ด้วยการเรียงตัวอักษรธรรมดา
let lastMs = 0, seq = 0;
function pushKey(){
  const ms = Date.now();
  seq = (ms === lastMs) ? seq + 1 : 0;
  lastMs = ms;
  return '-N' + ms.toString(36) + seq.toString(36).padStart(3, '0');
}

const parts = p => p.replace(/\.json$/, '').split('/').filter(Boolean);

function getAt(path){
  let cur = root;
  for(const k of parts(path)){
    if(cur == null || typeof cur !== 'object') return null;
    cur = cur[k];
  }
  return cur === undefined ? null : cur;
}

// เดินลงไปจนถึงพ่อของปลายทาง สร้างชั้นที่ยังไม่มีให้ด้วย
function parentOf(path){
  const ks = parts(path);
  if(!ks.length) return null;
  let cur = root;
  for(let i = 0; i < ks.length - 1; i++){
    if(typeof cur[ks[i]] !== 'object' || cur[ks[i]] === null) cur[ks[i]] = {};
    cur = cur[ks[i]];
  }
  return { obj: cur, key: ks[ks.length - 1] };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

http.createServer((req, res) => {
  const send = (code, val) => { res.writeHead(code, CORS); res.end(JSON.stringify(val)); };

  if(req.method === 'OPTIONS'){ res.writeHead(204, CORS); res.end(); return; }

  const path = req.url.split('?')[0];

  // ปุ่มล้างข้อมูลสำหรับเทสต์ ของจริงไม่มี
  if(path === '/__reset'){ root = {}; send(200, {ok:true}); return; }

  if(req.method === 'GET'){ send(200, getAt(path)); return; }

  let body = '';
  req.on('data', c => { body += c; if(body.length > 1e6) req.destroy(); });
  req.on('end', () => {
    let val = null;
    try{ val = body ? JSON.parse(body) : null; }catch(e){ send(400, {error:'invalid json'}); return; }

    const at = parentOf(path);
    if(!at){ send(400, {error:'bad path'}); return; }

    if(req.method === 'PUT'){ at.obj[at.key] = val; send(200, val); return; }

    if(req.method === 'POST'){
      if(typeof at.obj[at.key] !== 'object' || at.obj[at.key] === null) at.obj[at.key] = {};
      const k = pushKey();
      at.obj[at.key][k] = val;
      send(200, { name: k });
      return;
    }

    if(req.method === 'PATCH'){
      if(typeof at.obj[at.key] !== 'object' || at.obj[at.key] === null) at.obj[at.key] = {};
      Object.assign(at.obj[at.key], val);
      send(200, val);
      return;
    }

    if(req.method === 'DELETE'){ delete at.obj[at.key]; send(200, null); return; }

    send(405, {error:'method not allowed'});
  });
}).listen(PORT, () => {
  console.log(`\n  ที่เก็บออเดอร์จำลองเปิดที่ http://localhost:${PORT}  (Ctrl+C เพื่อปิด)\n`);
});
