'use strict';

import { escapeRegExp } from './helpers.js';

// ============================================================================
// УТИЛИТЫ ДЛЯ РАБОТЫ С HTML И ТЕКСТОМ
// ============================================================================

/**
 * Экранирует HTML символы в тексте
 */
export function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Алиас для escapeHtml (для совместимости)
 */
export const escapeHTML = escapeHtml;

/**
 * Нормализует сломанные HTML сущности в тексте
 */
export function normalizeBrokenEntities(text) {
    if (typeof text !== 'string') return '';
    let s = text;
    s = s.replace(/&qt;/gi, '>');
    s = s
        .replace(/&(amp;)+gt;|&gt;|&#0*62;|&#x0*3e;/gi, '>')
        .replace(/&(amp;)+lt;|&lt;|&#0*60;|&#x0*3c;/gi, '<')
        .replace(/&(amp;)+quot;|&quot;|&#0*34;|&#x0*22;/gi, '"')
        .replace(/&(amp;)+/gi, '&');
    return s;
}

/**
 * Декодирует базовые HTML сущности один раз
 */
export function decodeBasicEntitiesOnce(s) {
    if (typeof s !== 'string') return '';
    return s
        .replace(/&(amp;)+gt;|&gt;|&#0*62;|&#x0*3e;/gi, '>')
        .replace(/&(amp;)+lt;|&lt;|&#0*60;|&#x0*3c;/gi, '<')
        .replace(/&(amp;)+quot;|&quot;|&#0*34;|&#x0*22;/gi, '"')
        .replace(/&(amp;)+/gi, '&');
}

/**
 * Обрезает текст до указанной длины
 */
export function truncateText(text, maxLength) {
    if (!text || typeof text !== 'string') return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '…';
}

/**
 * Подсвечивает токены в тексте
 */
export function highlightText(text, tokensToHighlight) {
    if (!text) return '';
    if (!tokensToHighlight || tokensToHighlight.length === 0) return escapeHTML(text);

    const escapedTokens = tokensToHighlight.map((token) =>
        token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );

    escapedTokens.sort((a, b) => b.length - a.length);

    const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');

    return escapeHTML(text).replace(regex, '<mark>$1</mark>');
}

/**
 * Подсвечивает текст в строке по поисковому термину
 */
export function highlightTextInString(text, searchTerm) {
    if (!text || !searchTerm) return escapeHtml(text);

    const escapedText = escapeHtml(text);
    const escapedTerm = escapeRegExp(searchTerm);
    const regex = new RegExp(`(${escapedTerm})`, 'gi');

    return escapedText.replace(regex, '<mark class="search-term-highlight">$1</mark>');
}

/**
 * Подсвечивает элемент и текст внутри него
 */
export function highlightElement(element, searchTerm) {
    if (!element) return;

    document.querySelectorAll('.search-highlight-active').forEach((el) => {
        if (el !== element) {
            el.classList.remove('search-highlight-active', 'search-highlight-pulse');
            if (el._highlightTimerId) clearTimeout(el._highlightTimerId);
            delete el._highlightTimerId;
            if (el._pulseTimerId) clearTimeout(el._pulseTimerId);
            delete el._pulseTimerId;
        }
    });

    if (element._highlightTimerId) clearTimeout(element._highlightTimerId);
    if (element._pulseTimerId) clearTimeout(element._pulseTimerId);
    element.classList.remove('search-highlight-active', 'search-highlight-pulse');

    element.classList.add('search-highlight-active');
    element.classList.add('search-highlight-pulse');

    element._pulseTimerId = setTimeout(() => {
        element.classList.remove('search-highlight-pulse');
        delete element._pulseTimerId;
    }, 1500);

    element._highlightTimerId = setTimeout(() => {
        element.classList.remove('search-highlight-active');
        delete element._highlightTimerId;
        console.log(`Подсветка элемента (классы) удалена для элемента:`, element);
    }, 5000);

    if (searchTerm && typeof searchTerm === 'string' && searchTerm.trim() !== '') {
        highlightTextInElement(element, searchTerm);
    }
}

/**
 * Подсвечивает текст внутри элемента
 */
export function highlightTextInElement(element, searchTerm) {
    if (!element || !searchTerm || typeof searchTerm !== 'string' || searchTerm.trim() === '') {
        return;
    }

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) {
        if (node.nodeValue.trim()) {
            textNodes.push(node);
        }
    }

    textNodes.forEach((textNode) => {
        const parent = textNode.parentNode;
        if (!parent) return;

        const text = textNode.nodeValue;
        const highlighted = highlightTextInString(text, searchTerm);

        if (highlighted !== escapeHtml(text)) {
            const wrapper = document.createElement('span');
            wrapper.innerHTML = highlighted;
            parent.replaceChild(wrapper, textNode);
        }
    });
}

/**
 * Преобразует URL и email в кликабельные ссылки
 */
export function linkify(text) {
    if (!text) return '';

    const combinedPattern =
        /(https?:\/\/[^\s"']*[^\s"',.?!')\]}])|([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g;

    const parts = [];
    let lastIndex = 0;

    text.replace(combinedPattern, (match, url, email, offset) => {
        if (offset > lastIndex) {
            parts.push({ type: 'text', content: text.substring(lastIndex, offset) });
        }

        if (url) {
            parts.push({ type: 'url', content: url });
        } else if (email) {
            parts.push({ type: 'email', content: email });
        }

        lastIndex = offset + match.length;
        return match;
    });

    if (lastIndex < text.length) {
        parts.push({ type: 'text', content: text.substring(lastIndex) });
    }

    if (parts.length === 0) {
        return escapeHtml(text).replace(/\n/g, '<br>');
    }

    return parts
        .map((part) => {
            if (part.type === 'text') {
                return escapeHtml(part.content).replace(/\n/g, '<br>');
            }

            if (part.type === 'url') {
                const safeUrl = escapeHtml(part.content);
                return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">${safeUrl}</a>`;
            }

            if (part.type === 'email') {
                const safeEmail = escapeHtml(part.content);
                return `<a href="mailto:${safeEmail}" style="color: #3b82f6; text-decoration: underline;">${safeEmail}</a>`;
            }
            return '';
        })
        .join('');
}

/**
 * Нормализует строку URL закладки/внешней ссылки (как в карточке закладки).
 * @returns {string} Абсолютный href или пустая строка при ошибке разбора.
 */
export function normalizeExternalHttpUrl(raw) {
    if (typeof raw !== 'string') return '';
    let fixed = raw.trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
    if (!fixed) return '';
    if (!fixed.match(/^https?:\/\//i)) {
        fixed = 'https://' + fixed;
    }
    try {
        return new URL(fixed).href;
    } catch {
        return '';
    }
}

/**
 * Блок «Ссылка» для модалки деталей закладки (DOM API, безопасный href).
 * @returns {HTMLElement|null}
 */
export function createBookmarkDetailUrlSectionElement(rawUrl) {
    const href = normalizeExternalHttpUrl(rawUrl);
    if (!href || typeof document === 'undefined') return null;
    let hostname = '';
    try {
        hostname = new URL(href).hostname;
    } catch {
        return null;
    }
    const section = document.createElement('section');
    section.className =
        'bookmark-detail-url-section mb-4 pb-4 border-b border-gray-200 dark:border-gray-600';
    section.setAttribute('aria-labelledby', 'bookmarkDetailUrlHeading');

    const h3 = document.createElement('h3');
    h3.id = 'bookmarkDetailUrlHeading';
    h3.className =
        'text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2';
    h3.textContent = 'Ссылка';

    const p = document.createElement('p');
    p.className = 'text-sm m-0';

    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className =
        'text-primary hover:underline break-all inline-flex items-start gap-1.5 max-w-full';
    const icon = document.createElement('i');
    icon.className = 'fas fa-external-link-alt mt-0.5 opacity-75 flex-shrink-0';
    icon.setAttribute('aria-hidden', 'true');
    a.appendChild(icon);
    a.appendChild(document.createTextNode(hostname));

    p.appendChild(a);
    section.appendChild(h3);
    section.appendChild(p);
    return section;
}
