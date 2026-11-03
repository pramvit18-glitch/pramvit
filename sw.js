// Service worker — ทำให้แอปเปิดได้ตอนไม่มีเน็ต
// เวลาแก้ index.html แล้วอยากให้เครื่องที่ติดตั้งไปแล้วได้ของใหม่ ให้ขยับเลข CACHE
const CACHE = 'crepe-cost-v109';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* แตะแถบแจ้งเตือนแล้วต้องเด้งเข้าแอป ไม่ใช่แตะแล้วเงียบหาย
   ถ้าแอปเปิดค้างอยู่แล้วให้สลับไปหน้านั้น ไม่เปิดซ้ำเป็นอีกแท็บ */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // ตัวหน้าเว็บ: เอาของใหม่จากเน็ตก่อน ถ้าเน็ตล่มค่อยใช้ของที่เก็บไว้
  if (req.mode === 'navigate') {
    // เก็บแยกตามหน้า ไม่ใช่ยัดทุกหน้าลงช่องของ index.html
    // เคยพังมาแล้ว: ลูกค้าเปิด order.html ทีหนึ่ง มันเอาหน้าลูกค้าไปทับช่องของแอปร้าน
    // พอเน็ตหลุดแล้วแม่ค้าเปิดแอป ได้หน้าลูกค้าขึ้นมาแทน
    const u = new URL(req.url);
    const key = u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname;
    e.respondWith(
      // cache:'reload' = ข้ามแคชของเบราว์เซอร์ ไม่งั้นเปิดมาได้ของเก่าทั้งที่เน็ตมีของใหม่แล้ว
      fetch(req, {cache: 'reload'})
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(key, copy));
          return res;
        })
        .catch(() => caches.match(key)
          .then(r => r || caches.match('./index.html'))
          .then(r => r || caches.match('./')))
    );
    return;
  }

  // ไฟล์อื่น (ไอคอน ฯลฯ): ใช้ของที่เก็บไว้ก่อน เร็วกว่า
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && new URL(req.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => new Response('', {status: 503, statusText: 'ออฟไลน์'})))
  );
});
