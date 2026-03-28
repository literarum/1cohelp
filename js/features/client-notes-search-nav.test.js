'use strict';

import { describe, it, expect } from 'vitest';
import {
    findFirstWholeInnOccurrence,
    findFirstCaseInsensitiveSubstring,
    extractWholeInnsFromText,
    buildAppealNotesDigitQuerySuggestions,
    digitsRunFromSearchQuery,
} from './client-notes-search-nav.js';

describe('findFirstWholeInnOccurrence', () => {
    it('returns null for invalid inn length', () => {
        expect(findFirstWholeInnOccurrence('123', '123')).toBeNull();
        expect(findFirstWholeInnOccurrence('x', '1234567890')).toBeNull();
    });

    it('finds 10-digit INN with word boundaries', () => {
        const t = 'Клиент ИНН 7707083893 звонил';
        expect(findFirstWholeInnOccurrence(t, '7707083893')).toEqual({
            start: 11,
            end: 21,
        });
    });

    it('finds 10-digit substring inside a longer digit run (первое вхождение)', () => {
        const t = '7707083893123456';
        expect(findFirstWholeInnOccurrence(t, '7707083893')).toEqual({ start: 0, end: 10 });
    });

    it('finds 12-digit INN', () => {
        const inn = '770708389301';
        const t = `ИНН ${inn} ок`;
        expect(findFirstWholeInnOccurrence(t, inn)).toEqual({ start: 4, end: 16 });
    });

    it('finds INN written with spaces between digit groups', () => {
        const inn = '7707083893';
        const t = 'Клиент 77 07 083 893 звонил';
        expect(findFirstWholeInnOccurrence(t, inn)).toEqual({ start: 7, end: 20 });
    });
});

describe('extractWholeInnsFromText / extractTenTwelveDigitSequencesFromText', () => {
    it('собирает все окна 10 и 12 цифр из длинных блоков и отдельные совпадения', () => {
        const t = 'x 7707083893 и 770708389301 y 7707083893';
        const got = extractWholeInnsFromText(t);
        expect(got).toContain('7707083893');
        expect(got).toContain('770708389301');
        // из блока из 12 цифр — ещё два окна по 10
        expect(got).toContain('7070838930');
        expect(got).toContain('0708389301');
    });

    it('находит 10 цифр после схлопывания пробелов/дефисов', () => {
        const got = extractWholeInnsFromText('ИНН 77-07 083 893 в базе');
        expect(got).toContain('7707083893');
    });
});

describe('buildAppealNotesDigitQuerySuggestions', () => {
    it('returns suggestions for digit prefix via notesOverride', () => {
        const notes = 'Клиент ИНН 7707083893';
        const rows = buildAppealNotesDigitQuerySuggestions('77070', notes);
        expect(rows.length).toBe(1);
        expect(rows[0].type).toBe('clientNote');
        expect(rows[0].highlightTerm).toBe('7707083893');
        expect(rows[0].title).toContain('обращен');
    });

    it('extracts digit run from mixed query (ИНН + цифры)', () => {
        const notes = 'ИНН 7707083893';
        const rows = buildAppealNotesDigitQuerySuggestions('ИНН 77070', notes);
        expect(rows.length).toBe(1);
        expect(rows[0].highlightTerm).toBe('7707083893');
    });

    it('returns empty for non-digit query', () => {
        expect(buildAppealNotesDigitQuerySuggestions('налог', '7707083893')).toEqual([]);
    });

    it('подсказка по одной цифре-префиксу и любой 10-значной последовательности (не ИНН)', () => {
        const rows = buildAppealNotesDigitQuerySuggestions('8', 'тел 8123456789 офис');
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows[0].highlightTerm).toBe('8123456789');
        expect(rows[0].description).toMatch(/10 цифр/);
    });

    it('matches INN in notes when digits are separated by spaces', () => {
        const rows = buildAppealNotesDigitQuerySuggestions('77070', 'ИНН 77 07 083 893');
        expect(rows.length).toBe(1);
        expect(rows[0].highlightTerm).toBe('7707083893');
    });
});

describe('digitsRunFromSearchQuery', () => {
    it('strips non-digits', () => {
        expect(digitsRunFromSearchQuery('ИНН: 7707')).toBe('7707');
    });
});

describe('findFirstCaseInsensitiveSubstring', () => {
    it('matches case-insensitively', () => {
        expect(findFirstCaseInsensitiveSubstring('AbCdEf', 'bcd')).toEqual({
            start: 1,
            end: 4,
        });
    });

    it('returns null when missing', () => {
        expect(findFirstCaseInsensitiveSubstring('abc', 'xyz')).toBeNull();
    });
});
