import { describe, it, expect, beforeEach } from 'vitest';
import { readChecklist, writeChecklist, formatProgress, initMainChecklist } from './main-checklist.js';

describe('main-checklist', () => {
    beforeEach(() => localStorage.clear());
    it('хранение и формат прогресса', () => {
        writeChecklist(new Set([2, 0]));
        expect([...readChecklist()]).toEqual([0, 2]);
        writeChecklist(new Set());
        expect(readChecklist().size).toBe(0);
        expect(formatProgress(2, 6)).toBe('Пройдено 2 из 6');
    });
    it('кнопки появляются у шагов, клик отмечает, новое обращение сбрасывает', async () => {
        document.body.innerHTML = '<div><div id="mainAlgorithm"><div class="algorithm-step" data-step-index="0">A</div><div class="algorithm-step" data-step-index="1">B</div></div></div>';
        initMainChecklist();
        const btn = document.querySelector('[data-step-index="1"] .mc-toggle');
        expect(document.querySelectorAll('.mc-toggle')).toHaveLength(2);
        btn.click();
        expect([...readChecklist()]).toEqual([1]);
        expect(document.querySelector('[data-step-index="1"]').classList.contains('mc-done')).toBe(true);
        expect(document.getElementById('mainChecklistBar').textContent).toContain('Пройдено 1 из 2');
        document.dispatchEvent(new CustomEvent('copilot1co:new-appeal'));
        expect(readChecklist().size).toBe(0);
    });
});
