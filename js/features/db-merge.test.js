'use strict';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as indexedDbModule from '../db/indexeddb.js';
import { State } from '../app/state.js';
import {
    analyzeMergeData,
    buildMergePlan,
    applyMergePlan,
    setDbMergeDependencies,
    CONFLICT_KIND,
    CONTENT_STORES,
    __dbMergeConflictUiInternals,
    __dbMergeScopeInternals,
    __dbMergeUiInternals,
} from './db-merge.js';

describe('db-merge identity and diff logic', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('classifies identical vs conflicting records correctly for bookmarks', async () => {
        const exportPayload = {
            schemaVersion: '1.5',
            data: {
                bookmarkFolders: [{ id: 1, name: 'Работа' }],
                bookmarks: [
                    {
                        id: 10,
                        title: 'Сайт',
                        url: 'https://example.com/',
                        folder: 1,
                        dateAdded: '2024-01-01T00:00:00.000Z',
                    },
                    {
                        id: 11,
                        title: 'Другой',
                        url: 'https://example.com/other',
                        folder: 1,
                        dateAdded: '2024-01-01T00:00:00.000Z',
                    },
                ],
            },
        };

        const jsonString = JSON.stringify(exportPayload);

        // analyzeMergeData ожидает, что локальные данные уже в IndexedDB.
        // В юнит-тесте моделируем ситуацию «пустой локальной БД» –
        // тогда все записи попадут в importOnly, а identical/conflicts будут пустыми.
        const analysis = await analyzeMergeData(jsonString, {
            stores: ['bookmarkFolders', 'bookmarks'],
        });

        const bookmarksDiff = analysis.storeDiffs.find((d) => d.storeName === 'bookmarks');

        expect(bookmarksDiff).toBeTruthy();
        expect(bookmarksDiff.importOnly.length).toBe(2);
        expect(bookmarksDiff.identical.length).toBe(0);
        expect(bookmarksDiff.conflicts.length).toBe(0);
    });

    it('builds merge plan with per-store policy and explicit conflict resolutions', () => {
        const mockAnalysis = {
            storeDiffs: [
                {
                    storeName: 'bookmarks',
                    localOnly: [],
                    importOnly: [],
                    identical: [],
                    conflicts: [
                        {
                            local: { id: 1, title: 'A' },
                            incoming: { id: 101, title: 'A (new)' },
                            kind: CONFLICT_KIND.CONFLICT,
                        },
                    ],
                },
            ],
        };

        const resolutions = {
            perStorePolicy: { bookmarks: 'keepLocal' },
            conflicts: {
                bookmarks: [{ localId: 1, incomingId: 101, resolution: 'import' }],
            },
        };

        const plan = buildMergePlan(mockAnalysis, resolutions);
        expect(plan.perStore.bookmarks.toInsert.length).toBe(0);
        expect(plan.perStore.bookmarks.toUpdate.length).toBe(1);
    });

    it('exposes CONTENT_STORES with expected entries', () => {
        expect(CONTENT_STORES).toContain('algorithms');
        expect(CONTENT_STORES).toContain('bookmarks');
        expect(CONTENT_STORES).toContain('bookmarkFolders');
        expect(CONTENT_STORES).toContain('favorites');
    });

    it('analyzeMergeData does not throw for older schemaVersion (backward compatibility)', async () => {
        const oldSchemaPayload = {
            schemaVersion: '1.0',
            data: {
                bookmarkFolders: [],
                bookmarks: [{ id: 1, title: 'Old', url: 'https://old.example.com/', folder: 1 }],
            },
        };
        const analysis = await analyzeMergeData(JSON.stringify(oldSchemaPayload), {
            stores: ['bookmarkFolders', 'bookmarks'],
        });
        expect(analysis.schemaVersion).toBe('1.0');
        expect(analysis.expectedSchemaVersion).toBe('1.5');
        expect(analysis.storeDiffs).toBeDefined();
        const bookmarksDiff = analysis.storeDiffs.find((d) => d.storeName === 'bookmarks');
        expect(bookmarksDiff?.importOnly?.length).toBe(1);
    });

    it('normalizes extLinks with legacy string category keys during merge analysis', async () => {
        vi.spyOn(indexedDbModule, 'getAllFromIndexedDB').mockImplementation(async (storeName) => {
            if (storeName === 'extLinkCategories') {
                return [{ id: 10, name: 'Документация' }];
            }
            if (storeName === 'extLinks') {
                return [
                    {
                        id: 1,
                        title: 'Портал',
                        url: 'https://example.com/docs',
                        category: 10,
                    },
                ];
            }
            return [];
        });

        const payload = {
            schemaVersion: '1.0',
            data: {
                extLinkCategories: [{ id: 10, name: 'Документация' }],
                extLinks: [
                    {
                        id: 101,
                        title: 'Портал',
                        url: 'https://example.com/docs',
                        category: 'docs',
                    },
                ],
            },
        };

        const analysis = await analyzeMergeData(JSON.stringify(payload), {
            stores: ['extLinkCategories', 'extLinks'],
        });

        const extLinksDiff = analysis.storeDiffs.find((d) => d.storeName === 'extLinks');
        expect(extLinksDiff).toBeTruthy();
        expect(extLinksDiff?.identical.length).toBe(1);
        expect(extLinksDiff?.importOnly.length).toBe(0);
    });

    it('normalizes legacy bookmark folderId field to folder during merge analysis', async () => {
        vi.spyOn(indexedDbModule, 'getAllFromIndexedDB').mockImplementation(async (storeName) => {
            if (storeName === 'bookmarkFolders') {
                return [{ id: 1, name: 'Работа' }];
            }
            if (storeName === 'bookmarks') {
                return [{ id: 10, title: 'Wiki', url: 'https://example.com/wiki', folder: 1 }];
            }
            return [];
        });

        const payload = {
            schemaVersion: '1.0',
            data: {
                bookmarkFolders: [{ id: 1, name: 'Работа' }],
                bookmarks: [
                    {
                        id: 210,
                        title: 'Wiki',
                        url: 'https://example.com/wiki',
                        folderId: 1,
                    },
                ],
            },
        };

        const analysis = await analyzeMergeData(JSON.stringify(payload), {
            stores: ['bookmarkFolders', 'bookmarks'],
        });
        const bookmarksDiff = analysis.storeDiffs.find((d) => d.storeName === 'bookmarks');
        expect(bookmarksDiff).toBeTruthy();
        expect(bookmarksDiff?.identical.length).toBe(1);
        expect(bookmarksDiff?.importOnly.length).toBe(0);
    });

    it('normalizes legacy screenshot algorithmId field to parent linkage', async () => {
        vi.spyOn(indexedDbModule, 'getAllFromIndexedDB').mockImplementation(async (storeName) => {
            if (storeName === 'screenshots') {
                return [
                    {
                        id: 7,
                        parentType: 'algorithm',
                        parentId: '42',
                    },
                ];
            }
            return [];
        });

        const payload = {
            schemaVersion: '1.0',
            data: {
                screenshots: [
                    {
                        id: 7,
                        algorithmId: 42,
                    },
                ],
            },
        };

        const analysis = await analyzeMergeData(JSON.stringify(payload), {
            stores: ['screenshots'],
        });
        const screenshotsDiff = analysis.storeDiffs.find((d) => d.storeName === 'screenshots');
        expect(screenshotsDiff).toBeTruthy();
        expect(screenshotsDiff?.identical.length).toBe(1);
        expect(screenshotsDiff?.importOnly.length).toBe(0);
    });

    it('does not pass explicit undefined id for parent store inserts in applyMergePlan', async () => {
        State.db = { ready: true };
        setDbMergeDependencies({
            showNotification: vi.fn(),
            loadBookmarks: vi.fn(async () => {}),
            loadExtLinks: vi.fn(async () => {}),
            loadCibLinks: vi.fn(async () => {}),
            renderReglamentCategories: vi.fn(async () => {}),
            buildInitialSearchIndex: vi.fn(async () => {}),
        });

        const saveSpy = vi
            .spyOn(indexedDbModule, 'saveToIndexedDB')
            .mockImplementation(async (_storeName, data) => {
                if (Object.prototype.hasOwnProperty.call(data, 'id') && data.id === undefined) {
                    throw new Error('DataError: invalid undefined id');
                }
                return 777;
            });

        const mergePlan = {
            perStore: {
                bookmarkFolders: {
                    toInsert: [{ record: { id: 101, name: 'Новая папка' } }],
                    toUpdate: [],
                },
            },
        };

        await expect(applyMergePlan(mergePlan)).resolves.toBe(true);
        const firstCall = saveSpy.mock.calls[0];
        expect(firstCall?.[0]).toBe('bookmarkFolders');
        expect(firstCall?.[1]).not.toHaveProperty('id');
        State.db = null;
    });

    it('merges algorithms by sections and replaces conflicting algorithm for preferImport mode', async () => {
        State.db = { ready: true };
        setDbMergeDependencies({
            showNotification: vi.fn(),
            loadBookmarks: vi.fn(async () => {}),
            loadExtLinks: vi.fn(async () => {}),
            loadCibLinks: vi.fn(async () => {}),
            renderReglamentCategories: vi.fn(async () => {}),
            buildInitialSearchIndex: vi.fn(async () => {}),
        });

        const saveSpy = vi
            .spyOn(indexedDbModule, 'saveToIndexedDB')
            .mockImplementation(async () => 1);

        const mergePlan = {
            perStore: {
                algorithms: {
                    mergeMode: 'preferImport',
                    localContainer: {
                        section: 'all',
                        data: {
                            main: { id: 'main', title: 'Main Local', steps: [{ title: 'L' }] },
                            support: [{ id: 'a1', title: 'Локальный' }],
                        },
                    },
                    importContainer: {
                        section: 'all',
                        data: {
                            main: { id: 'main', title: 'Main Import', steps: [{ title: 'I' }] },
                            support: [
                                { id: 'a1', title: 'Импортный' },
                                { id: 'a2', title: 'Новый' },
                            ],
                            sales: [{ id: 's1', title: 'Продажи' }],
                        },
                    },
                    toInsert: [],
                    toUpdate: [],
                },
            },
        };

        await expect(applyMergePlan(mergePlan)).resolves.toBe(true);

        const algorithmsCall = saveSpy.mock.calls.find(([storeName]) => storeName === 'algorithms');
        expect(algorithmsCall).toBeTruthy();
        const savedContainer = algorithmsCall?.[1];
        expect(savedContainer.section).toBe('all');
        expect(savedContainer.data.main.title).toBe('Main Import');
        expect(savedContainer.data.support).toHaveLength(2);
        expect(savedContainer.data.support.find((item) => item.id === 'a1')?.title).toBe('Импортный');
        expect(savedContainer.data.support.find((item) => item.id === 'a2')?.title).toBe('Новый');
        expect(savedContainer.data.sales.find((item) => item.id === 's1')?.title).toBe('Продажи');

        State.db = null;
    });

    it('remaps screenshot parentId for algorithm keepBoth conflict copies', async () => {
        State.db = { ready: true };
        setDbMergeDependencies({
            showNotification: vi.fn(),
            loadBookmarks: vi.fn(async () => {}),
            loadExtLinks: vi.fn(async () => {}),
            loadCibLinks: vi.fn(async () => {}),
            renderReglamentCategories: vi.fn(async () => {}),
            buildInitialSearchIndex: vi.fn(async () => {}),
        });

        const saveSpy = vi
            .spyOn(indexedDbModule, 'saveToIndexedDB')
            .mockImplementation(async (_storeName, _record) => 1);

        const mergePlan = {
            perStore: {
                algorithms: {
                    mergeMode: 'keepBoth',
                    localContainer: {
                        section: 'all',
                        data: {
                            support: [{ id: 'a1', title: 'Локальный' }],
                        },
                    },
                    importContainer: {
                        section: 'all',
                        data: {
                            support: [{ id: 'a1', title: 'Импортный конфликтный' }],
                        },
                    },
                    toInsert: [],
                    toUpdate: [],
                },
                screenshots: {
                    toInsert: [
                        {
                            record: {
                                id: 55,
                                parentType: 'algorithm',
                                parentId: 'a1',
                            },
                        },
                    ],
                    toUpdate: [],
                },
            },
        };

        await expect(applyMergePlan(mergePlan)).resolves.toBe(true);

        const screenshotCall = saveSpy.mock.calls.find(([storeName]) => storeName === 'screenshots');
        expect(screenshotCall).toBeTruthy();
        const savedScreenshot = screenshotCall?.[1];
        expect(savedScreenshot.parentId).toBe('a1__importCopy');
        expect(savedScreenshot).not.toHaveProperty('id');

        State.db = null;
    });

    it('restores pre-merge snapshot when apply fails mid-flight', async () => {
        State.db = {
            ready: true,
            objectStoreNames: {
                contains: () => true,
            },
        };
        setDbMergeDependencies({
            showNotification: vi.fn(),
            loadBookmarks: vi.fn(async () => {}),
            loadExtLinks: vi.fn(async () => {}),
            loadCibLinks: vi.fn(async () => {}),
            renderReglamentCategories: vi.fn(async () => {}),
            buildInitialSearchIndex: vi.fn(async () => {}),
        });

        vi.spyOn(indexedDbModule, 'getAllFromIndexedDB').mockImplementation(async (storeName) => {
            if (storeName === 'bookmarkFolders') {
                return [{ id: 1, name: 'Before merge' }];
            }
            return [];
        });

        const clearSpy = vi
            .spyOn(indexedDbModule, 'clearIndexedDBStore')
            .mockImplementation(async () => undefined);

        const saveSpy = vi
            .spyOn(indexedDbModule, 'saveToIndexedDB')
            .mockImplementationOnce(async () => {
                throw new Error('Synthetic merge write failure');
            })
            .mockImplementation(async () => 1);

        const mergePlan = {
            perStore: {
                bookmarkFolders: {
                    toInsert: [{ record: { id: 101, name: 'Incoming folder' } }],
                    toUpdate: [],
                },
            },
        };

        await expect(applyMergePlan(mergePlan)).rejects.toThrow('Synthetic merge write failure');
        expect(clearSpy).toHaveBeenCalledWith('bookmarkFolders');
        expect(saveSpy).toHaveBeenCalledWith(
            'bookmarkFolders',
            expect.objectContaining({ id: 1, name: 'Before merge' }),
        );

        State.db = null;
    });
});

