/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { showUnsavedConfirmModal } from './unsaved-confirm-modal.js';

describe('Окно «Выйти без сохранения?»: Esc', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <input id="field" />
            <div id="unsavedConfirmModal" class="hidden">
              <h2 id="unsavedConfirmModalTitle">?</h2><p id="unsavedConfirmModalMessage"></p>
              <button id="unsavedConfirmCancelBtn">Отмена</button>
              <button id="unsavedConfirmLeaveBtn">Выйти</button>
            </div>`;
    });

    it('Esc разрешает Promise значением false, даже если глобальный обработчик Esc останавливает событие', async () => {
        // имитация глобального обработчика горячих клавиш (bubble, stopImmediatePropagation)
        const greedy = (e) => {
            if (e.key === 'Escape') e.stopImmediatePropagation();
        };
        document.addEventListener('keydown', greedy);
        const field = document.getElementById('field');
        field.focus();
        const p = showUnsavedConfirmModal();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const res = await Promise.race([p, new Promise((r) => setTimeout(() => r('timeout'), 500))]);
        document.removeEventListener('keydown', greedy);
        expect(res).toBe(false);
        expect(document.getElementById('unsavedConfirmModal').classList.contains('hidden')).toBe(true);
        await new Promise((r) => setTimeout(r, 10));
        expect(document.activeElement).toBe(field);
    });
});
