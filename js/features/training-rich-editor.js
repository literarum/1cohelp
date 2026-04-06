'use strict';

/**
 * Визуальный редактор текста шага (панель + contenteditable).
 * Пользователь не видит разметку; при сохранении HTML проходит sanitizeTrainingBodyHtml.
 */

import { sanitizeTrainingBodyHtml } from './training-user-curriculum.js';

const DEFAULT_EMPTY = '<p><br></p>';

/**
 * @param {string} label
 * @param {string} iconClass
 * @param {() => void} onActivate
 * @returns {HTMLButtonElement}
 */
function makeToolbarButton(label, iconClass, onActivate) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'training-rich-toolbar-btn';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i>`;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', onActivate);
    return btn;
}

/**
 * @param {HTMLElement} hostEl
 * @param {object} [options]
 * @param {string} [options.ariaLabel]
 * @param {string} [options.placeholder] подсказка для aria (видимый placeholder в CSS)
 */
export function mountTrainingRichEditor(hostEl, options = {}) {
    const ariaLabel = options.ariaLabel || 'Текст материала';
    const placeholder = options.placeholder || '';

    const toolbar = document.createElement('div');
    toolbar.className = 'training-rich-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Форматирование текста');

    const editable = document.createElement('div');
    editable.className = 'training-rich-editable';
    editable.setAttribute('contenteditable', 'true');
    editable.setAttribute('role', 'textbox');
    editable.setAttribute('aria-multiline', 'true');
    editable.setAttribute('aria-label', ariaLabel);
    if (placeholder) editable.setAttribute('data-placeholder', placeholder);

    const runCmd = (cmd, value = null) => {
        editable.focus();
        try {
            document.execCommand(cmd, false, value);
        } catch {
            /* ignore */
        }
    };

    toolbar.appendChild(
        makeToolbarButton('Жирный', 'fas fa-bold', () => runCmd('bold')),
    );
    toolbar.appendChild(
        makeToolbarButton('Курсив', 'fas fa-italic', () => runCmd('italic')),
    );
    const sep1 = document.createElement('span');
    sep1.className = 'training-rich-toolbar-sep';
    sep1.setAttribute('aria-hidden', 'true');
    toolbar.appendChild(sep1);
    toolbar.appendChild(
        makeToolbarButton('Маркированный список', 'fas fa-list-ul', () =>
            runCmd('insertUnorderedList'),
        ),
    );
    toolbar.appendChild(
        makeToolbarButton('Нумерованный список', 'fas fa-list-ol', () =>
            runCmd('insertOrderedList'),
        ),
    );
    const sep2 = document.createElement('span');
    sep2.className = 'training-rich-toolbar-sep';
    sep2.setAttribute('aria-hidden', 'true');
    toolbar.appendChild(sep2);
    toolbar.appendChild(
        makeToolbarButton('Убрать оформление', 'fas fa-remove-format', () => {
            runCmd('removeFormat');
            runCmd('unlink');
        }),
    );

    editable.addEventListener('paste', (e) => {
        e.preventDefault();
        const t = e.clipboardData?.getData('text/plain') ?? '';
        editable.focus();
        try {
            document.execCommand('insertText', false, t);
        } catch {
            /* ignore */
        }
    });

    editable.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            runCmd('bold');
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            runCmd('italic');
        }
    });

    hostEl.appendChild(toolbar);
    hostEl.appendChild(editable);

    return {
        /** @returns {string} санитизированный HTML */
        getHtml() {
            return sanitizeTrainingBodyHtml(editable.innerHTML);
        },
        /** @param {string} html */
        setHtml(html) {
            const clean = sanitizeTrainingBodyHtml(html || '');
            editable.innerHTML = clean && clean.trim() ? clean : DEFAULT_EMPTY;
        },
        focus() {
            editable.focus();
        },
        /** @returns {HTMLDivElement} */
        getEditable() {
            return editable;
        },
        destroy() {
            toolbar.remove();
            editable.remove();
        },
    };
}
