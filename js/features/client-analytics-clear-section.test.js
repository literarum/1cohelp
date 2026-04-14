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
}));

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
        expect(updateSearchIndex.mock.calls.every((c) => c[0] === 'clientAnalyticsRecords')).toBe(true);
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
});
