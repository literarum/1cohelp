'use strict';

import { describe, expect, it } from 'vitest';
import { effectiveMinGlobalScoreForPaletteQuery } from './search.js';
import { MIN_GLOBAL_SCORE } from './constants.js';

describe('effectiveMinGlobalScoreForPaletteQuery', () => {
    it('для одного слова возвращает MIN_GLOBAL_SCORE', () => {
        expect(effectiveMinGlobalScoreForPaletteQuery('алгоритм')).toBe(MIN_GLOBAL_SCORE);
    });

    it('для двух и более слов снижает порог, но не ниже 8', () => {
        const v = effectiveMinGlobalScoreForPaletteQuery('налоговая декларация');
        expect(v).toBeGreaterThanOrEqual(8);
        expect(v).toBeLessThan(MIN_GLOBAL_SCORE);
    });
});
