import { describe, it, expect, vi } from 'vitest';
import { attachSearchResultsKeyboard } from './search-results-keyboard.js';

function setup(n = 3) {
    document.body.innerHTML = `<input id="q"><div id="searchResults"><ul>${Array.from({ length: n }, (_, i) => `<li class="search-result-item" data-i="${i}">R${i}</li>`).join('')}</ul></div>`;
    Element.prototype.scrollIntoView = () => {};
    const input = document.getElementById('q');
    const box = document.getElementById('searchResults');
    attachSearchResultsKeyboard(input, box);
    const press = (key) => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    return { input, box, press };
}

describe('search-results-keyboard', () => {
    it('стрелки двигают выбор по кругу, aria-activedescendant указывает на него', () => {
        const { input, box, press } = setup();
        press('ArrowDown');
        press('ArrowDown');
        const active = box.querySelector('.is-kb-active');
        expect(active.dataset.i).toBe('1');
        expect(input.getAttribute('aria-activedescendant')).toBe(active.id);
        press('ArrowUp');
        press('ArrowUp');
        expect(box.querySelector('.is-kb-active').dataset.i).toBe('2');
    });
    it('Enter открывает выбранный результат и не всплывает дальше', () => {
        const { input, box, press } = setup();
        const onClick = vi.fn();
        box.querySelectorAll('li')[0].addEventListener('click', onClick);
        const other = vi.fn();
        input.addEventListener('keydown', other);
        press('ArrowDown');
        press('Enter');
        expect(onClick).toHaveBeenCalledOnce();
        expect(other).toHaveBeenCalledTimes(1); // только ArrowDown дошёл
    });
    it('Escape скрывает список', () => {
        const { input, box, press } = setup();
        press('Escape');
        expect(box.classList.contains('hidden')).toBe(true);
        expect(input.getAttribute('aria-expanded')).toBe('false');
    });
});
