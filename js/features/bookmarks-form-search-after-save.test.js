import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bookmarksFormPath = join(__dirname, 'bookmarks-form.js');
const scriptPath = join(__dirname, '..', '..', 'script.js');

/**
 * После сохранения закладки список должен снова применить фильтр поиска/тегов
 * (loadBookmarks рендерит только по выбранной папке).
 */
describe('bookmarks-form: поиск закладок после сохранения', () => {
    it('после успешного save вызываются loadBookmarks и затем filterBookmarks', () => {
        const src = readFileSync(bookmarksFormPath, 'utf8');
        expect(src).toMatch(/filterBookmarks\s*=\s*deps\.filterBookmarks/);
        const successIdx = src.indexOf('if (saveSuccessful)');
        expect(successIdx).toBeGreaterThan(-1);
        const tail = src.slice(successIdx);
        const loadIdx = tail.indexOf('await loadBookmarks()');
        const filterIdx = tail.indexOf('await filterBookmarks()');
        expect(loadIdx).toBeGreaterThan(-1);
        expect(filterIdx).toBeGreaterThan(-1);
        expect(filterIdx).toBeGreaterThan(loadIdx);
    });

    it('script.js передаёт filterBookmarks в setBookmarksFormDependencies', () => {
        const src = readFileSync(scriptPath, 'utf8');
        const block = src.match(/setBookmarksFormDependencies\(\{[\s\S]*?\}\);/);
        expect(block).toBeTruthy();
        expect(block[0]).toMatch(/\bfilterBookmarks\b/);
    });
});
