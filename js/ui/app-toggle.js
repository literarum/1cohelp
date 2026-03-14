'use strict';

/**
 * Централизованный модуль переключателей в стиле iOS.
 * Стили берутся из app-toggle.css (переменные темы приложения).
 *
 * @param {Object} options
 * @param {string} [options.id] - id для input (для связи с label for="...")
 * @param {string} [options.name] - name для input
 * @param {boolean} [options.checked] - начальное состояние
 * @param {string} [options.labelText] - текст подписи рядом с переключателем
 * @param {boolean} [options.compact] - использовать компактный вариант (.app-toggle--compact)
 * @returns {{ root: HTMLLabelElement, input: HTMLInputElement }}
 */
export function createAppToggle(options = {}) {
    const { id, name, checked = false, labelText = '', compact = false } = options;
    const root = document.createElement('label');
    root.className =
        'app-toggle flex items-center cursor-pointer' + (compact ? ' app-toggle--compact' : '');
    root.setAttribute('for', id || undefined);

    const input = document.createElement('input');
    input.type = 'checkbox';
    if (id) input.id = id;
    if (name) input.name = name;
    input.checked = !!checked;
    input.classList.add('app-toggle-input');

    const track = document.createElement('span');
    track.className = 'app-toggle__track';

    root.appendChild(input);
    root.appendChild(track);
    if (labelText) {
        const span = document.createElement('span');
        span.className = 'ml-3 text-sm text-gray-700 dark:text-gray-300';
        span.textContent = labelText;
        root.appendChild(span);
    }

    return { root, input };
}
