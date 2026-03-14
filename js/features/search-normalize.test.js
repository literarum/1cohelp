'use strict';

import { describe, expect, it } from 'vitest';
import {
    stemWord,
    normalizeTextForIndex,
    tokenizeNormalized,
    suggestTokenVariants,
} from './search-normalize.js';

describe('search-normalize stemWord', () => {
    it('нормализует ё в е', () => {
        expect(stemWord('отчёт')).toBe('отчет');
    });

    it('приводит отчёт/отчёты к одной основе', () => {
        const stem1 = stemWord('отчет');
        const stem2 = stemWord('отчеты');
        expect(stem1).toBe(stem2);
        expect(stem2).toBe('отчет');
    });

    it('приводит налог/налоговая к одной основе', () => {
        const stem1 = stemWord('налог');
        const stem2 = stemWord('налоговая');
        expect(stem1).toBe('налог');
        expect(stem2).toBe('налог');
    });

    it('короткие слова не укорачивает ниже 2 символов', () => {
        expect(stemWord('1с')).toBe('1с');
        expect(stemWord('фн')).toBe('фн');
    });

    it('возвращает пустую строку для пустого/не строки', () => {
        expect(stemWord('')).toBe('');
        expect(stemWord(null)).toBe('');
        expect(stemWord(undefined)).toBe('');
    });
});

describe('search-normalize normalizeTextForIndex', () => {
    it('нижний регистр и ё→е', () => {
        expect(normalizeTextForIndex('Отчёт')).toBe('отчет');
    });

    it('убирает лишние символы, оставляет дефис/подчёркивание', () => {
        expect(normalizeTextForIndex('1С-Отчетность')).toContain('1с');
        expect(normalizeTextForIndex('word_word')).toContain('word');
    });
});

describe('search-normalize tokenizeNormalized', () => {
    it('возвращает стеммы и префиксы', () => {
        const tokens = tokenizeNormalized('отчёты отчёт');
        expect(tokens).toContain('отчет');
        expect(tokens.some((t) => t.startsWith('отч'))).toBe(true);
    });

    it('разбивает по дефису и индексирует части', () => {
        const tokens = tokenizeNormalized('какой-то текст');
        expect(tokens.length).toBeGreaterThan(0);
        expect(tokens.some((t) => t === 'какой' || t === 'текст')).toBe(true);
    });

    it('пустая строка даёт пустой массив', () => {
        expect(tokenizeNormalized('')).toEqual([]);
        expect(tokenizeNormalized(null)).toEqual([]);
    });
});

describe('search-normalize suggestTokenVariants', () => {
    it('возвращает не более maxVariants вариантов с одной заменой', () => {
        const v = suggestTokenVariants('отчет', 2);
        expect(v.length).toBeLessThanOrEqual(2);
        v.forEach((s) => {
            expect(s.length).toBe(5);
            let diff = 0;
            for (let i = 0; i < 5; i++) if (s[i] !== 'отчет'[i]) diff++;
            expect(diff).toBe(1);
        });
    });

    it('короткий токен (< 3) даёт пустой массив', () => {
        expect(suggestTokenVariants('аб', 2)).toEqual([]);
    });

    it('длинный токен (> 8) даёт пустой массив', () => {
        expect(suggestTokenVariants('оченьдлинноеслово', 2)).toEqual([]);
    });
});
