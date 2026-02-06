#!/usr/bin/env python3
"""
Скрипт для автоматического извлечения CSS стилей и HTML шаблонов из index.html
"""

import re
import os
from pathlib import Path

def extract_css_sections(content):
    """Извлекает CSS стили из блока <style>"""
    style_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
    if not style_match:
        return None
    
    css_content = style_match.group(1)
    
    # Разделяем CSS на секции по комментариям
    sections = {}
    current_section = None
    current_content = []
    
    lines = css_content.split('\n')
    for line in lines:
        # Проверяем начало новой секции
        if '/*' in line and '*/' in line:
            # Сохраняем предыдущую секцию
            if current_section:
                sections[current_section] = '\n'.join(current_content)
            
            # Определяем название секции
            if 'CSS Переменные' in line or 'variables' in line.lower():
                current_section = 'variables'
            elif 'Базовые стили' in line or 'base' in line.lower():
                current_section = 'base'
            elif 'Модальные окна' in line or 'modal' in line.lower():
                current_section = 'modals'
            elif 'скроллбар' in line.lower() or 'scrollbar' in line.lower():
                current_section = 'scrollbar'
            elif 'Табы' in line or 'tab' in line.lower():
                current_section = 'tabs'
            elif 'поиск' in line.lower() or 'search' in line.lower():
                current_section = 'search'
            elif 'Анимации' in line or 'animation' in line.lower():
                current_section = 'animations'
            elif 'ТЕМИЗАЦИИ' in line or 'theming' in line.lower():
                current_section = 'theming'
            elif 'Сортируемые списки' in line or 'sortable' in line.lower():
                current_section = 'components'
            elif 'Color Picker' in line:
                current_section = 'components'
            elif 'Лайтбокс' in line or 'lightbox' in line.lower():
                current_section = 'components'
            elif 'Прочие компоненты' in line:
                current_section = 'components'
            else:
                current_section = 'components'
            
            current_content = [line]
        else:
            current_content.append(line)
    
    # Сохраняем последнюю секцию
    if current_section:
        sections[current_section] = '\n'.join(current_content)
    
    return sections

def extract_html_templates(content):
    """Извлекает HTML шаблоны компонентов"""
    templates = {}
    
    # Извлекаем header
    header_match = re.search(r'(<header[^>]*>.*?</header>)', content, re.DOTALL)
    if header_match:
        templates['header'] = header_match.group(1)
    
    # Извлекаем табы
    tabs_match = re.search(r'(<!-- Навигация по вкладкам -->.*?</nav>)', content, re.DOTALL)
    if tabs_match:
        templates['tabs'] = tabs_match.group(1)
    
    # Извлекаем модальные окна
    modal_patterns = {
        'algorithm-modal': r'(<div[^>]*id="algorithmModal"[^>]*>.*?</div>\s*</div>)',
        'edit-modal': r'(<div[^>]*id="editModal"[^>]*>.*?</div>\s*</div>)',
        'add-modal': r'(<div[^>]*id="addModal"[^>]*>.*?</div>\s*</div>)',
        'bookmark-modal': r'(<div[^>]*id="bookmarkModal"[^>]*>.*?</div>\s*</div>)',
        'reglament-modal': r'(<div[^>]*id="reglamentModal"[^>]*>.*?</div>\s*</div>)',
        'hotkeys-modal': r'(<div[^>]*id="hotkeysModal"[^>]*>.*?</div>\s*</div>)',
        'cib-link-modal': r'(<div[^>]*id="cibLinkModal"[^>]*>.*?</div>\s*</div>)',
        'confirm-clear-data-modal': r'(<div[^>]*id="confirmClearDataModal"[^>]*>.*?</div>\s*</div>)',
        'customize-ui-modal': r'(<div[^>]*id="customizeUIModal"[^>]*>.*?</div>\s*</div>)',
    }
    
    for name, pattern in modal_patterns.items():
        match = re.search(pattern, content, re.DOTALL)
        if match:
            templates[name] = match.group(1)
    
    return templates

def main():
    # Читаем index.html
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Создаем директории
    os.makedirs('css/base', exist_ok=True)
    os.makedirs('css/components', exist_ok=True)
    os.makedirs('templates/components', exist_ok=True)
    os.makedirs('templates/modals', exist_ok=True)
    
    # Извлекаем CSS
    css_sections = extract_css_sections(content)
    if css_sections:
        # Сохраняем CSS файлы
        css_mapping = {
            'variables': 'css/base/variables.css',
            'base': 'css/base/base.css',
            'modals': 'css/components/modals.css',
            'scrollbar': 'css/components/scrollbar.css',
            'tabs': 'css/components/tabs.css',
            'search': 'css/components/search.css',
            'animations': 'css/components/animations.css',
            'theming': 'css/components/theming.css',
            'components': 'css/components/components.css',
        }
        
        for section, css_content in css_sections.items():
            filepath = css_mapping.get(section, f'css/components/{section}.css')
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(css_content)
            print(f'Создан файл: {filepath}')
    
    # Извлекаем HTML шаблоны
    html_templates = extract_html_templates(content)
    if html_templates:
        template_mapping = {
            'header': 'templates/components/header.html',
            'tabs': 'templates/components/tabs.html',
        }
        
        for name, html_content in html_templates.items():
            if name in template_mapping:
                filepath = template_mapping[name]
            elif 'modal' in name:
                filepath = f'templates/modals/{name}.html'
            else:
                filepath = f'templates/components/{name}.html'
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(html_content)
            print(f'Создан файл: {filepath}')
    
    print('\nИзвлечение завершено!')

if __name__ == '__main__':
    main()
