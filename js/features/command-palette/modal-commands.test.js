'use strict';

import { describe, it, expect } from 'vitest';
import { getModalPaletteResults } from './modal-commands.js';

describe('getModalPaletteResults', () => {
    it('returns empty when no query and not @modal filter', () => {
        expect(getModalPaletteResults('', null, 20)).toEqual([]);
    });

    it('returns many entries for @modal with empty search', () => {
        const r = getModalPaletteResults('', 'modal', 20);
        expect(r.length).toBeGreaterThan(5);
        expect(r[0].type).toBe('modal');
        expect(r[0].payload.modalKey).toBeTruthy();
    });

    it('matches modal by keyword', () => {
        const r = getModalPaletteResults('слияние', null, 20);
        expect(r.some((x) => x.payload.modalKey === 'dbMerge')).toBe(true);
    });
});
