import { describe, it, expect } from 'vitest';
import {
    normalizePrefs,
    isInDndWindow,
    makeMuteKey,
    decide,
    DEFAULT_PREFS,
} from './notification-prefs.js';

const at = (h, m = 0) => new Date(2026, 9, 8, h, m, 0);

describe('notification-prefs', () => {
    it('normalizePrefs: мусор превращается в значения по умолчанию, числа ограничиваются', () => {
        const p = normalizePrefs({ durationScale: 99, maxVisible: -4, position: 'nowhere', types: { error: 'yes' } });
        expect(p.durationScale).toBe(3);
        expect(p.maxVisible).toBe(1);
        expect(p.position).toBe(DEFAULT_PREFS.position);
        expect(p.types.error).toBe(true);
        expect(normalizePrefs(null).enabled).toBe(true);
    });

    it('«Не беспокоить»: окно через полночь', () => {
        const dnd = { enabled: true, from: '22:00', to: '08:00' };
        expect(isInDndWindow(dnd, at(23, 30))).toBe(true);
        expect(isInDndWindow(dnd, at(3))).toBe(true);
        expect(isInDndWindow(dnd, at(12))).toBe(false);
        expect(isInDndWindow({ ...dnd, enabled: false }, at(23))).toBe(false);
        expect(isInDndWindow({ enabled: true, from: '10:00', to: '10:00' }, at(10, 30))).toBe(false);
    });

    it('makeMuteKey: числа и ссылки не делают ключ уникальным', () => {
        const a = makeMuteKey({ type: 'error', title: 'Сбой', message: 'Код 500 https://a.ru/x' });
        const b = makeMuteKey({ type: 'error', title: 'Сбой', message: 'Код 404 https://b.ru/y' });
        expect(a).toBe(b);
        expect(makeMuteKey({ suppressKey: 'k1' })).toBe('k1');
    });

    it('decide: ошибки проходят в «Не беспокоить», заглушённые не показываются, прогресс — всегда', () => {
        const base = normalizePrefs({ dnd: { enabled: true, from: '22:00', to: '08:00' } });
        expect(decide(base, { type: 'info' }, at(23)).show).toBe(false);
        expect(decide(base, { type: 'error' }, at(23)).show).toBe(true);
        const key = makeMuteKey({ type: 'error', title: 'X', message: 'Y' });
        const muted = normalizePrefs({ muted: { [key]: { label: 'X', type: 'error', ts: 1 } } });
        expect(decide(muted, { type: 'error', title: 'X', message: 'Y' }).reason).toBe('muted');
        const off = normalizePrefs({ enabled: false });
        expect(decide(off, { type: 'progress' }).show).toBe(true);
        expect(decide(off, { type: 'error', force: true }).show).toBe(true);
        expect(decide(off, { type: 'error' }).reason).toBe('disabled');
    });
});
