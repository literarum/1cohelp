#!/usr/bin/env python3
"""Извлекает оставшиеся небольшие блоки стилей из index.html"""

import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Находим все блоки <style>
style_matches = list(re.finditer(r'<style[^>]*>(.*?)</style>', content, re.DOTALL))

if style_matches:
    print(f'Найдено блоков <style>: {len(style_matches)}')
    
    # Первый блок - scrollbar-theme (id="scrollbar-theme")
    # Второй блок - buttons-radius-fix (id="buttons-radius-fix")
    # Третий блок - tailwind config (встроенный)
    
    for i, match in enumerate(style_matches):
        style_content = match.group(1)
        start_tag = match.group(0)[:match.group(0).index('>') + 1]
        
        # Определяем тип стиля
        if 'scrollbar-theme' in start_tag:
            print(f'\nБлок {i+1}: scrollbar-theme ({len(style_content)} символов)')
        elif 'buttons-radius-fix' in start_tag:
            print(f'Блок {i+1}: buttons-radius-fix ({len(style_content)} символов)')
        elif 'tailwind.config' in style_content:
            print(f'Блок {i+1}: tailwind config (оставляем в HTML)')
        else:
            print(f'Блок {i+1}: неизвестный ({len(style_content)} символов)')
else:
    print('Блоки <style> не найдены')
