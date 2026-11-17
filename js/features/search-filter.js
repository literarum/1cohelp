'use strict';

/**
 * Фильтр выпадающего списка глобального поиска по разделам: «Все · Алгоритмы · Закладки · …».
 * Показывается, когда результатов достаточно и они из двух и более групп.
 * Выбранная группа запоминается до конца сессии и применяется к следующим запросам,
 * если в новых результатах она есть.
 */

export const SEARCH_GROUPS = Object.freeze([
    { id: 'algorithms', label: 'Алгоритмы', types: ['algorithm', 'main'] },
    { id: 'bookmarks', label: 'Закладки', types: ['bookmark', 'bookmark_note', 'bookmarkFolder'] },
    { id: 'links', label: 'Ссылки и ресурсы', types: ['link', 'extLink', 'extLinkCategory'] },
    { id: 'reglaments', label: 'Регламенты', types: ['reglament'] },
    {
        id: 'clients',
        label: 'Клиенты',
        types: ['clientAnalyticsRecord', 'blacklistedClient', 'clientNote'],
    },
]);
const OTHER = { id: 'other', label: 'Прочее' };
export const MIN_RESULTS_FOR_FILTER = 5;

/** Группа результата по его типу. */
export function searchGroupOf(type) {
    for (const g of SEARCH_GROUPS) if (g.types.includes(type)) return g.id;
    return OTHER.id;
}

/** Счётчики по группам в порядке SEARCH_GROUPS (+ «Прочее» в конце). */
export function countSearchGroups(types) {
    const counts = new Map();
    for (const t of types) {
        const g = searchGroupOf(t);
        counts.set(g, (counts.get(g) || 0) + 1);
    }
    return [...SEARCH_GROUPS, OTHER]
        .filter((g) => counts.has(g.id))
        .map((g) => ({ id: g.id, label: g.label, count: counts.get(g.id) }));
}

let activeGroup = 'all';

export function resetSearchFilter() {
    activeGroup = 'all';
}

function apply(container, group) {
    activeGroup = group;
    container.querySelectorAll('li.search-result-item').forEach((li) => {
        li.hidden = group !== 'all' && li.dataset.group !== group;
    });
    // Заголовок «Похожие по смыслу» прячем, если под ним не осталось видимых пунктов.
    container.querySelectorAll('li.search-semantic-header').forEach((hd) => {
        let next = hd.nextElementSibling;
        let any = false;
        while (next) {
            if (next.classList.contains('search-result-item') && !next.hidden) {
                any = true;
                break;
            }
            next = next.nextElementSibling;
        }
        hd.hidden = !any;
    });
    container.querySelectorAll('[data-search-filter]').forEach((b) => {
        const on = b.getAttribute('data-search-filter') === group;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
    });
}

/**
 * Добавить панель фильтров в контейнер результатов (вызывается после отрисовки списка).
 * @param {HTMLElement} container #searchResults
 */
export function attachSearchFilter(container) {
    if (!container) return;
    container.querySelector('.search-filter-bar')?.remove();
    const items = Array.from(container.querySelectorAll('li.search-result-item'));
    items.forEach((li) => {
        li.dataset.group = searchGroupOf(li.dataset.type);
    });
    const groups = countSearchGroups(items.map((li) => li.dataset.type));
    if (items.length < MIN_RESULTS_FOR_FILTER || groups.length < 2) {
        activeGroup = 'all';
        return;
    }
    const bar = document.createElement('div');
    bar.className = 'search-filter-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Фильтр результатов по разделам');
    const chip = (id, label, count) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'search-filter-chip';
        b.setAttribute('data-search-filter', id);
        b.setAttribute('aria-pressed', 'false');
        b.textContent = label;
        if (count !== null) {
            const n = document.createElement('span');
            n.className = 'search-filter-count';
            n.textContent = String(count);
            b.appendChild(n);
        }
        return b;
    };
    bar.appendChild(chip('all', 'Все', items.length));
    for (const g of groups) bar.appendChild(chip(g.id, g.label, g.count));
    // mousedown: не забирать фокус у поля поиска (иначе список закроется по blur).
    bar.addEventListener('mousedown', (e) => e.preventDefault());
    bar.addEventListener('click', (e) => {
        const b = e.target instanceof Element ? e.target.closest('[data-search-filter]') : null;
        if (!b) return;
        e.stopPropagation();
        apply(container, b.getAttribute('data-search-filter'));
    });
    container.insertBefore(bar, container.firstChild);
    const keep = activeGroup !== 'all' && groups.some((g) => g.id === activeGroup);
    apply(container, keep ? activeGroup : 'all');
}
