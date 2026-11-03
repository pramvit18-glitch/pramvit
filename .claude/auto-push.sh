#!/usr/bin/env bash
# บันทึกและส่งขึ้น git อัตโนมัติเมื่อ Claude ทำงานเสร็จในรอบนั้น
# เงื่อนไข: ชุดตรวจต้องผ่านก่อน ไม่ผ่าน = ไม่แตะ git เลย
# ตั้งไว้ที่ .claude/settings.json (Stop hook)
set -u

cd "$(dirname "$0")/.." || exit 0
[ -d .git ] || exit 0

say(){ printf '%s' "{\"systemMessage\":\"$1\"}"; }

# ---------- ไม่มีอะไรเปลี่ยน ก็ไม่ต้องทำอะไร ----------
if git diff --quiet HEAD -- 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

# ---------- ชุดตรวจต้องผ่านก่อน ----------
if ! npm run check > .claude/last-check.log 2>&1; then
  say "ชุดตรวจไม่ผ่าน — ยังไม่ commit/push ให้ ดูสาเหตุที่ .claude/last-check.log"
  exit 0
fi

# ---------- แก้หน้าเว็บหน้าไหนก็ตาม ต้องขยับเลขรุ่น ----------
# ไม่งั้นเครื่องที่ติดตั้งแอปไว้แล้วจะไม่ได้ของใหม่
# และหน้าลูกค้าที่เปิดค้างไว้ระหว่างรอคิวจะไม่รู้ว่ามีของใหม่
# เดิมดูแค่ index.html พอแก้ order.html เลขไม่ขยับ ของใหม่เลยไม่ถึงมือลูกค้า
if ! git diff --quiet HEAD -- '*.html' 2>/dev/null; then
  node tools/bump-ver.js > /dev/null 2>&1
fi

# ---------- commit ----------
files=$(git status --porcelain | awk '{print $NF}' | head -4 | tr '\n' ' ')
more=$(git status --porcelain | wc -l)
[ "$more" -gt 4 ] && files="$files และอีก $((more-4)) ไฟล์"

git add -A || exit 0
git commit -q -m "บันทึกอัตโนมัติ: $files" \
               -m "ชุดตรวจผ่านครบทุกชุดก่อน commit · ขยับเลขแคชใน sw.js ให้แล้วถ้าแก้ index.html" \
  || { say "ไม่มีอะไรให้ commit"; exit 0; }

# ---------- push ไปทั้ง GitLab และ GitHub ----------
if git push -q origin main 2>/dev/null; then
  say "บันทึกและส่งขึ้น git ให้แล้ว (ชุดตรวจผ่านครบ)"
else
  say "commit ให้แล้ว แต่ push ไม่สำเร็จ — ลองรัน git push origin main เอง"
fi
exit 0
