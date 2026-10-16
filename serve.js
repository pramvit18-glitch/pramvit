// เซิร์ฟเวอร์เล็ก ๆ ไว้เปิดเว็บนี้บนมือถือผ่าน Wi-Fi เดียวกัน
// วิธีใช้:  node serve.js     แล้วเอา URL ที่ขึ้นไปเปิดบนมือถือ
// ไม่ต้องลงอะไรเพิ่ม ไม่ต้องสมัครอะไร ไม่ต้องมีเน็ตก็ได้ ขอแค่ต่อ Wi-Fi วงเดียวกัน

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// เลี่ยง 8080 เพราะบนเครื่องที่ลง IIS ไว้ พอร์ตนั้นมักถูกจองอยู่แล้ว
const PORT = Number(process.argv[2]) || 8787;
const ROOT = __dirname;

const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',   '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon',
  '.webmanifest':'application/manifest+json; charset=utf-8'
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';

  // กันการไต่ออกนอกโฟลเดอร์
  let file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('403'); return; }
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch {}

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'}).end('<h1>404</h1>ไม่พบไฟล์'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
// ไม่ระบุ host เพื่อให้รับทั้ง IPv4 และ IPv6 — เบราว์เซอร์บางตัวเข้า localhost ผ่าน ::1
}).listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);

  console.log('\n  🥞 เปิดเว็บคำนวณต้นทุนแล้ว — กด Ctrl+C เพื่อปิด\n');
  console.log(`  บนคอมเครื่องนี้ :  http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  บนมือถือ        :  http://${ip}:${PORT}   <-- พิมพ์อันนี้ใน Safari`));
  console.log('\n  * มือถือกับคอมต้องต่อ Wi-Fi วงเดียวกัน');
  console.log('  * ถ้า Windows ถามเรื่อง Firewall ให้กด "Allow access" (เลือก Private networks)\n');
});
