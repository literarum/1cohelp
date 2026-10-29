/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ items: [] }));
vi.mock('../db/indexeddb.js', async (original) => ({
    ...(await original()),
    countInIndexedDB: vi.fn(async () => fixture.items.length),
    maxKeyInIndexedDB: vi.fn(async () => fixture.items.length),
    getStoreVersion: vi.fn(() => 1),
    forEachBatchInStore: vi.fn(async (_store, consume) => consume(fixture.items)),
    getAllFromIndexedDB: vi.fn(async () => []),
}));
vi.mock('../utils/virtual-grid.js', () => ({
    decorateCardForView: vi.fn(),
    createVirtualGrid: ({ container, renderItem }) => ({
        setItems(items) { container.replaceChildren(...items.map((item, i) => renderItem(item, i, 'list'))); },
        destroy: vi.fn(),
    }),
}));

import { filterBookmarks, invalidateBookmarksCache, handleBookmarkAction, setBookmarksDependencies } from './bookmarks.js';

describe('bookmark semantic matches', () => {
    beforeEach(() => {
        fixture.items = [
            { id: 1, title: 'ЭЦП руководителя', description: '', dateAdded: 1 },
            { id: 2, title: 'Установка сертификата', description: '', url: 'https://example.com/certificate', dateAdded: 2 },
            { id: 3, title: 'Курс валют', description: '', dateAdded: 3 },
        ];
        invalidateBookmarksCache();
        document.body.innerHTML = '<input id="bookmarkSearchInput" value="эцп"><select id="bookmarkFolderFilter"><option value="">Все</option></select><div id="bookmarksContainer" data-default-view="list"></div>';
        setBookmarksDependencies({ State: { viewPreferences: { bookmarksContainer: 'list' } } });
    });

    it('shows a clearly marked semantic subset and returns to all results without changing the query', async () => {
        await filterBookmarks();
        const semantic = document.querySelector('.bookmark-item[data-id="2"]');
        expect(semantic?.dataset.searchMatch).toBe('semantic');
        expect(semantic?.textContent).toContain('Близко по смыслу');
        expect(document.querySelector('.bookmark-item[data-id="1"]')?.dataset.searchMatch).toBe('exact');
        const toggle = document.querySelector('#bookmarkSearchHint .search-hint-semantic');
        expect(toggle).not.toBeNull();
        toggle.click();
        await vi.waitFor(() => expect(document.querySelectorAll('.bookmark-item')).toHaveLength(1));
        expect(document.querySelector('.bookmark-item').dataset.id).toBe('2');
        expect(document.getElementById('bookmarkSearchInput').value).toBe('эцп');
        expect(document.querySelector('.search-hint-semantic').getAttribute('aria-pressed')).toBe('true');
        document.querySelector('.search-hint-semantic').click();
        await vi.waitFor(() => expect(document.querySelectorAll('.bookmark-item')).toHaveLength(2));
    });

    it('keeps standard edit and open actions available on semantic results', async () => {
        const edit = vi.fn();
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        setBookmarksDependencies({ State: { viewPreferences: {} }, showEditBookmarkModal: edit });
        await filterBookmarks();
        const button = document.querySelector('.bookmark-item[data-id="2"] [data-action="edit"]');
        const event = new MouseEvent('click', { bubbles: true });
        Object.defineProperty(event, 'target', { value: button });
        await handleBookmarkAction(event);
        expect(edit).toHaveBeenCalledWith(2);
        const link = document.querySelector('.bookmark-item[data-id="2"] [data-action="open-link-icon"]');
        const openEvent = new MouseEvent('click', { bubbles: true });
        Object.defineProperty(openEvent, 'target', { value: link });
        await handleBookmarkAction(openEvent);
        expect(open).toHaveBeenCalledWith('https://example.com/certificate', '_blank', 'noopener,noreferrer');
        open.mockRestore();
    });

    it('resets the subset when the query changes', async () => {
        await filterBookmarks();
        document.querySelector('.search-hint-semantic')?.click();
        await vi.waitFor(() => expect(document.querySelectorAll('.bookmark-item')).toHaveLength(1));
        document.getElementById('bookmarkSearchInput').value = 'валют';
        await filterBookmarks();
        expect(document.querySelector('.bookmark-item').dataset.id).toBe('3');
        expect(document.querySelector('.search-hint-semantic')).toBeNull();
    });

    it('returns to exact results when editing removes the last semantic match', async () => {
        await filterBookmarks();
        document.querySelector('.search-hint-semantic').click();
        await vi.waitFor(() => expect(document.querySelectorAll('.bookmark-item')).toHaveLength(1));
        fixture.items = fixture.items.filter((item) => item.id !== 2);
        await filterBookmarks({ force: true });
        expect(document.querySelectorAll('.bookmark-item')).toHaveLength(1);
        expect(document.querySelector('.bookmark-item').dataset.id).toBe('1');
        expect(document.querySelector('.search-hint-semantic')).toBeNull();
    });
});
