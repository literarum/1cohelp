'use strict';

import { describe, it, expect } from 'vitest';
import {
    buildDisplayUnitsFromGrouped,
    getClientAnalyticsUnitMetaId,
    sortClientAnalyticsDisplayUnits,
    filterUnitsByFolder,
    filterUnitsByTagsAny,
    groupClientAnalyticsUnitsForRender,
    normalizeClientAnalyticsCardMeta,
    CA_FOLDER_FILTER_ALL,
    CA_FOLDER_FILTER_UNFILED,
} from './client-analytics-organization.js';

describe('client-analytics-organization meta ids', () => {
    it('builds units and stable meta ids', () => {
        const grouped = groupClientAnalyticsRecordsForDisplayFixture();
        const units = buildDisplayUnitsFromGrouped(grouped);
        expect(units).toHaveLength(2);
        expect(getClientAnalyticsUnitMetaId(units[0])).toBe('inn:7707083893');
        expect(getClientAnalyticsUnitMetaId(units[1])).toBe('rec:10');
    });
});

function groupClientAnalyticsRecordsForDisplayFixture() {
    return {
        innStacks: [
            {
                innKey: '7707083893',
                records: [
                    {
                        id: 1,
                        inn: '7707083893',
                        uploadedAt: '2026-02-01T10:00:00.000Z',
                        sourceFileName: 'b.txt',
                        question: 'Бета',
                    },
                ],
            },
        ],
        noInnRecords: [
            {
                id: 10,
                inn: '',
                phones: ['79001234567'],
                uploadedAt: '2026-01-15T10:00:00.000Z',
                sourceFileName: 'a.txt',
                question: 'Альфа',
            },
        ],
    };
}

describe('client-analytics-organization sort', () => {
    it('sorts by date descending by default path', () => {
        const grouped = groupClientAnalyticsRecordsForDisplayFixture();
        let units = buildDisplayUnitsFromGrouped(grouped);
        units = sortClientAnalyticsDisplayUnits(units, 'date_desc');
        expect(getClientAnalyticsUnitMetaId(units[0])).toBe('inn:7707083893');
    });

    it('sorts by date ascending', () => {
        const grouped = groupClientAnalyticsRecordsForDisplayFixture();
        let units = buildDisplayUnitsFromGrouped(grouped);
        units = sortClientAnalyticsDisplayUnits(units, 'date_asc');
        expect(getClientAnalyticsUnitMetaId(units[0])).toBe('rec:10');
    });

    it('sorts by appeals count', () => {
        const grouped = {
            innStacks: [
                {
                    innKey: '1111111111',
                    records: [
                        { id: 1, uploadedAt: '2026-01-01T00:00:00.000Z' },
                        { id: 2, uploadedAt: '2026-01-02T00:00:00.000Z' },
                    ],
                },
                {
                    innKey: '2222222222',
                    records: [{ id: 3, uploadedAt: '2026-01-03T00:00:00.000Z' }],
                },
            ],
            noInnRecords: [],
        };
        let units = sortClientAnalyticsDisplayUnits(
            buildDisplayUnitsFromGrouped(grouped),
            'appeals_desc',
        );
        expect(units[0].type).toBe('inn');
        expect(units[0].innKey).toBe('1111111111');
    });
});

