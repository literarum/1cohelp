/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    attachSearchFilter,
    countSearchGroups,
    searchGroupOf,
    resetSearchFilter,
} from './search-filter.js';

function render(types) {
    const c = document.createElement('div');
    c.id = 'searchResults';
    const ul = document.createElement('ul');
    for (const t of types) {
        const li = document.createElement('li');
        li.className = 'search-result-item';
        li.dataset.type = t;
        ul.appendChild(li);
    }
    c.appendChild(ul);
    document.body.replaceChildren(c);
    attachSearchFilter(c);
    return c;
}

describe('фильтр результатов поиска по разделам', () => {
    beforeEach(() => resetSearchFilter());

    it('группы и счётчики', () => {
        expect(searchGroupOf('main')).toBe('algorithms');
        expect(searchGroupOf('blacklistedClient')).toBe('clients');
        expect(searchGroupOf('sedoInfo')).toBe('other');
        expect(countSearchGroups(['link', 'algorithm', 'extLink', 'uiSetting'])).toEqual([
            { id: 'algorithms', label: 'Алгоритмы', count: 1 },
            { id: 'links', label: 'Ссылки и ресурсы', count: 2 },
            { id: 'other', label: 'Прочее', count: 1 },
        ]);
    });

    it('мало результатов или одна группа — без панели', () => {
        expect(render(['link', 'algorithm']).querySelector('.search-filter-bar')).toBeNull();
        expect(render(['link', 'link', 'link', 'link', 'link']).querySelector('.search-filter-bar')).toBeNull();
    });

    it('клик по группе скрывает остальные; выбор переживает новый запрос', () => {
        const c = render(['algorithm', 'link', 'link', 'bookmark', 'reglament', 'main']);
        const chips = [...c.querySelectorAll('[data-search-filter]')].map((b) => b.textContent);
        expect(chips[0]).toBe('Все6');
        c.querySelector('[data-search-filter="algorithms"]').click();
        const visible = [...c.querySelectorAll('li.search-result-item')].filter((li) => !li.hidden);
        expect(visible.map((li) => li.dataset.type)).toEqual(['algorithm', 'main']);
        expect(c.querySelector('[data-search-filter="algorithms"]').getAttribute('aria-pressed')).toBe('true');

        const c2 = render(['algorithm', 'link', 'bookmark', 'bookmark', 'link']);
        expect(c2.querySelectorAll('li.search-result-item:not([hidden])')).toHaveLength(1);
        // группы нет в новых результатах — показываются все
        const c3 = render(['link', 'link', 'bookmark', 'bookmark', 'reglament']);
        expect(c3.querySelectorAll('li.search-result-item:not([hidden])')).toHaveLength(5);
    });
});
