#!/usr/bin/env python3
"""Извлекает оставшиеся небольшие блоки стилей из index.html"""

import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Находим блоки стилей с id
scrollbar_theme_match = re.search(r'<style id="scrollbar-theme">(.*?)</style>', content, re.DOTALL)
buttons_fix_match = re.search(r'<style id="buttons-radius-fix">(.*?)</style>', content, re.DOTALL)

if scrollbar_theme_match and buttons_fix_match:
    scrollbar_content = scrollbar_theme_match.group(1)
    buttons_content = buttons_fix_match.group(1)
    
    # Объединяем в один файл
    combined_css = f"""/* =================================================================== */
/*    ВСТРОЕННЫЕ СТИЛИ (Inline Styles)                                */
/*    Стили, которые были встроены в index.html                       */
/* =================================================================== */

/* Стили для скроллбара (scrollbar-theme) */
{scrollbar_content}

/* Исправление радиуса кнопок (buttons-radius-fix) */
{buttons_content}
"""
    
    # Сохраняем в файл
    with open('css/inline-styles.css', 'w', encoding='utf-8') as f:
        f.write(combined_css)
    
    print(f'Создан файл: css/inline-styles.css')
    print(f'  - scrollbar-theme: {len(scrollbar_content)} символов')
    print(f'  - buttons-radius-fix: {len(buttons_content)} символов')
    
    # Заменяем блоки в index.html на ссылку
    new_content = content
    
    # Заменяем scrollbar-theme
    new_content = re.sub(
        r'<style id="scrollbar-theme">.*?</style>',
        '        <link rel="stylesheet" href="css/inline-styles.css" />',
        new_content,
        flags=re.DOTALL
    )
    
    # Удаляем buttons-radius-fix (уже включен в inline-styles.css)
    new_content = re.sub(
        r'<style id="buttons-radius-fix">.*?</style>\s*',
        '',
        new_content,
        flags=re.DOTALL
    )
    
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print('\nОбновлен index.html: блоки стилей заменены на ссылку')
else:
    print('Не найдены блоки стилей для извлечения')
