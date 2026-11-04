/* ตัวกลางส่งแจ้งเตือนออเดอร์เข้า LINE — เอาไปวางใน Google Apps Script
 *
 * ทำไมต้องมีไฟล์นี้: แอปร้านเป็นหน้าเว็บเฉย ๆ ยิงไปหา LINE ตรง ๆ ไม่ได้
 *   1. เบราว์เซอร์บล็อกไว้ (CORS)
 *   2. ต่อให้ยิงได้ก็ไม่ควร เพราะต้องเอากุญแจของ OA ไปฝังในหน้าเว็บ
 *      ใครเปิดดูโค้ดก็ก๊อปไปส่งข้อความในนามร้านเราได้
 * ไฟล์นี้จึงทำหน้าที่ถือกุญแจไว้แทน แอปแค่ส่งข้อความมาให้
 *
 * ฟรี ไม่ต้องผูกบัตร ใช้บัญชี Google ที่มีอยู่แล้ว
 * ขั้นตอนติดตั้งทั้งหมดอยู่ในไฟล์ line-อ่านก่อน.md
 */

var PROP = PropertiesService.getScriptProperties();

function json(o){
  return ContentService.createTextOutput(JSON.stringify(o))
                       .setMimeType(ContentService.MimeType.JSON);
}

// เปิดลิงก์ในเบราว์เซอร์แล้วเห็นสถานะ ใช้เช็กว่าติดตั้งถูกไหม
function doGet(){
  return json({
    ok: true,
    token: !!PROP.getProperty('LINE_TOKEN'),   // ใส่กุญแจแล้วหรือยัง
    user:  !!PROP.getProperty('USER_ID')       // ลงทะเบียนแล้วหรือยัง
  });
}

function doPost(e){
  var body = {};
  try{ body = JSON.parse(e.postData.contents); }catch(err){}

  // LINE ส่ง webhook มา (มีคนทักเข้า OA ของร้าน)
  if(body.events) return handleWebhook(body.events);

  // แอปร้านสั่งให้ส่งข้อความ
  return pushToShop(String(body.text || ''));
}

/* ตอนมีคนทักเข้า OA
   พิมพ์ "ลงทะเบียน" = จำไว้ว่าจะส่งแจ้งเตือนไปหาคนนี้
   พิมพ์ "ยกเลิก"    = เลิกส่ง
   ข้อความอื่นไม่ยุ่ง จะได้ไม่ไปตอบลูกค้าที่บังเอิญทักมา

   การ "ตอบกลับ" แบบนี้ **ไม่นับโควตาข้อความ** ของ LINE ตอบได้ไม่อั้น */
function handleWebhook(events){
  events.forEach(function(ev){
    if(!ev || ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
    var text = String(ev.message.text || '').trim();
    var uid  = ev.source && ev.source.userId;
    if(!uid || !ev.replyToken) return;

    if(text === 'ลงทะเบียน'){
      PROP.setProperty('USER_ID', uid);
      reply(ev.replyToken, 'เรียบร้อย ต่อไปมีออเดอร์ใหม่จะเด้งมาที่นี่\n\nถ้าอยากเลิกรับ พิมพ์คำว่า ยกเลิก');
    }else if(text === 'ยกเลิก'){
      PROP.deleteProperty('USER_ID');
      reply(ev.replyToken, 'เลิกส่งแจ้งเตือนแล้ว · อยากกลับมารับอีก พิมพ์คำว่า ลงทะเบียน');
    }
  });
  return json({ ok:true });
}

function reply(replyToken, text){
  lineCall('https://api.line.me/v2/bot/message/reply',
           { replyToken: replyToken, messages:[{ type:'text', text: text }] });
}

function pushToShop(text){
  if(!text) return json({ ok:false, why:'ไม่มีข้อความให้ส่ง' });

  var to = PROP.getProperty('USER_ID');
  if(!to) return json({ ok:false, why:'ยังไม่ได้ลงทะเบียน — ทักหา OA ของร้านแล้วพิมพ์คำว่า ลงทะเบียน' });
  if(!PROP.getProperty('LINE_TOKEN'))
    return json({ ok:false, why:'ยังไม่ได้ใส่กุญแจ LINE_TOKEN ในหน้า Project Settings' });

  // ตัดความยาวกันพลาด LINE รับข้อความละไม่เกิน 5,000 ตัว
  var res  = lineCall('https://api.line.me/v2/bot/message/push',
                      { to: to, messages:[{ type:'text', text: text.slice(0, 900) }] });
  var code = res.getResponseCode();

  if(code === 200) return json({ ok:true });
  // 429 = ส่งครบโควตาของแพ็กแล้ว ต้องบอกให้ชัด ไม่งั้นแม่ค้าจะนึกว่าวันนี้ไม่มีลูกค้าสั่ง
  if(code === 429) return json({ ok:false, why:'โควตาข้อความของ LINE เดือนนี้หมดแล้ว' });
  if(code === 401) return json({ ok:false, why:'กุญแจ LINE_TOKEN ผิดหรือหมดอายุ' });
  return json({ ok:false, why:'LINE ตอบกลับมา ' + code });
}

function lineCall(url, payload){
  return UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + PROP.getProperty('LINE_TOKEN') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}
