// สร้างไอคอนแอป PNG โดยไม่ใช้ไลบรารีภายนอก (วาดลงบัฟเฟอร์พิกเซลแล้วเข้ารหัส PNG เอง)
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];

/* ---------- เข้ารหัส PNG ---------- */
function crc32(buf){
  let c, crc = 0xFFFFFFFF;
  for(let n=0; n<buf.length; n++){
    c = (crc ^ buf[n]) & 0xFF;
    for(let k=0; k<8; k++) c = c & 1 ? 0xEDB88320 ^ (c>>>1) : c>>>1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgba){
  const raw = Buffer.alloc((width*4 + 1) * height);
  for(let y=0; y<height; y++){
    raw[y*(width*4+1)] = 0;                                    // filter: none
    rgba.copy(raw, y*(width*4+1)+1, y*width*4, (y+1)*width*4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;    // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, {level:9})),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- วาดไอคอน: เครปห่อกรวยบนพื้นฟ้า ---------- */
const mix = (a,b,t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];

const BG_TOP = [242,138,58], BG_BOT = [196,80,10];   // ไล่เฉดส้ม
const CREPE  = [255,255,255];                        // ตัวเครปสีขาว
const CHOC   = [150,62,8];                           // ไส้ — ส้มเข้ม
const SHADE  = [250,232,214];                        // เงาบนตัวเครป

const draw = S => png(S, S, drawPixels(S));

function drawPixels(S){
  const SS = 3;                      // supersample กันขอบหยัก
  const W = S*SS;
  const buf = Buffer.alloc(S*S*4);

  // เรขาคณิตของกรวยเครป (หน่วยสัดส่วน 0..1)
  const cx = 0.5, topY = 0.34, apexY = 0.86, halfW = 0.205;

  // ตัวกรวย: สามเหลี่ยมปลายมนที่สอบลงล่าง
  const inCone = (x,y) => {
    if(y < topY || y > apexY) return false;
    const t = (y - topY) / (apexY - topY);
    return Math.abs(x - cx) <= halfW * (1 - t*t*0.35 - t*0.65);
  };
  const ellipse = (x,y,ex,ey,rx,ry) => ((x-ex)/rx)**2 + ((y-ey)/ry)**2 <= 1;
  const circle  = (x,y,ex,ey,r) => (x-ex)**2 + (y-ey)**2 <= r*r;

  const inRim    = (x,y) => ellipse(x,y, cx, topY, halfW, 0.072);              // ขอบปากกรวย
  const inFill   = (x,y) => ellipse(x,y, cx, topY+0.006, halfW*0.80, 0.053);   // ไส้
  const inCream  = (x,y) => circle(x,y, 0.443, topY-0.018, 0.047)              // วิปครีม
                         || circle(x,y, 0.556, topY-0.002, 0.036);

  for(let py=0; py<S; py++){
    for(let px=0; px<S; px++){
      let r=0, g=0, b=0;
      for(let sy=0; sy<SS; sy++){
        for(let sx=0; sx<SS; sx++){
          const x = (px + (sx+0.5)/SS) / S;
          const y = (py + (sy+0.5)/SS) / S;
          let c = mix(BG_TOP, BG_BOT, y);                  // พื้นหลังไล่เฉด
          const shade = Math.min(1, Math.max(0, (x - cx + halfW) / (2*halfW)));
          if(inCone(x,y) || inRim(x,y)) c = mix(CREPE, SHADE, shade*0.45);  // ตัวเครป
          if(inFill(x,y))  c = CHOC;                                        // ไส้
          if(inCream(x,y)) c = CREPE;                                       // วิปครีมโผล่ปากกรวย
          r+=c[0]; g+=c[1]; b+=c[2];
        }
      }
      const n = SS*SS, i = (py*S+px)*4;
      buf[i]=Math.round(r/n); buf[i+1]=Math.round(g/n); buf[i+2]=Math.round(b/n); buf[i+3]=255;
    }
  }
  return buf;
}

/* ---------- ภาพ splash ตอนเปิดแอป: พื้นหลังล้วน + โลโก้เล็ก ๆ กลางจอ ---------- */
function drawSplash(S, dark){
  const buf = Buffer.alloc(S*S*4);
  const BG = dark ? [26,20,16] : [255,255,255];
  const L = Math.round(S*0.26);                   // โลโก้กินพื้นที่ 26% ของจอ
  const o = Math.round((S - L) / 2);
  const sub = drawPixels(L);
  for(let y=0; y<S; y++){
    for(let x=0; x<S; x++){
      const i = (y*S+x)*4;
      let c = BG;
      const lx = x - o, ly = y - o;
      if(lx>=0 && ly>=0 && lx<L && ly<L){
        const j = (ly*L+lx)*4;
        c = [sub[j], sub[j+1], sub[j+2]];
      }
      buf[i]=Math.round(c[0]); buf[i+1]=Math.round(c[1]); buf[i+2]=Math.round(c[2]); buf[i+3]=255;
    }
  }
  return png(S, S, buf);
}

/* ไอคอนสำหรับเว็บ (PWA) */
for(const size of [512, 192, 180, 32]){
  const name = size===180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  const file = path.join(OUT, name);
  fs.writeFileSync(file, draw(size));
  console.log(`  ${name.padEnd(22)} ${String(size).padStart(4)}x${size}  ${(fs.statSync(file).size/1024).toFixed(1)} KB`);
}

/* ไอคอน + splash สำหรับ build เป็นแอป (@capacitor/assets ต้องการขนาดนี้เป๊ะ) */
const ASSETS = process.argv[3];
if(ASSETS){
  fs.mkdirSync(ASSETS, {recursive:true});
  const jobs = [
    ['icon.png',        () => draw(1024)],
    ['splash.png',      () => drawSplash(2732, false)],
    ['splash-dark.png', () => drawSplash(2732, true)]
  ];
  for(const [name, make] of jobs){
    const file = path.join(ASSETS, name);
    fs.writeFileSync(file, make());
    console.log(`  ${name.padEnd(22)} ${(fs.statSync(file).size/1024).toFixed(1)} KB`);
  }
}
