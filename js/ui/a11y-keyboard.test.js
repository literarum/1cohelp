import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleTablistKeydown, handleFileTriggerKeydown } from './a11y-keyboard.js';

function key(target, k) {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'target', { value: target });
    return e;
}

describe('a11y-keyboard', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        // jsdom не считает раскладку: делаем все элементы «видимыми».
        Element.prototype.getClientRects = () => [{}];
    });

    it('стрелки переключают вкладки по кругу и активируют их', () => {
        document.body.innerHTML = `<div role="tablist">
            <button role="tab" id="a" aria-selected="true">A</button>
            <button role="tab" id="b">B</button>
            <button role="tab" id="c">C</button></div>`;
        const clicks = [];
        document.querySelectorAll('[role=tab]').forEach((t) => t.addEventListener('click', () => clicks.push(t.id)));
        const a = document.getElementById('a');
        expect(handleTablistKeydown(key(a, 'ArrowRight'))).toBe(true);
        expect(handleTablistKeydown(key(a, 'ArrowLeft'))).toBe(true);
        expect(handleTablistKeydown(key(a, 'End'))).toBe(true);
        expect(clicks).toEqual(['b', 'c', 'c']);
        expect(document.activeElement.id).toBe('c');
        expect(handleTablistKeydown(key(a, 'x'))).toBe(false);
    });

    it('Enter на label-кнопке открывает выбор файла', () => {
        document.body.innerHTML = '<label role="button" tabindex="0" data-file-trigger>Импорт<input type="file" class="hidden"></label>';
        const label = document.querySelector('label');
        const input = document.querySelector('input');
        const spy = vi.spyOn(input, 'click');
        expect(handleFileTriggerKeydown(key(label, 'Enter'))).toBe(true);
        expect(spy).toHaveBeenCalledOnce();
        expect(handleFileTriggerKeydown(key(label, 'a'))).toBe(false);
    });
});
