/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setupClearButton } from '../utils/helpers.js';

function mountLinkSearch() {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const source = new DOMParser().parseFromString(html, 'text/html');
    const input = source.getElementById('linkSearchInput');
    const button = source.getElementById('clearLinkSearchInputBtn');
    document.body.innerHTML = `<div id="appContent">${input.parentElement.outerHTML}</div>`;
    const style = document.createElement('style');
    style.dataset.searchClearTest = '';
    style.textContent = readFileSync(resolve(process.cwd(), 'css/components/search.css'), 'utf8');
    document.head.appendChild(style);
    return {
        input: document.getElementById(input.id),
        button: document.getElementById(button.id),
    };
}

afterEach(() => {
    document.querySelectorAll('[data-search-clear-test]').forEach((el) => el.remove());
    document.body.innerHTML = '';
});

describe('1C links search clear control', () => {
    it('keeps vertical centering independent of press transforms', () => {
        const { button } = mountLinkSearch();
        // Press/reduced-motion effects replace transform; centering must survive both.
        expect(getComputedStyle(button).translate).toBe('0 -50%');
        for (const transform of ['scale(0.97)', 'none']) {
            button.style.transform = transform;
            expect(getComputedStyle(button).translate).toBe('0 -50%');
        }
    });

    it('retains the real clear action and returns focus to the input', () => {
        const { input, button } = mountLinkSearch();
        setupClearButton(input.id, button.id);
        input.value = '100';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(button.classList.contains('hidden')).toBe(false);
        button.click();
        expect(input.value).toBe('');
        expect(button.classList.contains('hidden')).toBe(true);
        expect(document.activeElement).toBe(input);
    });
});
