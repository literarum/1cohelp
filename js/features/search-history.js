'use strict';

/**
 * История запросов глобального поиска: при фокусе на пустом поле — недавние запросы.
 * Запрос запоминается, когда по нему открыли результат (значит, он был полезен).
 */

import { escapeHtml } from '../utils/html.js';

export const HISTORY_KEY = 'copilot.searchHistory.v1';
export const HISTORY_MAX = 8;

export function readSearchHistory() {
    try {
        const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, HISTORY_MAX) : [];
    } catch {
        return [];
    }
}

/** Добавить запрос в начало, без повторов (без учёта регистра), не больше HISTORY_MAX. */
export function pushQuery(list, query) {
    const q = String(query || '').trim().slice(0, 120);
    if (q.length < 2) return list;
    const rest = list.filter((x) => x.toLowerCase() !== q.toLowerCase());
    return [q, ...rest].slice(0, HISTORY_MAX);
}

export function recordSearchQuery(query) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(pushQuery(readSearchHistory(), query)));
    } catch {
        /* ignore */
    }
}

export function clearSearchHistory() {
    try {
        localStorage.removeItem(HISTORY_KEY);
    } catch {
        /* ignore */
    }
}

/**
 * @param {HTMLInputElement} input
 * @param {HTMLElement} container #searchResults
 */
export function attachSearchHistory(input, container) {
    if (!input || !container) return;
    const show = () => {
        if (input.value.trim()) return;
        const list = readSearchHistory();
        if (!list.length) return;
        container.innerHTML = `<div class="search-semantic-header px-3 py-1.5 text-xs font-semibold uppercase tracking-wide flex justify-between items-center"><span>Недавние запросы</span><button type="button" class="sh-clear" data-sh-clear>Очистить</button></div><ul>${list
            .map((q) => `<li class="search-result-item p-3 cursor-pointer sh-item" tabindex="0" data-sh-q="${escapeHtml(q)}"><i class="fas fa-clock-rotate-left mr-2 opacity-60" aria-hidden="true"></i>${escapeHtml(q)}</li>`)
            .join('')}</ul>`;
        container.classList.remove('hidden');
    };
    input.addEventListener('focus', show);
    input.addEventListener('input', () => {
        if (!input.value.trim()) show();
    });
    container.addEventListener('click', (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t) return;
        if (t.closest('[data-sh-clear]')) {
            e.stopPropagation();
            clearSearchHistory();
            container.classList.add('hidden');
            container.innerHTML = '';
            input.focus();
            return;
        }
        const item = t.closest('[data-sh-q]');
        if (!item) return;
        e.stopPropagation();
        input.value = item.getAttribute('data-sh-q');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
    });
}
