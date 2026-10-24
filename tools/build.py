#!/usr/bin/env python3
"""สร้างโฟลเดอร์ dist/ ที่พร้อมอัปโหลดขึ้นเว็บ (เฉพาะไฟล์ที่ต้องใช้)

ใช้งาน:
    python3 tools/build.py

ผลลัพธ์:
    dist/                        โฟลเดอร์สำหรับ drag & drop ขึ้น host ใดก็ได้
    xauusd-journal-site.zip      ไฟล์ zip ขนาดเล็กสำหรับอัปโหลด
"""
import hashlib
import os
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
ZIP_PATH = os.path.join(ROOT, "xauusd-journal-site.zip")

FILES = [
    "index.html",
    "manifest.webmanifest",
    "sw.js",
    "assets/styles.css",
    "assets/app.js",
    "assets/calc.js",
    "assets/store.js",
    "assets/csv.js",
    "assets/icon-180.png",
    "assets/icon-192.png",
    "assets/icon-512.png",
]

# ไฟล์ข้อมูลตัวอย่าง (ตัวเลขเทรดจริง) — ไม่รวมในเวอร์ชันที่ขึ้นเว็บสาธารณะ เว้นแต่ระบุ --with-sample
OPTIONAL_FILES = ["assets/sample-data.js"]


def asset_version():
    """คำนวณรุ่นของแคชจากเนื้อไฟล์ เพื่อให้ service worker อัปเดตเมื่อไฟล์เปลี่ยน"""
    h = hashlib.sha1()
    for rel in FILES:
        path = os.path.join(ROOT, rel)
        if os.path.exists(path):
            with open(path, "rb") as f:
                h.update(f.read())
    return h.hexdigest()[:10]


def main():
    with_sample = "--with-sample" in sys.argv

    # ล้าง dist/ แต่เก็บ .git ไว้ เพื่อให้ dist เป็น git repo สำหรับ deploy ขึ้น GitHub Pages ได้
    if os.path.isdir(DIST):
        for entry in os.listdir(DIST):
            if entry == ".git":
                continue
            path = os.path.join(DIST, entry)
            if os.path.isdir(path):
                shutil.rmtree(path)
            else:
                os.remove(path)
    else:
        os.makedirs(DIST)

    version = asset_version()
    missing = []
    files = FILES + (OPTIONAL_FILES if with_sample else [])

    for rel in files:
        src = os.path.join(ROOT, rel)
        dst = os.path.join(DIST, rel)
        if not os.path.exists(src):
            missing.append(rel)
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if rel == "sw.js":
            with open(src, "r", encoding="utf-8") as f:
                content = f.read().replace("__VERSION__", version)
            if with_sample:
                content = content.replace(
                    "  './assets/csv.js',",
                    "  './assets/csv.js',\n  './assets/sample-data.js',"
                )
            with open(dst, "w", encoding="utf-8") as f:
                f.write(content)
        else:
            shutil.copy2(src, dst)

    # ถ้าไม่มีไฟล์ข้อมูลตัวอย่าง ให้ index.html ไม่ต้องโหลดไฟล์นั้น (กัน 404)
    if not with_sample:
        idx = os.path.join(DIST, "index.html")
        with open(idx, "r", encoding="utf-8") as f:
            html = f.read()
        html = html.replace('<script src="assets/sample-data.js"></script>\n', "")
        with open(idx, "w", encoding="utf-8") as f:
            f.write(html)

    # ไฟล์ประกอบการโฮสต์: ปิด Jekyll (GitHub Pages) และบอก host ว่าไม่ต้องประมวลผล
    open(os.path.join(DIST, ".nojekyll"), "w").close()
    with open(os.path.join(DIST, "robots.txt"), "w", encoding="utf-8") as f:
        f.write("User-agent: *\nDisallow:\n")
    with open(os.path.join(DIST, "_headers"), "w", encoding="utf-8") as f:
        f.write("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n")

    if os.path.exists(ZIP_PATH):
        os.remove(ZIP_PATH)
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for base, _dirs, names in os.walk(DIST):
            for name in names:
                full = os.path.join(base, name)
                zf.write(full, os.path.relpath(full, DIST))

    total = sum(os.path.getsize(os.path.join(base, n))
                for base, _d, fs in os.walk(DIST) for n in fs)
    print(f"✅ สร้าง dist/ สำเร็จ  ({len(files)} ไฟล์, {total/1024:.0f} KB)")
    print(f"   แคชเวอร์ชัน : {version}")
    print(f"   ไฟล์ zip    : {os.path.basename(ZIP_PATH)} ({os.path.getsize(ZIP_PATH)/1024:.0f} KB)")
    print(f"   ข้อมูลตัวอย่าง : {'รวม (--with-sample)' if with_sample else 'ไม่รวม (เริ่มต้นว่าง)'}")
    if missing:
        print("   ⚠️  ไม่พบไฟล์: " + ", ".join(missing))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
