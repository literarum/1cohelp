'use strict';

import { describe, it, expect } from 'vitest';
import {
    normalizeInnForBlacklistLookup,
    buildMaxBlacklistLevelByInnMap,
    getBlacklistLevelForClientInn,
    frogBadgeLabelsForLevel,
} from './client-analytics-blacklist-crosscheck.js';

describe('client-analytics-blacklist-crosscheck', () => {
    describe('normalizeInnForBlacklistLookup', () => {
        it('returns 10 or 12 digit compact forms', () => {
            expect(normalizeInnForBlacklistLookup('7707083893')).toBe('7707083893');
            expect(normalizeInnForBlacklistLookup('770708389301')).toBe('770708389301');
        });
        it('strips non-digits when result is valid length', () => {
            expect(normalizeInnForBlacklistLookup('77 07 083893')).toBe('7707083893');
        });
        it('extracts first valid INN from noisy string', () => {
            expect(normalizeInnForBlacklistLookup('ИНН 7707083893 (тест)')).toBe('7707083893');
        });
        it('returns empty for invalid', () => {
            expect(normalizeInnForBlacklistLookup('')).toBe('');
            expect(normalizeInnForBlacklistLookup(null)).toBe('');
            expect(normalizeInnForBlacklistLookup('123')).toBe('');
        });
    });

    describe('buildMaxBlacklistLevelByInnMap', () => {
        it('aggregates max level per INN', () => {
            const m = buildMaxBlacklistLevelByInnMap([
                { inn: '7707083893', level: 1 },
                { inn: '7707083893', level: 3 },
                { inn: '770708389301', level: 2 },
            ]);
            expect(m.get('7707083893')).toBe(3);
            expect(m.get('770708389301')).toBe(2);
        });
        it('defaults invalid level to 1', () => {
            const m = buildMaxBlacklistLevelByInnMap([{ inn: '7707083893', level: 0 }]);
            expect(m.get('7707083893')).toBe(1);
        });
        it('caps level at 3', () => {
            const m = buildMaxBlacklistLevelByInnMap([{ inn: '7707083893', level: 99 }]);
            expect(m.get('7707083893')).toBe(3);
        });
        it('skips entries without inn', () => {
            expect(buildMaxBlacklistLevelByInnMap([{ level: 2 }]).size).toBe(0);
        });
    });

    describe('getBlacklistLevelForClientInn', () => {
        it('returns 0 when no match', () => {
            const map = new Map([['7707083893', 2]]);
            expect(getBlacklistLevelForClientInn('1111111111', map)).toBe(0);
            expect(getBlacklistLevelForClientInn('', map)).toBe(0);
        });
        it('matches normalized client INN', () => {
            const map = new Map([['7707083893', 2]]);
            expect(getBlacklistLevelForClientInn('7707083893', map)).toBe(2);
            expect(getBlacklistLevelForClientInn('77 07 083893', map)).toBe(2);
        });
    });

    describe('frogBadgeLabelsForLevel', () => {
        it('returns labels for 1–3', () => {
            expect(frogBadgeLabelsForLevel(3).short).toContain('Гипер');
            expect(frogBadgeLabelsForLevel(2).short).toContain('2');
            expect(frogBadgeLabelsForLevel(1).short).toContain('1');
        });
    });
});
