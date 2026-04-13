import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    addRecentlyDeletedRecord,
    buildRecentlyDeletedRecord,
    clearRecentlyDeletedBinWithUserConfirm,
    listRecentlyDeletedRecords,
    permanentlyRemoveRecentlyDeletedEntryWithUserConfirm,
    RECENTLY_DELETED_CLEAR_BIN_CONFIRM_MESSAGE,
    restoreRecentlyDeletedRecord,
    setRecentlyDeletedDependencies,
} from './recently-deleted.js';
import { RECENTLY_DELETED_STORE_NAME } from '../constants.js';
import {
    deleteFromIndexedDB,
    getAllFromIndexedDB,
    getFromIndexedDB,
    performDBOperation,
    saveToIndexedDB,
} from '../db/indexeddb.js';

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

    it('dedupes list by storeName+entityId keeping newest deletedAt', async () => {
        getAllFromIndexedDB.mockResolvedValueOnce([
            {
                id: 1,
                storeName: 'bookmarks',
                entityId: '5',
                deletedAt: '2020-01-01T10:00:00.000Z',
                payload: { id: 5, title: 'Old' },
            },
            {
                id: 2,
                storeName: 'bookmarks',
                entityId: '5',
                deletedAt: '2020-01-03T10:00:00.000Z',
                payload: { id: 5, title: 'Newer' },
            },
            {
                id: 3,
                storeName: 'links',
                entityId: '5',
                deletedAt: '2020-01-02T10:00:00.000Z',
                payload: { id: 5 },
            },
        ]);

        const list = await listRecentlyDeletedRecords();

        expect(list).toHaveLength(2);
        const bm = list.filter((e) => e.storeName === 'bookmarks');
        expect(bm).toHaveLength(1);
        expect(bm[0].deletedAt).toBe('2020-01-03T10:00:00.000Z');
        expect(bm[0].payload.title).toBe('Newer');
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

    it('buildRecentlyDeletedRecord returns a plain object without writing DB', () => {
        const payload = { id: 'a1', title: 'Algo', steps: [] };
        const rec = buildRecentlyDeletedRecord({
            storeName: 'algorithms',
            entityId: 'a1',
            payload,
            context: { section: 'skzi' },
            reason: 'delete_algorithm',
        });
        expect(rec).toMatchObject({
            storeName: 'algorithms',
            entityId: 'a1',
            reason: 'delete_algorithm',
            context: { section: 'skzi' },
        });
        expect(rec.payload).toEqual(payload);
        expect(rec.deletedAt).toBeTruthy();
        expect(rec).not.toHaveProperty('id');
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
        expect(saveToIndexedDB).toHaveBeenCalledWith('bookmarks', {
            id: 11,
            title: 'Restored bookmark',
        });
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

    it('permanent bin delete does not touch IndexedDB when user cancels confirm', async () => {
        const showAppConfirm = vi.fn().mockResolvedValue(false);
        setRecentlyDeletedDependencies({ showAppConfirm, showNotification: vi.fn() });
        getFromIndexedDB.mockResolvedValueOnce({
            id: 7,
            storeName: 'bookmarks',
            entityId: '1',
            payload: { id: 1, title: 'Hello' },
        });

        const r = await permanentlyRemoveRecentlyDeletedEntryWithUserConfirm(7);

        expect(r).toEqual({ removed: false, cancelled: true });
        expect(showAppConfirm).toHaveBeenCalledTimes(1);
        expect(deleteFromIndexedDB).not.toHaveBeenCalled();
    });

    it('permanent bin delete removes row after confirm', async () => {
        const showAppConfirm = vi.fn().mockResolvedValue(true);
        setRecentlyDeletedDependencies({ showAppConfirm });
        getFromIndexedDB.mockResolvedValueOnce({
            id: 7,
            storeName: 'bookmarks',
            entityId: '1',
            payload: { id: 1, title: 'Hello' },
        });
        deleteFromIndexedDB.mockResolvedValueOnce(undefined);

        const r = await permanentlyRemoveRecentlyDeletedEntryWithUserConfirm(7);

        expect(r).toEqual({ removed: true, cancelled: false });
        expect(deleteFromIndexedDB).toHaveBeenCalledWith(RECENTLY_DELETED_STORE_NAME, 7);
    });

    it('clear bin does not run store.clear when user cancels', async () => {
        const showAppConfirm = vi.fn().mockResolvedValue(false);
        setRecentlyDeletedDependencies({ showAppConfirm });

        const r = await clearRecentlyDeletedBinWithUserConfirm();

        expect(r).toEqual({ cleared: false, cancelled: true });
        expect(performDBOperation).not.toHaveBeenCalled();
    });

    it('clear bin runs store clear after confirm', async () => {
        const showAppConfirm = vi.fn().mockResolvedValue(true);
        setRecentlyDeletedDependencies({ showAppConfirm });
        performDBOperation.mockResolvedValueOnce(undefined);

        const r = await clearRecentlyDeletedBinWithUserConfirm();

        expect(r).toEqual({ cleared: true, cancelled: false });
        expect(performDBOperation).toHaveBeenCalled();
        expect(showAppConfirm).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Безвозвратное удаление',
                confirmText: 'Удалить безвозвратно',
                message: RECENTLY_DELETED_CLEAR_BIN_CONFIRM_MESSAGE,
            }),
        );
    });

    it('clear bin uses injected showRecentlyDeletedClearConfirm when provided', async () => {
        const showRecentlyDeletedClearConfirm = vi.fn().mockResolvedValue(true);
        const showAppConfirm = vi.fn();
        setRecentlyDeletedDependencies({ showRecentlyDeletedClearConfirm, showAppConfirm });
        performDBOperation.mockResolvedValueOnce(undefined);

        const r = await clearRecentlyDeletedBinWithUserConfirm();

        expect(r).toEqual({ cleared: true, cancelled: false });
        expect(showRecentlyDeletedClearConfirm).toHaveBeenCalledTimes(1);
        expect(showAppConfirm).not.toHaveBeenCalled();
        expect(performDBOperation).toHaveBeenCalled();
    });
});
