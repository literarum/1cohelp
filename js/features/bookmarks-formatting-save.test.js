import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { State } from '../app/state.js';
import { handleBookmarkFormSubmit, setBookmarksFormDependencies } from './bookmarks-form.js';

let db;
const read = () =>
    new Promise((resolve, reject) => {
        const r = db.transaction('bookmarks').objectStore('bookmarks').getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
beforeEach(async () => {
    const factory = new IDBFactory();
    db = await new Promise((resolve, reject) => {
        const r = factory.open('bookmark-formatting', 1);
        r.onupgradeneeded = () => {
            r.result.createObjectStore('bookmarks', { keyPath: 'id', autoIncrement: true });
            r.result.createObjectStore('screenshots', { keyPath: 'id', autoIncrement: true });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
    State.db = db;
    setBookmarksFormDependencies({
        State,
        ARCHIVE_FOLDER_ID: 'archive',
        showNotification: vi.fn(),
        addPdfRecords: vi.fn(),
        updateSearchIndex: vi.fn().mockResolvedValue(),
        loadBookmarks: vi.fn().mockResolvedValue(),
        filterBookmarks: vi.fn().mockResolvedValue(),
        getVisibleModals: () => [],
    });
    document.body.innerHTML =
        '<div id="bookmarkModal"><form id="bookmarkForm"><input name="bookmarkId"><input name="bookmarkTitle" value="Formatting"><input name="bookmarkUrl"><textarea name="bookmarkDescription">Hello world</textarea><input type="hidden" name="bookmarkDescriptionHtml"><select name="bookmarkFolder"><option value=""></option></select><input name="bookmarkTags"></form><button id="saveBookmarkBtn">Сохранить</button></div>';
});
afterEach(() => {
    db.close();
    State.db = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('bookmark formatting actual save transaction', () => {
    it('persists sanitized rich content and readable search text through the real form and IndexedDB', async () => {
        const form = document.querySelector('form');
        form.elements.bookmarkDescriptionHtml.value =
            '<p><strong>Hello</strong> world<script>alert(1)</script></p>';
        await handleBookmarkFormSubmit({ target: form, preventDefault() {} });
        const [record] = await read();
        expect(record.description).toBe('Hello world');
        expect(record.descriptionHtml).toContain('<strong>Hello</strong>');
        expect(record.descriptionHtml).not.toContain('script');
    });
    it('rejects a text-only bookmark containing empty rich markup instead of stale textarea content', async () => {
        const form = document.querySelector('form');
        form.elements.bookmarkDescriptionHtml.value = '<p><br></p>';
        await handleBookmarkFormSubmit({ target: form, preventDefault() {} });
        expect(await read()).toHaveLength(0);
    });
    it('keeps legacy plain form submissions readable without requiring a rich field', async () => {
        const form = document.querySelector('form');
        form.elements.bookmarkDescriptionHtml.remove();
        await handleBookmarkFormSubmit({ target: form, preventDefault() {} });
        expect((await read())[0].description).toBe('Hello world');
    });
});
