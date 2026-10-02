'use strict';

import { describe, it, expect } from 'vitest';
import {
    normalizeBookmarkUrl,
    findDuplicateBookmarkGroups,
    buildMergedBookmark,
} from './bookmarks-bulk.js';

describe('bookmarks-bulk normalizeBookmarkUrl', () => {
    it('ignores protocol, www, hash, trailing slash and tracking params', () => {
        const a = normalizeBookmarkUrl('https://www.Example.com/path/?utm_source=x&b=2&a=1#top');
        const b = normalizeBookmarkUrl('http://example.com/path?a=1&b=2');
        expect(a).toBe(b);
        expect(a).toBe('example.com/path?a=1&b=2');
    });

    it('accepts scheme-less urls and rejects garbage / non-http', () => {
        expect(normalizeBookmarkUrl('example.com')).toBe('example.com');
        expect(normalizeBookmarkUrl('')).toBe('');
        expect(normalizeBookmarkUrl('javascript:alert(1)')).toBe('');
        expect(normalizeBookmarkUrl('ftp://example.com/x')).toBe('');
    });

    it('drops default ports but keeps custom ones', () => {
        expect(normalizeBookmarkUrl('https://example.com:443/a')).toBe('example.com/a');
        expect(normalizeBookmarkUrl('http://example.com:8080/a')).toBe('example.com:8080/a');
    });
});

describe('bookmarks-bulk duplicates', () => {
    const items = [
        { id: 3, title: 'C', url: 'https://example.com/a/', dateAdded: '2024-03-01T00:00:00Z' },
        { id: 1, title: 'A', url: 'http://www.example.com/a', dateAdded: '2024-01-01T00:00:00Z', tags: ['x'] },
        { id: 2, title: 'B', url: 'https://other.org/', dateAdded: '2024-02-01T00:00:00Z' },
        { id: 4, title: 'Note without url', dateAdded: '2024-02-01T00:00:00Z' },
    ];

    it('groups by normalized url, oldest first, ignores notes and singletons', () => {
        const groups = findDuplicateBookmarkGroups(items);
        expect(groups).toHaveLength(1);
        expect(groups[0].items.map((x) => x.id)).toEqual([1, 3]);
    });

    it('merge keeps keeper and unions tags, longest description, screenshots, earliest date', () => {
        const { merged, others } = buildMergedBookmark(
            [
                { id: 1, title: 'A', tags: ['x'], description: 'short', screenshotIds: [10], dateAdded: '2024-01-01T00:00:00Z' },
                { id: 3, title: 'C', tags: ['y', 'x'], description: 'a much longer description', screenshotIds: [11, 10], dateAdded: '2023-01-01T00:00:00Z', folder: 5 },
            ],
            1,
        );
        expect(merged.id).toBe(1);
        expect(others.map((o) => o.id)).toEqual([3]);
        expect(merged.tags.sort()).toEqual(['x', 'y']);
        expect(merged.description).toBe('a much longer description');
        expect(merged.screenshotIds).toEqual([10, 11]);
        expect(merged.dateAdded).toBe('2023-01-01T00:00:00Z');
        expect(merged.folder).toBe(5);
    });
});
