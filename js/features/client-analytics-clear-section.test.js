/** @vitest-environment node */
'use strict';

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** @type {Record<string, object[]>} */
const inventory = {
    clientAnalyticsRecords: [],
    clientAnalyticsFiles: [],
    clientAnalyticsFolders: [],
    clientAnalyticsTags: [],
    clientAnalyticsCardMeta: [],
    preferences: [],
};

vi.mock('../app/state.js', () => ({
    State: { db: {} },
}));

vi.mock('../db/indexeddb.js', () => ({
    getAllFromIndexedDB: async (name) => [...(inventory[name] || [])],
    getFromIndexedDB: vi.fn(),
    saveToIndexedDB: vi.fn(),
    deleteFromIndexedDB: async (store, id) => {
        const arr = inventory[store];
        if (!Array.isArray(arr)) return;
        const idx = arr.findIndex((row) => row && row.id === id);
        if (idx !== -1) arr.splice(idx, 1);
    },
    getAllProjected: async (name, fn) =>
        (inventory[name] || []).map((r) => fn(r)).filter((v) => v !== undefined),
    forEachBatchInStore: async (name, cb) => {
        const rows = [...(inventory[name] || [])];
        if (rows.length) await cb(rows);
        return rows.length;
    },
    bulkPutToIndexedDB: async (name, rows) => {
        const arr = (inventory[name] = inventory[name] || []);
        return rows.map((r) => {
            const id = r.id ?? arr.length + 1000;
            arr.push({ ...r, id });
            return id;
        });
    },
    bulkDeleteFromIndexedDB: async (name, keys) => {
        inventory[name] = (inventory[name] || []).filter((r) => !keys.includes(r.id));
    },
    countInIndexedDB: async (name) => (inventory[name] || []).length,
    maxKeyInIndexedDB: async (name) =>
        Math.max(0, ...(inventory[name] || []).map((r) => Number(r.id) || 0)),
    getAllKeysFromIndexedDB: async (name) => (inventory[name] || []).map((r) => r.id),
    getAllFromIndex: async () => [],
    clearIndexedDBStore: async (name) => {
        inventory[name] = [];
    },
    yieldToMain: async () => {},
}));

import * as idb from '../db/indexeddb.js';
import {
    clearEntireClientAnalyticsSection,
    importClientAnalyticsSection,
    setClientAnalyticsDependencies,
} from './client-analytics.js';

describe('client-analytics clear section', () => {
    beforeEach(() => {
        inventory.clientAnalyticsRecords = [
            { id: 1, inn: '7707083893' },
            { id: 2, inn: '500100732259' },
        ];
        inventory.clientAnalyticsFiles = [{ id: 10, fileName: 'a.txt' }];
        inventory.clientAnalyticsFolders = [{ id: 3, name: 'F' }];
        inventory.clientAnalyticsTags = [{ id: 4, name: 'T' }];
        inventory.clientAnalyticsCardMeta = [{ id: 'inn:7707083893', folderId: null, tagIds: [] }];
        inventory.preferences = [{ id: 'clientAnalyticsOrgView', data: { sortMode: 'date_desc' } }];
    });

    it('clearEntireClientAnalyticsSection clears only client analytics stores and org view preference', async () => {
        const updateSearchIndex = vi.fn();
        setClientAnalyticsDependencies({ updateSearchIndex });

        await clearEntireClientAnalyticsSection();

        expect(inventory.clientAnalyticsRecords).toHaveLength(0);
        expect(inventory.clientAnalyticsFiles).toHaveLength(0);
        expect(inventory.clientAnalyticsFolders).toHaveLength(0);
        expect(inventory.clientAnalyticsTags).toHaveLength(0);
        expect(inventory.clientAnalyticsCardMeta).toHaveLength(0);
        expect(inventory.preferences.some((p) => p.id === 'clientAnalyticsOrgView')).toBe(false);
        expect(updateSearchIndex).toHaveBeenCalled();
        expect(updateSearchIndex.mock.calls.every((c) => c[0] === 'clientAnalyticsRecords')).toBe(
            true,
        );
    });

    it('importClientAnalyticsSection reuses purge (empty import leaves stores empty)', async () => {
        setClientAnalyticsDependencies({ updateSearchIndex: vi.fn() });

        await importClientAnalyticsSection({
            exportKind: 'clientAnalyticsSection',
            files: [],
            records: [],
            folders: [],
            tags: [],
            cardMeta: [],
        });

        expect(inventory.clientAnalyticsRecords).toHaveLength(0);
        expect(inventory.clientAnalyticsFiles).toHaveLength(0);
        expect(inventory.clientAnalyticsFolders).toHaveLength(0);
        expect(inventory.clientAnalyticsTags).toHaveLength(0);
        expect(inventory.clientAnalyticsCardMeta).toHaveLength(0);
    });

    it('импорт раздела: «rec:<id>» карточек без ИНН пересчитывается на новые id, свои темы переносятся', async () => {
        setClientAnalyticsDependencies({ updateSearchIndex: vi.fn(), bulkAddToSearchIndex: vi.fn() });
        let auto = 500;
        idb.saveToIndexedDB.mockImplementation(async (store, row) => {
            const arr = (inventory[store] = inventory[store] || []);
            const id = row.id ?? ++auto;
            const i = arr.findIndex((r) => r.id === id);
            if (i !== -1) arr.splice(i, 1);
            arr.push({ ...row, id });
            return id;
        });
        await importClientAnalyticsSection({
            exportKind: 'clientAnalyticsSection',
            files: [{ id: 7, fileName: 'x.txt' }],
            records: [
                { id: 41, inn: '', phones: ['79031112233'], sourceFileId: 7, question: 'без ИНН' },
                { id: 42, inn: '7707083893', sourceFileId: 7, question: 'с ИНН' },
            ],
            folders: [{ id: 3, name: 'Важное' }],
            tags: [{ id: 9, name: 'тег' }],
            cardMeta: [
                { id: 'rec:41', folderId: 3, tagIds: [9] },
                { id: 'inn:7707083893', folderId: 3, tagIds: [] },
                { id: 'rec:999', folderId: 3, tagIds: [] },
            ],
            customTopics: [{ id: '1', label: 'Кассы', words: 'касс' }],
        });
        const noInn = inventory.clientAnalyticsRecords.find((r) => r.question === 'без ИНН');
        expect(noInn.id).not.toBe(41);
        const metaIds = inventory.clientAnalyticsCardMeta.map((m) => m.id);
        expect(metaIds).toContain(`rec:${noInn.id}`);
        expect(metaIds).toContain('inn:7707083893');
        expect(metaIds).not.toContain('rec:41');
        expect(metaIds).not.toContain('rec:999'); // запись не импортирована — метаданные не висят
        const moved = inventory.clientAnalyticsCardMeta.find((m) => m.id === `rec:${noInn.id}`);
        expect(moved.tagIds).toHaveLength(1);
        expect(inventory.preferences.find((p) => p.id === 'clientAnalyticsCustomTopics').topics[0].label).toBe('Кассы');
    });
});
