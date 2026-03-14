'use strict';

import { describe, expect, it } from 'vitest';
import { __bookmarksPdfExportTestables } from './bookmarks-pdf-export.js';

describe('bookmarks-pdf-export testables', () => {
    const { buildFolderNameMap, resolveFolderName, getDescriptionParagraphsForExport } =
        __bookmarksPdfExportTestables;

    it('buildFolderNameMap stores names by folder id', () => {
        const map = buildFolderNameMap([
            { id: 7, name: 'Важное' },
            { id: '8', name: 'Инструкции' },
        ]);

        expect(map.get('7')).toBe('Важное');
        expect(map.get('8')).toBe('Инструкции');
    });

    it('resolveFolderName returns mapped folder name instead of raw id', () => {
        const map = buildFolderNameMap([{ id: 7, name: 'Важное' }]);
        expect(resolveFolderName(7, map)).toBe('Важное');
    });

    it('resolveFolderName has readable fallback for archive folder', () => {
        expect(resolveFolderName('archive', new Map())).toBe('Архив');
    });

    it('getDescriptionParagraphsForExport never truncates long text', () => {
        const longText = `Начало ${'ДлинныйТекст '.repeat(80)} Конец`;
        const parts = getDescriptionParagraphsForExport(longText);
        const merged = parts.join('\n\n');

        expect(merged).toBe(longText);
        expect(merged.includes('...')).toBe(false);
        expect(parts.length).toBeGreaterThan(0);
    });
});
