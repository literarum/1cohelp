'use strict';

/**
 * Строка-подсказка над списком результатов умного поиска:
 *  • «Возможно, вы искали «…»» — нажатие подставляет исправленный запрос;
 *  • «Показаны результаты, близкие по смыслу» — когда точных совпадений нет/мало.
 */
function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * @param {string} hintId id элемента подсказки
 * @param {HTMLElement|null} beforeEl перед каким элементом вставить
 * @param {HTMLInputElement|null} input поле поиска (для подстановки исправленного запроса)
 * @param {{ suggestion?: string|null, semantic?: number, total?: number }|null} info null — скрыть
 */
export function renderSearchHint(hintId, beforeEl, input, info) {
    if (typeof document === 'undefined') return;
    let el = document.getElementById(hintId);
    const parts = [];
    if (info && info.suggestion) {
        parts.push(
            `Возможно, вы искали <button type="button" class="search-hint-apply" data-q="${esc(info.suggestion)}">${esc(info.suggestion)}</button>`,
        );
    }
    if (info && info.semantic > 0) {
        parts.push(
            info.total === info.semantic
                ? 'Точных совпадений нет — показаны близкие по смыслу'
                : `Ещё ${info.semantic} — близкие по смыслу (синонимы, опечатки, контекст)`,
        );
    }
    if (!parts.length || !beforeEl || !beforeEl.parentNode) {
        if (el) el.remove();
        return;
    }
    if (!el) {
        el = document.createElement('div');
        el.id = hintId;
        el.className = 'search-hint';
        el.setAttribute('role', 'status');
        el.addEventListener('click', (e) => {
            const b = e.target.closest && e.target.closest('.search-hint-apply');
            if (!b || !input) return;
            input.value = b.dataset.q || '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
        });
    }
    el.innerHTML = parts.join('<span class="search-hint-sep"> · </span>');
    if (el.nextSibling !== beforeEl) beforeEl.parentNode.insertBefore(el, beforeEl);
}