describe('db-merge conflict UI helpers', () => {
    it('formats nested values into readable text for UI', () => {
        const { formatConflictValueForUi } = __dbMergeConflictUiInternals;
        expect(formatConflictValueForUi(['one', 'two'])).toContain('one');
        expect(formatConflictValueForUi({ title: 'Документ', tags: ['a', 'b'] })).toContain('title');
        expect(formatConflictValueForUi(null)).toBe('—');
    });

    it('builds field-level diff with separate same/different buckets', () => {
        const { buildConflictDiffView } = __dbMergeConflictUiInternals;
        const diff = buildConflictDiffView(
            {
                id: 1,
                title: 'Инструкция',
                url: 'https://example.com/v1',
                description: 'Описание',
            },
            {
                id: 10,
                title: 'Инструкция',
                url: 'https://example.com/v2',
                description: 'Описание (новое)',
            },
        );

        expect(diff.sameFields.map((item) => item.key)).toContain('title');
        expect(diff.differentFields.map((item) => item.key)).toContain('url');
        expect(diff.differentFields.map((item) => item.key)).toContain('description');
        expect(diff.sameFields.map((item) => item.key)).not.toContain('id');
    });

    it('builds stable human label for conflict cards', () => {
        const { getConflictRecordLabel } = __dbMergeConflictUiInternals;
        expect(
            getConflictRecordLabel(
                'bookmarks',
                { id: 1, title: 'Руководство', url: 'https://example.com' },
                { id: 2, title: 'Руководство', url: 'https://example.com/new' },
            ),
        ).toContain('Руководство');

        expect(getConflictRecordLabel('favorites', { id: 1 }, { id: 2 })).toContain('favorites');
    });
});

