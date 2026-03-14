import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    addRecentlyDeletedRecord,
    restoreRecentlyDeletedRecord,
    setRecentlyDeletedDependencies,
} from './recently-deleted.js';
import { RECENTLY_DELETED_STORE_NAME } from '../constants.js';
import { deleteFromIndexedDB, getFromIndexedDB, saveToIndexedDB } from '../db/indexeddb.js';

vi.mock('../db/indexeddb.js', () => ({
    getAllFromIndexedDB: vi.fn(),
    getFromIndexedDB: vi.fn(),
    saveToIndexedDB: vi.fn(),
    deleteFromIndexedDB: vi.fn(),
    performDBOperation: vi.fn(),
}));

describe('recently-deleted', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setRecentlyDeletedDependencies({
            showNotification: vi.fn(),
            loadBookmarks: vi.fn(async () => {}),
            renderAllAlgorithms: vi.fn(async () => {}),
        });
    });

    it('stores tracked entity snapshots in recentlyDeleted', async () => {
        saveToIndexedDB.mockResolvedValueOnce(101);
        const payload = { id: 7, title: 'Bookmark title', url: 'https://example.com' };

        const id = await addRecentlyDeletedRecord({
            storeName: 'bookmarks',
            entityId: 7,
            payload,
            reason: 'delete_bookmark',
        });

        expect(id).toBe(101);
        expect(saveToIndexedDB).toHaveBeenCalledWith(
            RECENTLY_DELETED_STORE_NAME,
            expect.objectContaining({
                storeName: 'bookmarks',
                entityId: '7',
                payload,
                reason: 'delete_bookmark',
            }),
        );
    });

    it('ignores untracked stores', async () => {
        const result = await addRecentlyDeletedRecord({
            storeName: 'preferences',
            entityId: 'uiSettings',
            payload: { id: 'uiSettings' },
        });

        expect(result).toBeNull();
        expect(saveToIndexedDB).not.toHaveBeenCalled();
    });

    it('restores regular entries back to source store', async () => {
        getFromIndexedDB.mockResolvedValueOnce({
            id: 9,
            storeName: 'bookmarks',
            entityId: '11',
            payload: { id: 11, title: 'Restored bookmark' },
            deletedAt: new Date().toISOString(),
        });
        saveToIndexedDB.mockResolvedValueOnce(undefined);
        deleteFromIndexedDB.mockResolvedValueOnce(undefined);

        const restored = await restoreRecentlyDeletedRecord(9);

        expect(restored.storeName).toBe('bookmarks');
        expect(saveToIndexedDB).toHaveBeenCalledWith('bookmarks', { id: 11, title: 'Restored bookmark' });
        expect(deleteFromIndexedDB).toHaveBeenCalledWith(RECENTLY_DELETED_STORE_NAME, 9);
    });

    it('restores algorithms by merging into algorithms container', async () => {
        getFromIndexedDB
            .mockResolvedValueOnce({
                id: 12,
                storeName: 'algorithms',
                entityId: 'program-1',
                context: { section: 'program' },
                payload: { id: 'program-1', section: 'program', title: 'Algo restored', steps: [] },
                deletedAt: new Date().toISOString(),
            })
            .mockResolvedValueOnce({
                section: 'all',
                data: { program: [] },
            });
        saveToIndexedDB.mockResolvedValueOnce(undefined);
        deleteFromIndexedDB.mockResolvedValueOnce(undefined);

        await restoreRecentlyDeletedRecord(12);

        expect(saveToIndexedDB).toHaveBeenCalledWith(
            'algorithms',
            expect.objectContaining({
                section: 'all',
                data: expect.objectContaining({
                    program: [expect.objectContaining({ id: 'program-1' })],
                }),
            }),
        );
        expect(deleteFromIndexedDB).toHaveBeenCalledWith(RECENTLY_DELETED_STORE_NAME, 12);
    });
});
