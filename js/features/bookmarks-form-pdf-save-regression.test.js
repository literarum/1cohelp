import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bookmarksFormPath = join(__dirname, 'bookmarks-form.js');

/**
 * Регрессия: при сохранении новой закладки с черновыми PDF addPdfRecords не должен
 * вызываться дважды (иначе в IndexedDB появляются дубликаты одного файла).
 */
describe('bookmarks-form: PDF при сохранении закладки', () => {
    it('handleBookmarkFormSubmit вызывает addPdfRecords ровно один раз', () => {
        const src = readFileSync(bookmarksFormPath, 'utf8');
        const start = src.indexOf('export async function handleBookmarkFormSubmit');
        expect(start).toBeGreaterThan(-1);
        const nextExport = src.indexOf('\nexport ', start + 1);
        const fnSrc = nextExport === -1 ? src.slice(start) : src.slice(start, nextExport);
        const matches = fnSrc.match(/await addPdfRecords\(/g);
        expect(matches?.length ?? 0).toBe(1);
    });
});
