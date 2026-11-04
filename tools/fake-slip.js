/* ทำไฟล์รูป "สลิป" ปลอมขึ้นมาใช้ตอนทดสอบ โดยไม่ลงไลบรารีเพิ่ม
   (zlib มากับ node อยู่แล้ว · ต้องเป็น PNG จริงที่เบราว์เซอร์เปิดได้
    ไม่ใช่ไฟล์มั่ว ๆ ไม่งั้นหน้าลูกค้าจะโยนทิ้งแล้วเทสต์ไม่ได้ทดสอบอะไรเลย)

   ใช้ร่วมกันสองชุด: e2e-slip (ตัวหลัก) กับ e2e-pay (ต้องมีสลิปถึงจะส่งออเดอร์ได้) */

const zlib = require('zlib');
const os   = require('os');
const path = require('path');
const fs   = require('fs');

const CRC = (() => {
  const t = new Int32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf){
  let c = -1;
  for(let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function makePNG(w, h, px){
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for(let y = 0; y < h; y++){
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for(let x = 0; x < w; x++){
      const c = px(x, y);
      raw[row + 1 + x*3]     = c[0];
      raw[row + 1 + x*3 + 1] = c[1];
      raw[row + 1 + x*3 + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level:9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const clamp = v => Math.max(0, Math.min(255, Math.round(v)));

// ให้พอเหมือนสลิปจริง: พื้นอ่อน มีแถบ มีก้อนตัวเลขเข้ม ๆ เป็นลาย
const slipA = (x, y) => {
  const band = (y % 90 < 8) ? 60 : 245;
  const ink  = (x % 70 < 26 && y % 90 > 24 && y % 90 < 40) ? 40 : band;
  return [clamp(ink), clamp(ink - 4), clamp(ink - 10)];
};
// ใบเดิมที่โดนบีบอัดซ้ำ/ถ่ายจอมา — พิกเซลเพี้ยนไปทั้งรูปแต่ลายเดิม
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF) / 0x7FFFFFFF;
const slipA2 = (x, y) => slipA(x, y).map(v => clamp(v + (rnd() * 24 - 12)));
// คนละใบจริง ๆ — ลายคนละแบบคนละทิศ
const slipB = (x, y) => {
  const band = (x % 70 < 10) ? 50 : 240;
  const ink  = (y % 60 < 30 && x % 70 > 30 && x % 70 < 52) ? 30 : band;
  return [clamp(ink - 12), clamp(ink), clamp(ink - 6)];
};
// อีกใบที่ต่างจากทั้ง A และ B — ลายเฉียง
const slipC = (x, y) => {
  const d = (x + y) % 80;
  const ink = d < 12 ? 45 : (d > 40 && d < 56 ? 150 : 238);
  return [clamp(ink), clamp(ink - 14), clamp(ink)];
};

const PATTERNS = { a: slipA, a2: slipA2, b: slipB, c: slipC };

/* เขียนไฟล์รูปลงโฟลเดอร์ชั่วคราว คืน path ให้ชุดทดสอบเอาไปใส่ช่องเลือกไฟล์
   เรียก writeSlips(['a','b']) ได้ ถ้าชุดนั้นใช้ไม่ครบทุกใบ */
function writeSlips(keys){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slip-'));
  const out = { dir };
  (keys || Object.keys(PATTERNS)).forEach(k => {
    const f = path.join(dir, k + '.png');
    fs.writeFileSync(f, makePNG(360, 540, PATTERNS[k]));
    out[k] = f;
  });
  return out;
}

module.exports = { makePNG, writeSlips, PATTERNS };
