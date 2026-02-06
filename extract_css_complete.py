#!/usr/bin/env python3
"""
Улучшенный скрипт для извлечения CSS стилей из index.html по секциям
"""

import re
import os

def extract_css_by_sections(content):
    """Извлекает CSS стили, разделяя их по секциям"""
    style_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
    if not style_match:
        return {}
    
    css_content = style_match.group(1)
    
    # Определяем границы секций по комментариям
    sections = {
        'modals': [],
        'scrollbar': [],
        'tabs': [],
        'search': [],
        'components': [],
        'animations': [],
        'theming': []
    }
    
    current_section = None
    lines = css_content.split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Определяем секцию по комментариям
        if '/* ----------------------------------- */' in line:
            # Следующая строка содержит название секции
            if i + 1 < len(lines):
                next_line = lines[i + 1].lower()
                if 'модальные окна' in next_line or 'modal' in next_line:
                    current_section = 'modals'
                elif 'скроллбар' in next_line or 'scrollbar' in next_line:
                    current_section = 'scrollbar'
                elif 'табы' in next_line or 'tab' in next_line:
                    current_section = 'tabs'
                elif 'поиск' in next_line or 'search' in next_line:
                    current_section = 'search'
                elif 'анимации' in next_line or 'animation' in next_line:
                    current_section = 'animations'
                elif 'темизаци' in next_line or 'theming' in next_line:
                    current_section = 'theming'
                elif any(x in next_line for x in ['сортируемые', 'color picker', 'лайтбокс', 'прочие компоненты', 'таймер']):
                    current_section = 'components'
        
        # Добавляем строку в текущую секцию
        if current_section:
            sections[current_section].append(line)
        elif '/* =================================================================== */' in line:
            # Начало новой большой секции
            if 'КОМПОНЕНТЫ' in line or 'Components' in line:
                current_section = 'components'
            elif 'ТЕМИЗАЦИИ' in line or 'Theming' in line:
                current_section = 'theming'
            elif 'УТИЛИТЫ' in line or 'Utilities' in line:
                current_section = 'animations'
        
        i += 1
    
    # Объединяем строки в текст для каждой секции
    result = {}
    for section, lines_list in sections.items():
        if lines_list:
            result[section] = '\n'.join(lines_list)
    
    return result

def main():
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()
    
    css_sections = extract_css_by_sections(content)
    
    # Создаем директории
    os.makedirs('css/components', exist_ok=True)
    
    # Сохраняем файлы
    file_mapping = {
        'modals': 'css/components/modals.css',
        'scrollbar': 'css/components/scrollbar.css',
        'tabs': 'css/components/tabs.css',
        'search': 'css/components/search.css',
        'components': 'css/components/components.css',
        'animations': 'css/components/animations.css',
        'theming': 'css/components/theming.css',
    }
    
    for section, css_text in css_sections.items():
        if section in file_mapping:
            filepath = file_mapping[section]
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(css_text)
            print(f'Создан файл: {filepath} ({len(css_text)} символов)')
    
    print(f'\nИзвлечено {len(css_sections)} секций CSS')

if __name__ == '__main__':
    main()
