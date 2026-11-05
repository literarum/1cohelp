import { describe, it, expect } from 'vitest';
import { createBookmarkElement } from '../components/bookmarks.js';
import {
    normalizeLegacyImportData,
    buildBackupIntegrityBlockWithHashes,
    verifyBackupStoreHashes,
} from './import-export.js';
import { buildStoreRecordSnapshot } from '../history/store-record-history.js';
import { __bookmarksPdfExportTestables } from './bookmarks-pdf-export.js';
import { extractPdfContent } from '../services/export.js';

const sample = {
    id: 7,
    title: 'Rich text',
    description: 'Код\t111\nСтатус\tНет данных',
    descriptionHtml:
        '<table><tbody><tr><th>Код</th><td><b>111</b></td></tr><tr><th>Статус</th><td style="color:#c53030">Нет данных</td></tr></tbody></table>',
};
describe('bookmark formatting consumer compatibility', () => {
    it('keeps quote-bearing description and title text inside tooltip attributes in both views', () => {
        const text = '" onmouseover="window.__BOOKMARK_XSS=1" data-review="';
        for (const mode of ['cards', 'list']) {
            const card = createBookmarkElement(
                {
                    ...sample,
                    title: text,
                    description: text,
                    descriptionHtml: '<p>' + text + '</p>',
                },
                {},
                mode,
            );
            expect(card.querySelector('[onmouseover],[data-review]')).toBeNull();
            expect(card.querySelector('h3').getAttribute('title')).toBe(text);
            expect(card.querySelector('.bookmark-description').getAttribute('title')).toBe(text);
        }
    });
    it('renders formatting in card mode and keeps a readable plain list preview', () => {
        const card = createBookmarkElement(sample, {}, 'cards');
        expect(card.querySelector('.bookmark-rich-content td b').textContent).toBe('111');
        const list = createBookmarkElement(sample, {}, 'list');
        expect(list.textContent).toContain('Нет данных');
        expect(list.textContent).not.toContain('<table>');
    });
    it('sanitizes rich markup at the actual card rendering boundary', () => {
        const card = createBookmarkElement(
            {
                ...sample,
                descriptionHtml:
                    '<p onclick="x()">Safe</p><img src=x onerror="x()"><script>x()</script>',
            },
            {},
            'cards',
        );
        expect(card.querySelector('.bookmark-rich-content').textContent).toBe('Safe');
        expect(card.querySelector('img,script,[onclick],[onerror]')).toBeNull();
    });
    it('retains rich content through JSON import normalization, integrity hashing and history snapshots', async () => {
        const data = normalizeLegacyImportData(JSON.parse(JSON.stringify({ bookmarks: [sample] })));
        expect(data.bookmarks[0].descriptionHtml).toBe(sample.descriptionHtml);
        const integrity = await buildBackupIntegrityBlockWithHashes(data);
        const backup = JSON.parse(JSON.stringify({ schemaVersion: '1.7', data, integrity }));
        expect((await verifyBackupStoreHashes(backup, backup.data)).ok).toBe(true);
        backup.data.bookmarks[0].descriptionHtml = '<p>Changed after export</p>';
        expect((await verifyBackupStoreHashes(backup, backup.data)).ok).toBe(false);
        expect(
            (await buildStoreRecordSnapshot('bookmarks', data.bookmarks[0])).record.descriptionHtml,
        ).toBe(sample.descriptionHtml);
    });
    it('keeps all formatted-note text and table cell values in the existing PDF path', async () => {
        const root = await __bookmarksPdfExportTestables.buildAllBookmarksExportElement(
            [sample],
            new Map(),
            new Map(),
            new Map(),
        );
        const text = extractPdfContent(root)
            .map((block) => block.text || '')
            .join('\n');
        for (const value of ['Код', '111', 'Статус', 'Нет данных']) expect(text).toContain(value);
        expect(text).not.toContain('<table>');
    });
});