describe('client-analytics-organization filters', () => {
    it('filters by folder id', () => {
        const grouped = groupClientAnalyticsRecordsForDisplayFixture();
        const units = buildDisplayUnitsFromGrouped(grouped);
        const meta = {
            'inn:7707083893': { folderId: 5, tagIds: [] },
            'rec:10': { folderId: null, tagIds: [] },
        };
        const f = filterUnitsByFolder(units, '5', meta);
        expect(f).toHaveLength(1);
        expect(getClientAnalyticsUnitMetaId(f[0])).toBe('inn:7707083893');
    });

    it('filters unfiled', () => {
        const grouped = groupClientAnalyticsRecordsForDisplayFixture();
        const units = buildDisplayUnitsFromGrouped(grouped);
        const meta = {
            'inn:7707083893': { folderId: 1, tagIds: [] },
            'rec:10': { folderId: null, tagIds: [] },
        };
        const f = filterUnitsByFolder(units, CA_FOLDER_FILTER_UNFILED, meta);
        expect(f).toHaveLength(1);
        expect(getClientAnalyticsUnitMetaId(f[0])).toBe('rec:10');
    });

    it('all folder filter keeps order length', () => {
        const grouped = groupClientAnalyticsRecordsForDisplayFixture();
        const units = buildDisplayUnitsFromGrouped(grouped);
        expect(filterUnitsByFolder(units, CA_FOLDER_FILTER_ALL, {}).length).toBe(2);
    });

    it('filters by any tag', () => {
        const grouped = groupClientAnalyticsRecordsForDisplayFixture();
        const units = buildDisplayUnitsFromGrouped(grouped);
        const meta = {
            'inn:7707083893': { folderId: null, tagIds: [7, 8] },
            'rec:10': { folderId: null, tagIds: [9] },
        };
        expect(filterUnitsByTagsAny(units, [7], meta)).toHaveLength(1);
        expect(filterUnitsByTagsAny(units, [7, 9], meta)).toHaveLength(2);
        expect(filterUnitsByTagsAny(units, [], meta)).toHaveLength(2);
    });
});

describe('client-analytics-organization grouping', () => {
    it('groups by folder into sections', () => {
        const grouped = groupClientAnalyticsRecordsForDisplayFixture();
        const units = buildDisplayUnitsFromGrouped(grouped);
        const meta = {
            'inn:7707083893': { folderId: 1, tagIds: [] },
            'rec:10': { folderId: null, tagIds: [] },
        };
        const folders = [
            { id: 1, name: 'Работа', sortOrder: 0 },
            { id: 2, name: 'Личное', sortOrder: 1 },
        ];
        const sections = groupClientAnalyticsUnitsForRender(units, 'folder', folders, [], meta);
        expect(sections).toHaveLength(2);
        expect(sections[0].key).toBe('folder:1');
        expect(sections[1].key).toBe('folder:unfiled');
    });

    it('groups by tag with duplicates across sections', () => {
        const grouped = groupClientAnalyticsRecordsForDisplayFixture();
        const units = buildDisplayUnitsFromGrouped(grouped);
        const meta = {
            'inn:7707083893': { folderId: null, tagIds: [1, 2] },
            'rec:10': { folderId: null, tagIds: [] },
        };
        const tags = [
            { id: 1, name: 'А', sortOrder: 0 },
            { id: 2, name: 'Б', sortOrder: 1 },
        ];
        const sections = groupClientAnalyticsUnitsForRender(units, 'tag', [], tags, meta);
        const withInn = sections.filter((s) =>
            s.units.some((u) => getClientAnalyticsUnitMetaId(u) === 'inn:7707083893'),
        );
        expect(withInn.length).toBe(2);
        const untagged = sections.find((s) => s.key === 'tag:untagged');
        expect(untagged.units).toHaveLength(1);
    });

    it('groups by source file', () => {
        const grouped = groupClientAnalyticsRecordsForDisplayFixture();
        const units = buildDisplayUnitsFromGrouped(grouped);
        const sections = groupClientAnalyticsUnitsForRender(units, 'source_file', [], [], {});
        expect(sections.length).toBeGreaterThanOrEqual(2);
    });
});

describe('client-analytics-organization normalizeClientAnalyticsCardMeta', () => {
    it('coerces invalid input', () => {
        expect(normalizeClientAnalyticsCardMeta(null)).toEqual({ folderId: null, tagIds: [] });
        expect(normalizeClientAnalyticsCardMeta({ folderId: 'x', tagIds: ['1', 2, 2] })).toEqual({
            folderId: null,
            tagIds: [1, 2],
        });
        expect(normalizeClientAnalyticsCardMeta({ folderId: 3, tagIds: [1] })).toEqual({
            folderId: 3,
            tagIds: [1],
        });
    });
});
