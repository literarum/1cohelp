#!/usr/bin/env python3
"""Удаляет большой блок <style> из index.html и заменяет на ссылку на внешний CSS"""

import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Находим все блоки <style>
style_matches = list(re.finditer(r'<style>(.*?)</style>', content, re.DOTALL))

if len(style_matches) > 1:
    # Находим самый большой блок (основные стили)
    largest_match = max(style_matches, key=lambda m: len(m.group(1)))
    
    # Заменяем большой блок на ссылку на внешний CSS
    start_pos = largest_match.start()
    end_pos = largest_match.end()
    
    # Проверяем, что это не первый маленький блок (для иконки)
    if start_pos > 200:  # Первый блок обычно в начале файла
        new_content = (
            content[:start_pos] +
            '        <!-- Основные стили вынесены в отдельный файл -->\n' +
            '        <link rel="stylesheet" href="css/styles.css" />\n' +
            content[end_pos:]
        )
        
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        print(f'Блок стилей удален (позиции {start_pos}-{end_pos})')
        print('Добавлена ссылка на css/styles.css')
    else:
        print('Не найден большой блок стилей для замены')
else:
    print('Не найдено достаточно блоков <style>')
