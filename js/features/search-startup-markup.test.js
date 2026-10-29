/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initSearchSystem } from './search.js';

function mountActualSearchInput() {
    const source = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    const input = parsed.getElementById('searchInput');
    document.body.innerHTML = `${input.outerHTML}<button id="clearSearchInputBtn" type="button"></button><div id="searchResults" class="hidden"></div>`;
    return document.getElementById('searchInput');
}

describe('global search startup contract', () => {
    it('explicitly requests no browser form autocomplete for transient search text', () => {
        const input = mountActualSearchInput();
        expect(input.getAttribute('autocomplete')).toBe('off');
        expect(input.defaultValue).toBe('');
    });

    it('initializes a clean field without injecting diagnostic text', () => {
        const input = mountActualSearchInput();
        initSearchSystem();
        expect(input.value).toBe('');
    });

    it('preserves a real query already entered before initialization, including 100', () => {
        const input = mountActualSearchInput();
        input.value = '100';
        initSearchSystem();
        expect(input.value).toBe('100');
        expect(document.getElementById('clearSearchInputBtn').classList.contains('hidden')).toBe(false);
    });
});
