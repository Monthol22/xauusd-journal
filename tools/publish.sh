#!/usr/bin/env bash
# อัปเดตเว็บที่ https://monthol22.github.io/xauusd-journal/
# วิธีใช้: ./tools/publish.sh "ข้อความอธิบายการเปลี่ยนแปลง"
set -euo pipefail

cd "$(dirname "$0")/.."

MSG="${1:-Update $(date '+%Y-%m-%d %H:%M')}"

echo "→ กำลัง build…"
python3 tools/build.py

cd dist
git add -A
if git diff --cached --quiet; then
  echo "✓ ไม่มีการเปลี่ยนแปลง — ไม่ต้อง deploy"
  exit 0
fi
git -c user.name="Monthol Rodsuan" -c user.email="imanimaa@gmail.com" commit -q -m "$MSG"
git push -q origin main
echo "→ อัปโหลดแล้ว รอ GitHub Pages build ~1 นาที"
echo "✓ https://monthol22.github.io/xauusd-journal/"
