'use strict';
/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { normalizeExternalHttpUrl, createBookmarkDetailUrlSectionElement } from '../utils/html.js';

describe('normalizeExternalHttpUrl', () => {
    it('adds https for scheme-less URLs', () => {
        expect(normalizeExternalHttpUrl('example.com/path')).toMatch(/^https:\/\/example\.com\//);
    });

    it('preserves valid absolute URLs', () => {
        expect(normalizeExternalHttpUrl('https://developer.mozilla.org/ru/')).toBe(
            'https://developer.mozilla.org/ru/',
        );
    });

    it('returns empty string for invalid input', () => {
        expect(normalizeExternalHttpUrl('')).toBe('');
        expect(normalizeExternalHttpUrl('not a url at all !!!')).toBe('');
    });
});

describe('createBookmarkDetailUrlSectionElement', () => {
    it('returns null when URL cannot be normalized', () => {
        expect(createBookmarkDetailUrlSectionElement('')).toBeNull();
    });

    it('returns a section with link when URL is valid', () => {
        const el = createBookmarkDetailUrlSectionElement('https://example.com/foo');
        expect(el).not.toBeNull();
        expect(el.querySelector('a')?.getAttribute('href')).toBe('https://example.com/foo');
        expect(el.textContent).toContain('example.com');
    });
});
