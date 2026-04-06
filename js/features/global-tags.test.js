'use strict';

import { describe, it, expect } from 'vitest';
import {
    normalizeTagToken,
    parseTagsFromUserString,
    parseSearchQueryTagsAndText,
    itemMatchesAllTags,
    coerceTagsArray,
} from './global-tags.js';

describe('global-tags', () => {
    it('normalizeTagToken lowercases and trims', () => {
        expect(normalizeTagToken('  Привет ')).toBe('привет');
        expect(normalizeTagToken('Ёж')).toBe('еж');
    });

    it('parseTagsFromUserString dedupes and respects order', () => {
        expect(parseTagsFromUserString('a, b, a')).toEqual(['a', 'b']);
    });

    it('parseSearchQueryTagsAndText splits #tags and text', () => {
        const r = parseSearchQueryTagsAndText('налог #фнс важно');
        expect(r.tagFilters).toContain('фнс');
        expect(r.textQuery).toContain('налог');
        expect(r.textQuery).toContain('важно');
        expect(r.textQuery.includes('#')).toBe(false);
    });

    it('parseSearchQueryTagsAndText supports tag-only query', () => {
        const r = parseSearchQueryTagsAndText('#один #два');
        expect(r.tagFilters).toEqual(['один', 'два']);
        expect(r.textQuery).toBe('');
    });

    it('itemMatchesAllTags is AND semantics', () => {
        expect(itemMatchesAllTags({ tags: ['a', 'b'] }, ['a'])).toBe(true);
        expect(itemMatchesAllTags({ tags: ['a'] }, ['a', 'b'])).toBe(false);
        expect(itemMatchesAllTags({ tags: [] }, ['a'])).toBe(false);
    });

    it('coerceTagsArray tolerates garbage', () => {
        expect(coerceTagsArray([' X ', 'x', 3])).toEqual(['x']);
    });
});