describe('db-merge scope mapping', () => {
    it('maps selected scopes to indexeddb stores for analysis', () => {
        const { resolveStoresFromSelectedScopes } = __dbMergeScopeInternals;
        const stores = resolveStoresFromSelectedScopes([
            'algorithms',
            'bookmarks',
            'extLinks',
            'attachments',
        ]);
        expect(stores).toEqual([
            'algorithms',
            'bookmarkFolders',
            'bookmarks',
            'extLinkCategories',
            'extLinks',
            'pdfFiles',
            'screenshots',
        ]);
    });

    it('returns empty list for empty or unknown scopes', () => {
        const { resolveStoresFromSelectedScopes } = __dbMergeScopeInternals;
        expect(resolveStoresFromSelectedScopes([])).toEqual([]);
        expect(resolveStoresFromSelectedScopes(['unknown-scope'])).toEqual([]);
        expect(resolveStoresFromSelectedScopes(null)).toEqual([]);
    });

    it('deduplicates repeated scopes and keeps stable order', () => {
        const { resolveStoresFromSelectedScopes } = __dbMergeScopeInternals;
        const stores = resolveStoresFromSelectedScopes([
            'bookmarks',
            'bookmarks',
            'attachments',
            'attachments',
        ]);
        expect(stores).toEqual(['bookmarkFolders', 'bookmarks', 'pdfFiles', 'screenshots']);
    });

    it('builds summary counters for selected scopes', () => {
        const { buildScopeSelectionSummary } = __dbMergeScopeInternals;
        const summary = buildScopeSelectionSummary([
            'algorithms',
            'bookmarks',
            'bookmarks',
            'unknown',
        ]);
        expect(summary.scopeCount).toBe(2);
        expect(summary.storeCount).toBe(3);
        expect(summary.stores).toEqual(['algorithms', 'bookmarkFolders', 'bookmarks']);
    });
});

describe('db-merge ui internals', () => {
    it('shows footer actions only after user selected file for analysis', () => {
        const { shouldShowFooterActions } = __dbMergeUiInternals;

        expect(shouldShowFooterActions({ hasSelectedFileForAnalysis: false })).toBe(false);
        expect(shouldShowFooterActions({ hasSelectedFileForAnalysis: true })).toBe(true);
    });
});
