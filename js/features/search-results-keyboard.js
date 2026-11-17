'use strict';

/**
 * Клавиатурная навигация по выпадающему списку глобального поиска (паттерн ARIA combobox):
 * ↓/↑ — выбор результата, Enter — открыть выбранный, Escape — закрыть список.
 * Фокус остаётся в поле ввода (aria-activedescendant), поэтому можно продолжать печатать.
 */

const ITEM_SELECTOR = 'li.search-result-item';
const ACTIVE_CLASS = 'is-kb-active';

function isAnyDialogOpen() {
    return Boolean(
        document.querySelector(
            '[role="dialog"]:not(.hidden):not([hidden]), .modal:not(.hidden), #bookmarkDetailModal:not(.hidden)',
        ),
    );
}

function visibleItems(container) {
    if (!container || container.classList.contains('hidden')) return [];
    // Пункты, скрытые фильтром по разделам, при навигации пропускаются.
    return Array.from(container.querySelectorAll(ITEM_SELECTOR)).filter((li) => !li.hidden);
}

/**
 * @param {HTMLInputElement} input
 * @param {HTMLElement} container
 * @returns {() => void} отключение
 */
export function attachSearchResultsKeyboard(input, container) {
    if (!input || !container) return () => {};
    let activeIndex = -1;
    let idSeq = 0;

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', container.id || 'searchResults');
    input.setAttribute('aria-expanded', 'false');
    container.setAttribute('role', 'listbox');
    container.setAttribute('aria-label', 'Результаты поиска');

    const setActive = (index) => {
        const items = visibleItems(container);
        items.forEach((li) => {
            li.classList.remove(ACTIVE_CLASS);
            li.setAttribute('aria-selected', 'false');
        });
        if (index < 0 || index >= items.length) {
            activeIndex = -1;
            input.removeAttribute('aria-activedescendant');
            return;
        }
        activeIndex = index;
        const li = items[index];
        if (!li.id) li.id = `search-result-opt-${++idSeq}`;
        li.classList.add(ACTIVE_CLASS);
        li.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
    };

    const syncAria = () => {
        const items = visibleItems(container);
        input.setAttribute('aria-expanded', items.length > 0 ? 'true' : 'false');
        // Пока список открыт, уведомления уходят под него (раньше перекрывали правый край).
        document.documentElement.classList.toggle('search-results-open', items.length > 0);
        items.forEach((li) => {
            li.setAttribute('role', 'option');
            if (!li.hasAttribute('aria-selected')) li.setAttribute('aria-selected', 'false');
        });
        container.querySelectorAll('ul').forEach((ul) => ul.setAttribute('role', 'presentation'));
        activeIndex = -1;
        input.removeAttribute('aria-activedescendant');
    };

    const observer =
        typeof MutationObserver === 'function'
            ? new MutationObserver(syncAria)
            : null;
    observer?.observe(container, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });

    const onKeyDown = (e) => {
        if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
        const items = visibleItems(container);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (items.length === 0) return;
            e.preventDefault();
            const delta = e.key === 'ArrowDown' ? 1 : -1;
            const next =
                activeIndex < 0
                    ? delta > 0
                        ? 0
                        : items.length - 1
                    : (activeIndex + delta + items.length) % items.length;
            setActive(next);
            return;
        }
        if (e.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const chosen = items[activeIndex];
            // Выбор сделан: список закрываем, фокус уводим из поля — иначе Escape открытой карточки
            // перехватывался полем поиска, и окно не закрывалось.
            const isHistory = chosen.hasAttribute('data-sh-q');
            chosen.click();
            if (!isHistory) {
                container.classList.add('hidden');
                setActive(-1);
                input.blur();
            }
            return;
        }
        if (e.key === 'Escape' && items.length > 0 && !isAnyDialogOpen()) {
            e.preventDefault();
            e.stopPropagation();
            container.classList.add('hidden');
            setActive(-1);
            input.setAttribute('aria-expanded', 'false');
            document.documentElement.classList.remove('search-results-open');
        }
    };
    // capture: раньше обработчика Enter для поиска ИНН в заметках.
    input.addEventListener('keydown', onKeyDown, true);
    syncAria();

    return () => {
        input.removeEventListener('keydown', onKeyDown, true);
        observer?.disconnect();
    };
}
