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

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Добавляем заголовки для правильной работы с модулями
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    
    def guess_type(self, path):
        mimetype, encoding = super().guess_type(path)
        # Убеждаемся, что HTML файлы имеют правильный Content-Type
        if path.endswith('.html'):
            return 'text/html; charset=utf-8'
        elif path.endswith('.js'):
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
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"[START] Server running at http://localhost:{PORT}")
        print(f"[DIR] Working directory: {os.getcwd()}")
        print(f"[STOP] Press Ctrl+C to stop")
        print("-" * 50)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[STOP] Server stopped")
