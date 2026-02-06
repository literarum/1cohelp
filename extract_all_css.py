#!/usr/bin/env python3
"""Извлекает весь CSS блок из index.html (самый большой)"""

import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Находим все блоки <style>
style_matches = list(re.finditer(r'<style>(.*?)</style>', content, re.DOTALL))

if style_matches:
    # Находим самый большой блок
    largest_match = max(style_matches, key=lambda m: len(m.group(1)))
    css_content = largest_match.group(1)
    
    # Сохраняем в файл
    with open('css/styles.css', 'w', encoding='utf-8') as f:
        f.write(css_content)
    
    print(f'CSS извлечен: {len(css_content)} символов')
    print(f'Строк: {css_content.count(chr(10))}')
    print('Файл сохранен: css/styles.css')
else:
    print('CSS блок не найден')
