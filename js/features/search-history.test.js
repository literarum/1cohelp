import { describe, it, expect, beforeEach } from 'vitest';
import { pushQuery, recordSearchQuery, readSearchHistory, HISTORY_MAX } from './search-history.js';

describe('search-history', () => {
    beforeEach(() => localStorage.clear());
    it('новые сверху, без повторов, ограничение длины', () => {
        let l = [];
        for (const q of ['инн', 'ЭЦП', 'инн', 'x']) l = pushQuery(l, q);
        expect(l).toEqual(['инн', 'ЭЦП']);
        for (let i = 0; i < 20; i++) l = pushQuery(l, `q${i}`);
        expect(l).toHaveLength(HISTORY_MAX);
    });
    it('сохранение в localStorage', () => {
        recordSearchQuery('рутокен');
        expect(readSearchHistory()).toEqual(['рутокен']);
    });
});
