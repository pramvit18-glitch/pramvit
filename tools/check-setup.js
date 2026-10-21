// ตรวจหน้าตั้งค่า: ชุดไส้แก้ที่เดียวแล้วทุกเมนูเปลี่ยนตาม
const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const script=src.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m,'');
global.localStorage={getItem:()=>null,setItem:()=>{}};
const stub=()=>({innerHTML:'',textContent:'',hidden:false,value:'',dataset:{},addEventListener(){},removeEventListener(){},showModal(){},close(){},querySelectorAll:()=>[],querySelector:()=>stub(),focus(){},setAttribute(){},classList:{toggle(){},add(){},remove(){},contains:()=>false},scrollIntoView(){},replaceWith(){},insertAdjacentHTML(){}});
global.document = { body: stub(), getElementById: stub,querySelector:()=>stub(),createElement:stub};
global.window={addEventListener(){},scrollTo(){}}; global.navigator={};
global.setTimeout=fn=>fn();
const probe=`(() => {
  const out=[];
  db.menus = shopMenu(); db.groups = []; migrateGroups(db); save();

  const html = viewSetup();
  const o=t=>(html.match(new RegExp('<'+t+'[ >]','g'))||[]).length, c=t=>(html.match(new RegExp('</'+t+'>','g'))||[]).length;
  out.push(['หน้าตั้งค่าแท็กครบ', ['div','span','button','p'].every(t=>o(t)===c(t))]);
  out.push(['แสดงเมนูครบทุกตัว', db.menus.every(m => html.includes(m.name))]);
  out.push(['แสดงชุดไส้ครบ', db.groups.every(g => html.includes(g.name))]);

  // แก้ราคาไส้ในชุด → ทุกเมนูที่ใช้ชุดนั้นต้องเปลี่ยนตาม
  const g = db.groups.find(x => x.name === 'ไส้คาว');
  const users = db.menus.filter(m => (m.groupIds||[]).includes(g.id));
  out.push(['ไส้คาวถูกใช้หลายเมนู', users.length >= 2]);
  const item = g.items.find(i => i.name === 'ไข่ไก่');
  const before = menuAddons(users[0]).find(a => a.name === 'ไข่ไก่').price;
  item.price = 12;
  const afterAll = users.map(m => menuAddons(m).find(a => a.name === 'ไข่ไก่').price);
  out.push(['แก้ที่เดียว ทุกเมนูเปลี่ยนตาม (' + before + ' → 12)', afterAll.every(p => p === 12)]);

  // ถอดชุดไส้ออกจากเมนู
  const m0 = users[0], n0 = menuAddons(m0).length;
  toggleMenuGroup(m0.id, g.id);
  out.push(['ถอดชุดออกจากเมนูได้', menuAddons(m0).length === n0 - g.items.length]);
  toggleMenuGroup(m0.id, g.id);
  out.push(['ใส่กลับได้', menuAddons(m0).length === n0]);

  // เพิ่มไส้ใหม่เข้าในชุด
  const gi = g.items.length;
  groupItemDialog(g.id, -1);
  dlgCfg.save({name:'ไก่ป็อป', price:10});
  out.push(['เพิ่มไส้ใหม่เข้าในชุดได้', g.items.length === gi + 1]);
  out.push(['เมนูที่ใช้ชุดนี้เห็นไส้ใหม่ทันที', menuAddons(users[1]).some(a => a.name === 'ไก่ป็อป')]);

  return {out, groups: db.groups.map(g=>g.name+' ('+g.items.length+')'), menus: db.menus.length};
})()`;
const r=eval(script+probe);
let bad=0; r.out.forEach(([nm,v])=>{ if(!v) bad++; console.log(' ', v?'✓':'✗', nm); });
console.log('\n  ชุดไส้:', r.groups.join(' · '));
console.log(' ', bad? bad+' ข้อไม่ผ่าน' : 'ผ่านทุกข้อ');
