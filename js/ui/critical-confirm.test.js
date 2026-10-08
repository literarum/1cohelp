import { describe, it, expect } from 'vitest';
import { confirmCriticalDeletion } from './critical-confirm.js';

const q = (sel) => document.querySelector(`[data-critical-confirm] ${sel}`);

describe('confirmCriticalDeletion', () => {
    it('требует два шага и флажок', async () => {
        const p = confirmCriticalDeletion({ title: 'Т', what: 'Что', consequences: ['а', 'б'] });
        expect(q('[data-cc-step="1"]').classList.contains('hidden')).toBe(false);
        expect(q('[data-cc-confirm]').classList.contains('hidden')).toBe(true);
        q('[data-cc-next]').click();
        expect(q('[data-cc-step="2"]').classList.contains('hidden')).toBe(false);
        expect(q('[data-cc-confirm]').disabled).toBe(true);
        q('[data-cc-confirm]').click(); // без флажка — игнор
        expect(document.querySelector('[data-critical-confirm]')).not.toBe(null);
        const ack = q('[data-cc-ack]');
        ack.checked = true;
        ack.dispatchEvent(new Event('change'));
        expect(q('[data-cc-confirm]').disabled).toBe(false);
        q('[data-cc-confirm]').click();
        expect(await p).toBe(true);
        expect(document.querySelector('[data-critical-confirm]')).toBe(null);
    });

    it('отмена и Esc возвращают false', async () => {
        const p1 = confirmCriticalDeletion({ title: 'Т', what: 'Что' });
        q('[data-cc-cancel]').click();
        expect(await p1).toBe(false);
        const p2 = confirmCriticalDeletion({ title: 'Т', what: 'Что' });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(await p2).toBe(false);
        expect(document.querySelector('[data-critical-confirm]')).toBe(null);
    });

    it('экранирует HTML в тексте', async () => {
        const p = confirmCriticalDeletion({ title: '<img src=x onerror=alert(1)>', what: '<b>x</b>' });
        expect(document.querySelector('[data-critical-confirm] img')).toBe(null);
        q('[data-cc-close]').click();
        expect(await p).toBe(false);
    });
});
