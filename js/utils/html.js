'use strict';

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
    if (typeof text !== 'string') return text;
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
    if (typeof s !== 'string') return s;
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
