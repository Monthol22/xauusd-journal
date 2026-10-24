#!/usr/bin/env python3
"""เซิร์ฟเวอร์สำหรับเปิดแอปจากเครื่องอื่นในวง LAN เดียวกัน (เช่น iPad / มือถือ)

ใช้งาน:  python3 tools/dev-server.py [port]
จากนั้นเปิด URL ที่แสดงบนหน้าจอด้วย iPad (ต้องต่อ Wi-Fi วงเดียวกัน)
"""
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class AppHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # ปิด cache เพื่อให้เปิดไฟล์ที่แก้ล่าสุดเสมอ (สะดวกตอนพัฒนา)
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, *args):
        pass  # ไม่ต้องรกหน้าจอ


def lan_ips():
    """หา IPv4 ของเครื่องนี้ในวง LAN"""
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addr = info[4][0]
            if not addr.startswith("127."):
                ips.add(addr)
    except OSError:
        pass
    return sorted(ips)


def local_hostname():
    """ชื่อ .local ของเครื่อง (Bonjour) — ใช้แทน IP เพื่อให้ที่อยู่คงที่"""
    try:
        import subprocess
        out = subprocess.run(["scutil", "--get", "LocalHostName"],
                             capture_output=True, text=True, timeout=2)
        name = out.stdout.strip()
        if name:
            return name + ".local"
    except Exception:
        pass
    try:
        name = socket.gethostname()
        if name and name.lower().endswith(".local"):
            return name
    except OSError:
        pass
    return ""


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except AttributeError:
        pass
    server = ThreadingHTTPServer(("0.0.0.0", port), AppHandler)
    ips = lan_ips()
    host = local_hostname()

    print("\n  บันทึกรายได้เทรด XAUUSD — เปิดใช้งานแล้ว\n")
    print(f"  เครื่องนี้        :  http://localhost:{port}/index.html")
    if host:
        print(f"  iPad / มือถือ     :  http://{host}:{port}/index.html   ← แนะนำ (ที่อยู่คงที่)")
    for ip in ips:
        print(f"  ทาง IP            :  http://{ip}:{port}/index.html")
    if not ips:
        print("  (ไม่พบ IP ในวง LAN — ตรวจสอบว่าเชื่อมต่อ Wi-Fi อยู่)")
    print("\n  * iPad ต้องต่อ Wi-Fi วงเดียวกับเครื่องนี้")
    print("  * ถ้า macOS ถามเรื่อง firewall ให้กด “Allow”")
    print("  * กด Ctrl+C เพื่อหยุด\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  หยุดเซิร์ฟเวอร์แล้ว\n")
        server.server_close()


if __name__ == "__main__":
    main()
