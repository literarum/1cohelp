'use strict';

/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { extractPdfContent } from '../services/export.js';
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

describe('bookmarks PDF — скриншоты в массовом и общем DOM', () => {
    const { appendBookmarkScreenshotsForPdfExport, buildAllBookmarksExportElement } =
        __bookmarksPdfExportTestables;

    function tinyPngBlob() {
        const b64 =
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return new Blob([bin], { type: 'image/png' });
    }

    it('appendBookmarkScreenshotsForPdfExport добавляет .export-pdf-image-container с data URL', async () => {
        const host = document.createElement('div');
        await appendBookmarkScreenshotsForPdfExport(host, [
            { parentType: 'bookmark', blob: tinyPngBlob() },
        ]);
        const img = host.querySelector('.export-pdf-image-container img');
        expect(img).toBeTruthy();
        expect(img.getAttribute('src') || img.src).toMatch(/data:image\/png/i);
    });

    it('buildAllBookmarksExportElement встраивает скриншоты для extractPdfContent (массовый сценарий)', async () => {
        const bookmarks = [
            { id: 42, title: 'T1', description: 'Описание', url: 'https://example.com' },
        ];
        const pdfsByBookmarkId = new Map([['42', [{ filename: 'a.pdf', size: 100 }]]]);
        const screenshotsByBookmarkId = new Map([
            ['42', [{ parentType: 'bookmark', blob: tinyPngBlob() }]],
        ]);
        const root = await buildAllBookmarksExportElement(
            bookmarks,
            pdfsByBookmarkId,
            screenshotsByBookmarkId,
            new Map(),
        );
        const blocks = extractPdfContent(root);
        const imageBlocks = blocks.filter((b) => b.type === 'block' && b.images?.length);
        expect(imageBlocks.length).toBeGreaterThanOrEqual(1);
        expect(String(imageBlocks[0].images[0])).toMatch(/data:image\/png/i);
    });

    it('пустой список скриншотов не добавляет контейнер изображений', async () => {
        const host = document.createElement('div');
        await appendBookmarkScreenshotsForPdfExport(host, []);
        expect(host.querySelector('.export-pdf-image-container')).toBeNull();
    });
});
