/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleBookmarkAction, setBookmarksDependencies } from './bookmarks.js';

function baseDeps(overrides = {}) {
    return {
        isFavorite: vi.fn(),
        getFavoriteButtonHTML: vi.fn(),
        showAddBookmarkModal: vi.fn(),
        showBookmarkDetail: vi.fn(),
        showOrganizeFoldersModal: vi.fn(),
        showNotification: vi.fn(),
        debounce: vi.fn(),
        setupClearButton: vi.fn(),
        loadFoldersList: vi.fn(),
        removeEscapeHandler: vi.fn(),
        addEscapeHandler: vi.fn(),
        handleSaveFolderSubmit: vi.fn(),
        getAllFromIndex: vi.fn(),
        State: { viewPreferences: {} },
        showEditBookmarkModal: vi.fn(),
        deleteBookmark: vi.fn(),
        showBookmarkDetailModal: vi.fn(),
        handleViewBookmarkScreenshots: vi.fn(),
        NotificationService: {},
        showScreenshotViewerModal: vi.fn(),
        showAppConfirm: vi.fn().mockResolvedValue(false),
        ...overrides,
    };
}

describe('bookmark delete — централизованное подтверждение', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="bookmarksContainer"></div>';
        delete window.showAppConfirm;
    });

    it('вызывает showAppConfirm из deps перед удалением', async () => {
        const showAppConfirm = vi.fn().mockResolvedValue(false);
        setBookmarksDependencies(baseDeps({ showAppConfirm }));

        document.getElementById('bookmarksContainer').innerHTML = `
            <div class="bookmark-item" data-id="42">
                <h3 title="My BM">My BM</h3>
                <button type="button" data-action="delete" class="delete-bookmark"><i></i></button>
            </div>
        `;
        const btn = document.querySelector('[data-action="delete"]');
        const ev = new MouseEvent('click', { bubbles: true });
        Object.defineProperty(ev, 'target', { value: btn, enumerable: true });

        await handleBookmarkAction(ev);

        expect(showAppConfirm).toHaveBeenCalledTimes(1);
        expect(showAppConfirm.mock.calls[0][0].title).toBe('Удаление закладки');
    });

    it('не затирает showAppConfirm повторным setBookmarksDependencies без ключа', async () => {
        const showAppConfirm = vi.fn().mockResolvedValue(false);
        setBookmarksDependencies(baseDeps({ showAppConfirm }));

        const second = baseDeps();
        delete second.showAppConfirm;
        setBookmarksDependencies(second);

        document.getElementById('bookmarksContainer').innerHTML = `
            <div class="bookmark-item" data-id="1">
                <h3>X</h3>
                <button type="button" data-action="delete" class="delete-bookmark"><i></i></button>
            </div>
        `;
        const btn = document.querySelector('[data-action="delete"]');
        const ev = new MouseEvent('click', { bubbles: true });
        Object.defineProperty(ev, 'target', { value: btn, enumerable: true });

        await handleBookmarkAction(ev);

        expect(showAppConfirm).toHaveBeenCalledTimes(1);
    });

    it('резерв: window.showAppConfirm, если модульный dep не функция', async () => {
        const winConfirm = vi.fn().mockResolvedValue(false);
        window.showAppConfirm = winConfirm;

        setBookmarksDependencies(baseDeps({ showAppConfirm: null }));

        document.getElementById('bookmarksContainer').innerHTML = `
            <div class="bookmark-item" data-id="1">
                <h3>X</h3>
                <button type="button" data-action="delete" class="delete-bookmark"><i></i></button>
            </div>
        `;
        const btn = document.querySelector('[data-action="delete"]');
        const ev = new MouseEvent('click', { bubbles: true });
        Object.defineProperty(ev, 'target', { value: btn, enumerable: true });

        await handleBookmarkAction(ev);

        expect(winConfirm).toHaveBeenCalledTimes(1);
    });
});
