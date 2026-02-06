#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Улучшенный HTTP сервер для Copilot 1CO
Правильно обрабатывает большие файлы и UTF-8 кодировку
"""
import http.server
import socketserver
import os
import sys

# Порт для локальной разработки (можно сменить, если занят)
PORT = 8765

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Добавляем заголовки для правильной работы с модулями
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    
    def guess_type(self, path):
        result = super().guess_type(path)
        mimetype = result[0] if isinstance(result, tuple) else result
        # Убеждаемся, что HTML и JS имеют правильный Content-Type
        if path.endswith('.html'):
            return 'text/html; charset=utf-8'
        if path.endswith('.js'):
            return 'application/javascript; charset=utf-8'
        return mimetype
    
    def log_message(self, format, *args):
        # Логируем все запросы для отладки
        sys.stderr.write("%s - - [%s] %s\n" %
                        (self.address_string(),
                         self.log_date_time_string(),
                         format%args))

if __name__ == "__main__":
    # Определяем директорию скрипта
    script_dir = os.path.dirname(os.path.abspath(__file__ if '__file__' in globals() else '.'))
    os.chdir(script_dir)

    try:
        httpd = socketserver.TCPServer(("", PORT), MyHTTPRequestHandler)
    except OSError as e:
        if getattr(e, "winerror", None) == 10048 or "Address already in use" in str(e):
            print(f"[ERROR] Port {PORT} is busy. Change PORT in server.py or stop the other process.")
        raise SystemExit(1)
    print(f"[START] Server: http://localhost:{PORT}/")
    print(f"[DIR]   Folder: {os.getcwd()}")
    print(f"[STOP] Press Ctrl+C to stop")
    print("-" * 50)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[STOP] Server stopped")
