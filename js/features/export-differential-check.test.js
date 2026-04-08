'use strict';

import { describe, it, expect } from 'vitest';
import {
    canonicalizeExportDataForDiff,
    djb2HashUtf8,
    hashCanonicalExportSnapshot,
    stableRecordKey,
    countsEqual,
} from './export-differential-check.js';

describe('stableRecordKey', () => {
    it('orders algorithms by section', () => {
        expect(stableRecordKey({ section: 'main' })).toContain('main');
        expect(stableRecordKey({ id: 5 })).toBe('id:5');
    });
});

describe('canonicalizeExportDataForDiff', () => {
    it('caps large stores and keeps full body for configured stores', () => {
        const many = Array.from({ length: 50 }, (_, i) => ({ id: i, title: `t${i}` }));
        const data = {
            schemaVersion: '1.0',
            data: {
                bookmarks: many,
                preferences: [{ id: 'x', v: 1 }],
            },
        };
        const canon = canonicalizeExportDataForDiff(data, {
            fullStores: ['preferences'],
            maxPerLarge: 10,
        });
        expect(canon.stores.bookmarks.comparedCount).toBe(10);
        expect(canon.stores.bookmarks.totalCount).toBe(50);
        expect(canon.stores.preferences.comparedCount).toBe(1);
        expect(canon.stores.preferences.fullBody).toBe(true);
    });

    it('produces identical hashes for batch vs sequential semantics when data matches', () => {
        const payload = {
            schemaVersion: '9',
            data: {
                a: [{ id: 2 }, { id: 1 }],
                b: [{ section: 'z' }, { section: 'a' }],
            },
        };
        const c1 = canonicalizeExportDataForDiff(payload);
        const c2 = canonicalizeExportDataForDiff(JSON.parse(JSON.stringify(payload)));
        expect(hashCanonicalExportSnapshot(c1)).toBe(hashCanonicalExportSnapshot(c2));
    });
});

describe('djb2HashUtf8', () => {
    it('is deterministic', () => {
        expect(djb2HashUtf8('abc')).toBe(djb2HashUtf8('abc'));
        expect(djb2HashUtf8('abc')).not.toBe(djb2HashUtf8('abd'));
    });
});

describe('countsEqual', () => {
    it('detects mismatch', () => {
        expect(countsEqual({ a: 1 }, { a: 1 })).toBe(true);
        expect(countsEqual({ a: 1 }, { a: 2 })).toBe(false);
    });
});
