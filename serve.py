#!/usr/bin/env python3
"""
Vault PWA - Local Test Server
Run this on your laptop to test the app before installing on iOS.

Usage:
    python3 serve.py

Then open: http://localhost:8080
Or from your iPhone (same WiFi): http://YOUR_LAPTOP_IP:8080
"""

import http.server
import socketserver
import socket
import os

PORT = 8080

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Service-Worker-Allowed', '/')
        super().end_headers()

    def guess_type(self, path):
        if path.endswith('.js'):   return 'application/javascript'
        if path.endswith('.json'): return 'application/json'
        if path.endswith('.css'):  return 'text/css'
        if path.endswith('.svg'):  return 'image/svg+xml'
        return super().guess_type(path)

def get_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        ip = get_ip()
        print("=" * 60)
        print("  VAULT PWA — LOCAL TEST SERVER")
        print("=" * 60)
        print(f"\n  Open on your laptop : http://localhost:{PORT}")
        print(f"  Open on your iPhone : http://{ip}:{PORT}")
        print(f"\n  Press Ctrl+C to stop")
        print("=" * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Server stopped. Goodbye!")
